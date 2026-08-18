import { describe, it, expect } from "vitest";
import {
  computeIntentFacts,
  toCp,
  whiteRelativeToMover,
  MATE_CP,
  PROPHYLAXIS_MIN_SWING_CP,
  PROPHYLAXIS_MIN_SPECIFIC_CP,
  PROPHYLAXIS_THREAT_MUST_END_BELOW_CP,
  DECISIVE_CP,
} from "../intentFacts";
import type { EngineLine, IntentProbe } from "../types";
import { buildPositionFacts, threatAfterEvasions } from "../positionFacts";
import { Chess } from "chess.js";

const line = (san: string, cp: number | null, mate: number | null = null, pv: string[] = []): EngineLine => ({
  san,
  score: { cp, mate },
  pv: pv.length ? pv : [san],
  depth: 16,
});

/**
 * Real positions for the fixtures that need board facts. "quiet" and the
 * prevention guard are both assertions about the board, and the module now
 * refuses to make either one when probe.position is null — an audit found it
 * calling positions dull while holding no board information at all.
 */
// 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5, White to move: nothing whatsoever going on.
const QUIET_FEN = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
// King and pawn only, where the flatness comparison inverts under zugzwang.
const KP_FEN = "8/8/4k3/8/4P3/4K3/8/8 w - - 0 1";

/** A probe with everything switched off; each test turns on only what it means to test. */
function probe(over: Partial<IntentProbe> = {}): IntentProbe {
  return {
    fenBefore: "8/8/8/8/8/8/8/K6k w - - 0 1",
    playedSan: "Kb1",
    fenAfter: "8/8/8/8/8/8/8/1K5k b - - 1 1",
    rootLines: [line("Kb1", 0)],
    threat: null,
    opponentBestAfterProbed: null,
    rootBestProbed: null,
    threatAfter: null,
    threatAlternative: null,
    opponentBestAfter: null,
    threatAfterAlternatives: [],
    threatStillLegal: true,
    threatPieceCaptured: null,
    threatEvasions: null,
    playedScore: { cp: 0, mate: null },
    moverHasPieces: true,
    position: null,
    opponentReply: null,
    ...over,
  };
}

// ─── score conventions ─────────────────────────────────────────────────────
// These are the guardrails. A sign error here does not throw, it silently
// inverts every comparison downstream, so they are tested directly.

describe("score conventions", () => {
  it("leaves White-to-move scores alone and flips Black-to-move ones", () => {
    expect(whiteRelativeToMover({ cp: 180, mate: null }, "w")).toEqual({ cp: 180, mate: null });
    expect(whiteRelativeToMover({ cp: 180, mate: null }, "b")).toEqual({ cp: -180, mate: null });
    expect(whiteRelativeToMover({ cp: null, mate: 3 }, "b")).toEqual({ cp: null, mate: -3 });
  });

  it("real case: Black is winning at -599 White-relative, which is +599 to Black", () => {
    // game_02 before h5, Black to move. Raw engine cp is White-relative.
    expect(toCp(whiteRelativeToMover({ cp: -599, mate: null }, "b"))).toBe(599);
  });

  it("ranks a mate above any material score, and a shorter mate above a longer one", () => {
    expect(toCp({ cp: null, mate: 1 })).toBe(MATE_CP - 1);
    expect(toCp({ cp: null, mate: 5 })).toBe(MATE_CP - 5);
    expect(toCp({ cp: null, mate: 1 })).toBeGreaterThan(toCp({ cp: null, mate: 5 })!);
    expect(toCp({ cp: null, mate: 1 })).toBeGreaterThan(toCp({ cp: 2000, mate: null })!);
    expect(toCp({ cp: null, mate: -2 })).toBe(-(MATE_CP - 2));
  });
});

// ─── the free-tempo gate: both operands from one regime ────────────────────
//
// "Is there a threat at all?" values the opponent's free tempo as
// `threat + playerBest`. The threat comes from the null-move prober (cold
// transposition table); gameEval's root score is read off a warm one. The sum
// therefore carries the difference between two engines.
//
// Sampled on 60 real plies deliberately chosen NEAR the 150cp bar, 12% of the
// threat/no-threat decisions flip when the root score is measured alongside the
// threat instead — about 7.8% of every ply where this gate is live, flipping in
// BOTH directions. Real case, game_06 ply 75 Rxa2: 158 warm, 55 cold.

describe("the free-tempo gate does not mix measurement regimes", () => {
  const threat = line("Qg4", 100);

  it("uses the same-regime root score when it exists, and stays silent below the bar", () => {
    // warm root +60 would make the tempo worth 160 and clear the bar; the
    // same-regime reading is +20, worth 120, and there is no threat to narrate.
    const f = computeIntentFacts(
      probe({
        threat,
        threatAfter: line("Qg4", -400),
        rootLines: [line("Rf5", 60)],
        rootBestProbed: { cp: 20, mate: null },
        opponentBestAfterProbed: { cp: -390, mate: null },
      }),
    );
    expect(f.prophylaxis).toBeNull();
    expect(f.notes.join(" ")).toContain("free tempo worth only 120cp");
  });

  it("CONTROL: the identical probe WITHOUT the same-regime score falls back, and speaks", () => {
    // Same numbers, `rootBestProbed` absent. The Tier 0 root score is used —
    // 160cp, over the bar — and the mixed comparison is recorded in the notes so
    // it is visible rather than silent.
    const f = computeIntentFacts(
      probe({
        threat,
        threatAfter: line("Qg4", -400),
        rootLines: [line("Rf5", 60)],
        rootBestProbed: null,
        opponentBestAfterProbed: { cp: -390, mate: null },
      }),
    );
    expect(f.prophylaxis).not.toBeNull();
    expect(f.notes.join(" ")).toContain("across measurement regimes");
  });

  it("CONTROL: a same-regime score comfortably OVER the bar still speaks", () => {
    const f = computeIntentFacts(
      probe({
        threat,
        threatAfter: line("Qg4", -400),
        rootLines: [line("Rf5", 60)],
        rootBestProbed: { cp: 300, mate: null },
        opponentBestAfterProbed: { cp: -390, mate: null },
      }),
    );
    expect(f.prophylaxis).not.toBeNull();
    expect(f.notes.join(" ")).not.toContain("across measurement regimes");
  });
});

