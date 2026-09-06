/**
 * Unified LLM Provider — single entry point for all chat/analysis calls.
 *
 * Tries **Anthropic Claude** first (if ANTHROPIC_API_KEY is valid), then falls
 * back to **OpenAI** (if OPENAI_API_KEY is set). Any auth / network / 5xx
 * failure from Anthropic triggers an immediate retry on OpenAI so a single
 * user request is never dropped when one provider is misconfigured or down.
 *
 * Call sites pass a `tier` instead of a concrete model name so they stay
 * agnostic of which provider actually serves the request:
 *   - "flagship" → Claude Sonnet 4  / gpt-4o       (deep analysis, 5-15s)
 *   - "fast"     → Claude Haiku 4  / gpt-4o-mini  (follow-ups, classification)
 *
 * The response always has a unified shape so every route handles both
 * providers identically.
 */

import { logger } from "./logging";

import { costOfCall, recordSpend } from "@/lib/coach/spendFuse";

const log = logger.child({ module: "llm-provider" });

// ── Env / config ────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL =
  process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL =
  process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

// A key is only considered usable if it has the correct prefix. Catches the
// "ssk-ant-" style typos that otherwise waste a full round-trip.
function isValidAnthropicKey(key: string | undefined): key is string {
  return !!key && key.startsWith("sk-ant-");
}
function isValidOpenAIKey(key: string | undefined): key is string {
  return !!key && (key.startsWith("sk-") || key.startsWith("sess-"));
}

// ── Public types ────────────────────────────────────────────────────────────
export type LLMTier = "flagship" | "fast";
export type LLMProvider = "anthropic" | "openai";

export type LLMMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface CallLLMOptions {
  tier: LLMTier;
  system: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  /** If true, skip Anthropic and go straight to OpenAI. Useful for A/B testing. */
  forceProvider?: LLMProvider;
  /**
   * If true (Anthropic only), send the system prompt with an ephemeral
   * prompt-cache marker. The first call after a 5-min idle will be a cache
   * write (`cacheCreationTokens > 0`); subsequent calls reusing the same
   * system prompt become cache reads (`cacheReadTokens > 0`), which are
   * faster and ~10× cheaper. No-op for OpenAI.
   */
  cacheSystem?: boolean;
  /**
   * Optional uncached tail appended after `system`. When set together with
   * `cacheSystem: true`, the Anthropic call emits two system blocks: the
   * first carries the ephemeral cache marker, the second does not. That
   * keeps per-user personalization out of the cached prefix so two callers
   * sharing the same stable persona still hit the prompt cache even when
   * their `username` / `userRating` / prefs differ. For OpenAI the suffix
   * is just concatenated onto the system message (OpenAI has no prompt
   * cache concept), so quality stays identical.
   */
  systemSuffix?: string;
  /**
   * Optional AbortSignal (2026-05-25 fix-orphan-pipeline-cancellation).
   * When provided, propagated to the underlying fetch() call so the
   * provider can abort cleanly on timeout. When the signal aborts, the
   * fallback to the secondary provider is skipped (belt-and-suspenders
   * check: AbortError name + signal.aborted state) to prevent re-spawning
   * the orphan as an OpenAI request.
   */
  signal?: AbortSignal;
  /**
   * Structured output (PR-CI-3, Contract Inversion tech-lead decision #6).
   * Constrains the response to a JSON schema via Anthropic's
   * `output_config.format: {type: "json_schema", schema}` (GA on Haiku 4.5 +
   * Sonnet 4.6) — kills the fail-open unparseable-JSON class on the Haiku
   * claim parsers (audit #4). Schema rules: every object needs
   * `additionalProperties: false`; no numeric/string constraints; first use
   * of a new schema pays a one-time server-side compilation (cached 24h).
   * On the OpenAI fallback this maps to `response_format.json_schema`
   * (`name` is required there — Anthropic ignores it).
   * Non-streaming calls only; callLLMStream does not send it (the streamed
   * flagship call is deliberately free-text, plan §3).
   */
  outputSchema?: { name: string; schema: Record<string, unknown> };
}

export interface LLMResult {
  content: string;
  provider: LLMProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Tokens written to the prompt cache on this call (Anthropic only). */
  cacheCreationTokens?: number;
  /** Tokens served from the prompt cache on this call (Anthropic only). */
  cacheReadTokens?: number;
  /** How long the provider took (ms). Excludes fallback retry time. */
  elapsedMs: number;
  /** Populated when the primary provider failed and we fell back. */
  primaryError?: { provider: LLMProvider; status?: number; code: LLMErrorCode };
}

