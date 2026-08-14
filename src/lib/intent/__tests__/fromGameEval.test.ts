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
