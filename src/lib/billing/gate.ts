/**
 * Premium gate for an AI-coach feature. Call inside a route handler AFTER
 * requireSession() resolves the uid. Returns either `{ ok: true }` (proceed) or
 * `{ ok: false, response }` (a 402 the caller should return immediately).
 *
 * Behaviour:
 *  - FREEMIUM_ENABLED off → always allow, with ZERO extra work (no DB read).
 *    This is what keeps the pivot safe to merge before go-live.
 *  - premium / trial / comped → allow, unlimited.
 *  - free → consume one unit of the daily allowance; 402 once exhausted.
 */
import { NextResponse, after } from "next/server";
import { getUserById, type StoredUser } from "@/lib/server/users";
import { isFreemiumEnabled, resolveEntitlement } from "./access";
import { checkAndConsumeQuota } from "./quota";
import { trialDaysRemaining } from "./entitlement";
import { type FeatureKey } from "./config";
import { trackEvent } from "@/lib/tracking/track";

export type GateResult =
  | { ok: true; consumed: boolean }
  | { ok: false; response: NextResponse };

export async function gateFeature(
  uid: string,
  feature: FeatureKey,
  opts: { surface?: string; user?: StoredUser } = {},
): Promise<GateResult> {
  // Enforcement off (dark launch) → allow immediately, no Firestore read.
  if (!isFreemiumEnabled()) return { ok: true, consumed: false };

  const user = opts.user ?? (await getUserById(uid));
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "User not found" }, { status: 401 }),
    };
  }

  const now = Date.now();
  const ent = resolveEntitlement(user, now);
  if (ent.isPremium) return { ok: true, consumed: false };

  // Free tier — consume one unit of today's allowance.
  const quota = await checkAndConsumeQuota(uid, feature, now);
  if (quota.allowed) return { ok: true, consumed: true };

  emitPaywallShown(uid, feature, opts.surface, quota.limit);
  return {
    ok: false,
    response: NextResponse.json(
      {
        error:
          "You've used today's free AI-coach allowance. Upgrade to Premium ($0.99/mo) for unlimited access.",
        code: "quota_exhausted",
        feature,
        limit: quota.limit,
        trialDaysRemaining: trialDaysRemaining(ent, now),
        upgrade: true,
      },
      { status: 402 },
    ),
  };
}

/**
 * Fire a best-effort paywall_shown analytics event. Uses next/server `after()`
 * so the serverless worker isn't frozen before the insert completes; falls back
 * to a fire-and-forget when called outside a request scope (e.g. unit tests),
 * where `after()` throws. trackEvent itself no-ops unless TRACKING_ENABLED.
 */
function emitPaywallShown(
  uid: string,
  feature: FeatureKey,
  surface: string | undefined,
  limit: number,
): void {
  const fire = () =>
    trackEvent({
      eventName: "paywall_shown",
      uid,
      surface: surface ?? feature,
      props: { feature, reason: "quota_exhausted", limit },
    });
  try {
    after(fire);
  } catch {
    void fire();
  }
}
