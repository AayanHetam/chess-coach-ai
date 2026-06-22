# Subscription / freemium architecture

The $0.99/mo freemium pivot. Go-live steps: [STRIPE_GO_LIVE.md](STRIPE_GO_LIVE.md).

## Model
- **Free tier** (always): play, puzzles, opening explorer, scout, saved games,
  and a small daily allowance of AI-coach features.
- **Premium** ($0.99/mo): unlimited AI coach analysis, follow-up chat, puzzle
  coach, concept lessons, Mastermind grounding.
- **7-day trial**: every account gets Premium free for 7 days, no card. Started
  lazily on first authenticated `/api/auth/me` load (covers pre-pivot users too).
- **Comp**: a redeemed promo code (`AKANKSHA2026`, `GRANDKNIGHTS2026`) grants
  Premium forever, no card.

## The master switch
`FREEMIUM_ENABLED` (env, default false). When **off**, every user resolves to
premium and nothing is gated — the whole pivot is inert. A comp still works when
off (it sets `compedReason`, which entitlement honors regardless), so partner
kids get access before launch.

## Entitlement (the one mental model)
Computed **live** on every gated request and on `/api/auth/me` — never stamped
into the session JWT (billing state changes mid-session via webhook/trial
expiry; a stale claim would mis-gate). Source of truth:

- **Stripe** = billing truth → mirrored onto the Firestore user doc via webhook.
- `src/lib/billing/entitlement.ts` `computeEntitlement()` (pure) →
  `comped → active → past_due(grace) → trialing → free`.
- `src/lib/billing/access.ts` applies the `FREEMIUM_ENABLED` flag + the trial
  start. `src/lib/billing/gate.ts` `gateFeature()` is what routes call after
  `requireSession()`.

## Data
User doc (`src/lib/server/users.ts` `StoredUser`) gains: `stripeCustomerId`,
`stripeSubscriptionId`, `subscriptionStatus`, `plan`, `trialStartedAt`,
`trialEndsAt`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `compedReason`,
`compedAt`. **Server-write only** — deliberately excluded from
`profilePatchSchema` so a user can't PATCH themselves premium.

Free-tier counters: Firestore `usageCounters/{uid}_{utcDay}`, atomic via
transaction (`src/lib/billing/quota.ts`).

Promo: Supabase `promo_codes` + `promo_redemptions`, redeemed atomically via the
`redeem_promo()` Postgres function (`src/lib/promo/promoCodes.ts`).

## Surfaces
- Routes gated: `/api/enhanced-analysis`, `/api/chat`, `/api/puzzle-chat`,
  `/api/concept-lesson` (gate placed after validation/cache so failed/cached
  requests don't burn allowance).
- Stripe: `/api/stripe/{checkout,webhook,portal}`.
- Promo: `/api/promo/redeem`, `/api/admin/promo-codes[/[code]]`, `/admin/promo-codes`.
- UI: `PaywallDialog` (global, opened via `usePaywallDialog()` or the
  `triggerPaywall()` window-event bridge), `TrialBanner`, `UpgradeButton`,
  `/pricing`. Client 402 handlers in the 4 coach call sites.

## Analytics
`trackEvent()` fires: `trial_started` (implicit), `paywall_shown`,
`checkout_started`, `checkout_completed`, `subscription_active`,
`subscription_canceled`, `promo_redeemed`.
