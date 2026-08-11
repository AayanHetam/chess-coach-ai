/**
 * The arming table the CI-4 gate runs measure against.
 *
 * IT IS THE REAL SERVING TABLE. This file used to hold a hand-maintained
 * MIRROR of `DEFAULT_ARMING_TABLE` (severities retyped by hand), which is the
 * exact drift class that makes a passing gate meaningless: the gate would
 * measure one configuration while serving ran another. As of 2026-08-11 the
 * mirror is gone — the gate table is `DEFAULT_ARMING_TABLE` plus a declared,
 * enumerated override set, so any delta between "what we measured" and "what
 * we serve" is visible in ONE place (CI4_GATE_ARMING_OVERRIDES below) and is
 * asserted by scripts/eval/__tests__/ci4GateTable.test.ts.
 *
 * HISTORICAL NOTE (why the mirror existed, and why it must not come back):
 * when the harness was written, `DEFAULT_ARMING_TABLE` was all-`warn` pending
 * the round-2 / v3 false-positive measurement, so measuring against it would
 * have measured NO enforcement at all — every card `pass`, shipped prose equal
 * to raw model prose, fabrication gate vacuous. The mirror armed 10 rows at
 * error to describe the serving posture CI-5 "would" flip on. That premise
 * expired: the v3/v4 measurements landed and the serving table now arms
 * eval_display, tactical_keyword, san_whitelist:square_unknown and
 * mobility_claims at error on its own. Keeping the mirror after that point
 * meant the 2026-08-11 gate run measured a STRICTER posture than serving would
 * ever apply (see the override block for the exact rows).
 */
import { DEFAULT_ARMING_TABLE, type ArmingTable } from "@/lib/contract/armingConfig";

/**
 * Deltas the gate run applies ON TOP of the real serving table.
 *
 * EMPTY ON PURPOSE (2026-08-11). The CI-4 gate question is "can serving be
 * flipped to CONTRACT_CATEGORIES=position_analysis?", and that question is
 * only answered by measuring the posture serving would actually apply. Every
 * row that the retired mirror armed above serving is deliberately NOT
 * reinstated here:
 *
 *   san_whitelist               mirror error / serving warn — san_unknown's
 *                               future-option class is an unresolved FP source
 *                               (refereePrecisionPack.test.ts #17/#18/#20).
 *   forbidden_claim             mirror error / serving warn — the positional
 *                               "dominates" class is board-unfalsifiable.
 *   stage9_positional_claim     mirror error / serving warn — CI-3 gates
 *   stage9_mate_in_n            predate the adjudication evidence standard.
 *   stage9_material_win
 *   relational_claim            mirror error / serving warn — full-referee-mode
 *                               oracle contradictions, unmeasured on this set.
 *   citation_invalid            mirror error / serving warn — arming it makes
 *                               the citation-coverage gate partly self-fulfilling
 *                               (uncited/invalid-cited sentences get dropped
 *                               before coverage is computed).
 *
 * TO EVALUATE A PROPOSED FLIP: add the row here with a comment naming why,
 * e.g. `citation_invalid: "error", // CI-5 proposal: measure coverage under
 * enforced provenance`. The test asserts every key here genuinely differs from
 * `DEFAULT_ARMING_TABLE`, so a stale override cannot sit here silently, and
 * the gate JSON's `armingTable` field records the effective table either way.
 */
export const CI4_GATE_ARMING_OVERRIDES: ArmingTable = {};

/**
 * The effective table every contract-mode harness passes. Derived — never
 * retyped. Do not replace this with a literal.
 */
export const CI4_GATE_ARMING_TABLE: ArmingTable = {
  ...DEFAULT_ARMING_TABLE,
  ...CI4_GATE_ARMING_OVERRIDES,
};
