import { describe, it, expect } from "vitest";
import { evaluate_position_complexity } from "../complexity";
import { LineEval } from "@/types/eval";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const KP_VS_K = "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1";

function line(cp: number, pv: string[], multiPv: number = 1, depth: number = 20): LineEval {
  return { pv, cp, depth, multiPv };
}

describe("evaluate_position_complexity", () => {
  it("score is bounded in [0, 1]", () => {
    const score = evaluate_position_complexity(STARTING_FEN, [
      line(20, ["e2e4"]),
      line(15, ["d2d4"], 2),
      line(10, ["g1f3"], 3),
    ]);
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(1);
  });

  it("starting position has high fan-out", () => {
    const score = evaluate_position_complexity(STARTING_FEN, [line(20, ["e2e4"])]);
    expect(score.fanOut).toBe(20);
  });

  it("KP-vs-K endgame has low fan-out", () => {
    const score = evaluate_position_complexity(KP_VS_K, [line(0, ["e1d1"])]);
    expect(score.fanOut).toBeLessThan(20);
  });

  it("similar top-3 evals yield high spread component (low spread = harder choice)", () => {
    const tight = evaluate_position_complexity(STARTING_FEN, [
      line(20, ["e2e4"]),
      line(18, ["d2d4"], 2),
      line(17, ["g1f3"], 3),
    ]);
    const wide = evaluate_position_complexity(STARTING_FEN, [
      line(100, ["e2e4"]),
      line(-200, ["d2d4"], 2),
      line(-400, ["g1f3"], 3),
    ]);
    expect(tight.components.spread).toBeGreaterThan(wide.components.spread);
  });

  it("detects forcing move when in check", () => {
    const checkFen = "rnbqkbnr/pppp1ppp/8/8/8/3P4/PPP1pPPP/RNBQKB1R w KQkq - 0 1";
    const score = evaluate_position_complexity(checkFen, [line(0, ["e1e2"])]);
    expect(score.forcingPresent).toBe(true);
  });

  it("treats mate-in-N as forcing", () => {
    const score = evaluate_position_complexity(STARTING_FEN, [
      { pv: ["e2e4"], mate: 5, depth: 20, multiPv: 1 },
    ]);
    expect(score.forcingPresent).toBe(true);
  });

  it("handles empty lines array gracefully", () => {
    const score = evaluate_position_complexity(STARTING_FEN, []);
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(1);
  });
});