// ─── mate: taken from whichever measurement resolves it ────────────────────

describe("a forced mate is reported from either measurement", () => {
  it("finds the mate the MultiPV root search missed (real: game_11 ply 89 a1=Q)", () => {
    // The root search splits its effort across three moves and scores a1=Q at
    // +807. The evaluation of the position it produces spends everything on one
    // line and finds mate in 13. Using only the root line loses that.
    const f = computeIntentFacts(
      probe({
        playedSan: "a1=Q",
        rootLines: [line("a1=Q", 807), line("Kxe4", 544)],
        playedScore: { cp: null, mate: 13 },
      }),
    );
    expect(f.mate).not.toBeNull();
    expect(f.mate!.inMoves).toBe(13);
  });

  it("reports the CHECKMATING move itself, which has no position after it", () => {
    // Real: game_02 ply 59 Re6#, and three others — the last move of four of
    // the founder's games. There are no lines after checkmate, so `playedScore`
    // is null and the module used to say nothing about the mate that ended the
    // game.
    const f = computeIntentFacts(
      probe({
        playedSan: "Re6#",
        rootLines: [line("Re6#", null, 1)],
        playedScore: null,
      }),
    );
    expect(f.mate).not.toBeNull();
    expect(f.mate!.inMoves).toBe(1);
  });

  it("prefers the shorter mate when both measurements find one", () => {
    const f = computeIntentFacts(
      probe({
        playedSan: "Qh5",
        rootLines: [line("Qh5", null, 5)],
        playedScore: { cp: null, mate: 3 },
      }),
    );
    expect(f.mate!.inMoves).toBe(3);
  });

  it("CONTROL: no mate anywhere means no mate fact", () => {
    const f = computeIntentFacts(
      probe({
        playedSan: "Qh5",
        rootLines: [line("Qh5", 300)],
        playedScore: { cp: 280, mate: null },
      }),
    );
    expect(f.mate).toBeNull();
  });

  it("CONTROL: a mate AGAINST us is never reported as our forced mate", () => {
    const f = computeIntentFacts(
      probe({
        playedSan: "Qh5",
        rootLines: [line("Qh5", null, -4)],
        playedScore: { cp: null, mate: -2 },
      }),
    );
    expect(f.mate).toBeNull();
  });
});

// ─── cost: both operands from one search ───────────────────────────────────
//
// `cost` is `rootLines[0] - played`. On the game-review path those come from
// DIFFERENT searches: the best move's score from the MultiPV search at
// fenBefore, and the played move's from the evaluation of the position it
// produced. When the student plays the engine's own top move the answer must be
// exactly zero, and it was not.
//
// Measured on the 285 plies in the founder's twelve games where he played
// rootLines[0]: median 1cp, p99 113cp, max 148cp — and five cleared
// COST_MIN_LOSS_CP, so the review charged him over a pawn for playing the best
// move on the board. Two of those five were his own moves.

describe("cost never charges for playing the engine's own best move", () => {
  it("reports NOTHING when the played move is rootLines[0], whatever the second measurement says", () => {
    // The real numbers from game_12 ply 98: Kg4 IS the top line at -1379, while
    // the separate evaluation of the position it produced reads -1527. The
    // difference is 148cp of measurement, and none of it is a mistake.
    const f = computeIntentFacts(
      probe({
        playedSan: "Kg4",
        rootLines: [line("Kg4", -1379), line("Kh4", -1500)],
        playedScore: { cp: -1527, mate: null },
      }),
    );
    expect(f.cost).toBeNull();
  });

  it("CONTROL: the same fixture with a move the engine did NOT rank still reports its cost", () => {
    // Identical but the played move is absent from the lines, so the separate
    // measurement is all there is — and it must still be used.
    const f = computeIntentFacts(
      probe({
        playedSan: "Kh5",
        rootLines: [line("Kg4", -1379), line("Kh4", -1500)],
        playedScore: { cp: -1527, mate: null },
      }),
    );
    expect(f.cost).not.toBeNull();
    expect(f.cost!.lossCp).toBe(148);
  });

  it("uses the in-search score even when the played move is only the SECOND line", () => {
    // Not just rootLines[0]: any line the same search scored is preferable to a
    // number from a different search. Here the played move is line 2 at -1500,
    // so the real loss is 121cp, not the 148cp the other measurement implies.
    const f = computeIntentFacts(
      probe({
        playedSan: "Kh4",
        rootLines: [line("Kg4", -1379), line("Kh4", -1500)],
        playedScore: { cp: -1527, mate: null },
      }),
    );
    expect(f.cost).not.toBeNull();
    expect(f.cost!.lossCp).toBe(121);
  });
});

// ─── prophylaxis ───────────────────────────────────────────────────────────