export type LLMErrorCode =
  | "provider_unconfigured"
  | "provider_http_error"
  | "provider_network_error"
  | "provider_invalid_response"
  | "providers_unavailable";

/**
 * Charge one completed call to today's spend total, and hand the result back
 * unchanged.
 *
 * This lives in the funnel, not in routes, on purpose: `recordLLMCall` (the
 * in-memory stats aggregator) is called by only two of the seven LLM routes,
 * which is exactly the drift a fuse cannot afford. Wrapping the three places
 * an LLMResult is actually constructed — the two non-streaming provider calls
 * and the streaming `done` — accounts every path exactly once, including
 * routes that do not exist yet.
 *
 * Never throws and never awaits: the caller has already been served, and a
 * bookkeeping failure must not become a user-visible one.
 */
function account(result: LLMResult): LLMResult {
  try {
    recordSpend(costOfCall(result));
  } catch {
    /* accounting must never break a served request */
  }
  return result;
}

export const PUBLIC_LLM_ERROR = {
  code: "AI_PROVIDER_UNAVAILABLE",
  message: "AI coaching is temporarily unavailable. Please try again.",
} as const;

// ── Model mapping ───────────────────────────────────────────────────────────

/**
 * Per-model capabilities.
 *
 * `output_config.effort` was previously gated on the TIER (`tier ===
 * "flagship"`), with a comment explaining that Haiku 4.5 returns 400 if it
 * receives one. But that is a property of the MODEL, not of the tier — so the
 * moment a tier points somewhere else the gate is wrong, in whichever
 * direction hurts: a 400 on every request, or a silently un-tuned model.
 *
 * Probed against the live API on 2026-08-19 (1-token calls, with and without
 * the param):
 *   claude-opus-5              200 / 200   → supports effort
 *   claude-sonnet-4-6          200 / 200   → supports effort
 *   claude-haiku-4-5-20251001  400 on effort (documented in the original note)
 */
interface AnthropicModelSpec {
  id: string;
  supportsEffort: boolean;
  /**
   * The model thinks ADAPTIVELY unless told not to (Sonnet 5 / Opus 5). Two
   * consequences the older models never had: the hidden thinking is billed
   * as output and eats `max_tokens` before a single visible token (a 3k-token
   * card budget can come back empty), and the API rejects a temperature
   * other than 1 while thinking is on — our calls send 0.7. So for these
   * models the request states the thinking mode explicitly: "disabled" by
   * default (byte-for-byte the behaviour the 4.6 flagship has today), or
   * "adaptive" when LLM_THINKING=adaptive is set for a deliberate trial.
   */
  thinksByDefault?: boolean;
  /**
   * The API returns 400 "`temperature` is deprecated for this model" for any
   * temperature at all (probed 2026-09-05 on claude-sonnet-5 with 0.7, with
   * and without thinking disabled). Omit the field for such models; the
   * caller's `temperature` option is ignored there, not translated.
   */
  rejectsTemperature?: boolean;
}

const ANTHROPIC_MODEL_SPECS: Record<string, AnthropicModelSpec> = {
  "claude-opus-5": { id: "claude-opus-5", supportsEffort: true, thinksByDefault: true },
  // FLAGSHIP since 2026-09-05 (founder decision). Probed 2026-09-05: effort
  // accepted; listed at $2/$10 per MTok against 4.6's $3/$15 and measured
  // $0.46 vs $0.55 per six-fixture review arm (ab-story-4.1-sonnet5.json —
  // all CI-4 gates pass). Thinking is sent as "disabled" and temperature is
  // omitted (see the spec fields). Revert: LLM_FLAGSHIP_MODEL=claude-sonnet-4-6.
  "claude-sonnet-5": { id: "claude-sonnet-5", supportsEffort: true, thinksByDefault: true, rejectsTemperature: true },
  // Previous flagship (until 2026-09-05); claude-sonnet-4-20250514 was retired
  // by Anthropic on 2026-06-15.
  "claude-sonnet-4-6": { id: "claude-sonnet-4-6", supportsEffort: true },
  "claude-haiku-4-5-20251001": {
    id: "claude-haiku-4-5-20251001",
    supportsEffort: false,
  },
};

