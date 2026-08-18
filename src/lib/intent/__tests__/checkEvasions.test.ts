import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { threatAfterEvasions, buildPositionFacts } from "../positionFacts";
import { computeIntentFacts } from "../intentFacts";
import type { IntentProbe } from "../types";

/**
 * "YOU DID NOT DEAL WITH X" — ON A MOVE THAT DEALS WITH X
 *
 * A check makes every opponent non-evasion illegal for exactly one ply. The
 * module correctly refused to read that as prevention, and then asserted the
 * opposite instead: that the threat comes straight back, so the move ignored
 * it. Both are claims about the same thing nobody measured.
 *
 * Measured over the founder's twelve games, of 19 such claims only 7 held:
 * 6 were flatly false and 6 depended on which evasion the opponent picked.
 *
 * The founder caught it on game_06 move 34. He played `Rhxg2+`; the card said
 * he had failed to deal with `Kf2`. `Rhxg2+` is precisely what stops `Kf2`.
 */

const probeOf = (over: Partial<IntentProbe>): IntentProbe => ({
  fenBefore: "",
  playedSan: "",
  fenAfter: "",
  rootLines: [],
  rootBestProbed: null,
  opponentBestAfterProbed: null,
  threat: null,
  threatAfter: null,
  threatAlternative: null,
  threatStillLegal: true,
  threatPieceCaptured: null,
  threatEvasions: null,
  opponentBestAfter: null,
  threatAfterAlternatives: [],
  playedScore: null,
  moverHasPieces: true,
  position: null,
  opponentReply: null,
  ...over,
});

/** Build the probe the way the adapter does, for a checking move. */
function checkingProbe(
  fenBefore: string,
  playedSan: string,
  threatSan: string,
  over: Partial<IntentProbe> = {},
): IntentProbe {
  const g = new Chess(fenBefore);
  const mv = g.move(playedSan);
  const fenAfter = g.fen();
  return probeOf({
    fenBefore,
    playedSan: mv.san,
    fenAfter,
    threat: { san: threatSan, score: { cp: 366, mate: null }, pv: [threatSan], depth: 16 },
    threatStillLegal: false,
    threatPieceCaptured: false,
    threatEvasions: threatAfterEvasions(fenAfter, threatSan, fenBefore),
    position: buildPositionFacts(fenBefore, playedSan, null, null),
    playedScore: { cp: 407, mate: null },
    rootLines: [{ san: mv.san, score: { cp: 342, mate: null }, pv: [mv.san], depth: 16 }],
    ...over,
  });
}

// ── the founder's position ───────────────────────────────────────────────────
// 8/4k3/2p5/1p2Pp2/p3pN2/2P1P1r1/PPB1K1Pr/3R4 b - - 2 34
// Black rooks on g3 and h2, White king on e2. If Black passes, Kf2 forks the
// loose rook on g3 — a real threat, worth +366. Rhxg2+ answers it: the rook
// lands on g2 with check, the two rooks defend each other, and f2 is covered.
const G6_BEFORE = "8/4k3/2p5/1p2Pp2/p3pN2/2P1P1r1/PPB1K1Pr/3R4 b - - 2 34";

// game_04's final move. Qxh7 is mate; there is no next move at all.
const G4_MATE_BEFORE = "5rk1/2p4p/p3p1pQ/1b6/4P3/P5P1/2B2q2/b2K3R w - - 0 28";

// game_02 move 18: Qxg3+ is check, and Qh4 really is available after every
// single legal reply. This one the module SHOULD still call unaddressed.
const G2_BEFORE = "2r2rk1/p1q2p1p/6p1/8/Q7/2P1P1P1/PP1P4/R1B1K2R b KQ - 0 18";

