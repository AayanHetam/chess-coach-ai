/**
 * PR-CI-2 unit tests for the measurement-grade referee checks.
 *
 * Discipline (plan §4, audit #35 — applies to measurement too): every check
 * is tested BOTH ways — true positives on handcrafted bad prose AND
 * no-false-fire controls on prose that only cites contract facts. A check
 * that fires on the control is a bug, not a tuning question.
 *
 * The insight fixture is synthetic and minimal: a knight-fork blunder with
 * two candidate lines, one confirmed fork motif, relational facts, and the
 * production Degraded states (lc0/maia/syzygy unavailable, chessdb down).
 */
import { describe, it, expect } from "vitest";
import {
  aggregateFidelity,
  checkEvalDisplays,
  checkForbiddenClaims,
  checkSanWhitelist,
  checkTacticalKeywords,
  countClaimSentences,
  runInsightChecks,
} from "@/lib/contract/refereeChecks";

// Synthetic insight factory — extracted to insightFactory.ts (PR-CI-3) so the
// blocking-referee suite (referee.test.ts) exercises the SAME fixture.
import { evalFact, makeContract, makeInsight } from "./insightFactory";

// ── checkEvalDisplays ───────────────────────────────────────────────────────
describe("checkEvalDisplays", () => {
  it("fires on an eval figure more than ±0.3 pawns from every contract eval", () => {
    const v = checkEvalDisplays("This leaves you at +5.00 here.", makeInsight());
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ check: "eval_display", category: "eval_unbacked", span: "+5.00" });
  });

  it("fires on a wrong mate distance (M±n must match exactly)", () => {
    const insight = makeInsight({
      evalAfter: evalFact({ cp: null, mate: 3, display: "M+3" }),
    });
    const bad = checkEvalDisplays("You are lost — it's M+7 now.", insight);
    expect(bad).toHaveLength(1);
    expect(bad[0].category).toBe("mate_distance_wrong");
    // Verbal phrasing too: "mate in 5" vs contract mate 3
    const verbal = checkEvalDisplays("There is a mate in 5 on the board.", insight);
    expect(verbal).toHaveLength(1);
    expect(verbal[0].category).toBe("mate_distance_wrong");
  });

  it("fires on any mate claim when the contract holds no mates", () => {
    const v = checkEvalDisplays("This is mate in 2!", makeInsight());
    expect(v).toHaveLength(1);
    expect(v[0].category).toBe("mate_distance_wrong");
  });

  it("control: exact displays, ±0.3 tolerance, drop figures, and correct mates do not fire", () => {
    const insight = makeInsight();
    expect(checkEvalDisplays("The eval went from +1.38 to -2.12, best was +3.20.", insight)).toEqual([]);
    // within tolerance (contract +1.38, prose +1.4 → 0.02 off)
    expect(checkEvalDisplays("You were around +1.40 before this.", insight)).toEqual([]);
    // severity drop phrased signed
    expect(checkEvalDisplays("That's a -3.50 swing.", insight)).toEqual([]);
    // correct mate distance
    const withMate = makeInsight({ evalAfter: evalFact({ cp: null, mate: -3, display: "M-3" }) });
    expect(checkEvalDisplays("Black has M-3, a mate in 3.", withMate)).toEqual([]);
  });

  it("control: sentinel evals never back a number (and never crash)", () => {
    const insight = makeInsight({
      evalBefore: evalFact({ cp: 0, depth: 0, sentinel: true, display: "engine data unavailable" }),
    });
    // +0.05 is only near the sentinel's fake 0 — must fire since sentinels are excluded
    const v = checkEvalDisplays("Roughly +0.05 equal here.", insight);
    expect(v).toHaveLength(1);
  });
});

