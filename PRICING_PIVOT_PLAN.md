# Pricing Pivot — $0.99/mo Freemium + 7-Day Trial + Akanksha Promo

**Branch:** `feat/pricing-pivot` (isolated git worktree at `../chess-coach-ai-pricing`)
**Started:** 2026-06-22 · **Owner:** Aayan · **Built by:** autonomous loop (max effort)
**Delivery:** test-mode code, dark-launched behind a flag, opened as a draft PR for Aayan to review + merge. I cannot create the Stripe account, set live keys, or charge real cards — those are in the go-live checklist.

---

## 1. Product decisions (locked with Aayan 2026-06-22)

| Decision | Choice |
|---|---|
| Provider | **Stripe** (USD, $0.99/mo) |
| Model | **Freemium** — 7-day trial unlocks premium; after, premium locks, core stays free |
| Trial | Auto-started at signup, **no card**. Card requested at the 1-week mark (or anytime user upgrades). |
| Promo | **One shared code** (`AKANKSHA2026`) → free-forever ("comped"), no card. Admin can rotate / cap / revoke. |
| Free tier | Core stays free forever (play, puzzles, opening explorer, scout, game save/load) + a small **daily allowance** of AI-coach features so the AEO "free AI coach" promise stays truthful. |
| Premium | Unlimited AI Coach (enhanced-analysis), follow-up chat, puzzle coach, concept lessons, Mastermind validators. |
| Launch safety | Everything ships behind `FREEMIUM_ENABLED` (default **false**). When false, every user is treated as premium → **zero behavior change** until Aayan flips the flag + sets live keys. |

## 2. What "premium" vs "free" means (from the code map)

PREMIUM (gated when `FREEMIUM_ENABLED` and user is free + over quota):
- `/api/enhanced-analysis` (AI game review) — client: `AnalysisImpl.tsx`, `AICoachChat.tsx`
- `/api/chat` (follow-up coach chat) — client: `AICoachChat.tsx`
- `/api/puzzle-chat` (puzzle coach) — client: `PuzzleCoachPanel.tsx`  *(currently NO auth — must add session gate)*
- `/api/concept-lesson` (micro-lessons) — client: `ConceptLessonCard.tsx`
- Mastermind validators inside enhanced-analysis (premium-only fact grounding)

FREE (never gated):
- `/api/puzzle-feed`, `/api/chess-puzzles-dataset`, `/api/adaptive-puzzles`, `/api/games`, `/api/scout(s)`, `/api/opening-explorer`, `/api/commentary-by-fen`

Free daily allowance (config, tunable): `3` game analyses, `15` coach messages, `3` puzzle-coach explanations, `1` concept lesson per day. Premium/trial/comped = unlimited.

## 3. Architecture

