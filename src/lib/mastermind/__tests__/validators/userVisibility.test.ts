import { describe, it, expect } from "vitest";
import { validateUserVisibility } from "@/lib/mastermind/validators/userVisibility";

const CORR = "test-corr-uv-1";

// ── Pass-through cases (no enforcement, but the telemetry should describe why) ──

describe("validateUserVisibility — no Maia data", () => {
  it("passes silently when maiaProb is null (Maia not consulted)", () => {
    const result = validateUserVisibility({
      llmResponse: "The obvious move Nf3 is just easy and clearly winning.",
      maiaProb: null,
      userRating: 1500,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.costUsd).toBe(0);
    expect(result.telemetry).toHaveLength(1);
    expect(result.telemetry[0].fire_reason).toBe("passed");
    // The telemetry should make it discoverable why we didn't fire.
    expect(result.telemetry[0].actual).toMatchObject({ maia_consulted: false });
  });

  it("passes silently regardless of userRating when maiaProb is null", () => {
    const result = validateUserVisibility({
      llmResponse: "obvious move",
      maiaProb: null,
      userRating: null,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });
});

// ── Above-threshold cases (defensible "obvious" use) ──────────────────────────

describe("validateUserVisibility — above threshold", () => {
  it("passes when prob >= 0.15 for 1500-rated user (canonical threshold)", () => {
    const result = validateUserVisibility({
      llmResponse: "The obvious move was Nf3 — clearly the best continuation.",
      maiaProb: 0.50,
      userRating: 1500,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.telemetry[0].fire_reason).toBe("passed");
  });

  it("passes at exactly the threshold (>=0.15) for adult user", () => {
    const result = validateUserVisibility({
      llmResponse: "obvious",
      maiaProb: 0.15,
      userRating: 1500,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });

  it("passes at exactly 0.20 for sub-1200 user (their canonical threshold)", () => {
    const result = validateUserVisibility({
      llmResponse: "easy move",
      maiaProb: 0.20,
      userRating: 1100,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });
});

// ── Below-threshold cases (the enforcement fires) ─────────────────────────────

describe("validateUserVisibility — below threshold, dismissive token present", () => {
  it("fires on 'obvious' when prob < 0.15 for 1500-rated user", () => {
    const result = validateUserVisibility({
      llmResponse: "The obvious move here was Nf3.",
      maiaProb: 0.08,
      userRating: 1500,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].check_name).toBe("user_visibility_overclaim");
    expect(result.issues[0].severity).toBe("warn");
    expect(result.issues[0].llm_span).toBe("obvious");
    expect(result.telemetry[0].fire_reason).toBe("obviousness_claim_below_visibility_threshold");
  });

  it("fires on 'clearly'", () => {
    const result = validateUserVisibility({
      llmResponse: "Black was clearly winning after that mistake.",
      maiaProb: 0.05,
      userRating: 1500,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].llm_span).toBe("clearly");
  });

  it("fires on 'simply'", () => {
    const result = validateUserVisibility({
      llmResponse: "You could have simply played Bb5.",
      maiaProb: 0.05,
      userRating: 1500,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].llm_span).toBe("simply");
  });

  it("fires on 'just' as a standalone word", () => {
    const result = validateUserVisibility({
      llmResponse: "Just play Nf6 here, it wins on the spot.",
      maiaProb: 0.05,
      userRating: 1500,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].llm_span).toBe("just");
  });

  it("fires on 'easy' / 'easily'", () => {
    const result = validateUserVisibility({
      llmResponse: "Easy win — you can easily find this with practice.",
      maiaProb: 0.05,
      userRating: 1500,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues).toHaveLength(2);
    const tokens = result.issues.map((i) => i.llm_span).sort();
    expect(tokens).toEqual(["easily", "easy"]);
  });

  it("fires on 'trivial' / 'trivially'", () => {
    const result = validateUserVisibility({
      llmResponse: "This is a trivial position — White wins trivially with Qa1.",
      maiaProb: 0.04,
      userRating: 1500,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues).toHaveLength(2);
    const tokens = result.issues.map((i) => i.llm_span).sort();
    expect(tokens).toEqual(["trivial", "trivially"]);
  });

  it("fires on 'of course'", () => {
    const result = validateUserVisibility({
      llmResponse: "Of course the right move was Re1.",
      maiaProb: 0.05,
      userRating: 1500,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].llm_span).toBe("of course");
  });

  it("fires multiple issues for multiple tokens in same response", () => {
    const result = validateUserVisibility({
      llmResponse: "The obvious move was clearly Nf3 — just look at the diagonal.",
      maiaProb: 0.06,
      userRating: 1500,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues.length).toBe(3);
    const tokens = result.issues.map((i) => i.llm_span).sort();
    expect(tokens).toEqual(["clearly", "just", "obvious"]);
  });

  it("captures the context window around each match in the issue detail", () => {
    const result = validateUserVisibility({
      llmResponse: "Some leading prose. The obvious move was Nf3 — clearly winning. Some trailing prose.",
      maiaProb: 0.05,
      userRating: 1500,
      correlationId: CORR,
    });
    const obviousIssue = result.issues.find((i) => i.llm_span === "obvious");
    expect(obviousIssue).toBeDefined();
    const actual = obviousIssue!.actual as { context_window: string };
    expect(actual.context_window).toContain("obvious");
    expect(actual.context_window.length).toBeLessThanOrEqual(120); // 40 + 7 + 40
  });
});

// ── Rating-band-aware threshold (sub-1200 gets more grace) ────────────────────

describe("validateUserVisibility — rating-band thresholds", () => {
  it("uses 0.20 threshold for sub-1200 users", () => {
    // 0.17 would PASS at 1500 (>=0.15) but FAIL at 1100 (<0.20)
    const at1500 = validateUserVisibility({
      llmResponse: "obvious move",
      maiaProb: 0.17,
      userRating: 1500,
      correlationId: CORR,
    });
    expect(at1500.passed).toBe(true);

    const at1100 = validateUserVisibility({
      llmResponse: "obvious move",
      maiaProb: 0.17,
      userRating: 1100,
      correlationId: CORR,
    });
    expect(at1100.passed).toBe(false);
    expect((at1100.telemetry[0].expected as { user_visibility_min_prob: number }).user_visibility_min_prob).toBe(0.20);
  });

  it("uses 0.15 threshold for unrated users (null userRating)", () => {
    const result = validateUserVisibility({
      llmResponse: "obvious",
      maiaProb: 0.17,
      userRating: null,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });

  it("issue detail labels the user as 'unrated' when userRating is null", () => {
    const result = validateUserVisibility({
      llmResponse: "obvious",
      maiaProb: 0.05,
      userRating: null,
      correlationId: CORR,
    });
    expect(result.issues[0].detail).toContain("unrated");
  });
});

// ── Negative cases (no token, no fire) ────────────────────────────────────────

describe("validateUserVisibility — no dismissive tokens", () => {
  it("passes when no forbidden tokens present, even at hard visibility", () => {
    const result = validateUserVisibility({
      llmResponse: "Nf3 is a strong move developing toward the kingside.",
      maiaProb: 0.05,
      userRating: 1500,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.telemetry[0].fire_reason).toBe("passed");
  });

  it("passes on empty response", () => {
    const result = validateUserVisibility({
      llmResponse: "",
      maiaProb: 0.05,
      userRating: 1500,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });
});

// ── Boundary / regex behaviour ────────────────────────────────────────────────

describe("validateUserVisibility — case and word boundary", () => {
  it("matches uppercase 'OBVIOUS'", () => {
    const result = validateUserVisibility({
      llmResponse: "OBVIOUSLY this is the move.",
      maiaProb: 0.05,
      userRating: 1500,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].llm_span).toBe("obviously");
  });

  it("matches when token is followed by punctuation", () => {
    const result = validateUserVisibility({
      llmResponse: "Obvious! That's the move.",
      maiaProb: 0.05,
      userRating: 1500,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].llm_span).toBe("obvious");
  });

  it("does NOT match 'obstructive' (different word root)", () => {
    const result = validateUserVisibility({
      llmResponse: "The pawn was obstructive to the rook.",
      maiaProb: 0.05,
      userRating: 1500,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });
});

// ── Telemetry / cost contract ─────────────────────────────────────────────────

describe("validateUserVisibility — contract", () => {
  it("always emits exactly one telemetry event", () => {
    const cases = [
      { llmResponse: "obvious", maiaProb: 0.05, userRating: 1500 },
      { llmResponse: "obvious", maiaProb: 0.50, userRating: 1500 },
      { llmResponse: "plain", maiaProb: null, userRating: 1500 },
    ];
    for (const opts of cases) {
      const result = validateUserVisibility({ ...opts, correlationId: CORR });
      expect(result.telemetry).toHaveLength(1);
    }
  });

  it("always reports costUsd = 0 (pure string scan)", () => {
    const result = validateUserVisibility({
      llmResponse: "obvious " .repeat(1000),
      maiaProb: 0.05,
      userRating: 1500,
      correlationId: CORR,
    });
    expect(result.costUsd).toBe(0);
  });
});
