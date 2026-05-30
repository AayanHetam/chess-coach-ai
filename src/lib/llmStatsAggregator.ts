/**
 * LLM Stats Aggregator — process-scoped running totals across every
 * /api/enhanced-analysis and /api/chat call that hit a provider.
 *
 * Two motivations:
 *
 *   1. Cost-claim verification. PRs #70 + #77 split the coach prompt so
 *      Anthropic's ephemeral cache amortises across users sharing a
 *      persona. The audit projected ~4× reduction; we now have the
 *      counters to back that up with a running cacheHitRate instead of
 *      grepping Vercel Log Drain.
 *
 *   2. Surfacing fallback drift. When Anthropic 5xx and we fall back to
 *      OpenAI, llmResult.provider flips. The totals here let an admin
 *      spot a sustained fallback condition that wouldn't otherwise page
 *      anyone (PR #71 wired Sentry only on hard failure, not silent
 *      fallback).
 *
 * Resets on cold start (in-memory, single Vercel function instance).
 * Production usage is light enough that even one instance gives a
 * useful signal; if multi-instance accuracy ever matters we'd back this
 * with an external store. For now: simplicity > durability.
 */

export interface LLMProviderTotals {
  /** Total successful calls served by this provider. */
  callCount: number;
  /** Total input (prompt) tokens charged at full rate. */
  inputTokens: number;
  /** Total output (completion) tokens. */
  outputTokens: number;
  /** Tokens written to the Anthropic prompt cache (Anthropic only). */
  cacheCreationTokens: number;
  /** Tokens served from the Anthropic prompt cache (Anthropic only). */
  cacheReadTokens: number;
  /** Sum of provider-reported elapsedMs across all calls. */
  elapsedMsSum: number;
}

/** Per-model breakout — same shape as provider totals plus a `provider` tag. */
export interface LLMModelTotals extends LLMProviderTotals {
  provider: string;
}

export interface LLMStatsSnapshot {
  /** Process start time (wall clock). Useful to ground "since X" copy. */
  startedAt: number;
  /** Last successful call timestamp; undefined if none yet. */
  lastCallAt?: number;
  /** Per-provider running totals. */
  byProvider: Record<string, LLMProviderTotals>;
  /**
   * Per-model running totals. Keyed by the exact model ID the provider
   * returned (e.g. "claude-sonnet-4-20250514"). Lets the cost dashboard
   * apply per-model pricing instead of a blended provider rate.
   */
  byModel: Record<string, LLMModelTotals>;
  /** Convenience aggregates rolled up across all providers. */
  totals: LLMProviderTotals;
  /**
   * Cache-hit rate as a fraction in [0,1], computed against Anthropic
   * cacheable input. Returns null when the denominator is zero (no
   * Anthropic calls have hit the cacheable-prefix threshold yet).
   */
  cacheHitRate: number | null;
}

const startedAt = Date.now();
let lastCallAt: number | undefined;

const byProvider: Record<string, LLMProviderTotals> = {};
const byModel: Record<string, LLMModelTotals> = {};

function ensureProvider(provider: string): LLMProviderTotals {
  if (!byProvider[provider]) {
    byProvider[provider] = {
      callCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      elapsedMsSum: 0,
    };
  }
  return byProvider[provider];
}

function ensureModel(model: string, provider: string): LLMModelTotals {
  if (!byModel[model]) {
    byModel[model] = {
      provider,
      callCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      elapsedMsSum: 0,
    };
  }
  return byModel[model];
}

/**
 * Record a successful LLM call. Safe to invoke synchronously after the
 * provider returns. Silently tolerates undefined counters so callers can
 * pass straight from an LLMResult without hand-coalescing zeros.
 */
export function recordLLMCall(stats: {
  provider: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  elapsedMs?: number;
}): void {
  const p = ensureProvider(stats.provider);
  p.callCount += 1;
  p.inputTokens += stats.inputTokens ?? 0;
  p.outputTokens += stats.outputTokens ?? 0;
  p.cacheCreationTokens += stats.cacheCreationTokens ?? 0;
  p.cacheReadTokens += stats.cacheReadTokens ?? 0;
  p.elapsedMsSum += stats.elapsedMs ?? 0;
  if (stats.model) {
    const m = ensureModel(stats.model, stats.provider);
    m.callCount += 1;
    m.inputTokens += stats.inputTokens ?? 0;
    m.outputTokens += stats.outputTokens ?? 0;
    m.cacheCreationTokens += stats.cacheCreationTokens ?? 0;
    m.cacheReadTokens += stats.cacheReadTokens ?? 0;
    m.elapsedMsSum += stats.elapsedMs ?? 0;
  }
  lastCallAt = Date.now();
}

function rollup(): LLMProviderTotals {
  const totals: LLMProviderTotals = {
    callCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    elapsedMsSum: 0,
  };
  for (const p of Object.values(byProvider)) {
    totals.callCount += p.callCount;
    totals.inputTokens += p.inputTokens;
    totals.outputTokens += p.outputTokens;
    totals.cacheCreationTokens += p.cacheCreationTokens;
    totals.cacheReadTokens += p.cacheReadTokens;
    totals.elapsedMsSum += p.elapsedMsSum;
  }
  return totals;
}

/**
 * Read the current snapshot. Mutating the returned object is harmless —
 * we deep-clone so an admin endpoint can attach more fields without
 * corrupting the internal store.
 */
export function getLLMStats(): LLMStatsSnapshot {
  const totals = rollup();
  // Per-provider deep copy so callers can JSON-serialise freely.
  const byProviderCopy: Record<string, LLMProviderTotals> = {};
  for (const [name, p] of Object.entries(byProvider)) {
    byProviderCopy[name] = { ...p };
  }
  const byModelCopy: Record<string, LLMModelTotals> = {};
  for (const [name, m] of Object.entries(byModel)) {
    byModelCopy[name] = { ...m };
  }
  // Cache hit rate against Anthropic input. Denominator = cached input
  // we COULD have served from the cache (read + creation). Numerator =
  // what we actually served from cache.
  const anthropic = byProvider["anthropic"];
  const cacheableInput =
    (anthropic?.cacheReadTokens ?? 0) + (anthropic?.cacheCreationTokens ?? 0);
  const cacheHitRate =
    cacheableInput > 0
      ? (anthropic?.cacheReadTokens ?? 0) / cacheableInput
      : null;
  return {
    startedAt,
    lastCallAt,
    byProvider: byProviderCopy,
    byModel: byModelCopy,
    totals,
    cacheHitRate,
  };
}

/**
 * Wipe the in-memory counters. Intended for tests; admin "reset" is not
 * wired since the process restarts on every Vercel cold start anyway.
 */
export function resetLLMStats(): void {
  for (const key of Object.keys(byProvider)) {
    delete byProvider[key];
  }
  for (const key of Object.keys(byModel)) {
    delete byModel[key];
  }
  lastCallAt = undefined;
}
