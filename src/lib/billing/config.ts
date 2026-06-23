/**
 * Central billing config — single source of truth for the pricing pivot
 * ($0.99/mo freemium + 7-day trial + Akanksha comp). Pure constants + shared
 * types only; no env reads, no Firestore, no Stripe import, so it's safe to
 * pull from both server and (display) client code.
 */

/** Subscription state mirrored onto the Firestore user doc from Stripe. */
export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled";

export type PlanTier = "free" | "premium";

export const TRIAL_DAYS = 7;
export const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Minimum lead time before trial end for Stripe to accept a `trial_end` on a
 * Checkout subscription (Stripe requires ≥48h; we keep a 1h margin so request
 * latency + the second-floor can't land us just under the line). Shared by the
 * checkout route — which uses it to decide whether to honor the remaining trial
 * (no charge now) or charge at checkout — and the UI billing disclosure below,
 * so what we *tell* the user about when they'll first be charged always matches
 * what Stripe actually does.
 */
export const MIN_TRIAL_LEAD_MS = 49 * 60 * 60 * 1000;

/**
 * Grace window after a paid period lapses (e.g. a failed card → `past_due`)
 * before we actually downgrade. Keeps a paying customer's access alive while
 * Stripe retries the charge, instead of locking them out on the first dunning.
 */
export const PAST_DUE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/** Display-only pricing (the real amount lives in the Stripe Price). */
export const PRICE_DISPLAY = {
  amount: "$0.99",
  cadence: "month",
  currency: "usd",
} as const;

/** Premium-gated server features (keys used by quota + gate + tracking). */
export type FeatureKey =
  | "analysis" // /api/enhanced-analysis — full AI game review
  | "coach_chat" // /api/chat — follow-up coach chat
  | "puzzle_coach" // /api/puzzle-chat — interactive puzzle coach
  | "concept_lesson"; // /api/concept-lesson — micro-lessons

export const FEATURE_KEYS: FeatureKey[] = [
  "analysis",
  "coach_chat",
  "puzzle_coach",
  "concept_lesson",
];

/**
 * Free-tier DAILY allowance per feature. Premium / trial / comped users are
 * unlimited. Keeping a small free allowance (rather than zero) is deliberate:
 * it keeps the AEO "free AI chess coach" promise truthful while nudging power
 * users to upgrade. Tunable without touching gate logic.
 */
export const FREE_DAILY_LIMITS: Record<FeatureKey, number> = {
  analysis: 3,
  coach_chat: 15,
  puzzle_coach: 3,
  concept_lesson: 1,
};

export const PROMO = {
  /** `compedReason` is stored as `${COMPED_REASON_PREFIX}${code}`. */
  COMPED_REASON_PREFIX: "promo:",
  /**
   * Codes seeded into the `promo_codes` table by the migration. Each grants
   * free-forever Premium (a "comp") to kids in a partner program — no card,
   * works even before go-live. Admins can mint more / cap / revoke from
   * /admin/promo-codes.
   */
  SEED_CODES: [
    { code: "AKANKSHA2026", note: "Akanksha Foundation kids" },
    { code: "GRANDKNIGHTS2026", note: "Grandknights program kids" },
  ],
} as const;

export function compedReasonForCode(code: string): string {
  return `${PROMO.COMPED_REASON_PREFIX}${code.trim().toUpperCase()}`;
}

/**
 * Plain-English auto-renewal disclosure shown right next to the subscribe
 * button. Centralised so the paywall modal and the pricing page disclose the
 * SAME recurring terms and the SAME first-charge moment — "billed today" vs "at
 * trial end" is derived from the same `MIN_TRIAL_LEAD_MS` the checkout route
 * uses, so the copy can never drift from what Stripe will actually charge.
 * (FTC/ROSCA wants the recurring nature, the price, and the cancellation method
 * clear, conspicuous, and adjacent to the point of consent.)
 */
export function subscriptionBillingNote(args: {
  isOnTrial: boolean;
  trialEndsAtMs: number | null;
  nowMs: number;
}): string {
  const { isOnTrial, trialEndsAtMs, nowMs } = args;
  const price = `${PRICE_DISPLAY.amount}/${PRICE_DISPLAY.cadence}`;
  const chargedToday =
    !isOnTrial ||
    trialEndsAtMs === null ||
    trialEndsAtMs <= nowMs + MIN_TRIAL_LEAD_MS;

  if (isOnTrial && !chargedToday && trialEndsAtMs !== null) {
    const when = new Date(trialEndsAtMs).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    return `You won't be charged until ${when}, when your free trial ends. After that it's ${price}, billed automatically until you cancel. Cancel anytime from Manage subscription.`;
  }
  if (isOnTrial && chargedToday) {
    return `Your trial is almost over, so you'll be charged ${PRICE_DISPLAY.amount} today, then ${price} automatically until you cancel. Cancel anytime from Manage subscription.`;
  }
  return `${price}, billed automatically until you cancel. Cancel anytime from Manage subscription.`;
}
