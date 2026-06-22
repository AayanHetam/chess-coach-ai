/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/server/users", () => ({
  getUserById: vi.fn(),
  getUserByStripeCustomerId: vi.fn(),
  updateSubscription: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(() => ({ customers: { retrieve: vi.fn() } })),
}));
vi.mock("@/lib/tracking/track", () => ({
  trackEvent: vi.fn().mockResolvedValue(undefined),
}));

import { handleStripeEvent } from "../handleStripeEvent";
import { getUserByStripeCustomerId, updateSubscription } from "@/lib/server/users";
import type Stripe from "stripe";

const PERIOD_END_SEC = 1_700_000_000;
const mockedByCustomer = vi.mocked(getUserByStripeCustomerId);
const mockedUpdate = vi.mocked(updateSubscription);

beforeEach(() => vi.clearAllMocks());

function evt(type: string, object: any): Stripe.Event {
  return { type, data: { object } } as unknown as Stripe.Event;
}

describe("handleStripeEvent", () => {
  it("checkout.session.completed → links customer + subscription to the uid", async () => {
    await handleStripeEvent(
      evt("checkout.session.completed", {
        client_reference_id: "u1",
        customer: "cus_1",
        subscription: "sub_1",
      }),
    );
    expect(mockedUpdate).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
      }),
    );
  });

  it("checkout.session.completed without client_reference_id → no write", async () => {
    await handleStripeEvent(
      evt("checkout.session.completed", { client_reference_id: null }),
    );
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("subscription.updated → maps status onto the resolved user", async () => {
    mockedByCustomer.mockResolvedValue({ uid: "u2", email: "a@b.c" } as any);
    await handleStripeEvent(
      evt("customer.subscription.updated", {
        id: "sub_2",
        status: "active",
        customer: "cus_2",
        cancel_at_period_end: false,
        items: { data: [{ current_period_end: PERIOD_END_SEC }] },
      }),
    );
    expect(mockedUpdate).toHaveBeenCalledWith(
      "u2",
      expect.objectContaining({ subscriptionStatus: "active", plan: "premium" }),
    );
  });

  it("never downgrades a comped (Akanksha) user", async () => {
    mockedByCustomer.mockResolvedValue({
      uid: "u3",
      email: "a@b.c",
      compedReason: "promo:AKANKSHA2026",
    } as any);
    await handleStripeEvent(
      evt("customer.subscription.deleted", {
        id: "sub_3",
        status: "canceled",
        customer: "cus_3",
        items: { data: [] },
      }),
    );
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("ignores unrelated events", async () => {
    await handleStripeEvent(evt("payment_intent.succeeded", {}));
    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});
