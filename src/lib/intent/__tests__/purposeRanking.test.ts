import { describe, it, expect } from "vitest";
import { computeIntentFacts } from "../intentFacts";
import { buildPositionFacts } from "../positionFacts";
import type { EngineLine, IntentProbe } from "../types";

/**
 * THE PURPOSE RANKING.
 *
 * Most moves do several things at once and only one of them is the point. The
 * founder's rejections are what forced this: Bxd1 does incidentally worsen an
 * opponent move, but "we are capturing Bxd1 to get the queen, not to stop Bd3".
 *
 * Every fixture below is a real position with its real measured numbers, and
 * each one broke an earlier version of this design.
 */

const line = (san: string, cp: number | null, mate: number | null = null): EngineLine => ({
  san,
  score: { cp, mate },
  pv: [san],
  depth: 16,
});

function probe(over: Partial<IntentProbe> = {}): IntentProbe {
  return {
    fenBefore: "8/8/8/8/8/8/8/K6k w - - 0 1",
    playedSan: "Kb1",
    fenAfter: "8/8/8/8/8/8/8/1K5k b - - 1 1",
    rootLines: [line("Kb1", 0)],
    threat: null,
    opponentBestAfterProbed: null,
    threatAfter: null,
    threatAlternative: null,
    opponentBestAfter: null,
    threatAfterAlternatives: [],
    threatStillLegal: true,
    threatPieceCaptured: null,
    playedScore: { cp: 0, mate: null },
    moverHasPieces: true,
    position: null,
    opponentReply: null,
    ...over,
  };
}

const SMOTHERED = "5r1k/6pp/7N/8/8/1Q6/6PP/6K1 w - - 0 1";
const BXD1 = "r2k1bnr/ppp2ppp/2nP4/1N6/2B1q3/4BbP1/PPP2P1P/R2QK2R b KQ - 0 10";
const BAIT = "2r2rk1/p1q2p1p/6p1/8/Q7/2P1P1P1/PP1P1P1b/R1B1K2R b KQ - 0 17";
const BC2 = "1r3rk1/2pb2bp/pq2p1p1/8/B2PP3/P1P2nP1/4QP2/R1BK3R w - - 1 21";
const H5 = "5rk1/p4p1p/6p1/2r5/5Q2/2P1P1K1/PP1Pq3/R1B4R b - - 9 23";
const KD8 = "r1b1kbnr/ppp2ppp/2np2q1/1N2p3/2BPP3/6P1/PPP2P1P/R1BQK1NR b KQkq - 2 6";

