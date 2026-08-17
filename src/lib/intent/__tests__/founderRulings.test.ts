import { describe, it, expect } from "vitest";
import { computeIntentFacts, ALREADY_LOST_CP } from "../intentFacts";
import type { EngineLine, IntentProbe, IntentScore } from "../types";

/**
 * THE FOUNDER'S RULINGS, as a regression suite.
 *
 * The module found seven positions where a forced mate survived the move
 * played. Asked which were worth telling a student about, the founder kept
 * exactly ONE and rejected six — and the reason was the same each time:
 *
 *   "the game is already decided, not much can be done and pretty much
 *    everything leads to mate — resignable position"
 *   "the position is mate in 1, doesn't matter what you do it will be mate,
 *    a3 is as good of a move as Rf1"
 *
 * against the keeper:
 *
 *   "the game is not already decided as black is winning before the blunder"
 *
 * Every number below is the real depth-16 measurement from that position, and
 * all of them were RE-MEASURED after the founder noticed that one move scored
 * two different values in the same position. The original sweep let null-move
 * searches share a transposition table with the real ones; the numbers here
 * come from the corrected one (probe18.mjs), where Tier 0 mirrors production's
 * warm-table walk and Tier 1 clears its table before every search.
 *
 * The VERDICTS all survived that correction — 7/7. Several of the measurements
 * did not:
 *
 *   game_11  the threat is not a forced mate at all, just a3 at +534
 *   game_12 56.  likewise — Ke5 at +875, not a mate in 22
 *   game_12 81.  the threat still mates, but after Kh6 it is +1088, not #13
 *   game_04  the keeper's best was +1158, not a forced mate in 17
 *
 * which only strengthens the founder's own reason for rejecting them. If a
 * future change makes the module chattier, these six go red before a student is
 * told they failed to stop a mate in a resignable position.
 */

const line = (san: string, score: IntentScore): EngineLine => ({ san, score, pv: [san], depth: 16 });
const cp = (n: number): IntentScore => ({ cp: n, mate: null });
const mate = (n: number): IntentScore => ({ cp: null, mate: n });

interface Ruling {
  id: string;
  verdict: "worth saying" | "not worth saying";
  why: string;
  played: string;
  best: EngineLine;
  playedScore: IntentScore;
  threat: EngineLine;
  threatAfter: EngineLine;
}

const RULINGS: Ruling[] = [
  {
    id: "game_04 27… Qxf2",
    verdict: "worth saying",
    why: "black is winning before the blunder — Qd4+ held +1158",
    played: "Qxf2",
    best: line("Qd4+", cp(1158)),
    playedScore: mate(-1),
    threat: line("Qxh7#", mate(1)),
    threatAfter: line("Qxh7#", mate(1)),
  },
  {
    id: "game_11 42. d4",
    verdict: "not worth saying",
    why: "the moves do not stop or counter each other, and the game is gone",
    played: "d4",
    best: line("d4", cp(-552)),
    playedScore: cp(-552),
    threat: line("a3", cp(534)),
    threatAfter: line("a3", cp(513)),
  },
  {
    id: "game_02 26. Kxg5",
    verdict: "not worth saying",
    why: "resignable — everything leads to mate",
    played: "Kxg5",
    best: line("Kxg5", mate(-3)),
    playedScore: mate(-3),
    threat: line("Qg4#", mate(1)),
    threatAfter: line("Qg4+", mate(3)),
  },
  {
    id: "game_02 30. Rf1",
    verdict: "not worth saying",
    why: "mate in 1 whatever you play — a3 is as good as Rf1",
    played: "Rf1",
    best: line("a3", mate(-1)),
    playedScore: mate(-1),
    threat: line("Re6#", mate(1)),
    threatAfter: line("Re6#", mate(1)),
  },
  {
    id: "game_09 33. Ke3",
    verdict: "not worth saying",
    why: "Kf2 was better but the game is very much gone already",
    played: "Ke3",
    best: line("Kf2", mate(-11)),
    playedScore: mate(-4),
    threat: line("e1=Q", mate(5)),
    threatAfter: line("e1=Q+", mate(4)),
  },
  {
    id: "game_12 56. Kf3",
    verdict: "not worth saying",
    why: "moves do not interact and the game is already very decided",
    played: "Kf3",
    best: line("Kh3", cp(-1011)),
    playedScore: cp(-1784),
    threat: line("Ke5", cp(875)),
    threatAfter: line("Ke5", cp(802)),
  },
  {
    id: "game_12 81. Kh6",
    verdict: "not worth saying",
    why: "the game is decided",
    played: "Kh6",
    best: line("Kh6", mate(-3)),
    playedScore: mate(-2),
    threat: line("Qh7#", mate(1)),
    threatAfter: line("Qh7+", cp(1088)),
  },
];

