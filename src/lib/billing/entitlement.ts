/**
 * Entitlement = "is this user premium right now, and why". Computed LIVE from
 * the mirrored subscription fields on the user doc — never stamped into the
 * session JWT — because billing state changes mid-session (trial expiry, a
 * webhook flipping `active`, a promo comp) and a stale JWT claim would either
 * lock out a paying user or hand out free premium. (See PRICING_PIVOT_PLAN §3.)
 *
 * The core `computeEntitlement` is a pure function over plain numbers so it is
 * trivially unit-testable; `entitlementForUser` is the thin Firestore adapter.
 */
import {
  PAST_DUE_GRACE_MS,
  type PlanTier,
  type SubscriptionStatus,
} from "./config";

export type EntitlementReason =
  | "comped" // Akanksha / admin comp — premium forever
  | "active" // paid, current period not yet ended
  | "grace" // past_due but inside the dunning grace window
  | "trialing" // inside the 7-day free trial
  | "expired" // had a sub/trial that lapsed → now free
  | "none"; // never subscribed → free

export type Entitlement = {
  tier: PlanTier;
  isPremium: boolean;
  reason: EntitlementReason;
  status: SubscriptionStatus;
  /** epoch ms — trial end, if known */
  trialEndsAt: number | null;
  /** epoch ms — current paid period end, if known */
  currentPeriodEnd: number | null;
  /** true once comped (e.g. Akanksha promo) */
  comped: boolean;
};

export type EntitlementInput = {
  status?: SubscriptionStatus;
  trialEndsAtMs?: number | null;
  currentPeriodEndMs?: number | null;
  compedReason?: string | null;
};

export function computeEntitlement(
  input: EntitlementInput,
  nowMs: number,
): Entitlement {
  const status: SubscriptionStatus = input.status ?? "none";
  const trialEndsAt = input.trialEndsAtMs ?? null;
  const currentPeriodEnd = input.currentPeriodEndMs ?? null;
  const comped = Boolean(input.compedReason);

  const premium = (reason: EntitlementReason): Entitlement => ({
    tier: "premium",
    isPremium: true,
    reason,
    status,
    trialEndsAt,
    currentPeriodEnd,
    comped,
  });

  // 1. Comped (Akanksha promo / admin) — premium forever, no card needed.
  if (comped) return premium("comped");

  // 2. Active paid subscription (no period end recorded ⇒ treat as current).
  if (status === "active" && (currentPeriodEnd === null || nowMs < currentPeriodEnd)) {
    return premium("active");
  }

  // 3. Past-due but still inside the grace window (card failed, Stripe retrying).
  if (
    status === "past_due" &&
    currentPeriodEnd !== null &&
    nowMs < currentPeriodEnd + PAST_DUE_GRACE_MS
  ) {
    return premium("grace");
  }

  // 4. Inside the free trial.
  if (status === "trialing" && trialEndsAt !== null && nowMs < trialEndsAt) {
    return premium("trialing");
  }

  // 5. Otherwise free. Distinguish a lapsed sub/trial ("expired") from a
  //    user who never had anything ("none") — drives copy + paywall framing.
  const everHadSomething =
    status === "trialing" ||
    status === "active" ||
    status === "past_due" ||
    status === "canceled";
  return {
    tier: "free",
    isPremium: false,
    reason: everHadSomething ? "expired" : "none",
    status,
    trialEndsAt,
    currentPeriodEnd,
    comped: false,
  };
}

/** Anything with a `toMillis()` (firebase-admin Timestamp) or null/undefined. */
type MillisLike = { toMillis(): number } | null | undefined;

function toMs(t: MillisLike): number | null {
  if (t && typeof t.toMillis === "function") return t.toMillis();
  return null;
}

/**
 * Structural subset of StoredUser the entitlement calc needs. Declared here
 * (not imported from users.ts) to keep this module free of any Firestore /
 * server-only import and avoid an import cycle.
 */
export type UserSubscriptionFields = {
  subscriptionStatus?: SubscriptionStatus;
  trialEndsAt?: MillisLike;
  currentPeriodEnd?: MillisLike;
  compedReason?: string | null;
};

export function entitlementForUser(
  user: UserSubscriptionFields,
  nowMs: number,
): Entitlement {
  return computeEntitlement(
    {
      status: user.subscriptionStatus,
      trialEndsAtMs: toMs(user.trialEndsAt),
      currentPeriodEndMs: toMs(user.currentPeriodEnd),
      compedReason: user.compedReason ?? null,
    },
    nowMs,
  );
}

/** Days remaining (rounded up, floored at 0) until trial end — for UI banners. */
export function trialDaysRemaining(
  ent: Pick<Entitlement, "trialEndsAt">,
  nowMs: number,
): number {
  if (ent.trialEndsAt === null) return 0;
  const ms = ent.trialEndsAt - nowMs;
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