describe("purpose ranking", () => {
  it("a queen sacrifice that mates is the MATE, not lost material", () => {
    // Philidor's legacy. Material is -900 and it captures nothing at all.
    // Any ranking led by material gets this exactly backwards.
    const position = buildPositionFacts(SMOTHERED, "Qg8+")!;
    // Qg8+ Rxg8 Nxg8 Kxg8 nets Black a queen for rook-and-knight: -720.
    expect(position.materialSwingCp).toBe(-720);

    const f = computeIntentFacts(
      probe({
        playedSan: "Qg8+",
        rootLines: [line("Qg8+", null, 2)],
        playedScore: { cp: null, mate: 2 },
        position,
      }),
    );
    expect(f.purpose).toBe("mate");
    expect(f.mate!.inMoves).toBe(2);
    expect(f.material).toBeNull();
  });

  it("winning a queen is MATERIAL, not incidental prophylaxis", () => {
    // game_01 move 10 Black, real numbers. It does worsen Bd3 by 193cp, and
    // the founder rejected exactly that reading.
    const position = buildPositionFacts(BXD1, "Bxd1")!;
    const f = computeIntentFacts(
      probe({
        playedSan: "Bxd1",
        rootLines: [line("Bxd1", 509), line("cxd6", 357)],
        playedScore: { cp: 520, mate: null },
        position,
        threat: line("Bd3", 300),
        threatAfter: line("Bd3", -200),
      }),
    );
    expect(f.purpose).toBe("material");
    expect(f.material!.capturedCp).toBe(900);
  });

  it("a bait the opponent took is a TRAP", () => {
    // game_02 move 17 Black. The engine says White declines with Rh3 (+194);
    // White played fxg3 (-253), grabbing a bishop with a pawn. 447cp.
    const position = buildPositionFacts(BAIT, "Bxg3")!;
    const f = computeIntentFacts(
      probe({
        playedSan: "Bxg3",
        rootLines: [line("Bxg3", -175), line("Rd8", -378)],
        playedScore: { cp: -175, mate: null },
        position,
        opponentReply: {
          san: "fxg3",
          actual: { cp: -253, mate: null },
          bestSan: "Rh3",
          best: { cp: 194, mate: null },
          tempting: true,
          // fxg3 is not even legal until Bxg3 is played: our move created the
          // opportunity outright, which is the strongest attribution there is.
          replyExistedBefore: false,
          counterfactualCostCp: 0,
        },
      }),
    );
    expect(f.purpose).toBe("trap");
    expect(f.trap!.costCp).toBe(447);
  });

  it("CONTROL: an opponent error nobody would be tempted by is NOT a trap", () => {
    // Otherwise every opponent mistake gets credited to whatever we happened
    // to play immediately before it.
    const f = computeIntentFacts(
      probe({
        opponentReply: {
          san: "Ka1",
          actual: { cp: -300, mate: null },
          bestSan: "Nf3",
          best: { cp: 100, mate: null },
          tempting: false,
          replyExistedBefore: true,
          counterfactualCostCp: 0,
        },
      }),
    );
    expect(f.trap).toBeNull();
    expect(f.notes.join(" ")).toContain("not tempting");
  });

  // ── trap attribution must FAIL CLOSED ────────────────────────────────────
  // The gate read `counterfactualCostCp !== null`, so it silently vanished
  // whenever the field was absent — reverting to exactly the flattery it was
  // added to prevent. walkedIntoMate skipped it unconditionally.

  it("CONTROL: no trap when there is no counterfactual for the opponent's error", () => {
    const f = computeIntentFacts(
      probe({
        opponentReply: {
          san: "Qxb2",
          actual: { cp: -300, mate: null },
          bestSan: "Rc8",
          best: { cp: 141, mate: null },
          tempting: true,
          replyExistedBefore: true,
          counterfactualCostCp: null,
        },
      }),
    );
    expect(f.trap).toBeNull();
    expect(f.notes.join(" ")).toContain("no counterfactual");
  });

  it("CONTROL: a mate that was already coming is not our trap", () => {
    // A far-wing pawn move credited with baiting a mate that the opponent walks
    // into with or without it. walkedIntoMate bypassed attribution entirely, so
    // no centipawn counterfactual could ever block this.
    const f = computeIntentFacts(
      probe({
        playedSan: "a3",
        opponentReply: {
          san: "Rxc3",
          actual: { cp: null, mate: -2 },
          bestSan: "Nc6",
          best: { cp: -120, mate: null },
          tempting: true,
          replyExistedBefore: true,
          // The same reply was already a 450cp error before we played.
          counterfactualCostCp: 450,
        },
      }),
    );
    expect(f.trap).toBeNull();
    expect(f.notes.join(" ")).toContain("already cost");
  });

  it("CONTROL: no trap when the opponent's best reply was never scored", () => {
    // Without a baseline, "their move was an error" is unsupported — they may
    // have been losing whatever they played.
    const f = computeIntentFacts(
      probe({
        opponentReply: {
          san: "Nxe5",
          actual: { cp: null, mate: -3 },
          bestSan: "Kf8",
          best: null,
          tempting: true,
          replyExistedBefore: true,
          counterfactualCostCp: 0,
        },
      }),
    );
    expect(f.trap).toBeNull();
    expect(f.notes.join(" ")).toContain("no baseline");
  });

  it("moving an attacked piece to safety is an ESCAPE", () => {
    // game_04 move 21 White. Founder: "playing Bc2 is to move the bishop out
    // of danger", not to stop Bxa4+.
    const position = buildPositionFacts(BC2, "Bc2")!;
    expect(position.escapedAttack).toBe(true);

    const f = computeIntentFacts(
      probe({
        playedSan: "Bc2",
        rootLines: [line("Bxd7", -382), line("Qc4", -547)],
        playedScore: { cp: -614, mate: null },
        position,
        threat: line("Bxa4+", 300),
        threatAfter: line("Bxa4+", -100),
      }),
    );
    expect(f.purpose).toBe("escape");
  });

  it("prophylaxis speaks only when nothing bigger explains the move (h5)", () => {
    const position = buildPositionFacts(H5, "h5")!;
    expect(position.escapedAttack).toBe(false); // attacked before AND after

    const f = computeIntentFacts(
      probe({
        playedSan: "h5",
        rootLines: [line("Rf5", 491), line("f6", 482)],
        playedScore: { cp: 0, mate: null },
        position,
        threat: line("Qg4", 161),
        threatAfter: line("Qg4", -926),
        // White's best reply after h5 is Rh2 at 0, so Qg4 is 926cp off it.
        opponentBestAfter: { cp: 0, mate: null },
      }),
    );
    expect(f.purpose).toBe("prophylaxis");
    expect(f.prophylaxis!.threatSan).toBe("Qg4");
  });

  it("says NOTHING about purpose when nothing explains the move (Kd8)", () => {
    // The founder rejected "Kd8 stops Be2": Be2 was White's own prophylactic
    // move, and plenty of Black moves would have made it worse.
    const position = buildPositionFacts(KD8, "Kd8")!;
    const f = computeIntentFacts(
      probe({
        playedSan: "Kd8",
        rootLines: [line("Qxe4+", 394), line("Nxd4", 182)],
        playedScore: { cp: 16, mate: null },
        position,
      }),
    );
    expect(f.purpose).toBe("none");
    // The cost is still reported — we just decline to invent a reason.
    expect(f.cost!.lossCp).toBe(378);
  });
});
