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

/**
 * PRECISION-PACK CORRECTION (supersedes the CI-4 "conservative defaults"
 * above, which were NOT conservative): the position-verified adjudication of
 * the 30-game FP measurement (contract-referee-fp-30game-*.json, 2026-08-10)
 * re-judged all 37 contested fires as 7 TRUE_FABRICATION / 30 FALSE_POSITIVE.
 * Per-check FP evidence:
 *   - tactical_keyword: 15 needs-review fires → ~11 were real board tactics
 *     outside the detector's scope, CONCEPT-widget text, or double-counted
 *     duplicates. CI-4 armed this at error — wrong.
 *   - forbidden_claim: 8 needs-review fires → the "Dominates/dominating"
 *     positional class split TF/FP on facts the check cannot see; "obvious"
 *     fires were definitional prose. CI-4 armed this at error — wrong.
 *   - san_whitelist: 14 needs-review fires → piece designators ("the Ne5"),
 *     mis-disambiguated-but-legal SAN, and punctuation-joined enumerations.
 *   - eval_display: 2/2 fires licensed by contract-global facts.
 * Until the precision-pack fixes land AND the measurement is RE-RUN against
 * real-engine fixtures (fixtures-real/), NO check arms at error. Everything
 * below is warn (telemetry); enforcement callers must pass an explicit table.
 */
export const DEFAULT_ARMING_TABLE: ArmingTable = {
  // Deterministic contract checks (plan §4 checks 2-4) — warn pending re-measure.
  eval_display: "warn",
  tactical_keyword: "warn",
  forbidden_claim: "warn",
  san_whitelist: "warn",
  // Stage-9 scanners — their CI-3 gates predate the adjudication's evidence
  // standard; held at warn with everything else until the v2 measurement.
  stage9_positional_claim: "warn",
  stage9_mate_in_n: "warn",
  stage9_material_win: "warn",
  stage9_user_visibility: "warn", // standing prohibition (clamped in code too)
  // Relational oracle contradictions (full referee mode only).
  relational_claim: "warn",
  // Citation validity (PR-CI-4 check 7).
  citation_invalid: "warn",
};

/**
 * POST-PRECISION-PACK PROPOSED table — COMMENTED OUT ON PURPOSE. This is the
 * arming candidate set to confirm against the v2 measurement
 * (contract-referee-fp-30game-v2-*.json, real-engine fixtures): flip a row
 * to error ONLY if that check measures 0 FP there (plan §9 risk 3's
 * 0-false-fire control gate).
 *
 * export const PROPOSED_ARMING_TABLE: ArmingTable = {
 *   eval_display: "error",        // contract-global pool: v1's only 2 fires were licensed
 *   san_whitelist: "error",       // after designator license + legal-move normalization + punctuation fix
 *   tactical_keyword: "warn",     // even with motif-scope extension, TF/FP split needs the re-measure
 *   forbidden_claim: "warn",      // "dominates" class is not mechanically adjudicable yet
 *   stage9_positional_claim: "error",
 *   stage9_mate_in_n: "error",
 *   stage9_material_win: "error",
 *   stage9_user_visibility: "warn", // standing prohibition — never error
 *   relational_claim: "error",
 *   citation_invalid: "error",    // deterministic provenance check, no chess judgment involved
 * };
 */

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
