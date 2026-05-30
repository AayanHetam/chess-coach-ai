import { describe, it, expect, beforeEach } from "vitest";
import {
  recordLLMCall,
  getLLMStats,
  resetLLMStats,
} from "../llmStatsAggregator";

describe("llmStatsAggregator", () => {
  beforeEach(() => {
    resetLLMStats();
  });

  it("returns zeroed totals with no calls recorded", () => {
    const s = getLLMStats();
    expect(s.totals.callCount).toBe(0);
    expect(s.totals.inputTokens).toBe(0);
    expect(s.byProvider).toEqual({});
    expect(s.cacheHitRate).toBeNull();
    expect(s.lastCallAt).toBeUndefined();
  });

  it("accumulates per-provider totals", () => {
    recordLLMCall({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationTokens: 80,
      cacheReadTokens: 0,
      elapsedMs: 1200,
    });
    recordLLMCall({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      inputTokens: 100,
      outputTokens: 60,
      cacheCreationTokens: 0,
      cacheReadTokens: 80,
      elapsedMs: 600,
    });
    const s = getLLMStats();
    expect(s.byProvider.anthropic.callCount).toBe(2);
    expect(s.byProvider.anthropic.inputTokens).toBe(200);
    expect(s.byProvider.anthropic.outputTokens).toBe(110);
    expect(s.byProvider.anthropic.cacheCreationTokens).toBe(80);
    expect(s.byProvider.anthropic.cacheReadTokens).toBe(80);
    expect(s.byProvider.anthropic.elapsedMsSum).toBe(1800);
  });

  it("tracks providers independently and rolls up totals", () => {
    recordLLMCall({
      provider: "anthropic",
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 80,
      cacheCreationTokens: 20,
      elapsedMs: 500,
    });
    recordLLMCall({
      provider: "openai",
      inputTokens: 200,
      outputTokens: 150,
      elapsedMs: 800,
    });
    const s = getLLMStats();
    expect(s.byProvider.anthropic.callCount).toBe(1);
    expect(s.byProvider.openai.callCount).toBe(1);
    expect(s.totals.callCount).toBe(2);
    expect(s.totals.inputTokens).toBe(300);
    expect(s.totals.outputTokens).toBe(200);
    expect(s.totals.elapsedMsSum).toBe(1300);
    // Cache metrics roll up too — but the hit rate denominator is Anthropic-
    // only (OpenAI has no cache concept).
    expect(s.totals.cacheReadTokens).toBe(80);
    expect(s.totals.cacheCreationTokens).toBe(20);
  });

  it("computes cacheHitRate against Anthropic cacheable input", () => {
    // 80 read, 20 creation = 80% hit rate
    recordLLMCall({
      provider: "anthropic",
      cacheReadTokens: 80,
      cacheCreationTokens: 20,
    });
    const s = getLLMStats();
    expect(s.cacheHitRate).toBeCloseTo(0.8);
  });

  it("returns null cacheHitRate when no Anthropic calls have hit the cache", () => {
    recordLLMCall({
      provider: "openai",
      inputTokens: 200,
      outputTokens: 100,
    });
    const s = getLLMStats();
    // OpenAI has no cache — Anthropic denominator is 0 — null.
    expect(s.cacheHitRate).toBeNull();
  });

  it("tolerates undefined token counters (LLMResult fields are all optional)", () => {
    expect(() =>
      recordLLMCall({ provider: "anthropic" }),
    ).not.toThrow();
    const s = getLLMStats();
    expect(s.byProvider.anthropic.callCount).toBe(1);
    expect(s.byProvider.anthropic.inputTokens).toBe(0);
    expect(s.byProvider.anthropic.cacheCreationTokens).toBe(0);
  });

  it("stamps lastCallAt on each successful recording", () => {
    const before = Date.now();
    recordLLMCall({ provider: "anthropic", inputTokens: 100 });
    const s = getLLMStats();
    expect(s.lastCallAt).toBeDefined();
    expect(s.lastCallAt!).toBeGreaterThanOrEqual(before);
  });

  it("returns a deep-copy snapshot — mutating it doesn't corrupt internal state", () => {
    recordLLMCall({ provider: "anthropic", inputTokens: 100 });
    const s = getLLMStats();
    s.byProvider.anthropic.inputTokens = 99999;
    s.totals.inputTokens = 99999;
    const fresh = getLLMStats();
    expect(fresh.byProvider.anthropic.inputTokens).toBe(100);
    expect(fresh.totals.inputTokens).toBe(100);
  });
});