describe("a check that actually answers the threat", () => {
  it("CONTROL: Rhxg2+ really does give check and really does make Kf2 illegal", () => {
    // Without this, the assertions below could pass because the fixture stopped
    // exercising the branch at all.
    const g = new Chess(G6_BEFORE);
    g.move("Rhxg2+");
    expect(g.isCheck()).toBe(true);
    expect(g.moves()).not.toContain("Kf2");
    // and Kf2 was genuinely available before the move
    const passed = new Chess(G6_BEFORE);
    const parts = passed.fen().split(" ");
    parts[1] = "w";
    parts[3] = "-";
    expect(new Chess(parts.join(" ")).moves()).toContain("Kf2");
  });

  it("CONTROL: White's only replies are Nxg2, Kf1, Ke1 — and 2 of 3 kill Kf2 for good", () => {
    const g = new Chess(G6_BEFORE);
    g.move("Rhxg2+");
    const ev = threatAfterEvasions(g.fen(), "Kf2");
    expect(ev).not.toBeNull();
    expect(ev!.replies).toBe(3);
    expect(ev!.returns).toBe(1); // only Nxg2, which takes the rook off g2
    expect(ev!.unmodelled).toBe(0);
  });

  it("does not claim the move ignored a threat it made illegal", () => {
    // This is the test that failed before the fix: reason "only-illegal-due-to-check".
    const facts = computeIntentFacts(checkingProbe(G6_BEFORE, "Rhxg2+", "Kf2"));
    expect(facts.unaddressedThreat).toBeNull();
    expect(facts.notes.join(" ")).toContain("returns after 1 of 3 replies");
  });

  it("says nothing about threats on the move that delivers checkmate", () => {
    // Qxh7# ends game_04. The old branch captioned it "you did not deal with Qf3+".
    const g = new Chess(G4_MATE_BEFORE);
    g.move("Qxh7#");
    expect(g.isCheckmate()).toBe(true);

    const ev = threatAfterEvasions(g.fen(), "Qf3+");
    expect(ev!.replies).toBe(0);

    const facts = computeIntentFacts(checkingProbe(G4_MATE_BEFORE, "Qxh7#", "Qf3+"));
    expect(facts.unaddressedThreat).toBeNull();
    expect(facts.notes.join(" ")).toContain("ended the game");
  });

  it("CONTROL: still reports the threat when it genuinely survives every legal reply", () => {
    // The fix must stay subtractive, not silence the branch outright.
    //
    // This control originally used Qxg3+/Qh4 — the position the FOUNDER then
    // refuted ("literally playing Qxg3+ stops Qh4 ... it is straight up
    // WRONG"): Qh4 is legal after every reply but lands into Qxh4, a capture
    // Qxg3+ itself created. The valid survivor from the same game is Qf3+
    // three plies later: Qf4 returns after both replies AND its capture
    // already existed in the world the threat was priced in, so the price
    // includes it and the claim stands.
    const QF3 = "2r2rk1/p4p1p/6p1/8/Q7/2P1P1q1/PP1P4/R1B2K1R b - - 1 19";
    const g = new Chess(QF3);
    g.move("Qf3+");
    const ev = threatAfterEvasions(g.fen(), "Qf4", QF3);
    expect(ev!.replies).toBeGreaterThan(0);
    expect(ev!.returns).toBe(ev!.replies);
    expect(ev!.met).toBe(0);

    const facts = computeIntentFacts(checkingProbe(QF3, "Qf3+", "Qf4"));
    expect(facts.unaddressedThreat).not.toBeNull();
    expect(facts.unaddressedThreat!.reason).toBe("only-illegal-due-to-check");
  });

  it("declines to speak when the evasions were never modelled", () => {
    // Fail closed: a null measurement must not fall back to the old assumption.
    const probe = checkingProbe(G6_BEFORE, "Rhxg2+", "Kf2");
    const facts = computeIntentFacts({ ...probe, threatEvasions: null });
    expect(facts.unaddressedThreat).toBeNull();
    expect(facts.notes.join(" ")).toContain("not modelled");
  });

  it("threatAfterEvasions never throws on a nonsense threat", () => {
    const g = new Chess(G6_BEFORE);
    g.move("Rhxg2+");
    const ev = threatAfterEvasions(g.fen(), "Qz9");
    expect(ev).not.toBeNull();
    expect(ev!.returns).toBe(0);
  });
});

/**
 * CREDIT WHEN SOUND — the founder's ruling of 2026-08-18.
 *
 * When a check ends the threat permanently (it returns after ZERO legal
 * replies), the coach may now say so — but only when the move is itself at or
 * near the engine's best, so a blunder is never praised for a side effect.
 *
 * Fixture is real: game_02 move 8, `Bxc6+`. The threat was `Bxd5` — capturing
 * the bishop that stood on d5. `Bxc6+` is that same bishop capturing c6 with
 * check, so the threat's target is gone from d5 forever: measured, Bxd5
 * returns after 0 of White's... Black's 4 legal replies. And the move is tied
 * with the engine's top choice at +210 in the same search, so the soundness
 * gate is met with a loss of exactly 0.
 */
const G2_BXC6_BEFORE = "r2qkb1r/ppp2p1p/2n1b1p1/3Bp3/8/4PQ2/PPPP1PPP/R1B1K1NR w KQkq - 1 8";
const BXC6_LINES = [
  { san: "Bxe6", score: { cp: 210, mate: null }, pv: ["Bxe6"], depth: 16 },
  { san: "Bxc6+", score: { cp: 210, mate: null }, pv: ["Bxc6+"], depth: 16 },
  { san: "Bb3", score: { cp: 36, mate: null }, pv: ["Bb3"], depth: 16 },
];

