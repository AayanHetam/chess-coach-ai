/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
  mapStripeStatus,
  subscriptionToPatch,
  currentPeriodEndMs,
  customerIdOf,
} from "../syncStripeSubscription";
import type Stripe from "stripe";

const PERIOD_END_SEC = 1_700_000_000;

function sub(over: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_123",
    status: "active",
    customer: "cus_123",
    cancel_at_period_end: false,
    items: { data: [{ current_period_end: PERIOD_END_SEC }] },
    ...over,
  } as unknown as Stripe.Subscription;
}

describe("mapStripeStatus", () => {
  it("maps all 8 Stripe statuses to our 5-state mirror", () => {
    expect(mapStripeStatus("active")).toBe("active");
    expect(mapStripeStatus("trialing")).toBe("trialing");
    expect(mapStripeStatus("past_due")).toBe("past_due");
    expect(mapStripeStatus("canceled")).toBe("canceled");
    expect(mapStripeStatus("unpaid")).toBe("canceled");
    expect(mapStripeStatus("incomplete_expired")).toBe("canceled");
    expect(mapStripeStatus("paused")).toBe("canceled");
    expect(mapStripeStatus("incomplete")).toBe("none");
  });
});

describe("currentPeriodEndMs", () => {
  it("reads items[0].current_period_end and converts s→ms", () => {
    expect(currentPeriodEndMs(sub())).toBe(PERIOD_END_SEC * 1000);
  });
  it("returns null when there is no item", () => {
    expect(currentPeriodEndMs(sub({ items: { data: [] } as any }))).toBeNull();
  });
});

describe("customerIdOf", () => {
  it("handles string, object, and missing customer", () => {
    expect(customerIdOf(sub())).toBe("cus_123");
    expect(customerIdOf(sub({ customer: { id: "cus_x" } as any }))).toBe("cus_x");
    expect(customerIdOf(sub({ customer: null as any }))).toBeNull();
  });
});

describe("subscriptionToPatch", () => {
  it("active → premium with period end + ids", () => {
    const p = subscriptionToPatch(sub());
    expect(p.subscriptionStatus).toBe("active");
    expect(p.plan).toBe("premium");
    expect(p.stripeSubscriptionId).toBe("sub_123");
    expect(p.stripeCustomerId).toBe("cus_123");
    expect(p.cancelAtPeriodEnd).toBe(false);
    expect(p.currentPeriodEnd?.toMillis()).toBe(PERIOD_END_SEC * 1000);
  });

  it("trialing → premium plan", () => {
    expect(subscriptionToPatch(sub({ status: "trialing" })).plan).toBe("premium");
  });

  it("past_due → premium plan (grace handled downstream)", () => {
    expect(subscriptionToPatch(sub({ status: "past_due" })).plan).toBe("premium");
  });

  it("canceled → free plan", () => {
    const p = subscriptionToPatch(sub({ status: "canceled" }));
    expect(p.plan).toBe("free");
    expect(p.subscriptionStatus).toBe("canceled");
  });

  it("carries cancel_at_period_end through", () => {
    expect(
      subscriptionToPatch(sub({ cancel_at_period_end: true })).cancelAtPeriodEnd,
    ).toBe(true);
  });

  it("treats a `cancel_at` timestamp as a scheduled cancel (dahlia portal cancel)", () => {
    // The Customer Portal's "cancel at end of billing period" on API
    // 2026-05-27.dahlia sets `cancel_at` and leaves `cancel_at_period_end`
    // false — reading the boolean alone would miss the cancellation entirely.
    const p = subscriptionToPatch(
      sub({
        status: "trialing",
        cancel_at: PERIOD_END_SEC,
        cancel_at_period_end: false,
      }),
    );
    expect(p.cancelAtPeriodEnd).toBe(true);
    expect(p.subscriptionStatus).toBe("trialing"); // still premium until then
  });
});
