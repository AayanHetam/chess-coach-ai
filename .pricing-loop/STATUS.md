# Pricing Pivot — Loop Status

**Plan:** [PRICING_PIVOT_PLAN.md](../PRICING_PIVOT_PLAN.md) · **Branch:** `feat/pricing-pivot` · **Worktree:** `../chess-coach-ai-pricing`
**Last updated:** 2026-06-22 (iteration 5 — C5 shipped)
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
- ☑ **C5 Paywall UI** — PaywallDialogContext+glass PaywallDialog (mounted in layout both branches), triggerPaywall() window-event bridge (non-React helpers open paywall on 402), TrialBanner, UpgradeButton, /pricing (Pages Router: Free vs Premium, checkout+portal+redeem), AuthContext.refresh(), client 402 handlers in all 4 coach call sites. tsc 0, suite 1312, BUILD OK (/pricing prerendered). Commit 8dc4199.
  - NOTE: /pricing redeem form already POSTs /api/promo/redeem (C6 adds endpoint). PaywallDialog "Have a promo code?" → /pricing#redeem. UpgradeButton built but not mounted in nav (optional polish).
- ◐ **C6 Promo** — NEXT. Financially-sensitive → adversarial review before commit. (a) Supabase migration supabase/migrations/<date>_create_promo_codes.sql: promo_codes (id uuid pk, code text unique, kind text default 'comp_lifetime', max_redemptions int null, redemption_count int default 0, revoked_at timestamptz null, note text, created_at) + promo_redemptions (id, code text, uid text, redeemed_at; unique(code,uid)) + seed AKANKSHA2026. (b) src/lib/promo/* server lib using getInternSupabase() (service-role) — redeemPromo(uid, code): validate exists+!revoked+(max null OR count<max)+not already redeemed by uid (unique constraint), then updateSubscription(uid,{compedReason:'promo:CODE',compedAt,plan:'premium'}) + insert redemption + increment count atomically. (c) /api/promo/redeem (auth'd POST {code}) → trackEvent('promo_redeemed'). (d) /api/admin/promo-codes GET+POST + /api/admin/promo-codes/[code] PUT(revoke/cap) via requireAdmin(). (e) src/pages/admin/promo-codes/index.tsx (mirror src/pages/admin/intern-data/index.tsx + useViewer isAdmin). Tests for redeem validation logic.
  - Read first: src/lib/intern/supabase.ts + allowlist.ts (supabase pattern), src/app/api/admin/intern-data/roster/route.ts (requireAdmin template), src/pages/admin/intern-data/index.tsx (admin page template), existing supabase/migrations/ files for SQL style. Promo constants in src/lib/billing/config.ts (PROMO.AKANKSHA_CODE, compedReasonForCode). Concurrency: prevent double-redeem via unique(code,uid) + handle 23505.
- ☐ **C7 AEO copy + docs** — 5 free pages, docs/SUBSCRIPTION.md, docs/STRIPE_GO_LIVE.md, CLAUDE.md. Final tsc+build.
- ☐ **Deliver** — push branch, open draft PR to main (--repo AayanHetam/chess-coach-ai).

## Verification gates
- tsc baseline GREEN at start (exit 0, 2026-06-22).
- Each commit must keep `npx tsc --noEmit` green.

## Notes / decisions log
- 2026-06-22: scoped via 8-agent code map; provider=Stripe, model=freemium, promo=AKANKSHA2026 shared, dark-launch flag FREEMIUM_ENABLED default false. Worktree created off origin/main 32e0610.
