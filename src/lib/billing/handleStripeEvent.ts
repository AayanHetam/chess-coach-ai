/**
 * Stripe webhook event handler (server-only). Extracted from the route so it's
 * unit-testable. Idempotent: every relevant event re-derives the mirror state
 * from the Stripe object, so replays/out-of-order delivery converge correctly.
 *
 * Resolution is robust to event ordering: customer.subscription.* can arrive
 * before checkout.session.completed has stored stripeCustomerId, so we fall
 * back to the customer's metadata.uid (set when we created the customer).
 *
 * Comped (Akanksha) users are never downgraded by a Stripe event.
 */
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import {
  getUserById,
  getUserByStripeCustomerId,
  updateSubscription,
  type StoredUser,
  type SubscriptionPatch,
} from "@/lib/server/users";
import { subscriptionToPatch, customerIdOf } from "./syncStripeSubscription";
import { trackEvent } from "@/lib/tracking/track";

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const uid = session.client_reference_id ?? undefined;
      if (!uid) return;
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : (session.customer?.id ?? undefined);
      const subId =
        typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription?.id ?? undefined);
      const patch: SubscriptionPatch = {};
      if (customerId) patch.stripeCustomerId = customerId;
      if (subId) patch.stripeSubscriptionId = subId;
      if (Object.keys(patch).length > 0) {
        await updateSubscription(uid, patch);
      }
      void trackEvent({
        eventName: "checkout_completed",
        uid,
        props: { subscriptionId: subId ?? null },
      });
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await applySubscription(event.data.object as Stripe.Subscription);
      return;
    }
    default:
      return;
  }
}

async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId = customerIdOf(sub);
  if (!customerId) return;

  const user = await resolveUser(customerId);
  if (!user) {
    console.warn(`[stripe/webhook] no local user for customer ${customerId}`);
    return;
  }
  // Never let a Stripe event clobber a comped (Akanksha) user's free access.
  if (user.compedReason) return;

  const patch = subscriptionToPatch(sub);
  await updateSubscription(user.uid, patch);

  void trackEvent({
    eventName:
      patch.subscriptionStatus === "canceled"
        ? "subscription_canceled"
        : "subscription_active",
    uid: user.uid,
    props: { stripeStatus: sub.status, status: patch.subscriptionStatus },
  });
}

/**
 * Find the local user for a Stripe customer. Prefer the stored stripeCustomerId
 * index; fall back to the customer's metadata.uid (set at customer creation) so
 * we still resolve when a subscription event beats checkout.session.completed.
 */
async function resolveUser(customerId: string): Promise<StoredUser | null> {
  const byIndex = await getUserByStripeCustomerId(customerId);
  if (byIndex) return byIndex;
  try {
    const customer = await getStripe().customers.retrieve(customerId);
    if (!customer.deleted) {
      const uid = customer.metadata?.uid;
      if (uid) return getUserById(uid);
    }
  } catch (err) {
    console.error(`[stripe/webhook] customer retrieve failed ${customerId}`, err);
  }
  return null;
}
