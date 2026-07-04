import { NextResponse, after } from "next/server";
import type Stripe from "stripe";
import { requireSession } from "@/lib/auth/session";
import { assertStripeSecrets, getStripeEnv, getBillingEnv } from "@/env";
import { getStripe } from "@/lib/stripe";
import { getUserById, updateSubscription } from "@/lib/server/users";
import { trackEvent } from "@/lib/tracking/track";
import { MIN_TRIAL_LEAD_MS } from "@/lib/billing/config";

export const runtime = "nodejs";

/**
 * Create a Stripe Checkout Session for the $0.99/mo Premium subscription.
 * Honors any remaining local trial via subscription_data.trial_end so a user
 * who upgrades early still isn't charged until their 7 days are up.
 */
export async function POST() {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const { uid, email } = guard.session;

  try {
    assertStripeSecrets();
  } catch (err) {
    console.error("[stripe/checkout]", err);
    return NextResponse.json(
      { error: "Billing is not configured yet." },
      { status: 503 },
    );
  }

  const { priceId } = getStripeEnv();
  if (!priceId) {
    return NextResponse.json({ error: "Billing not configured." }, { status: 503 });
  }
  const { appBaseUrl } = getBillingEnv();
  const stripe = getStripe();

  const user = await getUserById(uid);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }
  if (user.compedReason) {
    return NextResponse.json(
      { error: "You already have free Premium access." },
      { status: 400 },
    );
  }

  // Defense-in-depth against double-subscribing: if the user already has a live
  // Stripe subscription (incl. a Stripe-backed trial), do NOT open a second
  // checkout — that would create a duplicate subscription and bill them twice.
  // The UI already routes these users to "Manage subscription", but the server
  // is the real guard. A `canceled` sub is intentionally allowed through so a
  // lapsed user can resubscribe.
  const sub = user.subscriptionStatus;
  if (
    user.stripeSubscriptionId &&
    (sub === "active" || sub === "trialing" || sub === "past_due")
  ) {
    return NextResponse.json(
      {
        error:
          "You already have an active subscription. Manage it from the billing portal.",
      },
      { status: 409 },
    );
  }

  // Reuse or create the Stripe customer (tagged with uid for webhook fallback).
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: email ?? user.email,
      metadata: { uid },
    });
    customerId = customer.id;
    await updateSubscription(uid, { stripeCustomerId: customerId });
  }

  const now = Date.now();
  const trialEndMs = user.trialEndsAt?.toMillis?.();
  const trialEnd =
    typeof trialEndMs === "number" && trialEndMs > now + MIN_TRIAL_LEAD_MS
      ? Math.floor(trialEndMs / 1000)
      : undefined;

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    customer: customerId,
    client_reference_id: uid,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appBaseUrl}/pricing?checkout=success`,
    cancel_url: `${appBaseUrl}/pricing?checkout=cancel`,
    allow_promotion_codes: true,
  };
  if (trialEnd) params.subscription_data = { trial_end: trialEnd };

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(params);
  } catch (err) {
    console.error("[stripe/checkout] session create failed", err);
    return NextResponse.json(
      { error: "Could not start checkout. Please try again." },
      { status: 502 },
    );
  }

  after(() =>
    trackEvent({
      eventName: "checkout_started",
      uid,
      props: { priceId, trialHonored: Boolean(trialEnd) },
    }),
  );
  return NextResponse.json({ url: session.url });
}
