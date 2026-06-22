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
