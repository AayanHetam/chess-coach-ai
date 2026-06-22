/**
 * Map a Stripe Subscription onto our Firestore mirror fields. Pure + Stripe-
 * version-aware: as of API 2026-05-27.dahlia `current_period_end` lives on the
 * subscription ITEM, not the subscription, so we read it from items[0].
 */
import { Timestamp } from "firebase-admin/firestore";
import type Stripe from "stripe";
import type { SubscriptionStatus } from "./config";
import type { SubscriptionPatch } from "@/lib/server/users";

/** Stripe's 8 statuses → our 5-state mirror. */
export function mapStripeStatus(s: Stripe.Subscription.Status): SubscriptionStatus {
  switch (s) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
    case "paused":
      return "canceled";
    case "incomplete":
      return "none";
    default:
      return "none";
  }
}

/** epoch ms of the current period end, read from the first subscription item. */
export function currentPeriodEndMs(sub: Stripe.Subscription): number | null {
  const sec = sub.items?.data?.[0]?.current_period_end;
  return typeof sec === "number" ? sec * 1000 : null;
}

export function customerIdOf(
  sub: Pick<Stripe.Subscription, "customer">,
): string | null {
  const c = sub.customer;
  if (!c) return null;
  return typeof c === "string" ? c : c.id;
}

/** Build the Firestore patch for a subscription's current state. */
export function subscriptionToPatch(sub: Stripe.Subscription): SubscriptionPatch {
  const status = mapStripeStatus(sub.status);
  const isPremium =
    status === "active" || status === "trialing" || status === "past_due";
  const patch: SubscriptionPatch = {
    stripeSubscriptionId: sub.id,
    subscriptionStatus: status,
    plan: isPremium ? "premium" : "free",
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
  };
  const periodEndMs = currentPeriodEndMs(sub);
  if (periodEndMs !== null) {
    patch.currentPeriodEnd = Timestamp.fromMillis(periodEndMs);
  }
  // Mirror Stripe's authoritative trial_end into trialEndsAt so a Stripe-side
  // `trialing` sub is self-sufficient for entitlement (computeEntitlement reads
  // trialEndsAt) instead of relying on the possibly-drifted local seed.
  if (typeof sub.trial_end === "number") {
    patch.trialEndsAt = Timestamp.fromMillis(sub.trial_end * 1000);
  }
  const customerId = customerIdOf(sub);
  if (customerId) patch.stripeCustomerId = customerId;
  return patch;
}
