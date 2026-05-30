import { describe, it, expect } from "vitest";
import {
  estimateBaselineCostUSD,
  estimateCostUSD,
  getPricing,
  MODEL_PRICING,
} from "../llmPricing";

describe("llmPricing", () => {
  it("returns null for unknown model", () => {
    expect(getPricing("gpt-5-ultra")).toBeNull();
    expect(
      estimateCostUSD({
        model: "gpt-5-ultra",
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    ).toBeNull();
  });

  it("prices Sonnet 4 against published rates", () => {
    // 1M input × $3 + 1M output × $15 + 0 cache = $18.00
    const cost = estimateCostUSD({
      model: "claude-sonnet-4-20250514",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(18.0, 6);
  });

  it("prices Anthropic cache reads and writes separately", () => {
    // Haiku 4.5: $1 in, $5 out, $1.25 cache write, $0.10 cache read
    // 100k cache read × $0.10/M + 100k cache write × $1.25/M = $0.01 + $0.125 = $0.135
    const cost = estimateCostUSD({
      model: "claude-haiku-4-5-20251001",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 100_000,
      cacheCreationTokens: 100_000,
    });
    expect(cost).toBeCloseTo(0.135, 6);
  });

  it("ignores cache fields for OpenAI models (no cache pricing line item)", () => {
    // gpt-4o: $2.5 in, $10 out — cache fields should be no-ops since
    // OpenAI's API/billing doesn't expose a cache line item.
    const cost = estimateCostUSD({
      model: "gpt-4o",
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 1_000_000_000,
      cacheCreationTokens: 1_000_000_000,
    });
    expect(cost).toBeCloseTo(2.5, 6);
  });

  it("zeros across the board when no tokens were used", () => {
    const cost = estimateCostUSD({
      model: "gpt-4o-mini",
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(cost).toBe(0);
  });

  it("estimateBaselineCostUSD prices cache reads/writes at full input rate", () => {
    // Sonnet 4 baseline: pretend all cache tokens were just normal input.
    // 100k cache_read + 100k cache_write → counterfactual input 200k.
    // 200k × $3/M + 0 output = $0.60.
    const baseline = estimateBaselineCostUSD({
      model: "claude-sonnet-4-20250514",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 100_000,
      cacheCreationTokens: 100_000,
    });
    expect(baseline).toBeCloseTo(0.6, 6);
  });

  it("estimateBaselineCostUSD adds counterfactual to actual input", () => {
    // 50k actual input + 100k cache_read + 50k cache_write → counter 200k.
    const baseline = estimateBaselineCostUSD({
      model: "claude-haiku-4-5-20251001",
      inputTokens: 50_000,
      outputTokens: 0,
      cacheReadTokens: 100_000,
      cacheCreationTokens: 50_000,
    });
    // Haiku $1/M input: 200k × $1/M = $0.20.
    expect(baseline).toBeCloseTo(0.2, 6);
  });

  it("estimateBaselineCostUSD equals actual cost for OpenAI (no cache rates)", () => {
    const args = {
      model: "gpt-4o",
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
    expect(estimateBaselineCostUSD(args)).toBe(estimateCostUSD(args));
  });

  it("estimateBaselineCostUSD returns null for unknown model", () => {
    expect(
      estimateBaselineCostUSD({
        model: "claude-future-99",
        inputTokens: 100,
        outputTokens: 100,
      }),
    ).toBeNull();
  });

  it("savings (baseline − actual) is positive when cache is exercised", () => {
    const args = {
      model: "claude-sonnet-4-20250514",
      inputTokens: 1_000,
      outputTokens: 1_000,
      cacheReadTokens: 100_000,
      cacheCreationTokens: 10_000,
    };
    const baseline = estimateBaselineCostUSD(args)!;
    const actual = estimateCostUSD(args)!;
    expect(baseline - actual).toBeGreaterThan(0);
  });

  it("every entry in MODEL_PRICING has a sane provider and rate", () => {
    for (const [model, p] of Object.entries(MODEL_PRICING)) {
      expect(model).toMatch(/.+/);
      expect(["anthropic", "openai"]).toContain(p.provider);
      expect(p.inputPerMillion).toBeGreaterThan(0);
      expect(p.outputPerMillion).toBeGreaterThanOrEqual(p.inputPerMillion);
      // Anthropic models must declare cache rates; OpenAI must not.
      if (p.provider === "anthropic") {
        expect(p.cacheWritePerMillion).toBeGreaterThan(0);
        expect(p.cacheReadPerMillion).toBeGreaterThan(0);
      } else {
        expect(p.cacheWritePerMillion).toBeUndefined();
        expect(p.cacheReadPerMillion).toBeUndefined();
      }
    }
  });
});
