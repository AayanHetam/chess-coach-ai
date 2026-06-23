import { describe, it, expect } from "vitest";
import {
  applyFreemiumFlag,
  computeEntitlement,
  entitlementForUser,
  trialDaysRemaining,
} from "../entitlement";
import { PAST_DUE_GRACE_MS } from "../config";

const NOW = 1_700_000_000_000; // fixed epoch ms — no Date.now() in tests
const DAY = 24 * 60 * 60 * 1000;

describe("computeEntitlement", () => {
  it("comped → premium forever regardless of status/dates", () => {
    const e = computeEntitlement(
      { compedReason: "promo:AKANKSHA2026", status: "none" },
      NOW,
    );
    expect(e).toMatchObject({
      tier: "premium",
      isPremium: true,
      reason: "comped",
      comped: true,
    });
  });

  it("active with no period end → premium", () => {
    const e = computeEntitlement({ status: "active" }, NOW);
    expect(e.isPremium).toBe(true);
    expect(e.reason).toBe("active");
  });

  it("active with future period end → premium", () => {
    const e = computeEntitlement(
      { status: "active", currentPeriodEndMs: NOW + DAY },
      NOW,
    );
    expect(e.isPremium).toBe(true);
  });

  it("active with a lagging/past period end → still premium (status is authoritative)", () => {
    // Renewal webhook hasn't advanced currentPeriodEnd yet; the paying user
    // must NOT be downgraded.
    const e = computeEntitlement(
      { status: "active", currentPeriodEndMs: NOW - DAY },
      NOW,
    );
    expect(e.isPremium).toBe(true);
    expect(e.reason).toBe("active");
  });

  it("past_due within grace → premium(grace)", () => {
    const e = computeEntitlement(
      { status: "past_due", currentPeriodEndMs: NOW - DAY },
      NOW,
    );
    expect(e.isPremium).toBe(true);
    expect(e.reason).toBe("grace");
  });

  it("past_due beyond grace → free", () => {
    const e = computeEntitlement(
      { status: "past_due", currentPeriodEndMs: NOW - PAST_DUE_GRACE_MS - DAY },
      NOW,
    );
    expect(e.isPremium).toBe(false);
  });

  it("trialing not expired → premium(trialing)", () => {
    const e = computeEntitlement(
      { status: "trialing", trialEndsAtMs: NOW + 2 * DAY },
      NOW,
    );
    expect(e.isPremium).toBe(true);
    expect(e.reason).toBe("trialing");
  });

  it("trialing expired → free/expired", () => {
    const e = computeEntitlement(
      { status: "trialing", trialEndsAtMs: NOW - DAY },
      NOW,
    );
    expect(e.isPremium).toBe(false);
    expect(e.reason).toBe("expired");
  });

  it("none → free/none", () => {
    const e = computeEntitlement({ status: "none" }, NOW);
    expect(e).toMatchObject({ tier: "free", isPremium: false, reason: "none" });
  });

  it("canceled → free/expired", () => {
    const e = computeEntitlement({ status: "canceled" }, NOW);
    expect(e.isPremium).toBe(false);
    expect(e.reason).toBe("expired");
  });

  it("hasStripeSubscription reflects a stripeSubscriptionId", () => {
    // No Stripe sub yet (e.g. local no-card trial) → false.
    const local = computeEntitlement(
      { status: "trialing", trialEndsAtMs: NOW + 2 * DAY },
      NOW,
    );
    expect(local.hasStripeSubscription).toBe(false);

    // Stripe-backed trial: still trialing/premium, but a subscription exists →
    // true, so the UI shows "Manage subscription" not "Upgrade"/"Keep Premium".
    const stripeTrial = computeEntitlement(
      {
        status: "trialing",
        trialEndsAtMs: NOW + 2 * DAY,
        stripeSubscriptionId: "sub_123",
      },
      NOW,
    );
    expect(stripeTrial.isPremium).toBe(true);
    expect(stripeTrial.reason).toBe("trialing");
    expect(stripeTrial.hasStripeSubscription).toBe(true);
  });

  it("carries cancelAtPeriodEnd (premium stays, just scheduled to end)", () => {
    const plain = computeEntitlement({ status: "active" }, NOW);
    expect(plain.cancelAtPeriodEnd).toBe(false);

    const ending = computeEntitlement(
      { status: "active", currentPeriodEndMs: NOW + 5 * DAY, cancelAtPeriodEnd: true },
      NOW,
    );
    expect(ending.isPremium).toBe(true); // access holds until period end
    expect(ending.cancelAtPeriodEnd).toBe(true);
  });
});

describe("entitlementForUser (Timestamp adapter)", () => {
  it("reads toMillis() off Timestamp-like fields", () => {
    const e = entitlementForUser(
      {
        subscriptionStatus: "trialing",
        trialEndsAt: { toMillis: () => NOW + DAY },
      },
      NOW,
    );
    expect(e.isPremium).toBe(true);
    expect(e.trialEndsAt).toBe(NOW + DAY);
  });

  it("comped user is premium", () => {
    const e = entitlementForUser({ compedReason: "promo:AKANKSHA2026" }, NOW);
    expect(e.comped).toBe(true);
    expect(e.isPremium).toBe(true);
  });

  it("missing fields → free/none", () => {
    const e = entitlementForUser({}, NOW);
    expect(e.isPremium).toBe(false);
    expect(e.reason).toBe("none");
  });

  it("surfaces hasStripeSubscription from the user doc", () => {
    expect(entitlementForUser({}, NOW).hasStripeSubscription).toBe(false);
    const e = entitlementForUser(
      {
        subscriptionStatus: "trialing",
        trialEndsAt: { toMillis: () => NOW + DAY },
        stripeSubscriptionId: "sub_abc",
      },
      NOW,
    );
    expect(e.hasStripeSubscription).toBe(true);
  });
});

describe("applyFreemiumFlag (dark-launch master switch)", () => {
  it("flag OFF → a free user becomes premium (no paywall pre-launch)", () => {
    const free = computeEntitlement({ status: "none" }, NOW);
    expect(free.isPremium).toBe(false);
    const masked = applyFreemiumFlag(free, false);
    expect(masked.isPremium).toBe(true);
    expect(masked.tier).toBe("premium");
    expect(masked.reason).toBe("active");
  });

  it("flag OFF → comped user stays comped/premium", () => {
    const comped = computeEntitlement({ compedReason: "promo:AKANKSHA2026" }, NOW);
    const masked = applyFreemiumFlag(comped, false);
    expect(masked.isPremium).toBe(true);
    expect(masked.reason).toBe("comped");
  });

  it("flag ON → entitlement passes through unchanged", () => {
    const free = computeEntitlement({ status: "none" }, NOW);
    expect(applyFreemiumFlag(free, true)).toEqual(free);
  });
});

describe("trialDaysRemaining", () => {
  it("ceils partial days", () => {
    expect(trialDaysRemaining({ trialEndsAt: NOW + DAY + 1 }, NOW)).toBe(2);
    expect(trialDaysRemaining({ trialEndsAt: NOW + DAY }, NOW)).toBe(1);
  });
  it("floors at 0 when past or null", () => {
    expect(trialDaysRemaining({ trialEndsAt: NOW - DAY }, NOW)).toBe(0);
    expect(trialDaysRemaining({ trialEndsAt: null }, NOW)).toBe(0);
  });
});
