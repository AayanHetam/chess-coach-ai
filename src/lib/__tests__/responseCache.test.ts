import { describe, it, expect, beforeEach } from "vitest";
import {
  generateCacheKey,
  getCachedResponse,
  setCachedResponse,
  clearCache,
} from "../responseCache";

const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("generateCacheKey", () => {
  it("is deterministic for the same inputs", () => {
    const a = generateCacheKey(FEN, "intermediate", "what should I do here?");
    const b = generateCacheKey(FEN, "intermediate", "what should I do here?");
    expect(a).toBe(b);
  });

  it("normalises the user message (case + whitespace)", () => {
    const a = generateCacheKey(FEN, "intermediate", "What should I DO?");
    const b = generateCacheKey(FEN, "intermediate", "  what should i do?  ");
    expect(a).toBe(b);
  });

  it("strips half-move + full-move counters from the FEN so the same position at different move numbers shares the cache", () => {
    const fenEarly = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const fenLater = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 12 30";
    expect(generateCacheKey(fenEarly, "intermediate", "go")).toBe(
      generateCacheKey(fenLater, "intermediate", "go"),
    );
  });

  it("differentiates by skill level", () => {
    const beginner = generateCacheKey(FEN, "beginner", "go");
    const advanced = generateCacheKey(FEN, "advanced", "go");
    expect(beginner).not.toBe(advanced);
  });

  describe("persona signature scoping", () => {
    it("produces the same key when the persona signature matches", () => {
      const sig = "friendly|masti|tactical|tactics,endgames|caro-kann,najdorf";
      const a = generateCacheKey(FEN, "intermediate", "go", sig);
      const b = generateCacheKey(FEN, "intermediate", "go", sig);
      expect(a).toBe(b);
    });

    it("produces a different key when the personality changes", () => {
      const sigFriendly = "friendly|masti|tactical||";
      const sigStrict = "grandmaster|strict|positional||";
      expect(generateCacheKey(FEN, "intermediate", "go", sigFriendly)).not.toBe(
        generateCacheKey(FEN, "intermediate", "go", sigStrict),
      );
    });

    it("produces a different key when the coach tone changes", () => {
      expect(
        generateCacheKey(FEN, "intermediate", "go", "friendly|masti|||"),
      ).not.toBe(
        generateCacheKey(FEN, "intermediate", "go", "friendly|strict|||"),
      );
    });

    it("produces a different key when the playing style changes", () => {
      expect(
        generateCacheKey(FEN, "intermediate", "go", "friendly||tactical||"),
      ).not.toBe(
        generateCacheKey(FEN, "intermediate", "go", "friendly||positional||"),
      );
    });

    it("collapses no-signature callers and empty-signature callers to the same key (backward compatible)", () => {
      expect(generateCacheKey(FEN, "intermediate", "go")).toBe(
        generateCacheKey(FEN, "intermediate", "go", ""),
      );
    });
  });
});

describe("response cache round-trip", () => {
  beforeEach(() => {
    clearCache();
  });

  it("returns null on a miss", () => {
    expect(getCachedResponse("not-stored")).toBeNull();
  });

  it("stores and reads back a high-scoring response", () => {
    const key = generateCacheKey(FEN, "intermediate", "go", "friendly|||||");
    setCachedResponse(key, "analysis body", 0.95);
    expect(getCachedResponse(key)).toBe("analysis body");
  });

  it("does NOT store low-scoring responses", () => {
    const key = generateCacheKey(FEN, "intermediate", "go", "friendly|||||");
    setCachedResponse(key, "analysis body", 0.6);
    expect(getCachedResponse(key)).toBeNull();
  });

  it("isolates two users with different persona signatures on the same FEN + question", () => {
    // The load-bearing scenario: without persona in the key, userA's cached
    // response would leak to userB. With persona in the key, userB misses
    // and gets their own analysis.
    const keyUserA = generateCacheKey(
      FEN,
      "intermediate",
      "what should I do?",
      "friendly|masti|tactical||",
    );
    const keyUserB = generateCacheKey(
      FEN,
      "intermediate",
      "what should I do?",
      "grandmaster|strict|positional||",
    );
    expect(keyUserA).not.toBe(keyUserB);
    setCachedResponse(keyUserA, "warm-and-fuzzy reply", 0.95);
    expect(getCachedResponse(keyUserB)).toBeNull();
    expect(getCachedResponse(keyUserA)).toBe("warm-and-fuzzy reply");
  });
});
