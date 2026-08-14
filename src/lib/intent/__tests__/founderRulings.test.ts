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
 * Every number below is the real depth-16 measurement from that position. If a
 * future change makes the module chattier, these six go red before a student
 * is told they failed to stop a mate in a resignable position.
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
    why: "black is winning before the blunder — a forced mate in 17 was available",
    played: "Qxf2",
    best: line("Qd4+", mate(17)),
    playedScore: mate(-1),
    threat: line("Qxh7#", mate(1)),
    threatAfter: line("Qxh7#", mate(1)),
  },
  {
    id: "game_11 42. d4",
    verdict: "not worth saying",
    why: "the moves do not stop or counter each other, and the game is gone",
    played: "d4",
    best: line("Kh5", cp(-673)),
    playedScore: cp(-6371),
    threat: line("a3", mate(17)),
    threatAfter: line("a3", mate(16)),
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
    threat: line("Qg6#", mate(1)),
    threatAfter: line("Qg6#", mate(1)),
  },
  {
    id: "game_09 33. Ke3",
    verdict: "not worth saying",
    why: "Kf2 was better but the game is very much gone already",
    played: "Ke3",
    best: line("Kf2", mate(-12)),
    playedScore: mate(-4),
    threat: line("e1=Q", mate(4)),
    threatAfter: line("e1=Q+", mate(4)),
  },
  {
    id: "game_12 56. Kf3",
    verdict: "not worth saying",
    why: "moves do not interact and the game is already very decided",
    played: "Kf3",
    best: line("Kh3", cp(-1472)),
    playedScore: mate(-23),
    threat: line("Ke6", mate(22)),
    threatAfter: line("Ke6", mate(23)),
  },
  {
    id: "game_12 81. Kh6",
    verdict: "not worth saying",
    why: "the game is decided",
    played: "Kh6",
    best: line("Kh6", mate(-4)),
    playedScore: mate(-4),
    threat: line("Qh7#", mate(1)),
    threatAfter: line("Qh7+", mate(13)),
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
