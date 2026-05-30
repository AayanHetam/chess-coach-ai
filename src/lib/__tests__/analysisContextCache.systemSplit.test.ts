import { describe, it, expect } from "vitest";
import {
  storeAnalysisContext,
  getAnalysisContext,
  type AnalysisContext,
} from "../analysisContextCache";

// /api/chat reads the cached AnalysisContext written by /api/enhanced-analysis
// and now consumes a split form: systemPromptStable goes into the cached
// prefix, systemPromptSuffix + the per-turn condensed game context ride
// uncached. The chat route still falls back to the joined `systemPrompt`
// when the split fields are absent (legacy cache entries from before the
// split landed). These tests pin that contract.

const baseContext = (
  overrides: Partial<AnalysisContext> = {},
): AnalysisContext => ({
  contextId: `t-${Math.random().toString(36).slice(2, 10)}`,
  gameContext: "## GAME OVERVIEW\n…",
  compactGameContext: "1. e4 e5 …",
  playedMoves: ["e4", "e5"],
  systemPrompt: "STABLE_BODY\n\nUSER_TAIL",
  systemPromptStable: "STABLE_BODY",
  systemPromptSuffix: "USER_TAIL",
  fewShotExamples: "",
  fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
  skillLevel: "intermediate" as const,
  playerColor: "w",
  moveCount: 1,
  createdAt: Date.now(),
  initialAnalysis: "The Italian Game beckons…",
  ...overrides,
});

describe("AnalysisContext system-prompt split", () => {
  it("persists the split fields on store + read", () => {
    const ctx = baseContext();
    storeAnalysisContext(ctx);
    const retrieved = getAnalysisContext(ctx.contextId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.systemPromptStable).toBe("STABLE_BODY");
    expect(retrieved?.systemPromptSuffix).toBe("USER_TAIL");
    // Joined form is still present for backward compat.
    expect(retrieved?.systemPrompt).toBe("STABLE_BODY\n\nUSER_TAIL");
  });

  it("permits a legacy entry without the split (forward compat)", () => {
    const ctx = baseContext({
      systemPromptStable: undefined,
      systemPromptSuffix: undefined,
    });
    storeAnalysisContext(ctx);
    const retrieved = getAnalysisContext(ctx.contextId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.systemPromptStable).toBeUndefined();
    expect(retrieved?.systemPromptSuffix).toBeUndefined();
    expect(retrieved?.systemPrompt).toBeTruthy();
  });

  it("two contexts sharing the same persona have identical stable halves", () => {
    // The point of the split: aliceCtx and bobCtx can ride the same prompt
    // cache prefix on /api/chat even though their suffixes differ — username,
    // rating, prefs all land in the suffix and never bust the cached block.
    const aliceCtx = baseContext({
      systemPromptStable: "STABLE_BODY",
      systemPromptSuffix: "USER CONTEXT: alice 1400",
    });
    const bobCtx = baseContext({
      systemPromptStable: "STABLE_BODY",
      systemPromptSuffix: "USER CONTEXT: bob 1900",
    });
    expect(aliceCtx.systemPromptStable).toBe(bobCtx.systemPromptStable);
    expect(aliceCtx.systemPromptSuffix).not.toBe(bobCtx.systemPromptSuffix);
  });
});
