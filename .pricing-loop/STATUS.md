# Pricing Pivot — Loop Status

**Plan:** [PRICING_PIVOT_PLAN.md](../PRICING_PIVOT_PLAN.md) · **Branch:** `feat/pricing-pivot` · **Worktree:** `../chess-coach-ai-pricing`
**Last updated:** 2026-06-22 (iteration 4 — C4 shipped)
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
- ☑ **C4 Stripe checkout/webhook/portal** — /api/stripe/{checkout,webhook,portal} + handleStripeEvent + syncStripeSubscription (dahlia: current_period_end from items[0]; trial_end→trialEndsAt). Adversarial-reviewed (raw-body sig OK, no-pay-no-premium OK, comped guard OK; fixed trial-clock + 48h margin). 14 tests, full suite 1312 green, tsc 0. Commit 3e4654a. All new+dormant.
  - DEFERRED: invoice.* events not handled (subscription.updated covers status). Webhook tested at unit level; e2e via Stripe CLI is in go-live doc.
- ◐ **C5 Paywall UI** — NEXT. Good Workflow candidate (parallel UI drafting). Build: src/contexts/PaywallDialogContext.tsx + src/components/paywall/PaywallDialog.tsx (MIRROR src/components/auth/AuthDialog.tsx glass: blur 20px, rgba dark, 1px white-alpha border, orange #F97316/#FB923C accents, Framer 280ms ease [0.22,0.61,0.36,1]; forwardRef ModalChild). Mount GlobalPaywallDialog in src/sections/layout/index.tsx INSIDE ThemeProvider (both glass + standard branches; see isGlassRoute pattern). src/components/TrialBanner.tsx (days from useEntitlement().trialDaysRemaining, only when freemiumEnabled && isOnTrial), UpgradeButton, /pricing page (src/app/pricing/page.tsx or pages/ — check router; Free vs Premium $0.99, Upgrade btn→POST /api/stripe/checkout→redirect url, Manage→POST /api/stripe/portal). Client 402 handlers: AnalysisImpl.tsx (~682), AICoachChat.tsx (~2494), PuzzleCoachPanel.tsx (~212), ConceptLessonCard.tsx (~39) → on res.status===402 openPaywallDialog()+client trackEvent. useEntitlement already built.
  - Read first: src/components/auth/AuthDialog.tsx + AuthDialogContext.tsx (full), src/sections/layout/index.tsx (mount points + isGlassRoute), each client call site's fetch error handling. Apply design-OS glass tokens (memory). Pricing page router: app vs pages — admin pages are Pages Router; landing/marketing under src/app. Confirm.
- ☐ **C6 Promo** — supabase migration+seed, /api/promo/redeem, admin api+page, redeem UI. Tests.
- ☐ **C7 AEO copy + docs** — 5 free pages, docs/SUBSCRIPTION.md, docs/STRIPE_GO_LIVE.md, CLAUDE.md. Final tsc+build.
- ☐ **Deliver** — push branch, open draft PR to main (--repo AayanHetam/chess-coach-ai).

## Verification gates
- tsc baseline GREEN at start (exit 0, 2026-06-22).
- Each commit must keep `npx tsc --noEmit` green.

## Notes / decisions log
- 2026-06-22: scoped via 8-agent code map; provider=Stripe, model=freemium, promo=AKANKSHA2026 shared, dark-launch flag FREEMIUM_ENABLED default false. Worktree created off origin/main 32e0610.
