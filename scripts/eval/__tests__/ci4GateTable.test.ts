/**
 * ANTI-DRIFT GUARD for the CI-4 gate arming table.
 *
 * The 2026-08-11 gate run passed all six gates against a hand-maintained
 * MIRROR of `DEFAULT_ARMING_TABLE` that armed seven rows STRICTER than serving
 * (san_whitelist, forbidden_claim, the three stage-9 scanners, relational_claim,
 * citation_invalid). A gate measured against a configuration nobody serves is
 * not evidence about serving. These tests make that state unreachable:
 *
 *  1. the effective gate table must be `DEFAULT_ARMING_TABLE` + a declared,
 *     enumerated override set — no key may appear from nowhere, and no key may
 *     silently vanish;
 *  2. every declared override must genuinely DIFFER from the serving value, so
 *     a stale proposal cannot sit in the file pretending to be a delta;
 *  3. the harness source itself must not contain a re-typed severity table.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_ARMING_TABLE, type ArmedSeverity } from "@/lib/contract/armingConfig";

import { CI4_GATE_ARMING_OVERRIDES, CI4_GATE_ARMING_TABLE } from "../ci4GateTable";

/**
 * The ONLY keys the gate run may arm differently from serving. Empty on
 * purpose: the CI-4 gate question is "can CONTRACT_CATEGORIES be flipped?",
 * which only the true serving posture answers. Adding a key here is a
 * deliberate, reviewable act — it must come with a comment in ci4GateTable.ts
 * naming the proposal being measured.
 */
const DECLARED_OVERRIDES: readonly string[] = [];

const EVAL_DIR = path.resolve(__dirname, "..");

describe("CI-4 gate arming table is the serving table plus declared overrides", () => {
  it("equals DEFAULT_ARMING_TABLE spread with the override set", () => {
    expect(CI4_GATE_ARMING_TABLE).toEqual({
      ...DEFAULT_ARMING_TABLE,
      ...CI4_GATE_ARMING_OVERRIDES,
    });
  });

  it("carries every serving key — none dropped", () => {
    expect(Object.keys(CI4_GATE_ARMING_TABLE).sort()).toEqual(
      Array.from(
        new Set([...Object.keys(DEFAULT_ARMING_TABLE), ...Object.keys(CI4_GATE_ARMING_OVERRIDES)]),
      ).sort(),
    );
  });

  it("only overrides keys on the declared allowlist", () => {
    expect(Object.keys(CI4_GATE_ARMING_OVERRIDES).sort()).toEqual([...DECLARED_OVERRIDES].sort());
  });

  it("every declared override genuinely differs from the serving value", () => {
    for (const [key, severity] of Object.entries(CI4_GATE_ARMING_OVERRIDES)) {
      const serving = (DEFAULT_ARMING_TABLE as Record<string, ArmedSeverity | undefined>)[key];
      expect(
        severity,
        `override "${key}" is a no-op (serving already ${String(serving)}) — delete it`,
      ).not.toBe(serving);
    }
  });

  it("differs from serving ONLY on declared keys", () => {
    const drifted: string[] = [];
    for (const key of Object.keys(CI4_GATE_ARMING_TABLE)) {
      const gate = CI4_GATE_ARMING_TABLE[key];
      const serving = (DEFAULT_ARMING_TABLE as Record<string, ArmedSeverity | undefined>)[key];
      if (gate !== serving && !DECLARED_OVERRIDES.includes(key)) drifted.push(key);
    }
    expect(drifted, `undeclared gate-vs-serving drift on ${drifted.join(", ")}`).toEqual([]);
  });
});

describe("no hand-copied duplicate of the arming table may be reintroduced", () => {
  it("ci4GateTable.ts derives from DEFAULT_ARMING_TABLE instead of retyping it", () => {
    const src = fs.readFileSync(path.join(EVAL_DIR, "ci4GateTable.ts"), "utf8");
    expect(src).toContain("...DEFAULT_ARMING_TABLE");
    // A mirror is a literal severity map. The override set is the only object
    // literal allowed to hold severities, and it is enumerated by the tests
    // above; the exported table must be a spread, never a literal row list.
    const exportedTable = src.slice(src.indexOf("export const CI4_GATE_ARMING_TABLE"));
    expect(exportedTable).toContain("...DEFAULT_ARMING_TABLE");
  });

  it("no eval harness declares its own ArmingTable literal", () => {
    const offenders: string[] = [];
    for (const file of fs.readdirSync(EVAL_DIR)) {
      if (!file.endsWith(".ts") || file === "ci4GateTable.ts") continue;
      const src = fs.readFileSync(path.join(EVAL_DIR, file), "utf8");
      // `: ArmingTable = {` / `as ArmingTable` on a literal, or an inline
      // armingTable option built from severity rows.
      if (/:\s*ArmingTable\s*=\s*\{/.test(src)) offenders.push(`${file} (ArmingTable literal)`);
      if (/armingTable:\s*\{/.test(src)) offenders.push(`${file} (inline armingTable literal)`);
    }
    expect(
      offenders,
      `these harnesses hand-roll an arming table instead of importing CI4_GATE_ARMING_TABLE: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("every contract-mode harness passes the shared gate table", () => {
    const harnesses = [
      "contract_ci4_eval.ts",
      "contract_ci4_verify.ts",
      "contract_ci4_gates.ts",
      "contract_ci4_offline_replay.ts",
    ];
    for (const file of harnesses) {
      const src = fs.readFileSync(path.join(EVAL_DIR, file), "utf8");
      expect(src, `${file} must import the shared gate table`).toContain("CI4_GATE_ARMING_TABLE");
      expect(src, `${file} must not reference the retired mirror`).not.toContain(
        "CI5_CANDIDATE_ARMING_TABLE",
      );
    }
  });
});
