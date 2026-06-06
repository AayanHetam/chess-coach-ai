import { beforeEach, describe, expect, it } from "vitest";
import {
  _flushHintCache,
  _hintCacheSize,
  getCachedHint,
  setCachedHint,
} from "../cache";
import type { PuzzleHintResponse } from "@/lib/validation/puzzleHintSchemas";

function makeResponse(prose: string): PuzzleHintResponse {
  return {
    stage: "why_wrong",
    prose,
    mentions: [],
    meta: {
      model: "claude-haiku-4-5",
      provider: "anthropic",
      inputTokens: 100,
      outputTokens: 50,
      elapsedMs: 1200,
      cacheHit: false,
      leakRetry: false,
      leakFallback: false,
    },
  };
}

const k = (puzzleId: string, attempt: string | null = null) => ({
  puzzleId,
  stage: "why_wrong" as const,
  userAttemptSan: attempt,
  promptVersion: "1.0",
});

describe("hint cache", () => {
  beforeEach(() => {
    _flushHintCache();
  });

  it("misses on a key it hasn't seen", () => {
    expect(getCachedHint(k("p1"))).toBeNull();
  });

  it("hits on the same key after set", () => {
    setCachedHint(k("p1"), makeResponse("hello"));
    const got = getCachedHint(k("p1"));
    expect(got?.prose).toBe("hello");
  });

  it("distinguishes keys by attempt SAN", () => {
    setCachedHint(k("p1", "Bxc4"), makeResponse("for Bxc4"));
    setCachedHint(k("p1", "Bxh7"), makeResponse("for Bxh7"));
    expect(getCachedHint(k("p1", "Bxc4"))?.prose).toBe("for Bxc4");
    expect(getCachedHint(k("p1", "Bxh7"))?.prose).toBe("for Bxh7");
  });

  it("distinguishes keys by promptVersion", () => {
    setCachedHint(k("p1"), makeResponse("v1 response"));
    expect(
      getCachedHint({ ...k("p1"), promptVersion: "2.0" }),
    ).toBeNull();
  });

  it("evicts the LRU entry when capacity is exceeded", () => {
    // Fill to capacity + 1 to force one eviction.
    for (let i = 0; i < 257; i++) {
      setCachedHint(k(`p${i}`), makeResponse(`#${i}`));
    }
    expect(_hintCacheSize()).toBe(256);
    // p0 should have been the LRU and evicted.
    expect(getCachedHint(k("p0"))).toBeNull();
    // p256 (the latest insert) is present.
    expect(getCachedHint(k("p256"))?.prose).toBe("#256");
  });

  it("bumps LRU on read so frequently accessed entries survive eviction", () => {
    setCachedHint(k("p0"), makeResponse("hot"));
    for (let i = 1; i < 256; i++) {
      setCachedHint(k(`p${i}`), makeResponse(`#${i}`));
      // Keep p0 hot by reading it after each insert.
      getCachedHint(k("p0"));
    }
    // Now insert one more — that should evict p1 (the actual LRU after
    // p0's bumps), not p0.
    setCachedHint(k("p_overflow"), makeResponse("new"));
    expect(getCachedHint(k("p0"))?.prose).toBe("hot");
    expect(getCachedHint(k("p1"))).toBeNull();
  });
});