**Source of truth:** Stripe = billing truth; **Firestore user record = mirrored entitlement state** (fast gating). Entitlement is **computed live** from the Firestore record on each `/api/auth/me` and each gated route — NOT stamped into the JWT (avoids the staleness bug that affects `isIntern`/`isAdmin`). *(Deviation from the map's "stamp into JWT" suggestion — justified: billing state changes mid-session via webhook; live-compute is correct. Documented per feedback_plan_deviations.)*

**New `StoredUser` fields** (`src/lib/server/users.ts`):
`stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus` (`none|trialing|active|past_due|canceled`), `plan` (`free|premium`), `trialStartedAt`, `trialEndsAt`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `compedReason`, `compedAt` (all optional Timestamps/strings).

**`computeEntitlement(user, now)`** → `{ tier: 'free'|'premium', isPremium, reason: 'comped'|'active'|'trialing'|'expired'|'none', trialEndsAt, status, currentPeriodEnd }`:
1. `compedReason` set → premium (forever).
2. status `active`/`past_due` and now < currentPeriodEnd(+grace) → premium.
3. status `trialing` and now < trialEndsAt → premium (trial).
4. else → free.

## 4. Stripe flows

- **Signup** → set `trialStartedAt=now`, `trialEndsAt=now+7d`, `subscriptionStatus='trialing'`. No Stripe customer yet (no card).
- **Upgrade / day-7 prompt** → `POST /api/stripe/checkout` creates a Checkout Session (`mode=subscription`, `client_reference_id=uid`, line item = `STRIPE_PRICE_ID`). If `trialEndsAt` is still future, pass `subscription_data.trial_end` so they're not charged until day 7. Returns redirect URL.
- **Webhook** `POST /api/stripe/webhook` (raw body, `constructEvent`): handle `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed` → look up user by `client_reference_id`/`stripeCustomerId` → `updateUser()` with mirrored fields + `trackEvent`.
- **Manage/cancel** → `POST /api/stripe/portal` → Stripe Billing Portal session.
- **Idempotency:** webhook is the only writer of `subscriptionStatus` from Stripe events; checkout stores `stripeCustomerId` on success.

## 5. Promo (Akanksha)

- Supabase tables (mirror intern pattern, service-role): `promo_codes` (code, kind, max_redemptions, redemption_count, revoked_at, note, created_at) + `promo_redemptions` (uid, code, redeemed_at) for audit + double-redeem prevention. Seed `AKANKSHA2026`.
- `POST /api/promo/redeem` (auth'd): validate (exists, not revoked, under cap, not already redeemed by this uid) → set user `compedReason='promo:AKANKSHA2026'`, `compedAt`, `plan='premium'` → increment count → `trackEvent('promo_redeemed')`. **No card required.**
- Admin: `/api/admin/promo-codes` (GET/POST) + `/api/admin/promo-codes/[code]` (PUT revoke/cap) guarded by `requireAdmin()`; page `src/pages/admin/promo-codes/index.tsx`.
- Redemption UI: field in PaywallDialog ("Have a promo code?") + standalone `/redeem` page.

## 6. UI (mirror glass AuthDialog)

- `PaywallDialogContext` + `GlobalPaywallDialog` (copy AuthDialog glass tokens: blur 20px, rgba dark fill, 1px white-alpha border, orange `#F97316/#FB923C` accents only, Framer entrance 280ms ease `[0.22,0.61,0.36,1]`). Mount in `src/sections/layout/index.tsx` inside ThemeProvider (both route branches).
- `TrialBanner` (days-left, sticky glass) + `UpgradeButton`.
- `/pricing` page (Free vs Premium $0.99, promo redeem).
- Client 402/403 handlers in `AnalysisImpl.tsx`, `AICoachChat.tsx`, `PuzzleCoachPanel.tsx`, `ConceptLessonCard.tsx` → `openPaywallDialog()` + `trackEvent('paywall_shown')`.
- `AuthContext` exposes `entitlement`; `useEntitlement()` hook; window-focus refresh of `/api/auth/me`.

## 7. AEO copy (5 pages) — keep "free to start / free tier", drop "no subscription ever"

`free-ai-chess-coach`, `best-free-ai-chess-coach`, `free-chess-coach-for-beginners`, `free-chess-analysis`, `ai-chess-coach-for-india`. Reframe "no paywall / fully free / no subscription" → "free to start, generous free tier, premium $0.99/mo". Truthful + preserves SEO.

## 8. Env additions (`src/env.ts` + `.env.example`)

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `FREEMIUM_ENABLED` (flag), `STRIPE_PORTAL_RETURN_URL`/base URL. Add `getStripeEnv()` getter + `assertStripeSecrets()`; validate at boot only when flag on. Add Stripe section to `.env.example`. Reuse `CMIP_DASHBOARD_ADMIN_EMAIL` for promo admin.

## 9. Build order (commits on `feat/pricing-pivot`; grouped into review areas in the PR)

- **C1 Foundation**: `stripe` dep, env + `getStripeEnv`, `src/lib/billing/{config,entitlement}.ts`, StoredUser fields + `UpdateUserPatch` + validation, `src/lib/stripe.ts`. Tests. *(no behavior change)*
- **C2 Trial + me + client entitlement**: signup auto-trial, `/api/auth/me` returns entitlement, AuthContext + `useEntitlement`, focus refresh.
- **C3 Gating + quota**: `src/lib/billing/{gate,quota}.ts`, wire 4 routes behind `FREEMIUM_ENABLED`, 402 bodies. Tests.
- **C4 Stripe checkout/webhook/portal** + sync lib. Tests.
- **C5 Paywall UI** + client 402 handlers + `/pricing`.
- **C6 Promo**: migration + seed + redeem API + admin API/page + redeem UI. Tests.
- **C7 AEO copy + docs**: 5 pages + `docs/SUBSCRIPTION.md` + `docs/STRIPE_GO_LIVE.md` + CLAUDE.md row. Final tsc + build.

Delivery: push branch, open **draft PR** to `main` (`--repo AayanHetam/chess-coach-ai`) with a review guide grouping C1–C7. Offer to split into stacked PRs if preferred. **Never merge** (Aayan merges).

## 10. Go-live checklist (Aayan — in `docs/STRIPE_GO_LIVE.md`)

1. Create Stripe account; create Product "Chess Masti Premium", recurring price **$0.99/mo** → copy `price_…` → `STRIPE_PRICE_ID`.
2. Get `sk_…`, `pk_…`; add webhook endpoint `…/api/stripe/webhook` → copy `whsec_…`.
3. Set the 4 Stripe vars + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in Vercel (prod + preview).
4. Run the Supabase promo migration; confirm `AKANKSHA2026` seeded.
5. Set `FREEMIUM_ENABLED=true` to enforce. (Leave false to keep everyone premium.)
6. Test in Stripe test mode (4242 card) → trial → day-7 charge → portal cancel → promo comp.

## 11. Risks / open

- `puzzle-chat` currently anonymous → gating may break anonymous solvers; allowance covers signed-in only, anonymous gets a sign-in prompt under flag.
- `/api/chat` context cache could let a free user reuse a premium context → re-check tier every call (no tier in cache key).
- Cost at 1M MAU unchanged by this work; pricing math lives in AEO_GROWTH_PLAN.
- Worktree symlinks `node_modules` + `.env.local` from main checkout.

## 12. Loop protocol

State lives in `.pricing-loop/STATUS.md` (source of truth across iterations/summaries). Each iteration: read STATUS → do next commit/area → `npx tsc --noEmit` + `vitest run` the touched tests → commit → update STATUS → schedule next wakeup. Adversarially review billing logic (C3/C4/C6) before committing. Stop when C7 done + branch pushed + draft PR opened, then post a final summary.
