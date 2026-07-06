import { describe, it, expect } from "vitest";
import { validatePositionalClaim } from "@/lib/mastermind/validators/positionalClaim";

const CORR = "test-corr-pos-1";

// ── No claims → pass ─────────────────────────────────────────────────────────

describe("validatePositionalClaim — no strong claims", () => {
  it("passes when LLM has no strong positional language", () => {
    const result = validatePositionalClaim({
      llmResponse: "Black has a slight edge after this exchange.",
      positional_plan: "NONE",
      sfCp: 30,
      lc0Cp: null,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.telemetry[0].fire_reason).toBe("passed");
  });

  it("does NOT fire on 'slight edge' (intentional false-negative)", () => {
    const result = validatePositionalClaim({
      llmResponse: "White has a slight edge / small advantage / better position.",
      positional_plan: "NONE",
      sfCp: 30,
      lc0Cp: null,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });

  it("does NOT fire on 'better position' / 'active pieces'", () => {
    const result = validatePositionalClaim({
      llmResponse: "White's pieces are more active and the position is better.",
      positional_plan: "NONE",
      sfCp: 20,
      lc0Cp: null,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });
});

// ── HIGH voter → claims are grounded ──────────────────────────────────────────

describe("validatePositionalClaim — voter HIGH", () => {
  it("passes strong claims when positional_plan is HIGH", () => {
    const result = validatePositionalClaim({
      llmResponse: "White is completely winning with overwhelming advantage.",
      positional_plan: "HIGH",
      sfCp: 380,
      lc0Cp: 420,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });
});

// ── Fire cases: MED / LOW / NONE without Lc0 veto ─────────────────────────────

describe("validatePositionalClaim — ungrounded claims (no Lc0 veto)", () => {
  it("fires on 'dominating' when positional_plan is NONE", () => {
    const result = validatePositionalClaim({
      llmResponse: "Black is dominating in the endgame.",
      positional_plan: "NONE",
      sfCp: 40,
      lc0Cp: null,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].check_name).toBe("positional_claim_unsupported");
    expect(result.issues[0].severity).toBe("warn");
    expect(result.issues[0].llm_span).toBe("dominating");
    expect(result.telemetry[0].fire_reason).toBe("positional_overclaim_without_voter_high");
  });

  // 2026-06-06 live-test-feedback: stage9-live-test.ts found Sonnet uses
  // "dominates" (verb form) on adversarial-prompt fx-02. v1 regex only had
  // the gerund "dominating" and missed it. Patched to dominat(ing|es|ed);
  // these tests lock in the new behaviour and document the live-test
  // provenance for future readers.
  it("fires on 'dominates' (verb form) when positional_plan is NONE", () => {
    const result = validatePositionalClaim({
      llmResponse: "White dominates this position.",
      positional_plan: "NONE",
      sfCp: 30,
      lc0Cp: null,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].llm_span).toBe("dominates");
  });

  it("fires on 'dominated' (past tense) when positional_plan is NONE", () => {
    const result = validatePositionalClaim({
      llmResponse: "Black dominated the kingside throughout.",
      positional_plan: "NONE",
      sfCp: -30,
      lc0Cp: null,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].llm_span).toBe("dominated");
  });

  it("fires on 'strategically winning'", () => {
    const result = validatePositionalClaim({
      llmResponse: "White is strategically winning here.",
      positional_plan: "LOW",
      sfCp: 80,
      lc0Cp: null,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].llm_span).toBe("strategically winning");
  });

  it("fires on 'strategically crushing'", () => {
    const result = validatePositionalClaim({
      llmResponse: "Black is strategically crushing.",
      positional_plan: "MED",
      sfCp: 120,
      lc0Cp: null,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].llm_span).toBe("strategically crushing");
  });

  it("fires on 'completely winning' / 'completely won' / 'completely lost'", () => {
    const result = validatePositionalClaim({
      llmResponse: "White was completely winning; the position was completely lost for Black; completely won by move 30.",
      positional_plan: "NONE",
      sfCp: 40,
      lc0Cp: null,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues).toHaveLength(3);
    const spans = result.issues.map((i) => i.llm_span).sort();
    expect(spans).toEqual(["completely lost", "completely winning", "completely won"]);
  });

  it("fires on 'overwhelming advantage'", () => {
    const result = validatePositionalClaim({
      llmResponse: "White had an overwhelming advantage in time.",
      positional_plan: "LOW",
      sfCp: 60,
      lc0Cp: null,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].llm_span).toBe("overwhelming advantage");
  });

  it("fires on 'decisive advantage' / 'decisive edge'", () => {
    const result = validatePositionalClaim({
      llmResponse: "A decisive advantage in space; Black has a decisive edge.",
      positional_plan: "NONE",
      sfCp: 30,
      lc0Cp: null,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues).toHaveLength(2);
  });

  it("fires when positional_plan is MED (SF alone strong)", () => {
    const result = validatePositionalClaim({
      llmResponse: "Black is dominating.",
      positional_plan: "MED",
      sfCp: 140,
      lc0Cp: null,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].severity).toBe("warn");
  });
});

// ── Degraded mode: Lc0 unavailable, SF alone decisive ─────────────────────────
//
// Lc0 has never been deployed in production (LC0_API_URL unset), so
// positional_plan can never reach HIGH. Requiring HIGH made this validator
// fire on EVERY strong positional phrase — even at +8.0 — burning a flagship
// regeneration per fire. With a single engine, |SF| ≥ 300 grounds the claim.

describe("validatePositionalClaim — degraded single-engine mode", () => {
  it("passes strong claims when Lc0 unavailable and SF decisive (+3.5)", () => {
    const result = validatePositionalClaim({
      llmResponse: "White is completely winning with a decisive advantage.",
      positional_plan: "MED", // ceiling without Lc0
      sfCp: 350,
      lc0Cp: null,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
    expect(result.telemetry[0].fire_reason).toBe("passed_sf_decisive_lc0_unavailable");
  });

  it("passes symmetrically for Black-decisive evals (-8.0)", () => {
    const result = validatePositionalClaim({
      llmResponse: "Black is dominating.",
      positional_plan: "MED",
      sfCp: -800,
      lc0Cp: null,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });

  it("still fires when Lc0 unavailable and SF below the decisive band", () => {
    const result = validatePositionalClaim({
      llmResponse: "White is dominating.",
      positional_plan: "MED",
      sfCp: 290,
      lc0Cp: null,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].severity).toBe("warn");
  });

  it("does NOT apply degraded mode when Lc0 WAS consulted (consensus still required)", () => {
    const result = validatePositionalClaim({
      llmResponse: "White is dominating.",
      positional_plan: "MED",
      sfCp: 350,
      lc0Cp: 40, // consulted but below the 150 consensus bar
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
  });

  it("does NOT apply degraded mode when sfCp is null", () => {
    const result = validatePositionalClaim({
      llmResponse: "White is dominating.",
      positional_plan: "NONE",
      sfCp: null,
      lc0Cp: null,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
  });
});

// ── Severity escalation: Lc0 vetoes SF ────────────────────────────────────────

describe("validatePositionalClaim — Lc0 veto escalates severity", () => {
  it("escalates to ERROR when Lc0 opposite-direction and |lc0| >= 50", () => {
    // SF says +0.4 for White, Lc0 says -0.8 for White → veto
    const result = validatePositionalClaim({
      llmResponse: "White is dominating.",
      positional_plan: "NONE",
      sfCp: 40,
      lc0Cp: -80,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].severity).toBe("error");
    expect(result.telemetry[0].fire_reason).toBe("positional_overclaim_against_lc0_veto");
  });

  it("escalates symmetrically when SF says - and Lc0 says +", () => {
    const result = validatePositionalClaim({
      llmResponse: "Black is dominating.",
      positional_plan: "NONE",
      sfCp: -60,
      lc0Cp: 100,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].severity).toBe("error");
  });

  it("does NOT escalate when |lc0| < 50 (treated as neutral)", () => {
    const result = validatePositionalClaim({
      llmResponse: "White is dominating.",
      positional_plan: "NONE",
      sfCp: 40,
      lc0Cp: -30,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].severity).toBe("warn");
    expect(result.telemetry[0].fire_reason).toBe("positional_overclaim_without_voter_high");
  });

  it("does NOT escalate when SF and Lc0 same direction (no veto)", () => {
    const result = validatePositionalClaim({
      llmResponse: "White is dominating.",
      positional_plan: "MED",  // not HIGH because SF only +120, not the 150 needed
      sfCp: 120,
      lc0Cp: 80,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].severity).toBe("warn");
  });

  it("does NOT escalate when sfCp or lc0Cp is null (need both to detect veto)", () => {
    const cases = [
      { sfCp: 40, lc0Cp: null },
      { sfCp: null, lc0Cp: -80 },
      { sfCp: null, lc0Cp: null },
    ];
    for (const c of cases) {
      const result = validatePositionalClaim({
        llmResponse: "dominating",
        positional_plan: "NONE",
        sfCp: c.sfCp,
        lc0Cp: c.lc0Cp,
        correlationId: CORR,
      });
      expect(result.issues[0].severity).toBe("warn");
    }
  });
});

// ── Contract ──────────────────────────────────────────────────────────────────

describe("validatePositionalClaim — contract", () => {
  it("always emits exactly one telemetry event", () => {
    const cases = [
      { llmResponse: "plain", positional_plan: "NONE" as const },
      { llmResponse: "dominating", positional_plan: "NONE" as const },
      { llmResponse: "dominating", positional_plan: "HIGH" as const },
    ];
    for (const opts of cases) {
      const result = validatePositionalClaim({
        ...opts,
        sfCp: null,
        lc0Cp: null,
        correlationId: CORR,
      });
      expect(result.telemetry).toHaveLength(1);
    }
  });

  it("always reports costUsd = 0", () => {
    const result = validatePositionalClaim({
      llmResponse: "dominating ".repeat(500),
      positional_plan: "NONE",
      sfCp: 40,
      lc0Cp: null,
      correlationId: CORR,
    });
    expect(result.costUsd).toBe(0);
  });

  it("captures context_window per issue", () => {
    const result = validatePositionalClaim({
      llmResponse: "Long leading prose here. White is dominating after the exchange. Long trailing prose.",
      positional_plan: "NONE",
      sfCp: 40,
      lc0Cp: null,
      correlationId: CORR,
    });
    const actual = result.issues[0].actual as { context_window: string };
    expect(actual.context_window.toLowerCase()).toContain("dominating");
  });
});

// ── Case insensitivity ────────────────────────────────────────────────────────

describe("validatePositionalClaim — case insensitivity", () => {
  it("matches uppercase 'DOMINATING'", () => {
    const result = validatePositionalClaim({
      llmResponse: "WHITE IS DOMINATING HERE",
      positional_plan: "NONE",
      sfCp: 40,
      lc0Cp: null,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].llm_span).toBe("dominating");
  });
});
