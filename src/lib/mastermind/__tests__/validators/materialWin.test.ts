import { describe, it, expect } from "vitest";
import { validateMaterialWin } from "@/lib/mastermind/validators/materialWin";

const CORR = "test-corr-mw-1";

// ── Pass-through cases ────────────────────────────────────────────────────────

describe("validateMaterialWin — no material tokens", () => {
  it("passes when LLM has no material-claim language", () => {
    const result = validateMaterialWin({
      llmResponse: "Black has a slight initiative.",
      material_win: "NONE",
      sfCp: 50,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.telemetry[0].fire_reason).toBe("passed");
  });

  it("passes on empty response", () => {
    const result = validateMaterialWin({
      llmResponse: "",
      material_win: "NONE",
      sfCp: null,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });

  it("does NOT match 'up a pawn' (routine coach prose at +1.0)", () => {
    const result = validateMaterialWin({
      llmResponse: "After this exchange you're up a pawn.",
      material_win: "NONE",
      sfCp: 100,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });

  it("does NOT match 'won a pawn'", () => {
    const result = validateMaterialWin({
      llmResponse: "You won a pawn on the queenside.",
      material_win: "NONE",
      sfCp: 80,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });
});

describe("validateMaterialWin — voter grounded (MED/HIGH)", () => {
  it("passes when material_win is HIGH even with material claims", () => {
    const result = validateMaterialWin({
      llmResponse: "You're winning material — up a piece after the fork.",
      material_win: "HIGH",
      sfCp: 320,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
    expect(result.telemetry[0].fire_reason).toBe("passed");
  });

  it("passes when material_win is MED (chessdb + sfCp >= 100)", () => {
    const result = validateMaterialWin({
      llmResponse: "Material advantage for White.",
      material_win: "MED",
      sfCp: 150,
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });
});

// ── Fire cases: NONE / LOW + material claim ──────────────────────────────────

describe("validateMaterialWin — ungrounded claims", () => {
  it("fires on 'winning material' when material_win is NONE", () => {
    const result = validateMaterialWin({
      llmResponse: "White is winning material here.",
      material_win: "NONE",
      sfCp: 250,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].check_name).toBe("material_win_unsupported");
    expect(result.issues[0].llm_span).toBe("winning material");
  });

  it("fires on 'wins material'", () => {
    const result = validateMaterialWin({
      llmResponse: "This combination wins material.",
      material_win: "LOW",
      sfCp: 250,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].llm_span).toBe("wins material");
  });

  it("fires on 'up a piece'", () => {
    const result = validateMaterialWin({
      llmResponse: "Black is up a piece in the endgame.",
      material_win: "NONE",
      sfCp: 320,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].llm_span).toBe("up a piece");
  });

  it("fires on 'wins the exchange'", () => {
    const result = validateMaterialWin({
      llmResponse: "Nf6 wins the exchange.",
      material_win: "NONE",
      sfCp: 200,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].llm_span).toBe("wins the exchange");
  });

  it("fires on multiple distinct material claims", () => {
    const result = validateMaterialWin({
      llmResponse: "Wins material — you'll be up a rook.",
      material_win: "NONE",
      sfCp: 250,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues).toHaveLength(2);
    const spans = result.issues.map((i) => i.llm_span).sort();
    expect(spans).toEqual(["up a rook", "wins material"]);
  });

  it("fires on LOW confidence", () => {
    const result = validateMaterialWin({
      llmResponse: "You won the exchange.",
      material_win: "LOW",
      sfCp: 220,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
  });
});

// ── Severity upgrade (engine contradicts strong claim) ────────────────────────

describe("validateMaterialWin — severity upgrade when |sfCp| < 100 and strong claim", () => {
  it("escalates to ERROR when 'winning material' said at sfCp = 30", () => {
    const result = validateMaterialWin({
      llmResponse: "White is winning material here.",
      material_win: "NONE",
      sfCp: 30,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].severity).toBe("error");
    expect(result.telemetry[0].fire_reason).toBe("material_claim_contradicts_stockfish");
  });

  it("escalates on 'up a piece' at sfCp = -40 (engine says material balanced)", () => {
    const result = validateMaterialWin({
      llmResponse: "You're up a piece.",
      material_win: "NONE",
      sfCp: -40,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].severity).toBe("error");
  });

  it("stays at WARN when |sfCp| >= 100 (engine confirms strong claim is plausible)", () => {
    const result = validateMaterialWin({
      llmResponse: "White is winning material.",
      material_win: "NONE",
      sfCp: 250,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].severity).toBe("warn");
    expect(result.telemetry[0].fire_reason).toBe("material_claim_without_voter_med_or_high");
  });

  it("stays at WARN when sfCp is null (no engine signal to contradict)", () => {
    const result = validateMaterialWin({
      llmResponse: "You're winning material.",
      material_win: "NONE",
      sfCp: null,
      correlationId: CORR,
    });
    expect(result.issues[0].severity).toBe("warn");
  });

  it("non-strong claims do NOT escalate even at low sfCp", () => {
    // "up a rook" is in the regex but NOT in STRONG_MATERIAL_PHRASES — wait, it
    // IS in the strong set. Let's use "wins a knight" which is matched but not strong.
    const result = validateMaterialWin({
      llmResponse: "Black wins a knight.",
      material_win: "NONE",
      sfCp: 30,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].severity).toBe("warn");
  });
});

// ── Contract ──────────────────────────────────────────────────────────────────

describe("validateMaterialWin — contract", () => {
  it("always emits exactly one telemetry event", () => {
    const cases = [
      { llmResponse: "plain", material_win: "NONE" as const },
      { llmResponse: "winning material", material_win: "NONE" as const },
      { llmResponse: "winning material", material_win: "HIGH" as const },
    ];
    for (const opts of cases) {
      const result = validateMaterialWin({
        ...opts,
        sfCp: null,
        correlationId: CORR,
      });
      expect(result.telemetry).toHaveLength(1);
    }
  });

  it("always reports costUsd = 0", () => {
    const result = validateMaterialWin({
      llmResponse: "winning material ".repeat(500),
      material_win: "NONE",
      sfCp: 50,
      correlationId: CORR,
    });
    expect(result.costUsd).toBe(0);
  });

  it("captures context_window for triage", () => {
    const result = validateMaterialWin({
      llmResponse: "Some leading prose. Winning material was missed. Some trailing prose.",
      material_win: "NONE",
      sfCp: 50,
      correlationId: CORR,
    });
    const actual = result.issues[0].actual as { context_window: string };
    expect(actual.context_window.toLowerCase()).toContain("winning material");
  });
});

// ── Case insensitivity ────────────────────────────────────────────────────────

describe("validateMaterialWin — case insensitivity", () => {
  it("matches 'WINNING MATERIAL'", () => {
    const result = validateMaterialWin({
      llmResponse: "WINNING MATERIAL hereee",
      material_win: "NONE",
      sfCp: 50,
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].llm_span).toBe("winning material");
  });
});