describe("prophylaxis", () => {
  it("detects the real h5 case with the measured numbers", () => {
    // game_02 move 23, depth 16, all three from White's side and ALL THREE
    // MEASURED BY THE SAME ENGINE: a free tempo gets White +176 with Qg4;
    // forced after h5 it scores -936; and White's best reply after h5 is 0. So
    // Qg4 is 936cp worse than anything else they have — that gap, not the raw
    // fall, is what "h5 stopped it" means.
    //
    // The numbers moved (150/-969/1119/969 -> 176/-936/1112/936) when the sweep
    // stopped letting null-move searches share a transposition table with the
    // real ones. The old ones do not reproduce.
    const f = computeIntentFacts(
      probe({
        playedSan: "h5",
        threat: line("Qg4", 176),
        threatAfter: line("Qg4", -936),
        opponentBestAfterProbed: { cp: 0, mate: null },
        threatStillLegal: true,
      }),
    );
    expect(f.prophylaxis).not.toBeNull();
    expect(f.prophylaxis!.threatSan).toBe("Qg4");
    expect(f.prophylaxis!.swingCp).toBe(1112);
    expect(f.prophylaxis!.specificCp).toBe(936);
    expect(f.prophylaxis!.preventedOutright).toBe(false);
  });

  // ── the move must be why the threat died ─────────────────────────────────
  // Both fixtures below are real positions measured at depth 16, and both were
  // carded as prophylaxis by the version of this module that only looked at
  // how far the threat's score fell.

  it("rejects a RECAPTURE that merely won the material back (real Qxd5 case)", () => {
    // Black recaptures a pawn on d5. The 'threat' Bb5+ falls 263cp — but only
    // because White is no longer a pawn up. White's best reply after Qxd5 is
    // Nf3 at +35, and Bb5+ still scores -21, so Bb5+ is 56cp off their best:
    // entirely playable. Nothing was stopped.
    const f = computeIntentFacts(
      probe({
        playedSan: "Qxd5",
        rootLines: [line("exd5", -22), line("Qxd5", -25)],
        playedScore: { cp: -25, mate: null },
        threat: line("Bb5+", 242),
        threatAfter: line("Bb5+", -21),
        opponentBestAfter: { cp: 35, mate: null },
      }),
    );
    expect(f.prophylaxis).toBeNull();
    expect(f.notes.join(" ")).toContain("not stopped");
  });

  it("rejects a move that answers the threat WORSE than the moves we passed over (real Kd8 case)", () => {
    // The founder on this exact position: "I would not say playing Kd8 stops
    // this, there is probably just another move that does the same thing that
    // stockfish prefers." Measured: Kd8 answers Be2 to -189, while a6 reaches
    // -423 and Qxe4+ -515. Kd8 is the worst answer of the lot.
    //
    // It clears BOTH earlier gates — swing 333, and 230cp worse than White's
    // best reply — so only attribution catches it.
    const f = computeIntentFacts(
      probe({
        playedSan: "Kd8",
        rootLines: [line("Qxe4+", 394), line("Nxd4", 182)],
        playedScore: { cp: 16, mate: null },
        threat: line("Be2", 144),
        threatAfter: line("Be2", -189),
        opponentBestAfter: { cp: 41, mate: null },
        threatAfterAlternatives: [
          { ourSan: "Qxe4+", score: { cp: -515, mate: null }, stillLegal: true },
          { ourSan: "Nxd4", score: { cp: -241, mate: null }, stillLegal: true },
          { ourSan: "a6", score: { cp: -423, mate: null }, stillLegal: true },
          { ourSan: "Kd8", score: { cp: -189, mate: null }, stillLegal: true },
        ],
      }),
    );
    expect(f.prophylaxis).toBeNull();
    expect(f.notes.join(" ")).toContain("not this move's doing");
  });

  it("CONTROL: a move need not be the UNIQUE answer — h5 shares the job with f6", () => {
    // A gate demanding uniqueness would reject real prophylaxis. h5 answers Qg4
    // with a forced mate; so does f6. h5 must still earn the claim.
    const f = computeIntentFacts(
      probe({
        playedSan: "h5",
        threat: line("Qg4", 150),
        threatAfter: line("Qg4", null, -3),
        opponentBestAfter: { cp: 0, mate: null },
        threatAfterAlternatives: [
          { ourSan: "f6", score: { cp: null, mate: -4 }, stillLegal: true },
          { ourSan: "Rf5", score: { cp: -1109, mate: null }, stillLegal: true },
          { ourSan: "h5", score: { cp: null, mate: -3 }, stillLegal: true },
        ],
      }),
    );
    expect(f.prophylaxis).not.toBeNull();
    expect(f.prophylaxis!.threatSan).toBe("Qg4");
  });

  it("does not claim prophylaxis when the opponent is being mated whatever they play", () => {
    // Real, from a dead king-and-pawn ending in game_11: a3 was carded as
    // stopping Kg5 while White was mated in 20 regardless. This branch returns
    // BEFORE the specificity gate, so it was the one path where "their whole
    // position is lost" still read as "our move stopped this".
    const f = computeIntentFacts(
      probe({
        playedSan: "a3",
        // The threat must be worth something to them BEFORE the move, or the
        // opponent-already-lost gate rejects it first and this branch is never
        // reached — which is exactly what happened when that gate was added.
        rootLines: [line("Ke7", 400), line("a3", 100)],
        playedScore: { cp: 100, mate: null },
        threat: line("Kg5", 200),
        threatAfter: line("Kg5", null, -17),
        opponentBestAfter: { cp: null, mate: -20 },
      }),
    );
    expect(f.prophylaxis).toBeNull();
    expect(f.notes.join(" ")).toContain("mated whatever they play");
  });

  it("declines the same claim when their best reply was never measured", () => {
    // The guard above reads isMateAgainst(opponentBestAfter), and
    // isMateAgainst(null) is false — so "we never measured their best reply"
    // fell through it and returned a FULL prophylaxis fact, before the swing,
    // absolute, relative and attribution gates ever run. The exact null
    // collapse of the a3/Kg5 card the guard was added to kill, one field over:
    // types.ts documents opponentBestAfter as "null when not measured", and
    // fromGameEval leaves it null whenever the ply+1 evaluation timed out.
    const f = computeIntentFacts(
      probe({
        playedSan: "a3",
        rootLines: [line("Ke7", 400), line("a3", 100)],
        playedScore: { cp: 100, mate: null },
        threat: line("Kg5", 200),
        threatAfter: line("Kg5", null, -17),
        opponentBestAfter: null,
      }),
    );
    expect(f.prophylaxis).toBeNull();
    expect(f.notes.join(" ")).toContain("never measured");
  });

  it("CONTROL: still comprehensive defusal when the opponent HAD a way out", () => {
    const f = computeIntentFacts(
      probe({
        playedSan: "a3",
        rootLines: [line("Ke7", 400), line("a3", 100)],
        playedScore: { cp: 100, mate: null },
        threat: line("Kg5", 300),
        threatAfter: line("Kg5", null, -17),
        opponentBestAfter: { cp: -50, mate: null },
      }),
    );
    expect(f.prophylaxis).not.toBeNull();
    expect(f.prophylaxis!.threatSan).toBe("Kg5");
  });

  it("CONTROL: a threat that barely moves is NOT reported", () => {
    // Without this, the h5 assertion above could pass simply because any
    // threat probe produces a fact.
    const f = computeIntentFacts(
      probe({ threat: line("Nf3", 30), threatAfter: line("Nf3", 10), threatStillLegal: true }),
    );
    expect(f.prophylaxis).toBeNull();
    expect(f.notes.join(" ")).toContain("below");
  });

  it("treats a threat the move made illegal as prevention outright", () => {
    // Real board facts are required: without them the module cannot tell
    // permanent prevention from a threat that is illegal for one ply because
    // the move gave check, and it must say nothing rather than guess.
    const f = computeIntentFacts(
      probe({
        fenBefore: QUIET_FEN,
        playedSan: "d3",
        position: buildPositionFacts(QUIET_FEN, "d3"),
        threat: line("Qxh7#", null, 1),
        threatAfter: null,
        threatStillLegal: false,
      }),
    );
    expect(f.prophylaxis!.preventedOutright).toBe(true);
    expect(f.prophylaxis!.scoreAfterCp).toBeNull();
    expect(f.prophylaxis!.swingCp).toBeNull();
    expect(f.prophylaxis!.defusedMate).toBe(true);
  });

  // ── the check guard, and its two failure directions ──────────────────────
  // A check makes every opponent non-evasion illegal for one ply, so "the
  // threat is now illegal" proves nothing on a checking move. The guard that
  // rejects those was optional-chained through probe.position, so it silently
  // vanished when board facts were missing and the false claim came back.

  it("says nothing when it cannot tell prevention from a one-ply check", () => {
    const f = computeIntentFacts(
      probe({
        position: null,
        threat: line("Bxg2", 400),
        threatAfter: null,
        threatStillLegal: false,
        threatPieceCaptured: null,
      }),
    );
    expect(f.prophylaxis).toBeNull();
    expect(f.notes.join(" ")).toContain("board facts missing");
  });

  it("a check that CAPTURES the threatening piece is real prevention", () => {
    // The guard over-fired the other way too, silencing 7 of 190 sampled
    // positions with a note that was factually false: the piece is gone, so the
    // threat stays illegal for the rest of the game, check or no check.
    const fen = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
    const f = computeIntentFacts(
      probe({
        fenBefore: fen,
        playedSan: "Nxe5",
        position: buildPositionFacts(fen, "Nxe5"),
        threat: line("Nxe4", 400),
        threatAfter: null,
        threatStillLegal: false,
        threatPieceCaptured: true,
      }),
    );
    expect(f.prophylaxis).not.toBeNull();
    expect(f.prophylaxis!.preventedOutright).toBe(true);
  });

  it("fires exactly at the threshold and not one centipawn below", () => {
    // opponentBestAfter is set so specificity clears its own bar exactly, which
    // isolates the swing threshold as the thing under test.
    // threatAfter sits well below the absolute bar, and the root score is high
    // enough that the tempo gate passes, so this isolates SWING alone.
    const after = -200;
    const roots = [line("Rf5", 400)];
    const at = computeIntentFacts(
      probe({
        rootLines: roots, playedScore: { cp: 400, mate: null },
        threat: line("Qg4", PROPHYLAXIS_MIN_SWING_CP + after), threatAfter: line("Qg4", after),
      }),
    );
    expect(at.prophylaxis).not.toBeNull();
    const below = computeIntentFacts(
      probe({
        rootLines: roots, playedScore: { cp: 400, mate: null },
        threat: line("Qg4", PROPHYLAXIS_MIN_SWING_CP - 1 + after), threatAfter: line("Qg4", after),
      }),
    );
    expect(below.prophylaxis).toBeNull();
  });

  it("a threat that now LOSES counts, even with no relative margin", () => {
    // The absolute route, with opponentBestAfter deliberately level so the
    // relative route cannot be what carries it.
    const at = computeIntentFacts(
      probe({
        threat: line("Qg4", 400),
        threatAfter: line("Qg4", PROPHYLAXIS_THREAT_MUST_END_BELOW_CP),
        opponentBestAfter: { cp: PROPHYLAXIS_THREAT_MUST_END_BELOW_CP, mate: null },
      }),
    );
    expect(at.prophylaxis).not.toBeNull();
  });

  it("CONTROL: neither route satisfied means the threat is still playable (real Qxd5)", () => {
    // Ends at -21 (not losing) and 56cp off their best (not inferior). This is
    // the recapture, and it must fail BOTH routes or the pair is pointless.
    const f = computeIntentFacts(
      probe({
        playedSan: "Qxd5",
        rootLines: [line("exd5", -22), line("Qxd5", -25)],
        playedScore: { cp: -25, mate: null },
        threat: line("Bb5+", 242),
        threatAfter: line("Bb5+", -21),
        opponentBestAfter: { cp: 35, mate: null },
      }),
    );
    expect(f.prophylaxis).toBeNull();
    expect(f.notes.join(" ")).toContain("playable, so it was not stopped");
  });

  it("a threat merely INFERIOR to their alternatives counts too (real f5 case)", () => {
    // The relative route. game_07 move 16, re-measured in one regime: hxg5 ends
    // at -73 — 27cp short of the absolute bar — but sits 288cp adrift of
    // Black's best. The founder confirmed this one, and an absolute-only gate
    // rejected it by those few centipawns.
    const f = computeIntentFacts(
      probe({
        playedSan: "f5",
        rootLines: [line("Nf3", -57), line("Nh3", -113)],
        playedScore: { cp: -241, mate: null },
        threat: line("hxg5", 425),
        threatAfter: line("hxg5", -73),
        opponentBestAfterProbed: { cp: 215, mate: null },
      }),
    );
    expect(f.prophylaxis).not.toBeNull();
    expect(f.prophylaxis!.threatSan).toBe("hxg5");
  });

  // ── the cross-regime guard ───────────────────────────────────────────────
  //
  // These two run the SAME position through the relative route and differ in
  // one field only: whether the baseline was measured by the same engine as
  // `threatAfter`. The founder caught this by asking why one move scored two
  // different numbers in the same position; the answer was that gameEval reads
  // a warm transposition table and a Tier 1 prober reads a cold one. Across 768
  // plies of their games those two readings of the same position agree closely
  // in the middle (median 15cp), but 4.2% differ by more than the 150cp bar the
  // subtraction has to clear and 3.3% disagree about whether a forced mate
  // exists — so about one such claim in twenty-four was measuring the engine
  // rather than the move.
  describe("never subtracts across measurement regimes", () => {
    // Deliberately built so the ABSOLUTE route cannot fire: the threat still
    // ends at -60, above PROPHYLAXIS_THREAT_MUST_END_BELOW_CP. Only the
    // relative route can produce a claim here, so it is the thing under test.
    const base = {
      playedSan: "f5",
      rootLines: [line("f5", -50), line("Nf3", -57)],
      playedScore: { cp: -50, mate: null },
      threat: line("hxg5", 400),
      threatAfter: line("hxg5", -60),
      threatStillLegal: true,
    };

    it("makes NO claim when only the cross-regime baseline is available", () => {
      const f = computeIntentFacts(
        probe({ ...base, opponentBestAfter: { cp: 200, mate: null }, opponentBestAfterProbed: null }),
      );
      // 200 - (-60) = 260, comfortably past the 150cp bar — and refused anyway,
      // because those two numbers came from different engines.
      expect(f.prophylaxis).toBeNull();
      expect(f.notes.join(" ")).toContain("no same-regime baseline");
    });

    it("CONTROL: the same numbers measured in one regime do produce the claim", () => {
      const f = computeIntentFacts(
        probe({ ...base, opponentBestAfter: null, opponentBestAfterProbed: { cp: 200, mate: null } }),
      );
      expect(f.prophylaxis).not.toBeNull();
      expect(f.prophylaxis!.specificCp).toBe(260);
    });
  });

  it("a crushing move is not punished for crushing everything else too (real g6 case)", () => {
    // g6 drove Bxd8 from +467 to -464 — 931cp — and the founder confirmed it.
    // But because g6 also wrecks White's whole position, their best reply is
    // -325, so Bxd8 is only 139cp "specifically" worse. A relative gate
    // rejected this real prophylaxis on the same arithmetic that correctly
    // rejects a recapture.
    const f = computeIntentFacts(
      probe({
        playedSan: "g6",
        rootLines: [line("Bg6", 443), line("Qc7", 399)],
        playedScore: { cp: 399, mate: null },
        threat: line("Bxd8", 467),
        threatAfter: line("Bxd8", -464),
        opponentBestAfter: { cp: -325, mate: null },
      }),
    );
    expect(f.prophylaxis).not.toBeNull();
    expect(f.prophylaxis!.threatSan).toBe("Bxd8");
  });

  it("reports nothing when no threat was probed", () => {
    expect(computeIntentFacts(probe({ threat: null })).prophylaxis).toBeNull();
  });

  // ── the least-bad-move trap ──────────────────────────────────────────────
  // The null move ALWAYS returns something. When the opponent has nothing
  // going on it returns their least-bad option, and any decent move then makes
  // that option look worse — which reads as a defence against a threat that
  // never existed. Both fixtures below are real, measured at depth 16.

  it("rejects a 'threat' that was only the opponent's least-bad move (real fxg3 case)", () => {
    // game_02 move 18: a free tempo was worth just 60cp to the opponent
    // (-136 null score against a -196 baseline), and Qb7 was losing either way.
    const f = computeIntentFacts(
      probe({
        playedSan: "fxg3",
        rootLines: [line("Qg4", 196), line("fxg3", -218)],
        playedScore: { cp: -218, mate: null },
        threat: line("Qb7", -136),
        threatAfter: line("Qb7", -378),
      }),
    );
    expect(f.prophylaxis).toBeNull();
    expect(f.notes.join(" ")).toContain("no threat");
  });

  it("CONTROL: h5 still passes the tempo gate (real numbers)", () => {
    // Same gate, real threat: a free tempo was worth 628cp to White.
    const f = computeIntentFacts(
      probe({
        playedSan: "h5",
        rootLines: [line("Rf5", 462), line("h5", 0)],
        playedScore: { cp: 0, mate: null },
        threat: line("Qg4", 166),
        threatAfter: line("Qg4", -917),
        opponentBestAfter: { cp: 0, mate: null },
      }),
    );
    expect(f.prophylaxis).not.toBeNull();
    expect(f.prophylaxis!.threatSan).toBe("Qg4");
    expect(f.prophylaxis!.swingCp).toBe(1083);
  });
});

