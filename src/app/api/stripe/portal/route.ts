import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { assertStripeSecrets, getBillingEnv } from "@/env";
import { getStripe } from "@/lib/stripe";
import { getUserById } from "@/lib/server/users";

export const runtime = "nodejs";

/**
 * Open the Stripe Billing Portal so a subscriber can update their card, view
 * invoices, or cancel. Requires an existing Stripe customer (i.e. they've been
 * through checkout at least once).
 */
export async function POST() {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  try {
    assertStripeSecrets();
  } catch (err) {
    console.error("[stripe/portal]", err);
    return NextResponse.json(
      { error: "Billing is not configured yet." },
      { status: 503 },
    );
  }

  const user = await getUserById(guard.session.uid);
  if (!user?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No billing account yet — subscribe first." },
      { status: 400 },
    );
  }

  const { appBaseUrl } = getBillingEnv();
  try {
    const portal = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appBaseUrl}/pricing`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    console.error("[stripe/portal] session create failed", err);
    return NextResponse.json(
      { error: "Could not open billing portal. Please try again." },
      { status: 502 },
    );
  }
}