/** `temperature` only for models that still accept it (see AnthropicModelSpec.rejectsTemperature). */
function temperatureParam(spec: AnthropicModelSpec, temperature: number): { temperature: number } | Record<string, never> {
  return spec.rejectsTemperature ? {} : { temperature };
}

/** Explicit thinking mode for models that would otherwise think adaptively (see AnthropicModelSpec). */
function thinkingParam(spec: AnthropicModelSpec): { thinking: { type: "disabled" | "adaptive" } } | Record<string, never> {
  if (!spec.thinksByDefault) return {};
  return { thinking: { type: process.env.LLM_THINKING?.trim() === "adaptive" ? "adaptive" : "disabled" } };
}

const DEFAULT_ANTHROPIC_MODELS: Record<LLMTier, string> = {
  flagship: "claude-sonnet-5",
  fast: "claude-haiku-4-5-20251001",
};

/**
 * Resolve a tier to a concrete Anthropic model, honouring the
 * `LLM_FLAGSHIP_MODEL` / `LLM_FAST_MODEL` overrides.
 *
 * The overrides exist so a model upgrade is a config change with a one-line
 * revert rather than a deploy. Unset ⇒ today's mapping exactly.
 *
 * An unrecognised id falls back to the default and logs an ERROR rather than
 * throwing: a typo in an env var should not take the coach down. It must not
 * be silent either — every `LLMResult` carries the model that actually ran, so
 * the resolved value is visible in telemetry rather than assumed from config.
 */
function resolveAnthropicModel(tier: LLMTier): AnthropicModelSpec {
  const override = (
    tier === "flagship"
      ? process.env.LLM_FLAGSHIP_MODEL
      : process.env.LLM_FAST_MODEL
  )?.trim();

  if (override) {
    const spec = ANTHROPIC_MODEL_SPECS[override];
    if (spec) return spec;
    console.error(
      `[llmProvider] ${tier === "flagship" ? "LLM_FLAGSHIP_MODEL" : "LLM_FAST_MODEL"}="${override}" is not a known model; using ${DEFAULT_ANTHROPIC_MODELS[tier]}. Add it to ANTHROPIC_MODEL_SPECS (and llmPricing) first.`,
    );
  }
  return ANTHROPIC_MODEL_SPECS[DEFAULT_ANTHROPIC_MODELS[tier]];
}

/** Test seams — the resolver and registry are internal to this module. */
export const __resolveAnthropicModelForTest = resolveAnthropicModel;
export const __ANTHROPIC_MODEL_SPECS_FOR_TEST = ANTHROPIC_MODEL_SPECS;

const MODELS = {
  openai: {
    flagship: "gpt-4o",
    fast: "gpt-4o-mini",
  },
} as const;

/**
 * Build the Anthropic `system` payload from a CallLLMOptions. Returns either
 * a plain string (no cache, no suffix) or an array of content blocks. When
 * `systemSuffix` is set, the suffix lands in its own uncached block so the
 * preceding cached prefix can still be reused across callers with different
 * per-user tails (username / rating / coaching prefs). When `cacheSystem` is
 * also true, only the first block gets the ephemeral cache marker.
 */
function buildAnthropicSystemPayload(opts: CallLLMOptions): unknown {
  if (!opts.system) return opts.system;
  const hasSuffix = !!opts.systemSuffix;
  const wantsCache = !!opts.cacheSystem;
  if (!hasSuffix && !wantsCache) return opts.system;
  const blocks: Array<Record<string, unknown>> = [
    wantsCache
      ? {
          type: "text",
          text: opts.system,
          cache_control: { type: "ephemeral" },
        }
      : { type: "text", text: opts.system },
  ];
  if (hasSuffix) {
    blocks.push({ type: "text", text: opts.systemSuffix });
  }
  return blocks;
}

async function fetchProvider(
  provider: LLMProvider,
  input: string,
  init: RequestInit
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new LLMError(provider, 0, "provider_network_error");
  }
}

