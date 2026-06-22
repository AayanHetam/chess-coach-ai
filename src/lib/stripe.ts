import Stripe from "stripe";
import { getStripeEnv } from "@/env";

let cached: Stripe | null = null;

/**
 * Lazily-constructed Stripe client singleton. Lazy (not a module-level const)
 * so importing this file never crashes a deploy that hasn't set keys yet — the
 * throw only fires when a Stripe route actually runs. The SDK's bundled API
 * version is intentionally not pinned here so SDK upgrades pick it up.
 * Tests reset the cache via __resetStripeForTests().
 */
export function getStripe(): Stripe {
  if (cached) return cached;
  const { secretKey } = getStripeEnv();
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured (see docs/STRIPE_GO_LIVE.md)",
    );
  }
  cached = new Stripe(secretKey, {
    appInfo: { name: "chessmasti", url: "https://chessmasti.com" },
  });
  return cached;
}

export function __resetStripeForTests(): void {
  cached = null;
}
