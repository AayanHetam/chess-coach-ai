import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { buildJudgePacket, topConceptLabels } from "../helpfulnessGrounding";
import { compute_feature_delta } from "@/lib/mastermind/featureDelta";
import type { EngineLike } from "../helpfulnessTypes";
import type { EngineScore, MultiPvLine } from "../stockfish";
import { MoveClassification } from "@/types/enums";

/**
 * Fake engine: returns canned multi-PV + eval so buildJudgePacket can be tested
 * with NO Stockfish binary and NO network. The grounding fns (detectMotifs,
 * compute_feature_delta) are the real, pure chess.js implementations.
 */
function fakeEngine(opts: {
  beforeBestUci: string;
  beforeScoreCp: number; // White POV
  afterScoreCp: number; // White POV
  pv?: string[];
}): EngineLike {
  const cp = (n: number): EngineScore => ({ kind: "cp", cp: n });
  return {
    async evaluateMultiPv(): Promise<MultiPvLine[]> {
      const pv = opts.pv ?? [opts.beforeBestUci];
      return [
        { rank: 1, score: cp(opts.beforeScoreCp), pvUci: pv, bestMoveUci: pv[0], depth: 16 },
        { rank: 2, score: cp(opts.beforeScoreCp - 40), pvUci: ["g1f3"], bestMoveUci: "g1f3", depth: 16 },
        { rank: 3, score: cp(opts.beforeScoreCp - 80), pvUci: ["b1c3"], bestMoveUci: "b1c3", depth: 16 },
      ];
    },
    async evaluate(): Promise<{ score: EngineScore; depth: number }> {
      return { score: cp(opts.afterScoreCp), depth: 16 };
    },
  };
}

// Startpos — White plays e4. Engine best (faked) is also e2e4 → no blunder.
const STARTPOS = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Hanging-queen blunder: White Ke1 Qd1, black king e8, black pawn g6.
// White plays Qh5?? which hangs to ...gxh5 — detectMotifs yields a confirmed
// hanging_piece (verified live).
const HANGING_QUEEN = "4k3/8/6p1/8/8/8/8/3QK3 w - - 0 1";

describe("buildJudgePacket — shape & deterministic fields (fake engine)", () => {
  it("computes movePlayedUci and best move from the engine packet", async () => {
    const engine = fakeEngine({ beforeBestUci: "e2e4", beforeScoreCp: 40, afterScoreCp: 40, pv: ["e2e4", "e7e5"] });
    const p = await buildJudgePacket({
      fenBefore: STARTPOS,
      movePlayedSan: "e4",
      playerColor: "w",
      userRating: 1500,
      engine,
    });
    expect(p.movePlayedUci).toBe("e2e4");
    expect(p.stockfish.bestMoveUci).toBe("e2e4");
    expect(p.stockfish.bestMoveSan).toBe("e4");
    expect(p.stockfish.multiPv).toHaveLength(3);
    expect(p.stockfish.multiPv[0].rank).toBe(1);
    expect(p.fen).toBe(STARTPOS);
    expect(new Chess(p.fenAfter).turn()).toBe("b");
  });

  it("flips eval delta to the MOVER's POV for White", async () => {
    // White POV: before +50, after -100 → White lost 150cp.
    const engine = fakeEngine({ beforeBestUci: "e2e4", beforeScoreCp: 50, afterScoreCp: -100 });
    const p = await buildJudgePacket({
      fenBefore: STARTPOS,
      movePlayedSan: "e4",
      playerColor: "w",
      userRating: 1500,
      engine,
    });
    // mover-POV = 1 * (after - before) = -100 - 50 = -150 (a loss).
    expect(p.stockfish.evalDeltaCpMoverPov).toBe(-150);
    expect(p.stockfish.evalBeforeCp).toBe(50);
    expect(p.stockfish.evalAfterCp).toBe(-100);
  });

  it("flips eval delta to the MOVER's POV for Black (sign inverted vs White POV)", async () => {
    // Black to move position. White-POV before -50, after +100 → from Black's POV
    // that's a 150cp loss (Black's eval went -50→+100 White-POV = worse for Black).
    const blackToMove = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const engine = fakeEngine({ beforeBestUci: "e7e5", beforeScoreCp: -50, afterScoreCp: 100, pv: ["e7e5"] });
    const p = await buildJudgePacket({
      fenBefore: blackToMove,
      movePlayedSan: "e5",
      playerColor: "b",
      userRating: 1500,
      engine,
    });
    // mover-POV = -1 * (after - before) = -1 * (100 - (-50)) = -150 (a loss for Black).
    expect(p.stockfish.evalDeltaCpMoverPov).toBe(-150);
  });

  it("classifies by LOSS vs best, and never calls the best move a mistake", async () => {
    // Played e4 but engine best is d4 → mover loses 350cp → blunder.
    const blunderEngine = fakeEngine({ beforeBestUci: "d2d4", beforeScoreCp: 50, afterScoreCp: -300 });
    const blunder = await buildJudgePacket({
      fenBefore: STARTPOS, movePlayedSan: "e4", playerColor: "w", userRating: 1500, engine: blunderEngine,
    });
    expect(blunder.stockfish.classification).toBe(MoveClassification.Blunder);

    // The screenshot bug: played the BEST move (e4 == engine best) and the eval
    // even rose +91cp → must be "best", NOT "inaccuracy" (old abs-swing bug).
    const bestEngine = fakeEngine({ beforeBestUci: "e2e4", beforeScoreCp: 40, afterScoreCp: 131 });
    const best = await buildJudgePacket({
      fenBefore: STARTPOS, movePlayedSan: "e4", playerColor: "w", userRating: 1500, engine: bestEngine,
    });
    expect(best.stockfish.classification).toBe(MoveClassification.Best);
  });
});

