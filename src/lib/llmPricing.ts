/**
 * LLM model pricing — used by the /admin/cost dashboard to turn raw
 * token counts (from llmStatsAggregator) into a USD cost estimate.
 *
 * All rates are USD per 1,000,000 tokens, as published by the model
 * vendor at the time of writing. Update this table when a provider
 * changes their public list price.
 *
 * Sources (refresh annually or when a provider posts a change):
 *   - Anthropic: anthropic.com/pricing#api  (Sonnet 4, Haiku 4.5)
 *   - OpenAI:    openai.com/api/pricing      (gpt-4o, gpt-4o-mini)
 *
 * Two pricing fields are Anthropic-only because OpenAI doesn't have a
 * separate cache-read / cache-write line item. For unknown models we
 * return null so the dashboard can show "—" instead of pretending to
 * have a number.
 */

export interface ModelPricing {
  /** Provider tag matching LLMResult.provider ("anthropic" | "openai"). */
  provider: string;
  /** Human label for display ("Claude Sonnet 4"). */
  displayName: string;
  /** USD per 1M input tokens (uncached). */
  inputPerMillion: number;
  /** USD per 1M output tokens. */
  outputPerMillion: number;
  /** USD per 1M tokens written to the cache (Anthropic). undefined elsewhere. */
  cacheWritePerMillion?: number;
  /** USD per 1M tokens served from the cache (Anthropic). undefined elsewhere. */
  cacheReadPerMillion?: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-4-20250514": {
    provider: "anthropic",
    displayName: "Claude Sonnet 4",
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  "claude-haiku-4-5-20251001": {
    provider: "anthropic",
    displayName: "Claude Haiku 4.5",
    inputPerMillion: 1.0,
    outputPerMillion: 5.0,
    cacheWritePerMillion: 1.25,
    cacheReadPerMillion: 0.1,
  },
  "gpt-4o": {
    provider: "openai",
    displayName: "GPT-4o",
    inputPerMillion: 2.5,
    outputPerMillion: 10.0,
  },
  "gpt-4o-mini": {
    provider: "openai",
    displayName: "GPT-4o mini",
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
  },
};

export function getPricing(model: string): ModelPricing | null {
  return MODEL_PRICING[model] ?? null;
}

/**
 * Compute USD cost for a token bundle against a known model's pricing.
 * Returns null when the model is not in the pricing table — keeps the
 * dashboard from inventing numbers for an unknown future model.
 *
 * For Anthropic, `inputTokens` is the uncached prompt input (LLMResult
 * already excludes cache-read/-write tokens from input_tokens per the
 * Anthropic API response shape). Cache reads and cache writes are
 * charged separately at their own line-item rates.
 */
export function estimateCostUSD(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}): number | null {
  const price = getPricing(args.model);
  if (!price) return null;
  const inputCost = (args.inputTokens / 1_000_000) * price.inputPerMillion;
  const outputCost = (args.outputTokens / 1_000_000) * price.outputPerMillion;
  const cacheWriteCost =
    price.cacheWritePerMillion !== undefined
      ? ((args.cacheCreationTokens ?? 0) / 1_000_000) * price.cacheWritePerMillion
      : 0;
  const cacheReadCost =
    price.cacheReadPerMillion !== undefined
      ? ((args.cacheReadTokens ?? 0) / 1_000_000) * price.cacheReadPerMillion
      : 0;
  return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}
