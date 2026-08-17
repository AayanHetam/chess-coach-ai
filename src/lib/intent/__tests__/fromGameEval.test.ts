import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { intentProbesFromGameEval } from "../fromGameEval";
import { computeIntentFacts } from "../intentFacts";
import type { GameEval } from "@/types/eval";

/**
 * The adapter from the gameEval a review already has to the module's input.
 *
 * The hazard here is not a crash. gameEval centipawns are WHITE-relative and
 * this module is mover-relative; getting that wrong throws nothing and simply
 * inverts every comparison for Black, which is how a coach ends up praising a
 * blunder. So the sign convention is asserted directly, on a Black-to-move ply,
 * against a position whose truth is obvious.
 */

const line = (pv: string[], cp: number | null, mate: number | null = null, multiPv = 1) => ({
  pv,
  ...(cp === null ? {} : { cp }),
  ...(mate === null ? {} : { mate }),
  depth: 16,
  multiPv,
});

function evalOf(positions: Array<{ lines: ReturnType<typeof line>[] }>): GameEval {
  return {
    positions,
    accuracy: { white: 0, black: 0 },
    settings: { engine: "stockfish-local" as never, depth: 16, multiPv: 3, date: "" },
  };
}

describe("intentProbesFromGameEval", () => {
  // ── the opponent's reply is scored in the same search as their best ──────
  //
  // `trap` computes `best - actual` and calls the difference the opponent's
  // error. Taking `actual` from the evaluation of the position their reply
  // PRODUCED makes the two operands come from different searches, so when they
  // play the engine's own top reply the difference is not zero. Measured on the
  // 278 plies in the founder's games where the opponent played `bestSan`:
  // median 2cp, p99 113cp, max 148cp — over TRAP_MIN_ATTRIBUTION_CP on 1.8%.
  //
  // Same fix as `playedScoreOf` for `cost`, on the other side of the board.

  it("scores their reply from the lines at fenAfter, not from the position it produced", () => {
    // 1.e4 e5 2.Nf3. Black's reply e5 is the SECOND line at fenAfter (-30 for
    // White), while the evaluation of the position after e5 says +120. The
    // adapter must take -30, because that is the number measured beside their
    // best reply.
    const moves = ["e4", "e5", "Nf3"];
    const ge = evalOf([
      { lines: [line(["e2e4"], 20)] },
      { lines: [line(["b8c6"], 10, null, 1), line(["e7e5"], -30, null, 2)] },
      { lines: [line(["g1f3"], 120)] },
      { lines: [line(["b8c6"], 120)] },
    ]);
    const [white] = intentProbesFromGameEval({ gameEval: ge, moves });
    expect(white.probe.opponentReply).not.toBeNull();
    // fenAfter is Black to move, so White-relative -30 is +30 to them.
    expect(white.probe.opponentReply!.actual).toEqual({ cp: 30, mate: null });
    // and their best there, White-relative +10, is -10 to them.
    expect(white.probe.opponentReply!.best).toEqual({ cp: -10, mate: null });
  });

  it("CONTROL: falls back to the produced position when the reply is not in the lines", () => {
    // Identical, except Black's e5 is absent from fenAfter's lines. The
    // separate measurement is then the only thing available and must be used.
    const moves = ["e4", "e5", "Nf3"];
    const ge = evalOf([
      { lines: [line(["e2e4"], 20)] },
      { lines: [line(["b8c6"], 10, null, 1), line(["g8f6"], -5, null, 2)] },
      { lines: [line(["g1f3"], 120)] },
      { lines: [line(["b8c6"], 120)] },
    ]);
    const [white] = intentProbesFromGameEval({ gameEval: ge, moves });
    expect(white.probe.opponentReply!.actual).toEqual({ cp: -120, mate: null });
  });

  it("their OWN best reply subtracts to exactly zero", () => {
    // The invariant the fix exists for: when they play bestSan, `best - actual`
    // must be 0 no matter what the produced position evaluates to.
    const moves = ["e4", "e5", "Nf3"];
    const ge = evalOf([
      { lines: [line(["e2e4"], 20)] },
      { lines: [line(["e7e5"], 10, null, 1), line(["b8c6"], -30, null, 2)] },
      { lines: [line(["g1f3"], 158)] },
      { lines: [line(["b8c6"], 158)] },
    ]);
    const [white] = intentProbesFromGameEval({ gameEval: ge, moves });
    const r = white.probe.opponentReply!;
    expect(r.san).toBe(r.bestSan);
    expect(r.actual).toEqual(r.best);
  });

  it("converts White-relative scores to the MOVER's side, for both colours", () => {
    // 1.e4 (White) then 1...e5 (Black). Both positions are scored +100 for
    // WHITE. That must read as +100 to White on ply 0 and -100 to Black on
    // ply 1 — the same number meaning opposite things to the two players.
    const moves = ["e4", "e5"];
    const ge = evalOf([
      { lines: [line(["e2e4"], 100)] },
      { lines: [line(["e7e5"], 100)] },
      { lines: [line(["g1f3"], 100)] },
    ]);
    const [white, black] = intentProbesFromGameEval({ gameEval: ge, moves });

    expect(white.probe.rootLines[0].score).toEqual({ cp: 100, mate: null });
    expect(black.probe.rootLines[0].score).toEqual({ cp: -100, mate: null });

    // The played move's value is the resulting position read from our own side.
    expect(white.probe.playedScore).toEqual({ cp: 100, mate: null });
    expect(black.probe.playedScore).toEqual({ cp: -100, mate: null });

    // And the same number read from the OPPONENT's side is the threat baseline.
    expect(white.probe.opponentBestAfter).toEqual({ cp: -100, mate: null });
    expect(black.probe.opponentBestAfter).toEqual({ cp: 100, mate: null });
  });

  it("carries mate sign through the same flip", () => {
    const ge = evalOf([
      { lines: [line(["e2e4"], null, 3)] }, // White mates in 3
      { lines: [line(["e7e5"], null, 3)] },
      { lines: [line(["g1f3"], null, 3)] },
    ]);
    const [white, black] = intentProbesFromGameEval({ gameEval: ge, moves: ["e4", "e5"] });
    expect(white.probe.rootLines[0].score).toEqual({ cp: null, mate: 3 });
    // Black is being mated in 3, so from Black's side it is mate -3.
    expect(black.probe.rootLines[0].score).toEqual({ cp: null, mate: -3 });
  });

  it("translates UCI to SAN against the position it was searched from", () => {
    const ge = evalOf([
      { lines: [line(["e2e4"], 25, null, 1), line(["d2d4"], 17, null, 2)] },
      { lines: [line(["e7e5"], -3)] },
    ]);
    const [first] = intentProbesFromGameEval({ gameEval: ge, moves: ["e4"] });
    expect(first.probe.rootLines.map((l) => l.san)).toEqual(["e4", "d4"]);
  });

  it("marks a timed-out position skipped rather than reasoning from depth 0", () => {
    // lines[0].depth === 0 is the client-timeout sentinel. Treating it as a
    // real evaluation would let a depth-0 number drive a coaching claim.
    const ge = evalOf([
      { lines: [{ pv: ["e2e4"], cp: 0, depth: 0, multiPv: 1 }] },
      { lines: [line(["e7e5"], -3)] },
    ]);
    const [first] = intentProbesFromGameEval({ gameEval: ge, moves: ["e4"] });
    expect(first.skipped).toBe(true);
    expect(first.probe.rootLines).toEqual([]);
    // and the module then says nothing at all about it
    const f = computeIntentFacts(first.probe);
    expect(f.purpose).toBe("none");
    expect(f.quiet).toBe(false);
  });

  it("stops cleanly when the move list and the board diverge", () => {
    const ge = evalOf([{ lines: [line(["e2e4"], 25)] }, { lines: [line(["e7e5"], -3)] }]);
    const probes = intentProbesFromGameEval({ gameEval: ge, moves: ["e4", "Qxh8"] });
    expect(probes).toHaveLength(1);
  });

  it("survives a gameEval with no positions at all", () => {
    const probes = intentProbesFromGameEval({
      gameEval: evalOf([]),
      moves: ["e4", "e5"],
    });
    expect(probes.every((p) => p.skipped)).toBe(true);
  });

  // ── Tier 0 is enough for the thing that matters most ─────────────────────

  it("detects a forced mate the move failed to deal with, with NO extra search", () => {
    // The real game_04 Qxf2 shape: the move wins a pawn while the opponent has
    // mate in 1. All 34 such positions in the founder's games are visible from
    // gameEval alone, because the mate shows up in the NEXT position's lines.
    const FEN = "5rk1/2p4p/pq2p1pQ/1b6/4P3/P5P1/2B2P2/b2K3R b - - 1 27";
    const probes = intentProbesFromGameEval({
      startFen: FEN,
      gameEval: evalOf([
        { lines: [line(["b6d4"], 900)] }, // White is winning: +900 White-relative
        { lines: [line(["h6h7"], null, 1)] }, // and now mates in 1
      ]),
      moves: ["Qxf2"],
    });
    const probe = probes[0].probe;
    // Read from Black's side, White's mate-in-1 is mate -1 against them.
    expect(probe.opponentBestAfter).toEqual({ cp: null, mate: 1 });
    expect(probe.playedScore).toEqual({ cp: null, mate: -1 });
    const f = computeIntentFacts(probe);
    // Without a null-move probe there is no `threat`, so the module cannot say
    // the mate was ALREADY there — but cost reports walking into it.
    expect(f.cost?.mateChange).toBe("allowed-mate");
    expect(f.quiet).toBe(false);
  });

  it("threads Tier 1 null-move data through when a caller has paid for it", () => {
    const FEN = "5rk1/2p4p/pq2p1pQ/1b6/4P3/P5P1/2B2P2/b2K3R b - - 1 27";
    const probes = intentProbesFromGameEval({
      startFen: FEN,
      gameEval: evalOf([
        { lines: [line(["b6d4"], null, -17)] },
        { lines: [line(["h6h7"], null, 1)] },
      ]),
      moves: ["Qxf2"],
      nullMoveProbes: new Map([
        [0, {
          // Scores at the flipped position are already the opponent's own.
          threat: { san: "Qxh7#", score: { cp: null, mate: 1 }, pv: ["Qxh7#"], depth: 16 },
          threatAfter: { san: "Qxh7#", score: { cp: null, mate: 1 }, pv: ["Qxh7#"], depth: 16 },
          threatAlternative: null,
          threatStillLegal: true,
          opponentBestAfter: null,
          rootBest: null,
          threatAfterAlternatives: [],
          counterfactualCostCp: null,
        }],
      ]),
    });
    const f = computeIntentFacts(probes[0].probe);
    expect(f.unaddressedThreat).not.toBeNull();
    expect(f.unaddressedThreat!.threatSan).toBe("Qxh7#");
    expect(f.unaddressedThreat!.stillMates).toBe(true);
  });
});