describe("buildJudgePacket — motif grounding (real detector)", () => {
  it("surfaces a confirmed hanging_piece motif in motifTags for a hanging-queen blunder", async () => {
    const engine = fakeEngine({ beforeBestUci: "d1d2", beforeScoreCp: 0, afterScoreCp: -800, pv: ["g6h5"] });
    const p = await buildJudgePacket({
      fenBefore: HANGING_QUEEN,
      movePlayedSan: "Qh5",
      playerColor: "w",
      userRating: 1500,
      engine,
    });
    expect(p.motifTags).toContain("hanging_piece");
    // every tag must come from a confirmed motif
    for (const tag of p.motifTags) {
      expect(p.motifs.some((m) => m.motif === tag && m.confirmed)).toBe(true);
    }
  });

  it("only flattens CONFIRMED motifs into motifTags", async () => {
    const engine = fakeEngine({ beforeBestUci: "e2e4", beforeScoreCp: 40, afterScoreCp: 40, pv: ["e2e4"] });
    const p = await buildJudgePacket({
      fenBefore: STARTPOS, movePlayedSan: "e4", playerColor: "w", userRating: 1500, engine,
    });
    const confirmedCount = p.motifs.filter((m) => m.confirmed).length;
    expect(p.motifTags.length).toBe(confirmedCount);
  });
});

describe("topConceptLabels", () => {
  it("returns [] when the concept delta is empty", () => {
    // A bare king shuffle changes nothing measurable.
    const fen = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";
    const c = new Chess(fen);
    c.move("Kf2");
    const d = compute_feature_delta(fen, c.fen());
    expect(d.isEmptyDelta).toBe(true);
    expect(topConceptLabels(d)).toEqual([]);
  });

  it("topConcepts is empty in the packet when the delta is empty", async () => {
    const fen = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";
    const engine = fakeEngine({ beforeBestUci: "e1f2", beforeScoreCp: 0, afterScoreCp: 0, pv: ["e1f2"] });
    const p = await buildJudgePacket({
      fenBefore: fen, movePlayedSan: "Kf2", playerColor: "w", userRating: 1500, engine,
    });
    expect(p.conceptDelta.isEmptyDelta).toBe(true);
    expect(p.topConcepts).toEqual([]);
  });

  it("caps labels at the requested max and reports material changes", () => {
    // White captures a black pawn (material black -1).
    const fen = "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1";
    const c = new Chess(fen);
    c.move("exd5");
    const d = compute_feature_delta(fen, c.fen());
    const labels = topConceptLabels(d, 2);
    expect(labels.length).toBeLessThanOrEqual(2);
    expect(labels.length).toBeGreaterThan(0);
  });
});