describe("a sound check that permanently ends the threat is credited", () => {
  it("CONTROL: Bxc6+ really checks, and Bxd5 returns after 0 of the replies", () => {
    const g = new Chess(G2_BXC6_BEFORE);
    g.move("Bxc6+");
    expect(g.isCheck()).toBe(true);
    const ev = threatAfterEvasions(g.fen(), "Bxd5");
    expect(ev).not.toBeNull();
    expect(ev!.replies).toBeGreaterThan(0);
    expect(ev!.returns).toBe(0);
    expect(ev!.unmodelled).toBe(0);
  });

  it("credits the prevention when the move ties the engine's best", () => {
    const f = computeIntentFacts(
      checkingProbe(G2_BXC6_BEFORE, "Bxc6+", "Bxd5", { rootLines: BXC6_LINES }),
    );
    expect(f.prophylaxis).not.toBeNull();
    expect(f.prophylaxis!.preventedOutright).toBe(true);
    expect(f.unaddressedThreat).toBeNull();
  });

  it("does NOT credit the same prevention on an unsound move", () => {
    // Identical position, but the engine's best is 300cp above the played
    // move: the threat still dies for good, and the coach still says nothing,
    // because a side effect of a bad move earns no credit.
    const lines = [
      { san: "Bxe6", score: { cp: 510, mate: null }, pv: ["Bxe6"], depth: 16 },
      { san: "Bxc6+", score: { cp: 210, mate: null }, pv: ["Bxc6+"], depth: 16 },
    ];
    const f = computeIntentFacts(
      checkingProbe(G2_BXC6_BEFORE, "Bxc6+", "Bxd5", { rootLines: lines }),
    );
    expect(f.prophylaxis).toBeNull();
    expect(f.notes.join(" ")).toContain("loses 300cp");
  });

  it("does NOT credit when the move is outside the searched lines", () => {
    // Below the engine's third choice there is no same-search number, and a
    // soundness verdict from a cross-regime subtraction is the PR #331 bug —
    // so no measurement, no credit.
    const lines = [{ san: "Bxe6", score: { cp: 210, mate: null }, pv: ["Bxe6"], depth: 16 }];
    const f = computeIntentFacts(
      checkingProbe(G2_BXC6_BEFORE, "Bxc6+", "Bxd5", { rootLines: lines }),
    );
    expect(f.prophylaxis).toBeNull();
    expect(f.notes.join(" ")).toContain("not measurably near");
  });

  it("does NOT credit when an evasion could not be modelled", () => {
    const f = computeIntentFacts(
      checkingProbe(G2_BXC6_BEFORE, "Bxc6+", "Bxd5", {
        rootLines: BXC6_LINES,
        threatEvasions: { replies: 4, returns: 0, met: 0, unmodelled: 1 },
      }),
    );
    expect(f.prophylaxis).toBeNull();
    expect(f.notes.join(" ")).toContain("not claiming it was ignored");
  });

  it("CONTROL: Rhxg2+ (returns 1 of 3) still earns neither blame nor credit", () => {
    // The founder's original position must be unmoved by this feature: Kf2
    // comes back down Nxg2, so the claim depends on a choice the opponent
    // never made.
    const f = computeIntentFacts(checkingProbe(G6_BEFORE, "Rhxg2+", "Kf2"));
    expect(f.prophylaxis).toBeNull();
    expect(f.unaddressedThreat).toBeNull();
    expect(f.notes.join(" ")).toContain("returns after 1 of 3");
  });
});

/**
 * LEGAL AGAIN IS NOT THREATENING AGAIN.
 *
 * The founder, on game_02 move 18: "literally playing Qxg3+ stops Qh4, so what
 * you are claiming is not noise or worth saying, it is straight up WRONG."
 *
 * He is right, and the flaw is one level below PR #335. That fix upgraded "we
 * ASSUME the threat comes back" to "we MEASURE that the threat's SAN is legal
 * again" — and then let legality stand in for still-being-a-threat. Qxg3+
 * puts the queen on g3, and g3 covers h4: measured, White's Qh4 is met by
 * Qxh4 the instant it lands, down EVERY one of White's three evasions, while
 * in the null-move world where Qh4 was priced at +381 Black had no capture on
 * h4 at all. The played move CREATED the answer to the threat, and the card
 * said he ignored it.
 *
 * So a returning threat now also asks: can the mover capture the arriving
 * piece without losing material (SEE >= 0), through a capture that did NOT
 * exist in the world the threat was priced in? If yes in any branch, the
 * "you did not deal with it" claim dies. The baseline matters — Qf3+ three
 * plies later keeps its claim precisely because the capture of Qf4 already
 * existed pre-move, so the threat's price already included it.
 */
