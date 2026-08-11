/**
 * PR-CI-4 arming table: conservative defaults + the structural clamps that
 * no config edit can override (standing userVisibility prohibition; strict-
 * only hypothetical-line fires stay warn pending the 30-game FP measurement).
 */
import { describe, it, expect } from "vitest";
import { armFindings, armSeverity, DEFAULT_ARMING_TABLE } from "@/lib/contract/armingConfig";
import type { ServingFinding } from "@/lib/contract/armingConfig";

function finding(over: Partial<ServingFinding>): ServingFinding {
  return {
    check: "eval_display",
    severity: "error",
    category: "eval_unbacked",
    span: "+9.99",
    detail: "test",
    ...over,
  };
}

describe("DEFAULT_ARMING_TABLE — precision-pack correction: NOTHING arms at error", () => {
  // The 30-game FP adjudication (contract-referee-fp-30game, 2026-08-10)
  // found 30/37 contested fires were false positives — including on
  // tactical_keyword and forbidden_claim, which CI-4 had armed at error.
  // ARMED 2026-08-11 from the v3 measurement (fixtures-real, 30 reviews):
  // only checks with a position-verified 0-FP record may sit at error.
  // Each row below is pinned to its evidence so a future edit that arms a
  // check without a measurement has to delete a named assertion.
  it("arms ONLY the checks with a measured 0-false-positive record (v3)", () => {
    // eval_display: 0 fires across v1/v2/v3 — pure numeric comparison.
    // tactical_keyword: v3 22 fires = 19 TRUE_FABRICATION / 3 ambiguous / 0 FP.
    // san_whitelist:square_unknown — v3's 11 fires were 100% contract-globally
    // licensed (0 fabrications); the follow-up pack widened the serving pool
    // to that same pool and v4 measures 0 square_unknown fires. san_unknown is
    // NOT armed: v4 kept one future-option-SAN residual (see armingConfig).
    for (const [check, category] of [
      ["eval_display", "eval_unbacked"],
      ["tactical_keyword", "tactical_keyword_unbacked"],
      ["san_whitelist", "square_unknown"],
      // mobility_claims — the LITERAL family measured 9 fires / 9
      // TRUE_FABRICATION / 0 FP in v3 and now runs on the serving path; the
      // qualitative family stays measurement-only and cannot reach the ladder.
      ["mobility_claims", "mobility_count_wrong"],
    ] as const) {
      expect(armSeverity(finding({ check, category, severity: "error" }))).toBe("error");
    }
    // Held at warn with a named blocker (see armingConfig comments):
    //  forbidden_claim — v3's residue is the board-UNFALSIFIABLE positional
    //                    class ("dominates" — needs Lc0) plus the
    //                    structurally-clamped user_visibility class.
    //  san_whitelist:hypothetical_line_off_contract — every v3 fire was
    //                    strict-only/widened-licensed, so the category has no
    //                    0-FP evidence of its own.
    //  stage9_*/relational/citation — no v3 evidence of their own yet.
    for (const [check, category] of [
      ["forbidden_claim", "forbidden_claim_present"],
      ["san_whitelist", "san_unknown"], // v4 residual: future-option SAN
      ["citation_invalid", "citation_unresolvable"],
      ["relational_claim", "relational_claim_contradicted"],
      ["stage9_positional_claim", "positional_claim"],
      ["stage9_mate_in_n", "mate_in_n"],
      ["stage9_material_win", "material_win"],
    ] as const) {
      expect(armSeverity(finding({ check, category, severity: "error" }))).toBe("warn");
    }
  });

  it("hypothetical_line failing under BOTH rules stays warn by default too", () => {
    expect(
      armSeverity(
        finding({
          check: "san_whitelist",
          category: "hypothetical_line_off_contract",
          severity: "error",
          wouldPassWidenedWindow: false,
        }),
      ),
    ).toBe("warn");
  });

  it("an explicit enforcement table can still arm a check at error (the machinery is intact)", () => {
    expect(
      armSeverity(finding({ check: "eval_display", severity: "error" }), {
        eval_display: "error",
      }),
    ).toBe("error");
  });
});

describe("structural clamps (cannot be overridden by config)", () => {
  it("strict-only hypothetical-line fires (widened window passes) stay WARN even if the table says error", () => {
    const f = finding({
      check: "san_whitelist",
      category: "hypothetical_line_off_contract",
      severity: "warn",
      wouldPassWidenedWindow: true,
    });
    expect(armSeverity(f)).toBe("warn");
    expect(armSeverity(f, { ...DEFAULT_ARMING_TABLE, san_whitelist: "error" })).toBe("warn");
  });

  it("stage9_user_visibility can NEVER arm at error — standing prohibition", () => {
    const f = finding({
      check: "stage9_user_visibility",
      category: "user_visibility",
      severity: "warn",
    });
    expect(armSeverity(f)).toBe("warn");
    expect(armSeverity(f, { stage9_user_visibility: "error" })).toBe("warn");
  });

  it("forbidden_claim user_visibility fires (referee-warn) can NEVER arm at error", () => {
    const f = finding({
      check: "forbidden_claim",
      category: "forbidden_claim_present",
      severity: "warn", // referee marks exactly the user_visibility class warn
    });
    expect(armSeverity(f)).toBe("warn");
    expect(armSeverity(f, { forbidden_claim: "error" })).toBe("warn");
  });
});

describe("armFindings partition", () => {
  it("default table: v3-armed checks land in errors, the rest in warns", () => {
    const fs: ServingFinding[] = [
      finding({}), // eval_display — armed
      finding({ check: "stage9_user_visibility", severity: "warn" }), // never error
      finding({ check: "tactical_keyword", category: "tactical_keyword_unbacked" }), // armed
      finding({ check: "san_whitelist", category: "square_unknown" }), // armed (fix A)
      finding({ check: "forbidden_claim", category: "forbidden_claim_present" }), // held at warn
    ];
    const armed = armFindings(fs);
    expect(armed.errors).toHaveLength(3);
    expect(armed.errors.map((f) => f.check).sort()).toEqual([
      "eval_display",
      "san_whitelist",
      "tactical_keyword",
    ]);
    expect(armed.warns).toHaveLength(2);
  });

  it("splits errors/warns per an explicit enforcement table and drops 'off'", () => {
    const fs: ServingFinding[] = [
      finding({}), // eval_display
      finding({ check: "stage9_user_visibility", severity: "warn" }), // clamped warn
      finding({ check: "tactical_keyword", category: "tactical_keyword_unbacked" }),
    ];
    const enforce = { ...DEFAULT_ARMING_TABLE, eval_display: "error", tactical_keyword: "error" } as const;
    const armed = armFindings(fs, enforce);
    expect(armed.errors).toHaveLength(2);
    expect(armed.warns).toHaveLength(1);
    const off = armFindings(fs, { ...enforce, tactical_keyword: "off" });
    expect(off.errors).toHaveLength(1);
  });
});
