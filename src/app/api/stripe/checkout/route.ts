import { NextResponse, after } from "next/server";
import type Stripe from "stripe";
import { requireSession } from "@/lib/auth/session";
import { assertStripeSecrets, getStripeEnv, getBillingEnv } from "@/env";
import { getStripe } from "@/lib/stripe";
import { getUserById, updateSubscription } from "@/lib/server/users";
import { trackEvent } from "@/lib/tracking/track";

export const runtime = "nodejs";

// Stripe requires checkout subscription trial_end to be ≥48h out; we add a 1h
// margin so request latency + the s-floor below can't land us just under the
// line (Stripe would reject it). Under the threshold we just charge at checkout
// (the day-7 prompt case).
const MIN_TRIAL_LEAD_MS = 49 * 60 * 60 * 1000;

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
