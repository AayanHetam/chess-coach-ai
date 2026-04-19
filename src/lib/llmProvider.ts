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
}

export interface LLMResult {
  content: string;
  provider: LLMProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** How long the provider took (ms). Excludes fallback retry time. */
  elapsedMs: number;
  /** Populated when the primary provider failed and we fell back. */
  primaryError?: { provider: LLMProvider; status?: number; message: string };
}

// ── Model mapping ───────────────────────────────────────────────────────────
const MODELS = {
  anthropic: {
    flagship: "claude-sonnet-4-20250514",
    fast: "claude-haiku-4-20250514",
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

  const response = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      system: opts.system,
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