const G2_QXG3_BEFORE = "2r2rk1/p1q2p1p/6p1/8/Q7/2P1P1P1/PP1P4/R1B1K2R b KQ - 0 18";
const G2_QF3_BEFORE = "2r2rk1/p4p1p/6p1/8/Q7/2P1P1q1/PP1P4/R1B2K1R b - - 1 19";

describe("a threat that returns into a newly created capture was dealt with", () => {
  it("CONTROL: the fixture really presents the bug", () => {
    // In the null world (Black passes), Qh4 lands uncapturable — that is the
    // world the +381 was measured in. After Qxg3+, every White evasion leaves
    // Qh4 legal AND capturable by the g3 queen. If any of this stops being
    // true, the assertions below pass for the wrong reason.
    const passed = new Chess(G2_QXG3_BEFORE.replace(" b ", " w ").replace(" KQ ", " KQ "));
    passed.move("Qh4");
    expect(passed.moves({ verbose: true }).filter((m) => m.to === "h4" && m.captured)).toEqual([]);

    const g = new Chess(G2_QXG3_BEFORE);
    g.move("Qxg3+");
    const ev = threatAfterEvasions(g.fen(), "Qh4", G2_QXG3_BEFORE);
    expect(ev).not.toBeNull();
    expect(ev!.replies).toBe(3);
    expect(ev!.returns).toBe(3);
    expect(ev!.met).toBe(3);
  });

  it("does not claim Qxg3+ ignored the Qh4 it answers", () => {
    // The founder's exact position. Failed before the fix: the module kept
    // "you played Qxg3+ and did not deal with Qh4" because Qh4 is legal after
    // every evasion.
    const f = computeIntentFacts(checkingProbe(G2_QXG3_BEFORE, "Qxg3+", "Qh4"));
    expect(f.unaddressedThreat).toBeNull();
    expect(f.notes.join(" ")).toContain("meets it with a capture");
  });

  it("CONTROL: Qf3+ keeps its claim — the capture of Qf4 existed before the move", () => {
    // Three plies later in the same game. Qf4 returns after both evasions and
    // the queen on f3 can take it — but she could ALSO have taken it in the
    // null world where the threat was priced, so the price already includes
    // the capture and the threat is real. Without the baseline check this
    // valid claim dies with the invalid one.
    const g = new Chess(G2_QF3_BEFORE);
    g.move("Qf3+");
    const ev = threatAfterEvasions(g.fen(), "Qf4", G2_QF3_BEFORE);
    expect(ev!.returns).toBe(ev!.replies);
    expect(ev!.met).toBe(0);

    const f = computeIntentFacts(checkingProbe(G2_QF3_BEFORE, "Qf3+", "Qf4"));
    expect(f.unaddressedThreat).not.toBeNull();
    expect(f.unaddressedThreat!.reason).toBe("only-illegal-due-to-check");
  });

  it("CONTROL: a LOSING capture does not count as meeting the threat", () => {
    // Qe6+ newly covers e4 — but the knight arriving there is defended by the
    // f5 pawn, so Qxe4 loses the queen for a knight. A capture you cannot
    // afford is no answer, and the "you did not deal with Ne4" claim must
    // SURVIVE. This is the SEE >= 0 half of the criterion: without it, any
    // touchable square would silence a valid card.
    const FEN = "6k1/6pp/5n2/5p2/8/8/Q5P1/6K1 w - - 0 1";
    const g = new Chess(FEN);
    // fixture control: the queen does NOT see e4 before the move...
    expect(g.moves({ verbose: true }).some((m) => m.from === "a2" && m.to === "e4")).toBe(false);
    g.move("Qe6+");
    // ...and after every evasion the knight lands capturable-but-defended.
    const ev = threatAfterEvasions(g.fen(), "Ne4", FEN);
    expect(ev!.replies).toBe(2);
    expect(ev!.returns).toBe(2);
    expect(ev!.met).toBe(0);

    const f = computeIntentFacts(checkingProbe(FEN, "Qe6+", "Ne4"));
    expect(f.unaddressedThreat).not.toBeNull();
    expect(f.unaddressedThreat!.reason).toBe("only-illegal-due-to-check");
  });

  it("no baseline position means no claim, not a guessed one", () => {
    // Without fenBefore the helper cannot tell a new capture from a priced-in
    // one. The unaddressed claim must fail closed — silence — rather than
    // default to the assumption that just produced a wrong card.
    const g = new Chess(G2_QXG3_BEFORE);
    g.move("Qxg3+");
    const ev = threatAfterEvasions(g.fen(), "Qh4");
    expect(ev!.met).toBe(3);
  });
});
