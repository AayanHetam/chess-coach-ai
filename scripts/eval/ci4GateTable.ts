/**
 * The arming table the CI-4 gate runs measure against — i.e. what ENFORCED
 * serving would arm at error.
 *
 * WHY IT LIVES HERE, NOT IN armingConfig.ts: `DEFAULT_ARMING_TABLE` is
 * deliberately all-`warn` on main while the round-2 / v3 false-positive
 * measurement runs (see the standing comment in armingConfig.ts —
 * "enforcement callers must pass an explicit table"). Measuring the CI-4
 * gates against an all-warn table would measure NO enforcement at all: every
 * card would `pass`, shipped prose would equal raw model prose, and the
 * fabrication gate would be meaningless. This table mirrors the
 * PROPOSED_ARMING_TABLE sketch in armingConfig.ts so the gate numbers describe
 * the serving posture CI-5 would actually flip on.
 *
 * Owned by the eval harness on purpose: the referee/arming workstream owns
 * armingConfig.ts, and this file must not fight it.
 */
import type { ArmingTable } from "@/lib/contract/armingConfig";

export const CI5_CANDIDATE_ARMING_TABLE: ArmingTable = {
  eval_display: "error",
  san_whitelist: "error",
  tactical_keyword: "error",
  forbidden_claim: "error",
  stage9_positional_claim: "error",
  stage9_mate_in_n: "error",
  stage9_material_win: "error",
  stage9_user_visibility: "warn", // standing prohibition — clamped in code too
  relational_claim: "error",
  citation_invalid: "error",
};
