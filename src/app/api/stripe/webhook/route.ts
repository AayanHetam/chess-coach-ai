import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { assertStripeSecrets, getStripeEnv } from "@/env";
import { handleStripeEvent } from "@/lib/billing/handleStripeEvent";

export const runtime = "nodejs";

/**
 * Stripe webhook. Verifies the signature against the RAW body (must not be
 * JSON-parsed first — the HMAC is over the exact bytes), then delegates to the
 * testable handleStripeEvent(). Returns 200 once verified+handled; 500 on a
 * handler throw so Stripe retries the (transient) failure.
 */
export async function POST(request: NextRequest) {
  try {
    assertStripeSecrets({ needsWebhook: true });
  } catch (err) {
    console.error("[stripe/webhook]", err);
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const { webhookSecret } = getStripeEnv();
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[stripe/webhook] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    console.error(`[stripe/webhook] handler failed for ${event.type}`, err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
