import { describe, it, expect } from "vitest";

import { generateContextId } from "../analysisContextCache";

const MOVES = ["e4", "e5", "Nf3", "Nc6"];
const FEN = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";

describe("generateContextId — uid scoping", () => {
  it("gives two users analyzing the same game DIFFERENT context ids", () => {
    // Regression: without uid in the key, two users analyzing the same game
    // (e.g. a master game) shared one cache entry — last write won, and the
    // other user's follow-ups ran with someone else's persona/rating/analysis.
    const a = generateContextId(MOVES, FEN, "w", "user-a");
    const b = generateContextId(MOVES, FEN, "w", "user-b");
    expect(a).not.toBe(b);
  });

  it("is stable for the same user + game (reconnection)", () => {
    const a1 = generateContextId(MOVES, FEN, "w", "user-a");
    const a2 = generateContextId(MOVES, FEN, "w", "user-a");
    expect(a1).toBe(a2);
  });

  it("keeps the legacy key when uid is omitted", () => {
    const legacy1 = generateContextId(MOVES, FEN, "w");
    const legacy2 = generateContextId(MOVES, FEN, "w", undefined);
    expect(legacy1).toBe(legacy2);
  });

  it("still varies by game and color", () => {
    const base = generateContextId(MOVES, FEN, "w", "user-a");
    expect(generateContextId(["d4"], FEN, "w", "user-a")).not.toBe(base);
    expect(generateContextId(MOVES, FEN, "b", "user-a")).not.toBe(base);
  });
});
