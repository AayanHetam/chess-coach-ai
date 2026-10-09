import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generateCacheKey,
  getCachedMoments,
  getCachedResponse,
  setCachedResponse,
  clearCache,
} from "../responseCache";
import type { TurnMoment } from "@/lib/coach/turnMoment";

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

describe("generateCacheKey — move-history scoping (2026-07-05)", () => {
  const FEN2 = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  it("two different games reaching the same position get DIFFERENT keys", () => {
    // Regression: keying on final FEN alone meant transpositions shared a
    // cached response narrating the WRONG game's moves.
    const viaItalian = generateCacheKey(FEN2, "intermediate", "analyze", "p", ["e4", "e5", "Nf3", "Nc6", "Bc4"]);
    const viaScotch = generateCacheKey(FEN2, "intermediate", "analyze", "p", ["e4", "e5", "Nf3", "Nc6", "d4"]);
    expect(viaItalian).not.toBe(viaScotch);
  });

  it("same game + question is stable", () => {
    const a = generateCacheKey(FEN2, "intermediate", "analyze", "p", ["e4", "e5"]);
    const b = generateCacheKey(FEN2, "intermediate", "analyze", "p", ["e4", "e5"]);
    expect(a).toBe(b);
  });

  it("absent history collapses to one bucket (position-only analysis)", () => {
    const a = generateCacheKey(FEN2, "intermediate", "analyze", "p");
    const b = generateCacheKey(FEN2, "intermediate", "analyze", "p", []);
    expect(a).toBe(b);
  });
});

describe("response cache moments (COACH_TURN1_MOMENTS)", () => {
  const FEN8 = "r1b1kbnr/pp1ppppp/2n5/1N6/4P3/5N2/P1P2PPP/2qQKB1R w Kkq - 0 8";
  const moment = {
    idea: "You saw the knight fork on c7.",
    happens: "The queen on c1 was free with 8. Qxc1.",
    proof: { kind: "engine", moveNumber: 8, color: "w" },
    lesson: null,
    question: null,
    more: null,
    omitted: [],
    ply: 14,
    fen: FEN8,
    move: {
      san: "Nc7+",
      moveNumber: 8,
      color: "w",
      verdict: "blunder",
      evalBefore: "+2.84",
      evalAfter: "-2.11",
    },
    annotations: [],
    proofLine: null,
    actions: [],
    card: {
      factIdPrefix: "M2",
      moveNumber: 8,
      color: "w",
      playedSan: "Nc7+",
      key: "0123abcd",
    },
  } as TurnMoment;

  beforeEach(() => {
    clearCache();
  });
  afterEach(() => {
    vi.useRealTimers();
    clearCache();
  });

  it("is null for a missing entry and for one stored without moments", () => {
    expect(getCachedMoments("not-stored")).toBeNull();
    setCachedResponse("plain", "analysis body", 1.0);
    expect(getCachedMoments("plain")).toBeNull();
    setCachedResponse("empty", "analysis body", 1.0, []);
    expect(getCachedMoments("empty")).toBeNull();
  });

  it("stores moments beside the text under the same key", () => {
    setCachedResponse("k", "analysis body", 1.0, [moment]);
    expect(getCachedResponse("k")).toBe("analysis body");
    expect(getCachedMoments("k")).toEqual([moment]);
  });

  it("a later set without moments clears them", () => {
    setCachedResponse("k", "analysis body", 1.0, [moment]);
    setCachedResponse("k", "analysis body", 1.0);
    expect(getCachedMoments("k")).toBeNull();
    expect(getCachedResponse("k")).toBe("analysis body");
  });

  it("is null once the entry has expired", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
    setCachedResponse("k", "analysis body", 1.0, [moment]);
    expect(getCachedMoments("k")).toEqual([moment]);
    vi.setSystemTime(new Date("2026-10-10T12:00:01Z"));
    expect(getCachedMoments("k")).toBeNull();
    expect(getCachedResponse("k")).toBeNull();
  });

  it("is not stored for a response the cache refuses", () => {
    setCachedResponse("low", "analysis body", 0.5, [moment]);
    expect(getCachedMoments("low")).toBeNull();
  });
});
