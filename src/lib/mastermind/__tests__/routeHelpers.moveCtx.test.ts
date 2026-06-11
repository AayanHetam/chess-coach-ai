/**
 * deriveMastermindMoveContext — before-move eval threading (Stage 9 v2).
 *
 * positions[i] = eval after i half-moves, so for a move-anchored context
 * with lastIdx = moveHistory.length:
 *   - stockfishEval       ← positions[lastIdx]      (after the move)
 *   - stockfishEvalBefore ← positions[lastIdx - 1]  (before the move)
 *   - stockfishLinesBefore ← positions[lastIdx - 1].lines (with pv intact)
 *
 * The before-fields feed buildAsyncSnapshotForMove: the grounding sources
 * (chessdb / Lc0 / Maia / Syzygy) are all fetched for fenBefore, and mixing
 * an after-move sfCp with a before-move lc0Cp would make lc0AgreesWithSf
 * compare two different positions.
 */

import { describe, it, expect } from "vitest";
import { deriveMastermindMoveContext } from "@/lib/mastermind/routeHelpers";

const MOVE_HISTORY = ["e4", "e5", "Nf3", "Nc6"];

const BEFORE_LINES = [
  { cp: 111, mate: undefined, depth: 18, pv: ["b8c6", "d2d4"] },
  { cp: 90, depth: 18, pv: ["g8f6"] },
];
const GAME_EVAL = {
  positions: [
    { lines: [{ cp: 10, pv: ["e2e4"] }] },
    { lines: [{ cp: 20, pv: ["e7e5"] }] },
    { lines: [{ cp: 30, pv: ["g1f3"] }] },
    { lines: BEFORE_LINES },
    { lines: [{ cp: 222, mate: undefined, pv: ["d2d4"] }] },
  ],
};

describe("deriveMastermindMoveContext — before/after eval split", () => {
  it("move-anchored: after-eval in stockfishEval, before-eval + lines in the Before fields", () => {
    const ctx = deriveMastermindMoveContext(
      "position_analysis",
      MOVE_HISTORY,
      undefined,
      GAME_EVAL,
    );
    expect(ctx.moveSan).toBe("Nc6");
    expect(ctx.stockfishEval.cp).toBe(222); // positions[4] — after Nc6
    expect(ctx.stockfishEvalBefore.cp).toBe(111); // positions[3] — before Nc6
    expect(ctx.stockfishLinesBefore).toEqual(BEFORE_LINES); // pv preserved
    expect(ctx.stockfishLinesBefore[0].pv).toEqual(["b8c6", "d2d4"]);
  });

  it("move-anchored without gameEval: Before fields degrade to {} / []", () => {
    const ctx = deriveMastermindMoveContext(
      "position_analysis",
      MOVE_HISTORY,
      undefined,
      undefined,
    );
    expect(ctx.stockfishEvalBefore).toEqual({});
    expect(ctx.stockfishLinesBefore).toEqual([]);
  });

  it("NON_MOVE_FOCUS category: degraded context carries empty Before fields", () => {
    const ctx = deriveMastermindMoveContext(
      "improvement_strategy",
      MOVE_HISTORY,
      undefined,
      GAME_EVAL,
    );
    expect(ctx.moveSan).toBeUndefined();
    expect(ctx.fenBefore).toBe(ctx.fenAfter);
    expect(ctx.stockfishEvalBefore).toEqual({});
    expect(ctx.stockfishLinesBefore).toEqual([]);
  });

  it("fen-anchored (position-only): before-eval IS the position's eval (positions[0])", () => {
    const FEN = "4k3/3q1r2/8/8/8/5N2/8/4K3 w - - 0 1";
    const eval0 = { positions: [{ lines: [{ cp: 55, pv: ["f3e5"] }] }] };
    const ctx = deriveMastermindMoveContext(
      "position_analysis",
      undefined,
      FEN,
      eval0,
    );
    expect(ctx.fenBefore).toBe(FEN);
    expect(ctx.stockfishEval.cp).toBe(55);
    expect(ctx.stockfishEvalBefore.cp).toBe(55);
    expect(ctx.stockfishLinesBefore[0].pv).toEqual(["f3e5"]);
  });

  it("fully-degraded fallback: empty Before fields", () => {
    const ctx = deriveMastermindMoveContext(
      "position_analysis",
      undefined,
      undefined,
      undefined,
    );
    expect(ctx.stockfishEvalBefore).toEqual({});
    expect(ctx.stockfishLinesBefore).toEqual([]);
  });
});
