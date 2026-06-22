# Pricing Pivot — Loop Status

**Plan:** [PRICING_PIVOT_PLAN.md](../PRICING_PIVOT_PLAN.md) · **Branch:** `feat/pricing-pivot` · **Worktree:** `../chess-coach-ai-pricing`
**Last updated:** 2026-06-22 (iteration 3 — C3 shipped)
**Draft PR:** https://github.com/AayanHetam/chess-coach-ai/pull/189 (#189, dark-launched, do-not-merge)
**Remote branch:** `origin/feat/pricing-pivot` (pushed)

## Legend
☐ todo · ◐ in progress · ☑ done · ⚠ blocked

## Commits / areas
- ☑ **C1 Foundation** — stripe@22 dep, env+getStripeEnv+FREEMIUM_ENABLED, billing/config, billing/entitlement (15 tests), StoredUser fields + updateSubscription + getUserByStripeCustomerId, lib/stripe. tsc 0. Commit 681266d.
- ☑ **C2 Trial + /api/auth/me entitlement + client** — billing/access.ts (resolveEntitlement+master switch, startTrialIfEligible LAZY in /me, gated on flag so dark-launch doesn't burn trials), applyFreemiumFlag (OFF⇒everyone premium), /me returns live entitlement, AuthContext+entitlement+focus-refresh, useEntitlement() fails-open. 18 tests, tsc 0. Commit 4feade2.
  - DECISION: trial started lazily in /me (covers new + existing users), NOT at signup. Trial-start + enforcement both no-op when FREEMIUM_ENABLED=false.
- ☑ **C3 Gating + quota** — billing/gate.ts (gateFeature→ok|402, flag-OFF zero work), billing/quota.ts (atomic Firestore txn, fails-open). Wired all 4 routes AFTER validation/cache (no over-consume). puzzle-chat anonymous when OFF. Adversarial-reviewed (active=premium fix; 400/cache over-consume fixed). 25 billing tests, full suite 1298 green, tsc 0. Commit 4edbcd3.
  - DEFERRED minors (noted, accepted): quota fails-open on Firestore error (by design); enhanced-analysis double getUserById when flag ON (minor); usageCounters docs have no TTL cleanup (add cron later).
- ◐ **C4 Stripe checkout/webhook/portal** — NEXT. /api/stripe/checkout (auth'd: assertStripeSecrets, create Customer if none→store stripeCustomerId, Checkout Session mode=subscription, line price=STRIPE_PRICE_ID, client_reference_id=uid, subscription_data.trial_end=trialEndsAt if future so card-at-day-7 honored, success/cancel urls from appBaseUrl). /api/stripe/webhook (runtime nodejs, raw body via request.text(), constructEvent w/ STRIPE_WEBHOOK_SECRET; handle checkout.session.completed, customer.subscription.created|updated|deleted, invoice.paid, invoice.payment_failed → updateSubscription via getUserByStripeCustomerId/client_reference_id; trackEvent subscription_active/canceled). /api/stripe/portal (billing portal session). billing/syncStripeSubscription.ts: pure map Stripe.Subscription→SubscriptionPatch (status,currentPeriodEnd,cancelAtPeriodEnd,plan,stripeSubscriptionId). Tests: webhook mapping (mock constructEvent) + sync pure fn.
  - Use getStripe() (src/lib/stripe.ts), getStripeEnv(), updateSubscription/getUserByStripeCustomerId (already built). Stripe SDK 22.2.2.
- ☐ **C5 Paywall UI** — PaywallDialogContext+dialog, TrialBanner, UpgradeButton, /pricing, client 402 handlers.
- ☐ **C6 Promo** — supabase migration+seed, /api/promo/redeem, admin api+page, redeem UI. Tests.
- ☐ **C7 AEO copy + docs** — 5 free pages, docs/SUBSCRIPTION.md, docs/STRIPE_GO_LIVE.md, CLAUDE.md. Final tsc+build.
- ☐ **Deliver** — push branch, open draft PR to main (--repo AayanHetam/chess-coach-ai).

## Verification gates
- tsc baseline GREEN at start (exit 0, 2026-06-22).
- Each commit must keep `npx tsc --noEmit` green.

## Notes / decisions log
- 2026-06-22: scoped via 8-agent code map; provider=Stripe, model=freemium, promo=AKANKSHA2026 shared, dark-launch flag FREEMIUM_ENABLED default false. Worktree created off origin/main 32e0610.
