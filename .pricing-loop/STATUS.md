# Pricing Pivot — Loop Status

**Plan:** [PRICING_PIVOT_PLAN.md](../PRICING_PIVOT_PLAN.md) · **Branch:** `feat/pricing-pivot` · **Worktree:** `../chess-coach-ai-pricing`
**Last updated:** 2026-06-22 (iteration 2 — C2 shipped)
**Draft PR:** https://github.com/AayanHetam/chess-coach-ai/pull/189 (#189, dark-launched, do-not-merge)
**Remote branch:** `origin/feat/pricing-pivot` (pushed)

## Legend
☐ todo · ◐ in progress · ☑ done · ⚠ blocked

## Commits / areas
- ☑ **C1 Foundation** — stripe@22 dep, env+getStripeEnv+FREEMIUM_ENABLED, billing/config, billing/entitlement (15 tests), StoredUser fields + updateSubscription + getUserByStripeCustomerId, lib/stripe. tsc 0. Commit 681266d.
- ☑ **C2 Trial + /api/auth/me entitlement + client** — billing/access.ts (resolveEntitlement+master switch, startTrialIfEligible LAZY in /me, gated on flag so dark-launch doesn't burn trials), applyFreemiumFlag (OFF⇒everyone premium), /me returns live entitlement, AuthContext+entitlement+focus-refresh, useEntitlement() fails-open. 18 tests, tsc 0. Commit 4feade2.
  - DECISION: trial started lazily in /me (covers new + existing users), NOT at signup. Trial-start + enforcement both no-op when FREEMIUM_ENABLED=false.
- ◐ **C3 Gating + quota** — NEXT. billing/gate.ts (requirePremium(user,feature)→null|402Response, consumes quota), billing/quota.ts (daily Firestore counters: checkAndConsumeQuota(uid,feature)→{allowed,remaining}; collection `usageCounters` doc `${uid}_${yyyymmdd}` w/ FieldValue.increment). Wire 4 routes AFTER requireSession: enhanced-analysis (POST ~1153), chat (POST ~51 — re-check tier every call, no tier in contextId cache), puzzle-chat (POST ~31, currently NO auth — add requireSession), concept-lesson (POST ~81). 402 body {error,code:'premium_required'|'quota_exhausted',feature,trialDaysRemaining?}. All gating no-ops when !freemiumEnabled. trackEvent('paywall_shown') server-side. Tests for gate+quota.
  - Read first: each route POST head + how requireSession used (insights/route.ts is the template); src/lib/tracking/track.ts trackEvent sig + after() usage.
- ☐ **C4 Stripe checkout/webhook/portal** — routes + sync lib. Tests.
- ☐ **C5 Paywall UI** — PaywallDialogContext+dialog, TrialBanner, UpgradeButton, /pricing, client 402 handlers.
- ☐ **C6 Promo** — supabase migration+seed, /api/promo/redeem, admin api+page, redeem UI. Tests.
- ☐ **C7 AEO copy + docs** — 5 free pages, docs/SUBSCRIPTION.md, docs/STRIPE_GO_LIVE.md, CLAUDE.md. Final tsc+build.
- ☐ **Deliver** — push branch, open draft PR to main (--repo AayanHetam/chess-coach-ai).

## Verification gates
- tsc baseline GREEN at start (exit 0, 2026-06-22).
- Each commit must keep `npx tsc --noEmit` green.

## Notes / decisions log
- 2026-06-22: scoped via 8-agent code map; provider=Stripe, model=freemium, promo=AKANKSHA2026 shared, dark-launch flag FREEMIUM_ENABLED default false. Worktree created off origin/main 32e0610.