function probeFor(r: Ruling): IntentProbe {
  return {
    fenBefore: "8/8/8/8/8/8/8/K6k w - - 0 1",
    playedSan: r.played,
    fenAfter: "8/8/8/8/8/8/8/1K5k b - - 1 1",
    rootLines: [r.best, line("other", cp(-900))],
    threat: r.threat,
    threatAfter: r.threatAfter,
    threatAlternative: null,
    threatStillLegal: true,
    threatPieceCaptured: null,
    opponentBestAfter: null,
    opponentBestAfterProbed: null,
    threatAfterAlternatives: [],
    playedScore: r.playedScore,
    moverHasPieces: true,
    position: null,
    opponentReply: null,
  };
}

describe("the founder's rulings on unaddressed mate threats", () => {
  for (const r of RULINGS) {
    it(`${r.verdict}: ${r.id} — ${r.why}`, () => {
      const f = computeIntentFacts(probeFor(r));
      if (r.verdict === "worth saying") {
        expect(f.unaddressedThreat).not.toBeNull();
        expect(f.unaddressedThreat!.threatSan).toBe(r.threat.san);
        expect(f.unaddressedThreat!.stillMates).toBe(true);
      } else {
        expect(f.unaddressedThreat).toBeNull();
      }
    });
  }

  it("keeps exactly one of the seven — the ratio the founder actually gave", () => {
    const kept = RULINGS.filter((r) => computeIntentFacts(probeFor(r)).unaddressedThreat !== null);
    expect(kept.map((r) => r.id)).toEqual(["game_04 27… Qxf2"]);
  });
});

// ── the second ground-truth set: five prophylaxis rulings ──────────────────
//
// Four moves the founder confirmed as real prophylaxis, and one they rejected:
//
//   "I would not say playing Kd8 stops this, there is probably just another
//    move that does the same thing that stockfish prefers in that position."
//
// Every number is from the corrected sweep, and every operand of every
// subtraction was measured by the same engine under the same conditions.

interface Calibration {
  id: string;
  founderConfirmed: boolean;
  played: string;
  rootBest: EngineLine;
  playedScore: IntentScore;
  threat: EngineLine;
  threatAfter: EngineLine;
  probedBest: IntentScore;
  alts: IntentProbe["threatAfterAlternatives"];
}