// ── Anthropic call ──────────────────────────────────────────────────────────
async function callAnthropic(
  tier: LLMTier,
  opts: CallLLMOptions
): Promise<LLMResult> {
  if (!isValidAnthropicKey(ANTHROPIC_API_KEY)) {
    throw new LLMError("anthropic", 0, "provider_unconfigured");
  }

  const spec = resolveAnthropicModel(tier);
  const model = spec.id;
  const startedAt = Date.now();

  const systemPayload = buildAnthropicSystemPayload(opts);

  const response = await fetchProvider(
    "anthropic",
    `${ANTHROPIC_BASE_URL}/v1/messages`,
    {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        system: systemPayload,
        messages: opts.messages,
        ...temperatureParam(spec, opts.temperature ?? 0.7),
        max_tokens: opts.maxTokens ?? 1500,
        ...thinkingParam(spec),
        // output_config carries up to two independent knobs:
        //  - effort: Sonnet 4.6 defaults effort to "high" (more thinking →
        //    higher latency/cost). Pin it to "medium" for the balanced
        //    cost/quality point. Flagship-only: the fast tier (Haiku 4.5)
        //    returns 400 if sent `effort`.
        //  - format: structured output (see CallLLMOptions.outputSchema).
        ...(spec.supportsEffort || opts.outputSchema
          ? {
              output_config: {
                ...(spec.supportsEffort ? { effort: "medium" } : {}),
                ...(opts.outputSchema
                  ? {
                      format: {
                        type: "json_schema",
                        schema: opts.outputSchema.schema,
                      },
                    }
                  : {}),
              },
            }
          : {}),
      }),
      signal: opts.signal,
    }
  );

  const elapsedMs = Date.now() - startedAt;

  if (!response.ok) {
    throw new LLMError("anthropic", response.status, "provider_http_error");
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;
  if (typeof content !== "string") {
    throw new LLMError("anthropic", 200, "provider_invalid_response");
  }

  return account({
    content,
    provider: "anthropic",
    model,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    cacheCreationTokens: data.usage?.cache_creation_input_tokens ?? 0,
    cacheReadTokens: data.usage?.cache_read_input_tokens ?? 0,
    elapsedMs,
  });
}

