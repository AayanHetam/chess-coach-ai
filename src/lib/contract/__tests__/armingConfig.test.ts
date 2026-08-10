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

describe("DEFAULT_ARMING_TABLE — conservative defaults", () => {
  it("arms eval_display / forbidden_claim / tactical_keyword / san_whitelist at error", () => {
    for (const [check, category] of [
      ["eval_display", "eval_unbacked"],
      ["forbidden_claim", "forbidden_claim_present"],
      ["tactical_keyword", "tactical_keyword_unbacked"],
      ["san_whitelist", "san_unknown"],
      ["san_whitelist", "square_unknown"],
      ["citation_invalid", "citation_unresolvable"],
      ["relational_claim", "relational_claim_contradicted"],
    ] as const) {
      expect(armSeverity(finding({ check, category, severity: "error" }))).toBe("error");
    }
  });

  it("hypothetical_line under BOTH rules failing (true fabrication) stays error", () => {
    expect(
      armSeverity(
        finding({
          check: "san_whitelist",
          category: "hypothetical_line_off_contract",
          severity: "error",
          wouldPassWidenedWindow: false,
        }),
      ),
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
  it("splits errors/warns per the table and drops 'off'", () => {
    const fs: ServingFinding[] = [
      finding({}), // error by default
      finding({ check: "stage9_user_visibility", severity: "warn" }), // clamped warn
      finding({ check: "tactical_keyword", category: "tactical_keyword_unbacked" }),
    ];
    const armed = armFindings(fs);
    expect(armed.errors).toHaveLength(2);
    expect(armed.warns).toHaveLength(1);
    const off = armFindings(fs, { ...DEFAULT_ARMING_TABLE, tactical_keyword: "off" });
    expect(off.errors).toHaveLength(1);
  });
});