// ─── the threat the move did NOT deal with ─────────────────────────────────
// The mirror of prophylaxis, and the reason it exists: across the founder's
// twelve games the opponent had a forced mate in 53 positions; in 34 the mate
// survived the move played, and in 30 of those the module said nothing at all.

describe("unaddressed threats", () => {
  it("reports a forced mate that is STILL forced (real Qxf2 case)", () => {
    // The founder's own move. Qxf2 wins a pawn while White has Qxh7# — verified
    // independently with chess.js: after Qxf2, Qxh7# is an immediate mate. The
    // module used to card this as "you won a pawn" and stop there.
    const FEN = "5rk1/2p4p/pq2p1pQ/1b6/4P3/P5P1/2B2P2/b2K3R b - - 1 27";
    const f = computeIntentFacts(
      probe({
        fenBefore: FEN,
        playedSan: "Qxf2",
        position: buildPositionFacts(FEN, "Qxf2"),
        // Measured, not invented: Black had Qd4+, a forced mate in 17. That is
        // what makes this worth saying — the game was not decided before it.
        rootLines: [line("Qd4+", null, 17), line("Qxf2", null, -1)],
        playedScore: { cp: null, mate: -1 },
        threat: line("Qxh7#", null, 1),
        threatAfter: line("Qxh7#", null, 1),
        threatStillLegal: true,
      }),
    );
    expect(f.unaddressedThreat).not.toBeNull();
    expect(f.unaddressedThreat!.threatSan).toBe("Qxh7#");
    expect(f.unaddressedThreat!.stillMates).toBe(true);
    expect(f.unaddressedThreat!.mateInMoves).toBe(1);
    expect(f.unaddressedThreat!.reason).toBe("mate-still-forced");
    // and it still reports what the move DID do
    expect(f.purpose).toBe("material");
  });

  it("reports a threat the move barely changed", () => {
    const f = computeIntentFacts(
      probe({
        rootLines: [line("Rf5", 400)],
        playedScore: { cp: 400, mate: null },
        threat: line("Qg4", 300),
        threatAfter: line("Qg4", 260),
      }),
    );
    expect(f.unaddressedThreat!.reason).toBe("barely-changed");
    expect(f.unaddressedThreat!.madeItWorse).toBe(false);
    expect(f.quiet).toBe(false);
  });

  // ── a threat made WORSE needs the same evidence as a threat STOPPED ──────
  //
  // The label exists because a mutation proved nothing distinguished
  // "made-it-worse" from "barely-changed": collapsing them left the whole suite
  // green. But the FIRST version of these tests pinned noise.
  //
  // The founder, shown two cards claiming his move made a threat stronger: "the
  // evals should be the same because the position that occurs should be the
  // same a few moves after the move." They were the same, to within measurement
  // error. Measured like-for-like at increasing depth, the swing behind those
  // cards does this:
  //
  //   game_10 20.Qh3   d14 -29  d16 -28  d18 -12  d20  +7  d22  +6  d24 +13
  //   game_11 40.Ra6   d14  -8  d16 -25  d18  -3  d20 +43  d22 -151 d24 -333
  //
  // The first flips sign at depth 20 and stays flipped. The gate had no
  // threshold at all — it fired on `swing < 0` — so it was reading a label off
  // the sign of a quantity that moves ~25cp with legitimate measurement choices
  // at fixed depth, and changes sign with depth.
  //
  // Zero of the 835 plies in the founder's corpus now reach this label. That is
  // the honest state, and it is why the fixture below is SYNTHETIC: there is no
  // real instance to quote.
  it("says nothing about a threat 'strengthened' by less than the noise floor", () => {
    // The exact Ra6 numbers that used to produce a "you made it stronger" card:
    // a 21cp swing, whose sign flips by depth 20.
    const f = computeIntentFacts(
      probe({
        playedSan: "Ra6",
        rootLines: [line("Rc7+", 0), line("Rc3", 0)],
        playedScore: { cp: -527, mate: null },
        threat: line("Re6+", 521),
        threatAfter: line("Re6+", 542),
        opponentBestAfter: { cp: 556, mate: null },
        opponentBestAfterProbed: { cp: 556, mate: null },
      }),
    );
    expect(f.unaddressedThreat).not.toBeNull();
    expect(f.unaddressedThreat!.reason).toBe("barely-changed");
    expect(f.unaddressedThreat!.madeItWorse).toBe(false);
  });

  it("still separates the two labels when the swing clears the bar", () => {
    // SYNTHETIC, and deliberately so — see above. Same shape as the Ra6 case but
    // with the threat gaining 300cp, twice the bar, so the sign is not in doubt.
    // Without this the mutation "made-it-worse collapses into barely-changed"
    // survives and the label is untested.
    const f = computeIntentFacts(
      probe({
        playedSan: "Ra6",
        rootLines: [line("Rc7+", 0), line("Rc3", 0)],
        playedScore: { cp: -527, mate: null },
        threat: line("Re6+", 521),
        threatAfter: line("Re6+", 821),
        opponentBestAfter: { cp: 830, mate: null },
        opponentBestAfterProbed: { cp: 830, mate: null },
      }),
    );
    expect(f.unaddressedThreat).not.toBeNull();
    expect(f.unaddressedThreat!.reason).toBe("made-it-worse");
    expect(f.unaddressedThreat!.madeItWorse).toBe(true);
    expect(f.unaddressedThreat!.scoreBeforeCp).toBe(521);
    expect(f.unaddressedThreat!.scoreAfterCp).toBe(821);
  });

  it("CONTROL: an equally large swing the OTHER way is not made-it-worse", () => {
    // 521 -> 221 instead of 521 -> 821. If this and the test above ever agree,
    // the two labels are not separated.
    const f = computeIntentFacts(
      probe({
        playedSan: "Ra6",
        rootLines: [line("Rc7+", 0), line("Rc3", 0)],
        playedScore: { cp: -527, mate: null },
        threat: line("Re6+", 521),
        threatAfter: line("Re6+", 221),
        opponentBestAfter: { cp: 230, mate: null },
        opponentBestAfterProbed: { cp: 230, mate: null },
      }),
    );
    expect(f.unaddressedThreat?.reason ?? "no-card").not.toBe("made-it-worse");
  });

  it("reports a threat that is only illegal for one ply because we gave check", () => {
    // Italian: Bxf7+ checks, which makes Bxf2+ illegal for exactly one ply.
    // Here the assumption the old code made unconditionally happens to be TRUE
    // — the c5 bishop still bears on f2 after every legal evasion — so the
    // claim survives. It now has to be measured rather than assumed, which is
    // what `threatEvasions` carries.
    const FEN = "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 6 5";
    const board = new Chess(FEN);
    board.move("Bxf7+");
    const evasions = threatAfterEvasions(board.fen(), "Bxf2+");

    // CONTROL: the fixture must actually present the branch — a real check,
    // with the threat genuinely returning every time. Without this the
    // assertion below could pass for the wrong reason.
    expect(evasions!.replies).toBeGreaterThan(0);
    expect(evasions!.returns).toBe(evasions!.replies);

    const f = computeIntentFacts(
      probe({
        fenBefore: FEN,
        playedSan: "Bxf7+",
        position: buildPositionFacts(FEN, "Bxf7+"),
        rootLines: [line("d3", 30)],
        playedScore: { cp: 20, mate: null },
        threat: line("Bxf2+", 400),
        threatAfter: null,
        threatStillLegal: false,
        threatPieceCaptured: false,
        threatEvasions: evasions,
      }),
    );
    expect(f.prophylaxis).toBeNull();
    expect(f.unaddressedThreat!.reason).toBe("only-illegal-due-to-check");
  });

  it("CONTROL: a threat that WAS stopped is never also reported as unaddressed", () => {
    const f = computeIntentFacts(
      probe({
        playedSan: "h5",
        threat: line("Qg4", 150),
        threatAfter: line("Qg4", -969),
        opponentBestAfter: { cp: 0, mate: null },
      }),
    );
    expect(f.prophylaxis).not.toBeNull();
    expect(f.unaddressedThreat).toBeNull();
  });

  it("CONTROL: nothing is reported when the opponent had no real threat", () => {
    // The null move always returns SOMETHING. Without the tempo gate this
    // would warn about a threat on essentially every quiet move in chess.
    const f = computeIntentFacts(
      probe({
        rootLines: [line("Nf3", 20)],
        playedScore: { cp: 20, mate: null },
        threat: line("Qb7", -136),
        threatAfter: line("Qb7", -150),
      }),
    );
    expect(f.unaddressedThreat).toBeNull();
    expect(f.notes.join(" ")).toContain("no threat");
  });
});