// ── OpenAI call ─────────────────────────────────────────────────────────────
async function callOpenAI(
  tier: LLMTier,
  opts: CallLLMOptions
): Promise<LLMResult> {
  if (!isValidOpenAIKey(OPENAI_API_KEY)) {
    throw new LLMError("openai", 0, "provider_unconfigured");
  }

  const model = MODELS.openai[tier];
  const startedAt = Date.now();

  // OpenAI takes system as a message in the array, not a separate field.
  // There's no prompt-cache concept on OpenAI's side, so we just concatenate
  // the optional uncached suffix onto the system message. Output quality is
  // identical to what callAnthropic would produce.
  const openaiMessages: Array<{ role: string; content: string }> = [];
  if (opts.system) {
    const systemContent = opts.systemSuffix
      ? `${opts.system}\n\n${opts.systemSuffix}`
      : opts.system;
    openaiMessages.push({ role: "system", content: systemContent });
  }
  for (const m of opts.messages) {
    openaiMessages.push({ role: m.role, content: m.content });
  }

  const response = await fetchProvider(
    "openai",
    `${OPENAI_BASE_URL}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: openaiMessages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 1500,
        // OpenAI's structured-output shape. `strict` is deliberately omitted:
        // OpenAI's strict mode requires every property listed in `required`,
        // which the claim schemas don't guarantee. Downstream parsers keep
        // their lenient JSON handling either way.
        ...(opts.outputSchema
          ? {
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: opts.outputSchema.name,
                  schema: opts.outputSchema.schema,
                },
              },
            }
          : {}),
      }),
      signal: opts.signal,
    }
  );

  const elapsedMs = Date.now() - startedAt;

  if (!response.ok) {
    throw new LLMError("openai", response.status, "provider_http_error");
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new LLMError("openai", 200, "provider_invalid_response");
  }

  return account({
    content,
    provider: "openai",
    model,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    elapsedMs,
  });
}

// ── Streaming ───────────────────────────────────────────────────────────────
//
// SSE-style incremental output. Anthropic streams natively; OpenAI is used as
// a non-streaming fallback (whole response emitted as a single chunk) so the
// route handler doesn't need two code paths.

export type LLMStreamEvent =
  | { type: "text"; delta: string }
  | { type: "done"; result: LLMResult };

async function* callAnthropicStream(
  tier: LLMTier,
  opts: CallLLMOptions
): AsyncGenerator<LLMStreamEvent, void, void> {
  if (!isValidAnthropicKey(ANTHROPIC_API_KEY)) {
    throw new LLMError("anthropic", 0, "provider_unconfigured");
  }

  const spec = resolveAnthropicModel(tier);
  const model = spec.id;
  const startedAt = Date.now();

  const systemPayload = buildAnthropicSystemPayload(opts);

  const response = await fetchProvider(
    "anthropic",
    `${ANTHROPIC_BASE_URL}/v1/messages`,
    {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        system: systemPayload,
        messages: opts.messages,
        ...temperatureParam(spec, opts.temperature ?? 0.7),
        max_tokens: opts.maxTokens ?? 1500,
        stream: true,
        ...thinkingParam(spec),
        // See ANTHROPIC_MODEL_SPECS: pin effort to "medium" on models that
        // accept it (Sonnet 4.6 and Opus 5 default to "high"). Keyed on the
        // MODEL, not the tier — Haiku 4.5 returns 400 if sent `effort`, and
        // that stays true wherever it is mapped.
        ...(spec.supportsEffort
          ? { output_config: { effort: "medium" } }
          : {}),
      }),
      signal: opts.signal,
    }
  );

  if (!response.ok) {
    throw new LLMError("anthropic", response.status, "provider_http_error");
  }
  if (!response.body) {
    throw new LLMError("anthropic", 200, "provider_invalid_response");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line.
      let evtEnd: number;
      while ((evtEnd = buffer.indexOf("\n\n")) !== -1) {
        const evt = buffer.slice(0, evtEnd);
        buffer = buffer.slice(evtEnd + 2);

        for (const line of evt.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const dataStr = line.slice(5).trim();
          if (!dataStr) continue;
          let data: any;
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }

          if (
            data.type === "content_block_delta" &&
            data.delta?.type === "text_delta"
          ) {
            const text: string = data.delta.text || "";
            if (text) {
              fullText += text;
              yield { type: "text", delta: text };
            }
          } else if (data.type === "message_start") {
            const usage = data.message?.usage;
            if (usage) {
              inputTokens = usage.input_tokens ?? 0;
              cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
              cacheReadTokens = usage.cache_read_input_tokens ?? 0;
            }
          } else if (data.type === "message_delta" && data.usage) {
            outputTokens = data.usage.output_tokens ?? outputTokens;
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  const elapsedMs = Date.now() - startedAt;
  yield {
    type: "done",
    result: account({
      content: fullText,
      provider: "anthropic",
      model,
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens,
      elapsedMs,
    }),
  };
}

/**
 * Streaming counterpart to {@link callLLM}. Yields incremental text deltas
 * followed by a final `done` event carrying the full {@link LLMResult}.
 *
 * Anthropic streams natively. If Anthropic is unavailable or fails, falls back
 * to a non-streaming OpenAI call and emits the entire response as one chunk
 * — so the consumer still sees text and a `done` event in the same shape.
 */
export async function* callLLMStream(
  opts: CallLLMOptions
): AsyncGenerator<LLMStreamEvent, void, void> {
  const anthropicAvailable = isValidAnthropicKey(ANTHROPIC_API_KEY);
  const openaiAvailable = isValidOpenAIKey(OPENAI_API_KEY);

  if (!anthropicAvailable && !openaiAvailable) {
    throw new LLMError("anthropic", 0, "providers_unavailable");
  }

  if (opts.forceProvider === "openai") {
    const result = await callOpenAI(opts.tier, opts);
    if (result.content) yield { type: "text", delta: result.content };
    yield { type: "done", result };
    return;
  }

  if (anthropicAvailable) {
    try {
      for await (const ev of callAnthropicStream(opts.tier, opts)) {
        // The streamed path (game review, follow-up chat) is the flagship's
        // main road, and until 2026-09-06 it logged nothing on success — the
        // only production line naming the model came from callLLM. Same
        // fields as that line, so "which model served this review?" is one
        // log search either way.
        if (ev.type === "done") {
          log.info("LLM stream completed via Anthropic", {
            tier: opts.tier,
            model: ev.result.model,
            inputTokens: ev.result.inputTokens,
            outputTokens: ev.result.outputTokens,
            cacheCreationTokens: ev.result.cacheCreationTokens,
            cacheReadTokens: ev.result.cacheReadTokens,
            elapsedMs: ev.result.elapsedMs,
          });
        }
        yield ev;
      }
      return;
    } catch (err) {
      const e = toSafeLLMError(err, "anthropic");
      log.warn(
        "Anthropic streaming failed, falling back to OpenAI non-streaming",
        {
          tier: opts.tier,
          status: e.status,
          code: e.code,
        }
      );
      if (!openaiAvailable) {
        throw e;
      }
      // fall through to OpenAI fallback below
    }
  }

  const result = await callOpenAI(opts.tier, opts);
  if (result.content) yield { type: "text", delta: result.content };
  yield { type: "done", result };
}

// ── Custom error type ───────────────────────────────────────────────────────
export class LLMError extends Error {
  constructor(
    public provider: LLMProvider,
    public status: number,
    public code: LLMErrorCode
  ) {
    super(`AI provider error: ${code}`);
    this.name = "LLMError";
  }
}

export function toSafeLLMError(
  error: unknown,
  provider: LLMProvider = "anthropic"
): LLMError {
  return error instanceof LLMError
    ? error
    : new LLMError(provider, 0, "provider_network_error");
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Call the best available LLM for the given tier.
 *
 * Order:
 *   1. If `forceProvider` is set, go there directly (no fallback).
 *   2. Anthropic (if key is valid). On any error, fall through to step 3.
 *   3. OpenAI (if key is valid).
 *
 * If both fail or neither is configured, throws a content-free LLMError.
 */
export async function callLLM(opts: CallLLMOptions): Promise<LLMResult> {
  const anthropicAvailable = isValidAnthropicKey(ANTHROPIC_API_KEY);
  const openaiAvailable = isValidOpenAIKey(OPENAI_API_KEY);

  if (!anthropicAvailable && !openaiAvailable) {
    throw new LLMError("anthropic", 0, "providers_unavailable");
  }

  // Forced provider (skip fallback — useful for diagnostics).
  if (opts.forceProvider === "anthropic") {
    return callAnthropic(opts.tier, opts);
  }
  if (opts.forceProvider === "openai") {
    return callOpenAI(opts.tier, opts);
  }

  // Primary: Anthropic.
  if (anthropicAvailable) {
    try {
      const result = await callAnthropic(opts.tier, opts);
      log.info("LLM call succeeded via Anthropic", {
        tier: opts.tier,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cacheCreationTokens: result.cacheCreationTokens,
        cacheReadTokens: result.cacheReadTokens,
        elapsedMs: result.elapsedMs,
      });
      return result;
    } catch (err) {
      // Belt-and-suspenders abort check: if the caller's signal aborted
      // OR the error is named AbortError, do NOT fall back to OpenAI —
      // that would re-spawn the orphan as an OpenAI request and defeat
      // the purpose of withPipelineTimeout's cancellation. The two
      // conditions should coincide but timing windows can fool a
      // single-condition check; checking both is cheap.
      const isAbort =
        (err instanceof Error && err.name === "AbortError") ||
        opts.signal?.aborted === true;
      if (isAbort) {
        throw err;
      }

      const e = toSafeLLMError(err, "anthropic");
      log.warn("Anthropic call failed, falling back to OpenAI", {
        tier: opts.tier,
        status: e.status,
        code: e.code,
      });

      if (!openaiAvailable) {
        throw e;
      }

      try {
        const fallback = await callOpenAI(opts.tier, opts);
        const withPrimaryError: LLMResult = {
          ...fallback,
          primaryError: {
            provider: "anthropic",
            status: e.status,
            code: e.code,
          },
        };
        return withPrimaryError;
      } catch (err2) {
        const e2 = toSafeLLMError(err2, "openai");
        log.error("Both LLM providers failed", {
          anthropic: { status: e.status, code: e.code },
          openai: { status: e2.status, code: e2.code },
        });
        throw e2;
      }
    }
  }

  // Only OpenAI available.
  const result = await callOpenAI(opts.tier, opts);
  log.info("LLM call succeeded via OpenAI (Anthropic unavailable)", {
    tier: opts.tier,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    elapsedMs: result.elapsedMs,
  });
  return result;
}

// ── Diagnostics ─────────────────────────────────────────────────────────────
export function getProviderStatus() {
  return {
    anthropic: {
      configured: !!ANTHROPIC_API_KEY,
      keyValid: isValidAnthropicKey(ANTHROPIC_API_KEY),
    },
    openai: {
      configured: !!OPENAI_API_KEY,
      keyValid: isValidOpenAIKey(OPENAI_API_KEY),
    },
  };
}
