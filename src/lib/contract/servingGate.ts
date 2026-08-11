/**
 * Contract-serving arming gate (PR-CI-5).
 *
 * ONE pure predicate answering "does this request serve through the enforced
 * verbalizer-4.0 path?", so the route's two decision points (whether to keep
 * the built contract alive, and whether to enter the contract branch) can
 * never disagree — and so the precedence rule is testable without a route.
 *
 * PRECEDENCE (plan §7 PR-CI-5) — a plain OR, no override direction:
 *   1. the request's classified category is in CONTRACT_CATEGORIES  → armed
 *      for EVERYONE (the general-rollout lever, CI-4/CI-6);
 *   2. the request's session uid is in CONTRACT_UIDS                → armed
 *      for THAT USER on EVERY category (the CI-5 dogfood lever: game_review
 *      for the founder alone before general rollout);
 *   3. otherwise                                                    → legacy,
 *      byte-identical (pinned by contractRollbackDrill.test.ts).
 *
 * Deliberately NOT here: any notion of a uid allowlist *restricting* an armed
 * category. CONTRACT_CATEGORIES means "everyone on this category" — narrowing
 * it by uid would make the CI-4 rollout flag silently depend on a second flag,
 * and the rehearsed rollback ("empty the category list") would stop being
 * sufficient.
 *
 * This module imports only the env reader on purpose: the route consults it on
 * every streamed request, and it must not drag the LLM/referee graph in.
 */
import { getContractEnv } from "@/env";
import type { ContractEnv } from "@/env";

export interface ServingGateInput {
  /** categoryClassifier output for this request (e.g. "game_review"). */
  category: string | null | undefined;
  /** Session uid (never a client-supplied value — read from the cm_session JWT). */
  uid: string | null | undefined;
  /** Test seam; defaults to the memoized process env. */
  env?: Pick<ContractEnv, "categories" | "uids">;
}

export type ServingGateReason = "category" | "uid" | "off";

export interface ServingGateDecision {
  armed: boolean;
  /** Which lever armed it — telemetry + the dogfood/rollout distinction. */
  reason: ServingGateReason;
}

/**
 * Category match is case-insensitive (parseContractCategories lowercases the
 * env side; the classifier vocabulary is already lowercase snake_case).
 * Uid match is EXACT — see parseContractUids for why case is not folded.
 */
export function contractServingDecision(input: ServingGateInput): ServingGateDecision {
  const env = input.env ?? getContractEnv();
  const category = (input.category ?? "").trim().toLowerCase();
  if (category.length > 0 && env.categories.includes(category)) {
    return { armed: true, reason: "category" };
  }
  const uid = (input.uid ?? "").trim();
  if (uid.length > 0 && env.uids.includes(uid)) {
    return { armed: true, reason: "uid" };
  }
  return { armed: false, reason: "off" };
}

/** Convenience boolean for call sites that do not log the reason. */
export function isContractServingArmed(input: ServingGateInput): boolean {
  return contractServingDecision(input).armed;
}

/**
 * Could ANY request in this process serve through the contract path?
 *
 * The route builds the CoachContract before the category is classified, so it
 * needs a cheap "is enforcement configured at all" test to decide whether to
 * keep the built contract alive. Both levers count: with only CONTRACT_UIDS
 * set, the categories list is empty but dogfood traffic still needs a
 * contract.
 */
export function isContractServingConfigured(
  env: Pick<ContractEnv, "categories" | "uids"> = getContractEnv(),
): boolean {
  return env.categories.length > 0 || env.uids.length > 0;
}