// ─── cost ──────────────────────────────────────────────────────────────────

describe("cost", () => {
  it("prices the real h5 case: f6 was +599, h5 was 0", () => {
    const f = computeIntentFacts(
      probe({
        playedSan: "h5",
        rootLines: [line("f6", 599), line("Rf5", 542)],
        playedScore: { cp: 0, mate: null },
      }),
    );
    expect(f.cost).toEqual({
      bestSan: "f6", bestCp: 599, playedCp: 0, lossCp: 599,
      mateChange: null, beyondMeasurement: false,
    });
  });

  it("reports nothing when the played move IS the best move", () => {
    const f = computeIntentFacts(
      probe({ playedSan: "f6", rootLines: [line("f6", 599)], playedScore: { cp: 599, mate: null } }),
    );
    expect(f.cost).toBeNull();
  });

  it("never reports a negative loss when search noise makes the played move look better", () => {
    const f = computeIntentFacts(
      probe({ rootLines: [line("f6", 500)], playedScore: { cp: 540, mate: null } }),
    );
    expect(f.cost).toBeNull();
  });

  // ── mate scores must never enter a centipawn subtraction ────────────────
  // Before these branches existed, the harness printed "COST 30929cp" on a
  // real position — a mate score minus a material score, rendered as 309 pawns.

  it("reports giving up a forced mate categorically, not as centipawns", () => {
    const f = computeIntentFacts(
      probe({ rootLines: [line("Qh8#", null, 1)], playedScore: { cp: 50, mate: null } }),
    );
    expect(f.cost!.mateChange).toBe("gave-up-mate");
    expect(f.cost!.lossCp).toBeNull();
    expect(f.cost!.bestCp).toBeNull();
  });

  it("reports walking into mate categorically (the real Qxf2 / Kf6 case)", () => {
    const f = computeIntentFacts(
      probe({ rootLines: [line("Qd4+", 930)], playedScore: { cp: null, mate: -1 } }),
    );
    expect(f.cost!.mateChange).toBe("allowed-mate");
    expect(f.cost!.lossCp).toBeNull();
  });

  it("says nothing when both lines mate — a slower mate is still a mate", () => {
    const f = computeIntentFacts(
      probe({ rootLines: [line("Qh8#", null, 1)], playedScore: { cp: null, mate: 4 } }),
    );
    expect(f.cost).toBeNull();
  });

  it("reports an unmeasurably large gap as decisive rather than as pawns", () => {
    // Stockfish reports +8308 in won king-and-pawn endings. Subtracted, that
    // produced "this cost you 7513 centipawns" — 75 pawns, on a board holding
    // two. Over 2,196 root evaluations from the founder's games the 99th
    // percentile is 1281cp, so the bound discards almost nothing.
    const f = computeIntentFacts(
      probe({ rootLines: [line("Ke7", 8308)], playedScore: { cp: 795, mate: null } }),
    );
    expect(f.cost!.beyondMeasurement).toBe(true);
    expect(f.cost!.lossCp).toBe(DECISIVE_CP);
  });

  it("CONTROL: no lossCp is ever a mate-sized number", () => {
    // The defect this whole block exists for: any lossCp above a few thousand
    // centipawns means a mate score leaked into the subtraction.
    for (const played of [{ cp: 50, mate: null }, { cp: null, mate: -1 }, { cp: -900, mate: null }]) {
      for (const best of [line("a", 930), line("b", null, 1)]) {
        const f = computeIntentFacts(probe({ rootLines: [best], playedScore: played }));
        if (f.cost?.lossCp != null) expect(Math.abs(f.cost.lossCp)).toBeLessThan(5000);
      }
    }
  });
});

