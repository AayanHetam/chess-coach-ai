/**
 * Server-only billing access layer. Composes the pure entitlement calc with
 * the FREEMIUM_ENABLED env switch and the Firestore trial-start write. Import
 * this only from server code (route handlers) — it pulls firebase-admin via
 * users.ts. Client code imports the TYPE `ClientEntitlement` from
 * ./entitlement instead (pure, no server deps).
 */
import { Timestamp } from "firebase-admin/firestore";
import { getBillingEnv } from "@/env";
import { TRIAL_MS } from "./config";
import {
  applyFreemiumFlag,
  entitlementForUser,
  trialDaysRemaining,
  type ClientEntitlement,
  type Entitlement,
} from "./entitlement";
import { type StoredUser, updateSubscription } from "@/lib/server/users";

export function isFreemiumEnabled(): boolean {
  return getBillingEnv().freemiumEnabled;
}

/** Live entitlement for a user, respecting the master switch. */
export function resolveEntitlement(user: StoredUser, nowMs: number): Entitlement {
  return applyFreemiumFlag(entitlementForUser(user, nowMs), isFreemiumEnabled());
}

/** Shape the entitlement for the /api/auth/me JSON payload. */
export function toClientEntitlement(
  ent: Entitlement,
  nowMs: number,
): ClientEntitlement {
  return {
    ...ent,
    freemiumEnabled: isFreemiumEnabled(),
    trialDaysRemaining: trialDaysRemaining(ent, nowMs),
  };
}

/**
 * Start the 7-day premium trial for a user who has never had any billing state.
 * Idempotent and safe: no-ops for comped users, users with an existing
 * subscription status, and users who already started a trial.
 *
 * Gated on FREEMIUM_ENABLED on purpose: seeding a trial while enforcement is
 * OFF would silently start (and expire) everyone's 7 days during the dark-launch
 * window, so when the founder finally flips the flag nobody would have a trial
 * left. With the flag off everyone is premium anyway, so there's nothing to
 * seed. Called lazily from /api/auth/me so both new signups and pre-pivot
 * existing users get their trial from first authenticated load post-launch.
 */
export async function startTrialIfEligible(user: StoredUser): Promise<StoredUser> {
  if (!isFreemiumEnabled()) return user;
  if (user.compedReason) return user;
  if (user.subscriptionStatus) return user;
  if (user.trialStartedAt) return user;
  const now = Date.now();
  return updateSubscription(user.uid, {
    subscriptionStatus: "trialing",
    plan: "free",
    trialStartedAt: Timestamp.fromMillis(now),
    trialEndsAt: Timestamp.fromMillis(now + TRIAL_MS),
  });
}