// ── checkSanWhitelist ───────────────────────────────────────────────────────
describe("checkSanWhitelist", () => {
  it("fires on a SAN move that exists nowhere in the contract", () => {
    const v = checkSanWhitelist("You missed Qh5+ winning on the spot.", makeInsight());
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ category: "san_unknown", span: "Qh5+" });
  });

  it("fires on a phantom square coupled with a claim verb (the TTT class)", () => {
    // b3 is empty in fenBefore/fenAfter and appears in no motif/relational/line
    const v = checkSanWhitelist("Your rook on b3 cuts the defense of the queen.", makeInsight());
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ category: "square_unknown", span: "b3" });
  });

  it("control: a bare square WITHOUT a claim verb is not a violation", () => {
    expect(checkSanWhitelist("Keep an eye toward b3 next time.", makeInsight())).toEqual([]);
  });

  it("control: occupied-square references with claim verbs pass", () => {
    // d8 (queen), e4 (pawn) and d4 (knight) are occupied in fenBefore
    expect(
      checkSanWhitelist("The queen on d8 attacks nothing while your pawn on e4 defends d4.", makeInsight()),
    ).toEqual([]);
  });

  it("hypothetical-line allowance: PV prefixes pass, invented sequences fire once", () => {
    const insight = makeInsight();
    // Prefix of M1.pv0 (Ne6 Qd7 Nxg7)
    expect(checkSanWhitelist("If you go Ne6 Qd7, the fork stands.", insight)).toEqual([]);
    // Full PV with move numbers interleaved
    expect(checkSanWhitelist("Best was 11. Ne6 Qd7 12. Nxg7 collecting material.", insight)).toEqual([]);
    // Mid-PV window (measurement widening of the prefix rule — see isPvWindow)
    expect(checkSanWhitelist("Later Qd7 Nxg7 finishes the job.", insight)).toEqual([]);
    // Invented order: both moves exist but the sequence sits in no PV
    const v = checkSanWhitelist("After Qd7 Ne6 nothing works.", insight);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ category: "hypothetical_line_off_contract", span: "Qd7 Ne6" });
  });

  it("catches SAN embedded in the [INSIGHT:...] header grammar", () => {
    const v = checkSanWhitelist("[INSIGHT:11:w:blunder:+1.38:-2.12:Bd3:Qh5]", makeInsight());
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ category: "san_unknown", span: "Qh5" });
  });

  it("control: playedSan/bestSan/branch-point moves pass, including in headers", () => {
    expect(
      checkSanWhitelist("[INSIGHT:11:w:blunder:+1.38:-2.12:Bd3:Ne6]\nBd3 looked safe, Ne6 was the move.", makeInsight()),
    ).toEqual([]);
  });
});

// ── checkTacticalKeywords ───────────────────────────────────────────────────
describe("checkTacticalKeywords", () => {
  it("fires on a tactical keyword with no confirmed motif of that type", () => {
    // ROUND 2: keyword fires need a board-anchored sentence (square/SAN/
    // piece-on-square) — anchor on the licensed d8 square so ONLY the
    // keyword fires. Un-anchored variants are the definitional-exemption
    // class, pinned below.
    const v = checkTacticalKeywords("This pins the queen on d8 against the king.", makeInsight());
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ category: "tactical_keyword_unbacked", span: "pin" });
  });

  it("round-2 control: the same claim WITHOUT any board anchor is definitional-exempt", () => {
    expect(checkTacticalKeywords("This pins the queen against the king.", makeInsight())).toEqual(
      [],
    );
  });

  it("control: keywords licensed by allowedTacticalKeywords/confirmed motifs pass", () => {
    expect(
      checkTacticalKeywords("Ne6 is a fork — a classic double attack on queen and pawn.", makeInsight()),
    ).toEqual([]);
  });

  it("control: no keywords, no violations", () => {
    expect(checkTacticalKeywords("A quiet developing move.", makeInsight())).toEqual([]);
  });

  it("full ban when nothing is confirmed", () => {
    const insight = makeInsight({ motifs: [], allowedTacticalKeywords: [] });
    // Board-anchored (d4/e4 are occupied fixture squares) — see the round-2
    // definitional-exemption note above.
    const v = checkTacticalKeywords(
      "The knight on d4 is now trapped and the pawn on e4 is hanging.",
      insight,
    );
    expect(v.map((x) => x.span).sort()).toEqual(["hanging", "trapped"]);
  });
});

