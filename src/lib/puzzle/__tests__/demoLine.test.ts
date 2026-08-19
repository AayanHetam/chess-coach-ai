import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import {
  isPlayableFromAnySolverAnchor,
  planDemoLine,
  solverAnchors,
} from "../demoLine";

/**
 * The puzzle coach's `[SHOW_MOVE:]` card is model-authored SAN that the client
 * plays on the real board. Nothing validated it: the request schema accepts
 * `z.string().min(2).max(8)`, which "Qz9" satisfies.
 *
 * The playback loop in pages/puzzles.tsx does:
 *
 *     try { const r = g.move(moves[i]); if (!r) break; } catch { break; }
 *
 * so an illegal ply produces no error, no warning, and no mark on the card —
 * the board just stops mid-line under a card still listing the whole thing.
 */

// A real position: Italian Game, after 1.e4 e5 2.Nf3 Nc6 3.Bc4.
const ITALIAN = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";

describe("planDemoLine", () => {
  it("accepts a line that is legal all the way through", () => {
    const plan = planDemoLine(ITALIAN, ["Bc5", "b4", "Bxb4"]);
    expect(plan.playable).toBe(true);
    expect(plan.firstIllegal).toBeNull();
    expect(plan.legalPrefix).toHaveLength(3);
  });

  it("rejects a line whose LAST ply is impossible", () => {
    // The shape that hurts: the demo plays convincingly and then stops dead on
    // the move the whole explanation was building towards.
    const plan = planDemoLine(ITALIAN, ["Bc5", "b4", "Qh8"]);
    expect(plan.playable).toBe(false);
    expect(plan.firstIllegal).toEqual({ index: 2, san: "Qh8" });
  });

  it("reports the legal prefix without offering it as the demo", () => {
    // The prefix is diagnostic. Playing it would substitute a different line
    // for the one the coach's sentence described — the same bug, quieter.
    const plan = planDemoLine(ITALIAN, ["Bc5", "b4", "Qh8"]);
    expect(plan.legalPrefix).toEqual(["Bc5", "b4"]);
    expect(plan.playable).toBe(false);
  });

  it("rejects a move that is not chess notation at all", () => {
    // `z.string().min(2).max(8)` accepts this today.
    expect(planDemoLine(ITALIAN, ["Qz9"]).playable).toBe(false);
    expect(planDemoLine(ITALIAN, ["hello"]).playable).toBe(false);
  });

  it("rejects a legal-looking move played by the wrong side", () => {
    // Black is to move in ITALIAN; Ng5 is White's. This is the failure mode a
    // regex-shaped check misses entirely — the SAN is well-formed and the
    // piece exists.
    expect(planDemoLine(ITALIAN, ["Ng5"]).playable).toBe(false);
  });

  it("rejects an empty line rather than calling it clean", () => {
    // There is nothing to show; a card offering it is a button that does
    // nothing.
    expect(planDemoLine(ITALIAN, []).playable).toBe(false);
  });

  it("survives a corrupt anchor instead of throwing into the render", () => {
    expect(planDemoLine("not a fen", ["e4"]).playable).toBe(false);
  });
});

describe("solverAnchors", () => {
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  it("includes the start and every position along the solution", () => {
    const anchors = solverAnchors(START, ["e4", "e5", "Nf3"]);
    expect(anchors).toHaveLength(4);
    expect(anchors[0]).toBe(new Chess(START).fen());
  });

  it("stops at the first unplayable solution move rather than guessing", () => {
    const anchors = solverAnchors(START, ["e4", "Qh8", "Nf3"]);
    expect(anchors).toHaveLength(2);
  });

  it("reads UCI, which is what puzzle.solution actually holds", () => {
    // The feed stores UCI ("e2e4"), not SAN — `analyzeMateClaim` takes the same
    // shape. A SAN-only reader would produce a one-entry anchor list here and
    // silently reject every mid-solve demo.
    const anchors = solverAnchors(START, ["e2e4", "e7e5", "g1f3"]);
    expect(anchors).toHaveLength(4);
  });

  it("reads a UCI promotion", () => {
    // "a7a8q" — the lowercase-promotion case parseSolutionMoves exists to fix.
    const promo = "8/P7/8/8/8/8/8/K6k w - - 0 1";
    expect(solverAnchors(promo, ["a7a8q"])).toHaveLength(2);
  });
});

describe("isPlayableFromAnySolverAnchor", () => {
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const SOLUTION = ["e4", "e5", "Nf3", "Nc6", "Bb5"];

  it("accepts a demo anchored partway through the solution", () => {
    // The server does not know where the solver's board is — only that it is
    // somewhere on this line. "a6" is illegal at the start but legal after
    // 3.Bb5, so rejecting it would delete a legitimate demo.
    expect(isPlayableFromAnySolverAnchor(START, SOLUTION, ["a6"])).toBe(true);
  });

  it("rejects a demo that fits nowhere on the line", () => {
    expect(isPlayableFromAnySolverAnchor(START, SOLUTION, ["Qh8"])).toBe(false);
    expect(isPlayableFromAnySolverAnchor(START, SOLUTION, ["Qz9"])).toBe(false);
  });

  it("rejects an empty line", () => {
    expect(isPlayableFromAnySolverAnchor(START, SOLUTION, [])).toBe(false);
  });
});
