import { describe, it, expect } from "vitest";
import {
  deriveEMTSpine,
  selectHintRung,
  masteryForCategory,
  HINT_RUNG_LEVELS,
  type EMTSpine,
} from "@/lib/teaching/emtSpine";
import type { MasterySummary } from "@/lib/teaching/relevanceFilter";

// Engine best line from the PRE-move FEN (what the route passes as
// evalBefore.lines[0].pv). pv[0] = the improvement over the blunder; a quiet
// developing move here, "d3". Shared across suites.
const BEST_PV = ["d2d3"];

/**
 * Phase-4 EMT-spine derivation test. Proves the Socratic hint ladder is
 * (a) pre-derived deterministically from the same chess.js/Stockfish facts as
 * single-turn teaching, (b) grounded (no invented moves — the answer rung names
 * the engine's best move in SAN), (c) fades by mastery (a known weakness starts
 * the student further up the ladder), and (d) is empty on a quiet position so
 * the caller stays out of Socratic mode.
 */
describe("deriveEMTSpine", () => {
  // 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 — White to move.
  const ITALIAN_BEFORE =
    "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
  // 4.Nxe5?? — hangs the knight; ...Nxe5 wins a piece for a pawn.
  const ITALIAN_AFTER_BLUNDER =
    "r1bqk1nr/pppp1ppp/2n5/2b1N3/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 0 4";
  it("derives a grounded, non-empty spine for a real blunder", () => {
    const spine = deriveEMTSpine(
      ITALIAN_BEFORE,
      ITALIAN_AFTER_BLUNDER,
      BEST_PV,
      "Nxe5"
    );

    expect(spine.isEmpty).toBe(false);
    // Expectation names the concept-delta the move touched.
    expect(spine.expectation.concept).toBeTruthy();
    // The forcing replies to count are enumerated as concrete SANs.
    expect(spine.expectation.mustCount.length).toBeGreaterThan(0);
    expect(spine.expectation.mustCount.join(" ")).toMatch(
      /[NBRQK]?[a-h]?x?[a-h][1-8]/
    );
    // At least one grounded misconception was anticipated.
    expect(spine.misconceptions.length).toBeGreaterThan(0);
  });

  it("builds a 5-rung ladder ordered pump → answer, each rung more revealing", () => {
    const spine = deriveEMTSpine(
      ITALIAN_BEFORE,
      ITALIAN_AFTER_BLUNDER,
      BEST_PV,
      "Nxe5"
    );
    const kinds = spine.hintLadder.map((r) => r.kind);
    expect(kinds).toEqual(["pump", "hint", "prompt", "partial", "answer"]);
    // Levels are the canonical 0..4 in order.
    spine.hintLadder.forEach((r) => {
      expect(r.level).toBe(HINT_RUNG_LEVELS[r.kind]);
      expect(r.text.length).toBeGreaterThan(0);
    });
  });

  it("does NOT reveal the best move before the answer rung (non-spoiler ladder)", () => {
    const spine = deriveEMTSpine(
      ITALIAN_BEFORE,
      ITALIAN_AFTER_BLUNDER,
      BEST_PV,
      "Nxe5"
    );
    const answer = spine.hintLadder.find((r) => r.kind === "answer")!;
    // The refutation move is the opponent's capture, surfaced in mustCount /
    // answer. What must stay hidden earlier is the FIX phrasing "The move was".
    const preAnswer = spine.hintLadder.filter((r) => r.kind !== "answer");
    preAnswer.forEach((r) => {
      expect(r.text).not.toContain("The move was");
    });
    expect(answer.text).toContain("The move was");
  });

  it("answer rung names the engine's best move in SAN — no invented line", () => {
    const spine = deriveEMTSpine(
      ITALIAN_BEFORE,
      ITALIAN_AFTER_BLUNDER,
      BEST_PV,
      "Nxe5"
    );
    // d2d3 is the engine's best first move from the pre-move FEN; its SAN is "d3".
    expect(spine.expectation.bestMoveSan).toBe("d3");
    const answer = spine.hintLadder.find((r) => r.kind === "answer")!;
    expect(answer.text).toContain("d3");
  });

  it("returns an empty spine for a quiet position (no Socratic mode)", () => {
    // Bare K vs K king shuffle: empty delta, no threats.
    const before = "8/8/4k3/8/8/4K3/8/8 w - - 0 1";
    const after = "8/8/4k3/8/8/3K4/8/8 b - - 1 1";
    const spine = deriveEMTSpine(before, after, ["e6d6"]);
    expect(spine.isEmpty).toBe(true);
    expect(spine.hintLadder).toEqual([]);
    expect(selectHintRung(spine)).toBeNull();
  });

  it("survives an unusable FEN by returning an empty spine, not throwing", () => {
    const spine = deriveEMTSpine("not a fen", "also not a fen", ["e2e4"]);
    expect(spine.isEmpty).toBe(true);
  });

  it("frames the pump with the played move when a SAN is supplied", () => {
    const withSan = deriveEMTSpine(
      ITALIAN_BEFORE,
      ITALIAN_AFTER_BLUNDER,
      BEST_PV,
      "Nxe5"
    );
    const withoutSan = deriveEMTSpine(
      ITALIAN_BEFORE,
      ITALIAN_AFTER_BLUNDER,
      BEST_PV
    );
    expect(withSan.hintLadder[0].text).toContain("**Nxe5**");
    expect(withoutSan.hintLadder[0].text).toContain("that move");
  });
});