// ── checkForbiddenClaims ────────────────────────────────────────────────────
describe("checkForbiddenClaims", () => {
  it("fires on strong positional phrasing when lc0 is unavailable and SF is not decisive", () => {
    const v = checkForbiddenClaims("White is completely winning here, dominating every file.", makeInsight());
    expect(v).toHaveLength(2);
    expect(v.every((x) => x.claimClass === "positional_plan")).toBe(true);
  });

  it("control: SF-decisive escape mirrors the serving validator (|cp| ≥ 300 or mate)", () => {
    const decisive = makeInsight({ evalBefore: evalFact({ cp: 450, display: "+4.50" }) });
    expect(checkForbiddenClaims("White is completely winning here.", decisive)).toEqual([]);
    const mateOnBoard = makeInsight({ evalBefore: evalFact({ cp: null, mate: 4, display: "M+4" }) });
    expect(checkForbiddenClaims("White is completely winning here.", mateOnBoard)).toEqual([]);
  });

  it("control: lc0 OK lifts the positional_plan prohibition", () => {
    const insight = makeInsight({
      lc0: {
        status: "ok",
        value: { evalCp: 160, agreesWithSf: true },
        provenance: { source: "lc0", confidence: "engine_verified" },
      },
    });
    expect(checkForbiddenClaims("White is completely winning here.", insight)).toEqual([]);
  });

  it("fires on endgame_wdl phrasing (syzygy never runs on the game path)", () => {
    const v = checkForbiddenClaims("This is a theoretically won ending, per tablebase.", makeInsight());
    expect(v).toHaveLength(2);
    expect(v.every((x) => x.claimClass === "endgame_wdl")).toBe(true);
  });

  it("fires on 'obvious' when Maia was not consulted", () => {
    const v = checkForbiddenClaims("The fork was obvious once you look.", makeInsight());
    expect(v).toHaveLength(1);
    expect(v[0].claimClass).toBe("user_visibility");
  });

  it("control: benign prose fires nothing", () => {
    expect(
      checkForbiddenClaims("A small edge, with better piece activity and a clear plan.", makeInsight()),
    ).toEqual([]);
  });
});

// ── aggregateFidelity ───────────────────────────────────────────────────────
describe("aggregateFidelity", () => {
  it("clean prose over one insight yields zero fabrications and counts claim sentences", () => {
    const insight = makeInsight();
    const cleanProse =
      "Bd3 looked natural. But Ne6 was a fork on the queen and the g7 pawn. " +
      "The eval went from +1.38 to -2.12.";
    const report = aggregateFidelity([{ insight, prose: cleanProse }], makeContract([insight]));
    expect(report.fabricationCount).toBe(0);
    expect(report.fabricationRate).toBe(0);
    expect(report.claimSentences).toBe(3);
    expect(report.insightsChecked).toBe(1);
  });

  it("bad prose is counted per check and rated per 100 claim sentences", () => {
    const insight = makeInsight();
    const badProse =
      "Your rook on b3 cuts the defense — this pins the queen. " + // square_unknown + tactical pin
      "You are completely winning at +9.99."; // forbidden positional + eval_unbacked
    const report = aggregateFidelity([{ insight, prose: badProse }], makeContract([insight]));
    expect(report.fabricationCount).toBe(4);
    expect(report.violationsByCheck).toEqual({
      eval_display: 1,
      san_whitelist: 1,
      tactical_keyword: 1,
      forbidden_claim: 1,
    });
    expect(report.claimSentences).toBe(2);
    expect(report.fabricationRate).toBe(200);
    expect(report.sanViolations).toHaveLength(1);
    expect(report.evalViolations).toHaveLength(1);
    expect(report.allViolations.every((v) => v.factIdPrefix === "M1")).toBe(true);
  });

  it("empty entries yield a quiet report", () => {
    const report = aggregateFidelity([], makeContract([]));
    expect(report.fabricationCount).toBe(0);
    expect(report.fabricationRate).toBe(0);
    expect(report.claimSentences).toBe(0);
  });
});

// ── runInsightChecks + claim-sentence counting ─────────────────────────────
describe("runInsightChecks / countClaimSentences", () => {
  it("runInsightChecks concatenates all four checks", () => {
    const insight = makeInsight();
    const v = runInsightChecks("Qh5+ is obvious and completely winning at +9.99.", insight);
    const checks = new Set(v.map((x) => x.check));
    expect(checks).toEqual(new Set(["eval_display", "san_whitelist", "forbidden_claim"]));
  });

  it("countClaimSentences ignores rhetoric-only sentences", () => {
    expect(
      countClaimSentences(
        "Great fighting spirit today! Ne6 wins material. Keep practicing and have fun.",
      ),
    ).toBe(1);
  });
});
