# Pricing Pivot — Loop Status

**Plan:** [PRICING_PIVOT_PLAN.md](../PRICING_PIVOT_PLAN.md) · **Branch:** `feat/pricing-pivot` · **Worktree:** `../chess-coach-ai-pricing`
**Last updated:** 2026-06-22 (iteration 1 — C1 shipped)
**Draft PR:** https://github.com/AayanHetam/chess-coach-ai/pull/189 (#189, dark-launched, do-not-merge)
**Remote branch:** `origin/feat/pricing-pivot` (pushed)

## Legend
☐ todo · ◐ in progress · ☑ done · ⚠ blocked

## Commits / areas
- ☑ **C1 Foundation** — stripe@22 dep, env+getStripeEnv+FREEMIUM_ENABLED, billing/config, billing/entitlement (15 tests), StoredUser fields + updateSubscription + getUserByStripeCustomerId, lib/stripe. tsc 0. Commit 681266d.
- ◐ **C2 Trial + /api/auth/me entitlement + client** — signup auto-trial (set trialStartedAt/trialEndsAt=+7d/status=trialing in createUser or signup route), me returns entitlement (entitlementForUser + getUserById), AuthContext+useEntitlement, window-focus refresh. NEXT.
  - Files: src/app/api/auth/signup/route.ts, src/lib/server/users.ts (createUser trial seed?), src/app/api/auth/me/route.ts, src/contexts/AuthContext.tsx, new src/hooks/useEntitlement.ts.
  - Read first: signup/route.ts, me/route.ts, AuthContext.tsx (fetchMe ~82-99, AuthContextType ~34-55).
- ☐ **C3 Gating + quota** — billing/gate, billing/quota, wire enhanced-analysis/chat/puzzle-chat/concept-lesson behind FREEMIUM_ENABLED. Tests.
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