const CALIBRATION: Calibration[] = [
  {
    id: "h5 — game_02 move 23",
    founderConfirmed: true,
    played: "h5",
    rootBest: line("Rf5", cp(585)),
    playedScore: cp(0),
    threat: line("Qg4", cp(176)),
    threatAfter: line("Qg4", cp(-936)),
    probedBest: cp(0),
    alts: [
      { ourSan: "Rf5", score: cp(-851), stillLegal: true },
      { ourSan: "f6", score: cp(-1277), stillLegal: true },
    ],
  },
  {
    id: "f5 — game_07 move 16",
    founderConfirmed: true,
    played: "f5",
    rootBest: line("Nf3", cp(-61)),
    playedScore: cp(-240),
    threat: line("hxg5", cp(425)),
    threatAfter: line("hxg5", cp(-73)),
    probedBest: cp(215),
    alts: [
      { ourSan: "Nf3", score: null, stillLegal: false },
      { ourSan: "Nh3", score: null, stillLegal: false },
    ],
  },
  {
    id: "g6 — game_07 move 18",
    founderConfirmed: true,
    played: "g6",
    rootBest: line("Bg6", cp(394)),
    playedScore: cp(305),
    threat: line("Bxd8", cp(487)),
    threatAfter: line("Bxd8", cp(-470)),
    probedBest: cp(-272),
    alts: [
      { ourSan: "Bg6", score: cp(-507), stillLegal: true },
      { ourSan: "Qe8", score: cp(-492), stillLegal: true },
      { ourSan: "Qc7", score: cp(-543), stillLegal: true },
    ],
  },
  {
    id: "Re1 — game_07 move 14",
    founderConfirmed: true,
    played: "Re1",
    rootBest: line("Ng5", cp(127)),
    playedScore: cp(-70),
    threat: line("h6", cp(49)),
    threatAfter: line("h6", cp(-334)),
    probedBest: cp(41),
    alts: [
      { ourSan: "Ng5", score: cp(-529), stillLegal: true },
      { ourSan: "Bd3", score: cp(-551), stillLegal: true },
      { ourSan: "Qe2", score: cp(-94), stillLegal: true },
    ],
  },
  {
    id: "Kd8 — game_01 move 6",
    founderConfirmed: false,
    played: "Kd8",
    rootBest: line("Qxe4+", cp(373)),
    playedScore: cp(-57),
    threat: line("Bd5", cp(165)),
    threatAfter: line("Bd5", cp(-147)),
    probedBest: cp(39),
    alts: [
      { ourSan: "Qxe4+", score: null, stillLegal: false },
      { ourSan: "Nxd4", score: cp(-458), stillLegal: true },
    ],
  },
];

function calibrationProbe(c: Calibration): IntentProbe {
  return {
    fenBefore: "8/8/8/8/8/8/8/K6k w - - 0 1",
    playedSan: c.played,
    fenAfter: "8/8/8/8/8/8/8/1K5k b - - 1 1",
    rootLines: [c.rootBest, line("other", cp(-900))],
    threat: c.threat,
    threatAfter: c.threatAfter,
    threatAlternative: null,
    threatStillLegal: true,
    threatPieceCaptured: null,
    opponentBestAfter: null,
    opponentBestAfterProbed: c.probedBest,
    threatAfterAlternatives: c.alts,
    playedScore: c.playedScore,
    moverHasPieces: true,
    position: null,
    opponentReply: null,
  };
}