// ─── quiet / zugzwang guard ────────────────────────────────────────────────

describe("quiet positions and the zugzwang guard", () => {
  it("says quiet when nothing was found and the position is flat", () => {
    const f = computeIntentFacts(
      probe({
        fenBefore: QUIET_FEN,
        playedSan: "d3",
        position: buildPositionFacts(QUIET_FEN, "d3"),
        rootLines: [line("d3", 27), line("d4", 26), line("Nc3", 22)],
        playedScore: { cp: 27, mate: null },
      }),
    );
    expect(f.sharpness).toBe("flat");
    expect(f.quiet).toBe(true);
    expect(f.urgencySuppressed).toBe(false);
  });

  // ── "nothing tactical here" is an assertion, so it needs evidence ────────
  // An adversarial audit rated these CRITICAL: the gate tested only that a
  // finding was absent, so every way of ending up empty-handed — unreadable
  // scores, missing board facts, a threat we declined to narrate — was read as
  // "the position is dull".

  it("refuses to claim quiet when the board facts were never derived", () => {
    // material, escape and the check guard are ALL derived from probe.position.
    // With it null the module has no board information whatsoever.
    const f = computeIntentFacts(
      probe({
        position: null,
        rootLines: [line("Nf3", 27), line("d4", 26)],
        playedScore: { cp: 27, mate: null },
      }),
    );
    expect(f.quiet).toBe(false);
    expect(f.notes.join(" ")).toContain("board facts unavailable");
  });

  it("refuses to claim quiet when the played move's score is present but unreadable", () => {
    // The gate tested the CONTAINER (`playedScore !== null`), so this object
    // sailed through and a move that was never really scored was called quiet.
    const f = computeIntentFacts(
      probe({
        fenBefore: QUIET_FEN,
        playedSan: "d3",
        position: buildPositionFacts(QUIET_FEN, "d3"),
        rootLines: [line("d3", 27), line("d4", 26)],
        playedScore: { cp: null, mate: null },
      }),
    );
    expect(f.quiet).toBe(false);
    expect(f.notes.join(" ")).toContain("not scored");
  });

  it("refuses to claim quiet when a real threat was found but not narrated", () => {
    // The tempo gate has already confirmed the opponent has something going on.
    // Bailing out of the claim afterwards means we could not describe it — the
    // opposite of there being nothing to describe.
    const f = computeIntentFacts(
      probe({
        fenBefore: QUIET_FEN,
        playedSan: "d3",
        position: buildPositionFacts(QUIET_FEN, "d3"),
        rootLines: [line("d3", 27), line("d4", 26)],
        playedScore: { cp: 27, mate: null },
        threat: line("Qh5", 400),
        threatAfter: line("Qh5", 380), // swing of 20: real threat, not defused
        opponentBestAfter: { cp: 390, mate: null },
      }),
    );
    expect(f.prophylaxis).toBeNull();
    expect(f.quiet).toBe(false);
    expect(f.notes.join(" ")).toContain("not narrated");
  });

  it("refuses to call a king-and-pawn position quiet", () => {
    const f = computeIntentFacts(
      probe({
        fenBefore: KP_FEN,
        playedSan: "Kd3",
        position: buildPositionFacts(KP_FEN, "Kd3"),
        rootLines: [line("Kd3", 10), line("Kf3", 8)],
        playedScore: { cp: 10, mate: null },
        moverHasPieces: false,
      }),
    );
    expect(f.sharpness).toBe("flat");
    expect(f.quiet).toBe(false);
    expect(f.urgencySuppressed).toBe(true);
  });

  it("is not quiet when something concrete was found, however flat the spread", () => {
    const f = computeIntentFacts(
      probe({
        rootLines: [line("h5", 10), line("Re8", 5)],
        playedScore: { cp: 10, mate: null },
        threat: line("Qg4", 180),
        threatAfter: line("Qg4", -966),
        opponentBestAfter: { cp: 0, mate: null },
      }),
    );
    expect(f.sharpness).toBe("flat");
    expect(f.quiet).toBe(false);
  });

  it("buckets sharpness at the documented boundaries", () => {
    const at = (gap: number) =>
      computeIntentFacts(probe({ rootLines: [line("a", gap), line("b", 0)], playedScore: { cp: gap, mate: null } }))
        .sharpness;
    expect(at(150)).toBe("only-move");
    expect(at(149)).toBe("clearly-best");
    expect(at(50)).toBe("clearly-best");
    expect(at(49)).toBe("slight-edge");
    expect(at(20)).toBe("slight-edge");
    expect(at(19)).toBe("flat");
  });
});
