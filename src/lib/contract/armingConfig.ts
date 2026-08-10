/**
 * Referee ARMING configuration (PR-CI-4) — the single data-driven table that
 * decides which referee findings are ladder-enforceable errors on the served
 * path.
 *
 * WHY A TABLE: the 30-game false-positive measurement (running in a parallel
 * worktree, --fp-measure on contract_fidelity_eval.ts) will flip individual
 * switches. Making severities data here — not branches in referee.ts — means
 * those flips are one-line config edits with zero check-logic churn (plan §4
 * precision discipline).
 *
 * Conservative defaults pending that measurement:
 *  - eval_display / forbidden_claim / tactical_keyword  → armed at ERROR
 *  - san_whitelist:
 *      · san_unknown / square_unknown → armed at ERROR (the TTT phantom-
 *        square class the program exists to kill)
 *      · hypothetical_line_off_contract, STRICT-only fires (strict prefix
 *        rule fails but the widened window passes — the referee tags these
 *        wouldPassWidenedWindow) → WARN, never enforce before the FP
 *        measurement lands
 *  - user_visibility (forbidden claim OR stage-9 scanner) → NEVER error.
 *    STANDING PROHIBITION (plan §4 + non-goals): the table cannot express an
 *    error here — armSeverity clamps it — so a config edit cannot violate
 *    the prohibition by accident.
 *  - stage-9 scanners keep their validator-assigned severity by default
 *    (they went through their own 0-false-fire gates in CI-3).
 *  - citation_invalid (a [F:id] token that resolves to nothing) → ERROR: an
 *    unresolvable citation is a fabricated provenance claim.
 *
 * The referee itself (referee.ts) keeps its OWN severity mapping — that is
 * shadow/telemetry truth. This table is the SERVING overlay: what the CI-4
 * ladder treats as enforceable.
 */
import type { RefereeFinding } from "./referee";

/**
 * Serving-side finding: every referee finding plus the CI-4-only citation
 * check ("citation_invalid" — a [F:id] token that resolves to no contract
 * fact). The ladder and arming table operate on this widened type.
 */
export interface ServingFinding extends Omit<RefereeFinding, "check"> {
  check: RefereeFinding["check"] | "citation_invalid";
}

export type ArmedSeverity = "error" | "warn" | "off";

/** Table keys: `${check}` or `${check}:${category}` (most specific wins). */
export type ArmingTable = Record<string, ArmedSeverity>;

export const DEFAULT_ARMING_TABLE: ArmingTable = {
  // Deterministic contract checks (plan §4 checks 2-4).
  eval_display: "error",
  tactical_keyword: "error",
  forbidden_claim: "error", // user_visibility fires clamped to warn in armSeverity
  san_whitelist: "error",
  // Strict-only hypothetical-line fires stay WARN until the 30-game FP
  // measurement decides (finding.wouldPassWidenedWindow === true). Handled
  // structurally in armSeverity below — a widened-window FAILURE (fabricated
  // line under BOTH rules) stays at the san_whitelist error default.
  // Stage-9 scanners: validator-assigned severity passes through.
  stage9_positional_claim: "error",
  stage9_mate_in_n: "error",
  stage9_material_win: "error",
  stage9_user_visibility: "warn", // standing prohibition (clamped in code too)
  // Relational oracle contradictions (full referee mode only).
  relational_claim: "error",
  // Citation validity (PR-CI-4 check 7).
  citation_invalid: "error",
};

export interface ArmedFinding {
  finding: ServingFinding;
  armed: ArmedSeverity;
}

/**
 * Resolve the armed severity for one finding. Precedence:
 *  1. structural clamps (user_visibility never error; strict-only
 *     hypothetical-line fires never error while wouldPassWidenedWindow),
 *  2. `${check}:${category}[:claimClass]`-style specific keys,
 *  3. `${check}` key,
 *  4. the finding's own referee severity.
 */
export function armSeverity(
  finding: ServingFinding,
  table: ArmingTable = DEFAULT_ARMING_TABLE,
): ArmedSeverity {
  // Structural clamp 1 — standing prohibition: "obvious"/visibility checks
  // can never arm at error, whatever the table says. The referee is the
  // source of truth for WHICH forbidden-claim fires are user_visibility: its
  // severityForViolation marks exactly those warn (referee.ts), so a warn
  // from the forbidden_claim check is by construction the prohibited class.
  if (
    finding.check === "stage9_user_visibility" ||
    (finding.check === "forbidden_claim" && finding.severity === "warn")
  ) {
    return tableLookup(finding, table) === "off" ? "off" : "warn";
  }
  // Structural clamp 2 — strict-only hypothetical-line fires (widened window
  // passes) stay warn until the 30-game FP measurement arms them.
  if (
    finding.category === "hypothetical_line_off_contract" &&
    finding.wouldPassWidenedWindow === true
  ) {
    return tableLookup(finding, table) === "off" ? "off" : "warn";
  }
  const looked = tableLookup(finding, table);
  if (looked !== null) return looked;
  return finding.severity === "error" ? "error" : "warn";
}

function tableLookup(finding: ServingFinding, table: ArmingTable): ArmedSeverity | null {
  const specific = `${finding.check}:${finding.category}`;
  if (specific in table) return table[specific];
  if (finding.check in table) return table[finding.check];
  return null;
}

export interface ArmedFindings {
  /** Ladder-enforceable — these drive sentence-drop/edit/regen/template. */
  errors: ServingFinding[];
  /** Telemetry-only. */
  warns: ServingFinding[];
}

export function armFindings(
  findings: ServingFinding[],
  table: ArmingTable = DEFAULT_ARMING_TABLE,
): ArmedFindings {
  const errors: ServingFinding[] = [];
  const warns: ServingFinding[] = [];
  for (const f of findings) {
    const armed = armSeverity(f, table);
    if (armed === "error") errors.push(f);
    else if (armed === "warn") warns.push(f);
    // "off" → dropped entirely.
  }
  return { errors, warns };
}
