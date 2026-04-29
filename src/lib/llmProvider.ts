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
  primaryError?: { provider: LLMProvider; status?: number; message: string };
}

// ── Model mapping ───────────────────────────────────────────────────────────
const MODELS = {
  anthropic: {
    flagship: "claude-sonnet-4-20250514",
    fast: "claude-haiku-4-5-20251001",
  },
  openai: {
    flagship: "gpt-4o",
    fast: "gpt-4o-mini",
  },
} as const;

// ── Anthropic call ──────────────────────────────────────────────────────────
async function callAnthropic(
  tier: LLMTier,
  opts: CallLLMOptions
): Promise<LLMResult> {
  if (!isValidAnthropicKey(ANTHROPIC_API_KEY)) {
    throw new LLMError("anthropic", 0, "ANTHROPIC_API_KEY not configured or invalid prefix");
  }

  const model = MODELS.anthropic[tier];
  const startedAt = Date.now();

  // When cacheSystem is on, we send the system as a single content block
  // with an ephemeral cache marker. The API silently skips the cache when
  // the block is below the model's minimum cacheable size, so this is safe
  // even for short prompts.
  const systemPayload: unknown =
    opts.cacheSystem && opts.system
      ? [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }]
      : opts.system;

  const response = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
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
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 1500,
    }),
  });

  const elapsedMs = Date.now() - startedAt;

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new LLMError("anthropic", response.status, body.slice(0, 300));
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;
  if (typeof content !== "string") {
    throw new LLMError("anthropic", 200, "Anthropic returned no text content");
  }

  return {
    content,
    provider: "anthropic",
    model,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    cacheCreationTokens: data.usage?.cache_creation_input_tokens ?? 0,
    cacheReadTokens: data.usage?.cache_read_input_tokens ?? 0,
    elapsedMs,
  };
}

// ── OpenAI call ─────────────────────────────────────────────────────────────
async function callOpenAI(
  tier: LLMTier,
  opts: CallLLMOptions
): Promise<LLMResult> {
  if (!isValidOpenAIKey(OPENAI_API_KEY)) {
    throw new LLMError("openai", 0, "OPENAI_API_KEY not configured or invalid prefix");
  }

  const model = MODELS.openai[tier];
  const startedAt = Date.now();

  // OpenAI takes system as a message in the array, not a separate field.
  const openaiMessages: Array<{ role: string; content: string }> = [];
  if (opts.system) {
    openaiMessages.push({ role: "system", content: opts.system });
  }
  for (const m of opts.messages) {
    openaiMessages.push({ role: m.role, content: m.content });
  }

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
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
    }),
  });

  const elapsedMs = Date.now() - startedAt;

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new LLMError("openai", response.status, body.slice(0, 300));
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new LLMError("openai", 200, "OpenAI returned no message content");
  }

  return {
    content,
    provider: "openai",
    model,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    elapsedMs,
  };
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
    throw new LLMError("anthropic", 0, "ANTHROPIC_API_KEY not configured or invalid prefix");
  }

  const model = MODELS.anthropic[tier];
  const startedAt = Date.now();

  const systemPayload: unknown =
    opts.cacheSystem && opts.system
      ? [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }]
      : opts.system;

  const response = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
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
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 1500,
      stream: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new LLMError("anthropic", response.status, body.slice(0, 300));
  }
  if (!response.body) {
    throw new LLMError("anthropic", 200, "Anthropic streaming response had no body");
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

          if (data.type === "content_block_delta" && data.delta?.type === "text_delta") {
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
    try { reader.releaseLock(); } catch { /* ignore */ }
  }

  const elapsedMs = Date.now() - startedAt;
  yield {
    type: "done",
    result: {
      content: fullText,
      provider: "anthropic",
      model,
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens,
      elapsedMs,
    },
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
    throw new LLMError(
      "anthropic",
      0,
      "Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is configured."
    );
  }

  if (opts.forceProvider === "openai") {
    const result = await callOpenAI(opts.tier, opts);
    if (result.content) yield { type: "text", delta: result.content };
    yield { type: "done", result };
    return;
  }

  if (anthropicAvailable) {
    try {
      yield* callAnthropicStream(opts.tier, opts);
      return;
    } catch (err) {
      const e = err instanceof LLMError ? err : new LLMError("anthropic", 0, String(err));
      log.warn("Anthropic streaming failed, falling back to OpenAI non-streaming", {
        tier: opts.tier,
        status: e.status,
        detail: e.detail.slice(0, 200),
      });
      if (!openaiAvailable) throw e;
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
    public detail: string
  ) {
    super(`[${provider}] ${status ? `HTTP ${status} ` : ""}${detail}`);
    this.name = "LLMError";
  }
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
 * If both fail or neither is configured, throws an LLMError with the most
 * recent failure detail.
 */
export async function callLLM(opts: CallLLMOptions): Promise<LLMResult> {
  const anthropicAvailable = isValidAnthropicKey(ANTHROPIC_API_KEY);
  const openaiAvailable = isValidOpenAIKey(OPENAI_API_KEY);

  if (!anthropicAvailable && !openaiAvailable) {
    throw new LLMError(
      "anthropic",
      0,
      "Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is configured."
    );
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
      const e = err instanceof LLMError ? err : new LLMError("anthropic", 0, String(err));
      log.warn("Anthropic call failed, falling back to OpenAI", {
        tier: opts.tier,
        status: e.status,
        detail: e.detail.slice(0, 200),
      });

      if (!openaiAvailable) {
        throw e;
      }

      try {
        const fallback = await callOpenAI(opts.tier, opts);
        return {
          ...fallback,
          primaryError: { provider: "anthropic", status: e.status, message: e.detail },
        };
      } catch (err2) {
        const e2 = err2 instanceof LLMError ? err2 : new LLMError("openai", 0, String(err2));
        log.error("Both LLM providers failed", {
          anthropic: { status: e.status, detail: e.detail.slice(0, 100) },
          openai: { status: e2.status, detail: e2.detail.slice(0, 100) },
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
      keyPrefix: ANTHROPIC_API_KEY
        ? `${ANTHROPIC_API_KEY.slice(0, 10)}…${ANTHROPIC_API_KEY.slice(-4)}`
        : null,
    },
    openai: {
      configured: !!OPENAI_API_KEY,
      keyValid: isValidOpenAIKey(OPENAI_API_KEY),
      keyPrefix: OPENAI_API_KEY
        ? `${OPENAI_API_KEY.slice(0, 10)}…${OPENAI_API_KEY.slice(-4)}`
        : null,
    },
  };
}