describe("selectHintRung — fade by mastery", () => {
  const ITALIAN_BEFORE =
    "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
  const ITALIAN_AFTER_BLUNDER =
    "r1bqk1nr/pppp1ppp/2n5/2b1N3/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 0 4";
  const spine: EMTSpine = deriveEMTSpine(
    ITALIAN_BEFORE,
    ITALIAN_AFTER_BLUNDER,
    BEST_PV,
    "Nxe5"
  );

  it("a high-mastery student starts at PUMP (ask, don't tell)", () => {
    const rung = selectHintRung(spine, { masteryLevel: 0.9, probesOnPosition: 0 });
    expect(rung?.kind).toBe("pump");
  });

  it("a low-mastery (known-weakness) student starts further up the ladder", () => {
    const rung = selectHintRung(spine, { masteryLevel: 0.1, probesOnPosition: 0 });
    expect(rung!.level).toBeGreaterThan(0);
  });

  it("each successive probe walks one rung toward the answer", () => {
    const r0 = selectHintRung(spine, { masteryLevel: 0.9, probesOnPosition: 0 });
    const r1 = selectHintRung(spine, { masteryLevel: 0.9, probesOnPosition: 1 });
    const r2 = selectHintRung(spine, { masteryLevel: 0.9, probesOnPosition: 2 });
    expect(r0!.level).toBe(0);
    expect(r1!.level).toBe(1);
    expect(r2!.level).toBe(2);
  });

  it("clamps at ANSWER — a student who keeps asking eventually gets the fix", () => {
    const rung = selectHintRung(spine, { masteryLevel: 0.1, probesOnPosition: 99 });
    expect(rung?.kind).toBe("answer");
  });

  it("defaults to PUMP with no mastery signal (neutral start)", () => {
    const rung = selectHintRung(spine, {});
    expect(rung?.kind).toBe("pump");
  });
});

describe("masteryForCategory", () => {
  const summary: MasterySummary = {
    gamesAnalyzed: 6,
    weaknesses: [
      { category: "Missed Tactics", severity: "critical", frequency: 0.8 },
      { category: "King Safety", severity: "occasional", frequency: 0.3 },
    ],
  };

  it("scores a critical recurring weakness LOW (more scaffolding)", () => {
    expect(masteryForCategory(summary, "Missed Tactics")).toBeLessThan(0.3);
  });

  it("scores an occasional weakness mid-range", () => {
    expect(masteryForCategory(summary, "King Safety")).toBe(0.5);
  });

  it("scores a category the player does not struggle with neutral-high", () => {
    expect(masteryForCategory(summary, "Pawn Structure")).toBe(0.7);
  });

  it("returns neutral with no summary or no category", () => {
    expect(masteryForCategory(null, "Missed Tactics")).toBe(0.7);
    expect(masteryForCategory(summary, null)).toBe(0.7);
  });

  it("drives the ladder: a critical-weakness concept scaffolds sooner than a mastered one", () => {
    const ITALIAN_BEFORE =
      "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
    const ITALIAN_AFTER_BLUNDER =
      "r1bqk1nr/pppp1ppp/2n5/2b1N3/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 0 4";
    const spine = deriveEMTSpine(
      ITALIAN_BEFORE,
      ITALIAN_AFTER_BLUNDER,
      BEST_PV,
      "Nxe5"
    );
    const concept = spine.expectation.concept;
    const weakMastery = masteryForCategory(summary, concept);
    const coldMastery = masteryForCategory(null, concept);
    const weakStart = selectHintRung(spine, { masteryLevel: weakMastery });
    const coldStart = selectHintRung(spine, { masteryLevel: coldMastery });
    // If the blunder's concept is a known weakness, the weak student starts
    // higher (more telling); otherwise they start equal. Never LOWER.
    expect(weakStart!.level).toBeGreaterThanOrEqual(coldStart!.level);
  });
});
