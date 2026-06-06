import { describe, it, expect } from "vitest";
import { validateMateInN } from "@/lib/mastermind/validators/mateInN";

const CORR = "test-corr-mate-1";

// ── No mate tokens → pass ────────────────────────────────────────────────────

describe("validateMateInN — no mate tokens", () => {
  it("passes when LLM never mentions mate", () => {
    const result = validateMateInN({
      llmResponse: "Black should consider Nf6 here.",
      syzygyDtm: null,
      sfMate: null,
      mate_in_n: "NONE",
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.telemetry[0].fire_reason).toBe("passed");
  });

  it("passes on empty response", () => {
    const result = validateMateInN({
      llmResponse: "",
      syzygyDtm: null,
      sfMate: null,
      mate_in_n: "NONE",
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });

  it("does NOT match the word 'mate' alone (must be a phrase)", () => {
    const result = validateMateInN({
      llmResponse: "The Tata Steel chess tournament was a great mate of mine.",
      syzygyDtm: null,
      sfMate: null,
      mate_in_n: "NONE",
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });
});

// ── Fire A: ungrounded mate claim (mate_in_n === NONE) ────────────────────────

describe("validateMateInN — ungrounded claims (mate_in_n=NONE)", () => {
  it("fires on 'mate in 5' when mate_in_n is NONE", () => {
    const result = validateMateInN({
      llmResponse: "There was mate in 5 here for White.",
      syzygyDtm: null,
      sfMate: null,
      mate_in_n: "NONE",
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].check_name).toBe("mate_claim_unsupported");
    expect(result.issues[0].llm_span).toBe("mate in 5");
    expect(result.telemetry[0].fire_reason).toBe("mate_claim_without_syzygy_or_sf_mate");
  });

  it("fires on 'mate in five' (word form)", () => {
    const result = validateMateInN({
      llmResponse: "Mate in five was the line you missed.",
      syzygyDtm: null,
      sfMate: null,
      mate_in_n: "NONE",
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].llm_span).toBe("mate in five");
  });

  it("fires on 'forced mate' alone", () => {
    const result = validateMateInN({
      llmResponse: "You had a forced mate but missed it.",
      syzygyDtm: null,
      sfMate: null,
      mate_in_n: "NONE",
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].llm_span).toBe("forced mate");
  });

  it("fires on 'mating attack'", () => {
    const result = validateMateInN({
      llmResponse: "White had a strong mating attack via h-file.",
      syzygyDtm: null,
      sfMate: null,
      mate_in_n: "NONE",
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].llm_span).toBe("mating attack");
  });

  it("fires on 'inevitable mate' and 'unstoppable mate'", () => {
    const result = validateMateInN({
      llmResponse: "White had an inevitable mate; Black faced an unstoppable mate after Qh7+.",
      syzygyDtm: null,
      sfMate: null,
      mate_in_n: "NONE",
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues).toHaveLength(2);
    const spans = result.issues.map((i) => i.llm_span).sort();
    expect(spans).toEqual(["inevitable mate", "unstoppable mate"]);
  });

  it("fires on 'checkmate is forced'", () => {
    const result = validateMateInN({
      llmResponse: "After Rxh7, checkmate is forced.",
      syzygyDtm: null,
      sfMate: null,
      mate_in_n: "NONE",
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].llm_span).toBe("checkmate is forced");
  });

  it("fires multiple issues for multiple mate tokens", () => {
    const result = validateMateInN({
      llmResponse: "Mate in 3 — actually mate in three. Forced mate.",
      syzygyDtm: null,
      sfMate: null,
      mate_in_n: "NONE",
      correlationId: CORR,
    });
    expect(result.issues).toHaveLength(3);
  });

  it("does NOT fire when mate_in_n is HIGH and no distance specified", () => {
    const result = validateMateInN({
      llmResponse: "You had a forced mate via Qh5+.",
      syzygyDtm: 7,
      sfMate: 7,
      mate_in_n: "HIGH",
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("does NOT fire when mate_in_n is MED (SF + chessdb agree)", () => {
    const result = validateMateInN({
      llmResponse: "Forced mate after Qh5+.",
      syzygyDtm: null,
      sfMate: 4,
      mate_in_n: "MED",
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });

  it("does NOT fire when mate_in_n is LOW (SF mate score alone — still grounded)", () => {
    // LOW is "SF mate score alone" — voter accepts this. The validator treats
    // any non-NONE confidence as a sufficient ground for the claim language.
    const result = validateMateInN({
      llmResponse: "Forced mate.",
      syzygyDtm: null,
      sfMate: 5,
      mate_in_n: "LOW",
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });
});

// ── Fire B: mate distance wrong (Syzygy contradicts LLM) ──────────────────────

describe("validateMateInN — mate distance check vs Syzygy DTM", () => {
  it("passes when LLM's mate-in-N is within 1 of Syzygy DTM (off-by-1 grace)", () => {
    const result = validateMateInN({
      llmResponse: "There's mate in 5.",
      syzygyDtm: 6,
      sfMate: 5,
      mate_in_n: "HIGH",
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });

  it("passes on exact match", () => {
    const result = validateMateInN({
      llmResponse: "Mate in 7.",
      syzygyDtm: 7,
      sfMate: 7,
      mate_in_n: "HIGH",
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });

  it("fires distance_incorrect when LLM is off by more than 1", () => {
    const result = validateMateInN({
      llmResponse: "Mate in 12 was the line.",
      syzygyDtm: 6,
      sfMate: 12,
      mate_in_n: "HIGH",
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    const distanceIssue = result.issues.find((i) => i.check_name === "mate_distance_incorrect");
    expect(distanceIssue).toBeDefined();
    const actual = distanceIssue!.actual as { delta: number; llm_distance: number; syzygy_dtm: number };
    expect(actual.delta).toBe(6);
    expect(actual.llm_distance).toBe(12);
    expect(actual.syzygy_dtm).toBe(6);
    expect(result.telemetry[0].fire_reason).toBe("mate_distance_off_by_more_than_one");
  });

  it("can fire BOTH ungrounded AND distance-wrong on a single response", () => {
    // mate_in_n=NONE (so ungrounded fires) AND syzygyDtm=6 with claim of 12 (distance off).
    const result = validateMateInN({
      llmResponse: "Mate in 12 here.",
      syzygyDtm: 6,
      sfMate: null,
      mate_in_n: "NONE",
      correlationId: CORR,
    });
    expect(result.issues.length).toBe(2);
    const checkNames = result.issues.map((i) => i.check_name).sort();
    expect(checkNames).toEqual(["mate_claim_unsupported", "mate_distance_incorrect"]);
  });

  it("does NOT check distance when syzygyDtm is null (no ground truth)", () => {
    const result = validateMateInN({
      llmResponse: "Mate in 100.",
      syzygyDtm: null,
      sfMate: 100,
      mate_in_n: "MED",
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);  // can't check distance, mate_in_n is MED so ungrounded check passes
  });

  it("does NOT check distance on word-form mate tokens missing the number", () => {
    const result = validateMateInN({
      llmResponse: "Forced mate.",
      syzygyDtm: 6,
      sfMate: 6,
      mate_in_n: "HIGH",
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);  // no distance to check
  });
});

// ── Telemetry / contract ──────────────────────────────────────────────────────

describe("validateMateInN — contract", () => {
  it("always emits exactly one telemetry event", () => {
    const cases = [
      { llmResponse: "plain prose", mate_in_n: "NONE" as const },
      { llmResponse: "mate in 5", mate_in_n: "NONE" as const },
      { llmResponse: "mate in 5", mate_in_n: "HIGH" as const },
    ];
    for (const opts of cases) {
      const result = validateMateInN({
        ...opts,
        syzygyDtm: null,
        sfMate: null,
        correlationId: CORR,
      });
      expect(result.telemetry).toHaveLength(1);
    }
  });

  it("always reports costUsd = 0", () => {
    const result = validateMateInN({
      llmResponse: "mate in 5 ".repeat(500),
      syzygyDtm: null,
      sfMate: null,
      mate_in_n: "NONE",
      correlationId: CORR,
    });
    expect(result.costUsd).toBe(0);
  });

  it("captures context window in issue.actual for triage", () => {
    const result = validateMateInN({
      llmResponse: "Some leading prose. Mate in 5 was here. Some trailing prose.",
      syzygyDtm: null,
      sfMate: null,
      mate_in_n: "NONE",
      correlationId: CORR,
    });
    const actual = result.issues[0].actual as { context_window: string };
    // Context window preserves original case (the regex match is lowercased
    // separately as llm_span, but the surrounding context is verbatim slice).
    expect(actual.context_window.toLowerCase()).toContain("mate in 5");
  });
});