describe("the founder's rulings on prophylaxis", () => {
  for (const c of CALIBRATION.filter((x) => x.id.startsWith("h5") === false)) {
    it(`${c.founderConfirmed ? "prophylaxis" : "NOT prophylaxis"}: ${c.id}`, () => {
      const f = computeIntentFacts(calibrationProbe(c));
      expect(f.prophylaxis !== null).toBe(c.founderConfirmed);
    });
  }

  /**
   * KNOWN REGRESSION, AWAITING THE FOUNDER'S RULING — DO NOT "FIX" BY TUNING.
   *
   * h5 is the founder's clearest confirmed prophylactic move, and the module
   * now rejects it. `it.fails` asserts that: the day someone changes the gate,
   * THIS test fails and forces the change to be looked at deliberately.
   *
   * Why it cannot be fixed by moving PROPHYLAXIS_MAX_ATTRIBUTION_CP: on clean
   * data the two rulings order the WRONG WAY round.
   *
   *   h5   CONFIRMED   answers Qg4 to -936; best alternative f6 reaches -1277
   *                    -> 341cp short
   *   Kd8  REJECTED    answers Bd5 to -147; best alternative Nxd4 reaches -458
   *                    -> 311cp short
   *
   * No threshold keeps h5 and rejects Kd8, because h5's shortfall is LARGER.
   * The gate's shape is wrong, not its value: an absolute centipawn margin is
   * being applied to refutations of wildly different size. As a share of the
   * refutation actually available, h5 captured 1112 of 1453cp (77%) while Kd8
   * captured 312 of 623cp (50%) — which does separate them, in the right
   * direction. Changing a gate's shape is a chess judgement, so it waits.
   *
   * Until then the module is SILENT on h5, which is the safe direction: a
   * missed observation costs nothing a student will notice, a fabricated one
   * costs their trust.
   */
  it.fails("h5 — game_02 move 23: the founder confirmed it, the module does not", () => {
    const h5 = CALIBRATION.find((c) => c.id.startsWith("h5"))!;
    const f = computeIntentFacts(calibrationProbe(h5));
    expect(f.prophylaxis).not.toBeNull();
  });

  it("records exactly why h5 is currently refused", () => {
    const h5 = CALIBRATION.find((c) => c.id.startsWith("h5"))!;
    const f = computeIntentFacts(calibrationProbe(h5));
    expect(f.prophylaxis).toBeNull();
    expect(f.notes.join(" ")).toContain("not this move's doing");
  });

  // ── the same rule, applied to the other side ────────────────────────────
  // The founder's principle is symmetric and only one half was implemented.

  it("says nothing about a threat from an opponent who is already lost", () => {
    // Real: game_12 move 49, re-measured. The player is +1104 and the module
    // reported they had failed to deal with Kg4 — a move worth -813 TO THE
    // OPPONENT. The null move always returns something; in a won position that
    // something is just the least-bad way to keep losing.
    //
    // The numbers this fixture used to carry (+1631 / -1429 / -1360) were the
    // two single most corrupted rows in the old sweep: the same two moves came
    // back as mate-in-27 when read from the polluted table, a 98,613cp
    // disagreement with themselves.
    const f = computeIntentFacts(
      probeFor({
        ...RULINGS[0],
        best: line("Bc1", cp(1104)),
        playedScore: cp(996),
        threat: line("Kg4", cp(-813)),
        threatAfter: line("Kg4", cp(-724)),
      }),
    );
    expect(f.unaddressedThreat).toBeNull();
    expect(f.notes.join(" ")).toContain("lost anyway");
  });

  it("CONTROL: a live opponent threat in a winning position still speaks", () => {
    // The gate must key on THEIR position, not on ours being good.
    const f = computeIntentFacts(
      probeFor({
        ...RULINGS[0],
        best: line("Bc1", cp(1631)),
        playedScore: cp(1374),
        threat: line("Qg4", cp(200)),
        threatAfter: line("Qg4", cp(180)),
      }),
    );
    expect(f.unaddressedThreat).not.toBeNull();
  });

  it("a move that makes the threat STRONGER is not filed as 'barely changed'", () => {
    // Real: game_11 move 40 Ra6. Level beforehand (Rc3 +2), the move scores
    // -1735, and their threat rises from 2196 to 2706. Calling that "barely
    // changed" undersold it into the weakest category in the module.
    const f = computeIntentFacts(
      probeFor({
        ...RULINGS[0],
        best: line("Rc3", cp(2)),
        playedScore: cp(-1735),
        threat: line("Re6+", cp(2196)),
        threatAfter: line("Re6+", cp(2706)),
      }),
    );
    expect(f.unaddressedThreat!.reason).toBe("made-it-worse");
    expect(f.unaddressedThreat!.madeItWorse).toBe(true);
  });

  it("the boundary is the repo's existing LOST band, to the centipawn", () => {
    const at = (best: number) =>
      computeIntentFacts(
        probeFor({ ...RULINGS[1], best: line("Kh5", cp(best)) }),
      ).unaddressedThreat;
    // One centipawn better than LOST: the player still had a game.
    expect(at(ALREADY_LOST_CP + 1)).not.toBeNull();
    // Exactly LOST: silence.
    expect(at(ALREADY_LOST_CP)).toBeNull();
  });
});
