# Pricing pivot — go-live checklist

Everything in the `feat/pricing-pivot` branch (PR #189) ships **dark**: with
`FREEMIUM_ENABLED` unset/false, nothing is gated and no money moves. This doc is
the exact sequence to turn it on. None of it can be done from the codebase — it
needs your Stripe + Supabase accounts.

> Order matters: do steps 1–6 in **test mode** first, verify, then repeat 1–3
> with live keys and flip the flag.

## 1. Create the Stripe product + price
1. Stripe Dashboard → **sandbox / Test mode** (toggle, top right).
2. Products → **Add product**: name `Chess Masti Premium`.
3. **Product tax code**: search the picker and pick **"Software as a service (SaaS) — personal use"**. Do NOT pick an education code (it can trigger exemptions that under-collect tax).
4. Pricing: **Recurring**, **$0.99 USD / month**.
5. **Tax behavior → "Inclusive of tax"** — the $0.99 is all-in everywhere (required for EU/UK consumer display; no checkout surprise). ⚠️ This is **sticky**: once a price is used you can't flip inclusive↔exclusive, you must create a new price. Confirm before copying the id.
6. Save. Copy the price id (`price_…`) → this is `STRIPE_PRICE_ID`.
   - Verify from the CLI: `stripe prices retrieve <price_id>` → expect `"tax_behavior": "inclusive"`, `"unit_amount": 99`.

## 2. Get API keys
- Developers → API keys → copy **Secret key** (`sk_test_…`) → `STRIPE_SECRET_KEY`.
- Copy **Publishable key** (`pk_test_…`) → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

## 3. Add the webhook
1. Developers → Webhooks → **Add endpoint**.
2. URL: `https://chessmasti.com/api/stripe/webhook` (or your preview URL).
3. Events to send (minimum):
   `checkout.session.completed`,
   `customer.subscription.created`,
   `customer.subscription.updated`,
   `customer.subscription.deleted`.
4. Copy the **Signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.

> **Local testing doesn't need a dashboard endpoint.** Run
> `stripe listen --forward-to localhost:3000/api/stripe/webhook` — it prints its
> own `whsec_…` (use that for local) and tunnels events to your dev server. Only
> create the dashboard endpoint for deployed (preview/live) environments. The
> dashboard webhook secret differs from the CLI one — keep them straight.

## 4. Set the env vars in Vercel
Project → Settings → Environment Variables (Production **and** Preview):

| Var | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` (then `sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `STRIPE_PRICE_ID` | `price_…` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` (then `pk_live_…`) — needs a redeploy to bake into the bundle |
| `FREEMIUM_ENABLED` | leave unset for now |

## 5. Run the Supabase promo migration
The two comp codes (`AKANKSHA2026`, `GRANDKNIGHTS2026`) live in Supabase (same
project as CMIP — `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`).

Run `supabase/migrations/20260622090000_promo_codes.sql` against that project
(Supabase Dashboard → SQL editor → paste + run, or `supabase db push`). It
creates `promo_codes` + `promo_redemptions` + the `redeem_promo()` function and
seeds both codes. Verify: `select code, redemption_count from promo_codes;`.

You can mint/cap/revoke more codes at **`/admin/promo-codes`** (signed in as
`CMIP_DASHBOARD_ADMIN_EMAIL`).

## 6. Test in Stripe test mode (before flipping the flag)
With test keys set, set `FREEMIUM_ENABLED=true` on a **preview** deploy and:
1. **Trial** — new signup → `/api/auth/me` shows `entitlement.reason: "trialing"`, trial banner shows days left.
2. **Quota** — as a (simulated) post-trial free user, exhaust the daily allowance → the paywall dialog appears on the next AI-coach call.
3. **Checkout** — click Upgrade → Stripe Checkout → pay with test card `4242 4242 4242 4242`, any future expiry/CVC → redirected back to `/pricing?checkout=success` → entitlement flips to premium.
4. **Webhook** — `stripe listen --forward-to localhost:3000/api/stripe/webhook` (or check the dashboard webhook log) shows `customer.subscription.created` → user doc `subscriptionStatus: active`.
5. **Portal** — `/pricing` → Manage subscription → cancel → webhook sets `cancelAtPeriodEnd`/`canceled`.
6. **Promo** — `/pricing#redeem` → enter `AKANKSHA2026` → user becomes comped (premium forever); re-entering it is idempotent.

## 7. Go live
1. Repeat steps 1–4 with **live** Stripe keys (`sk_live_…`, `pk_live_…`, a live webhook + its `whsec_…`).
2. Set `FREEMIUM_ENABLED=true` in Production.
3. Redeploy (so `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is baked in).
4. Smoke-test one real upgrade + one promo redemption.

## 3b. Managed Payments, Billing Portal & statement descriptor
These aren't optional — the cancel flow and tax handling depend on them.

- **Managed Payments (Merchant of Record)** — in onboarding we chose *"Stripe does it"*. Stripe becomes liable for global **sales tax + VAT** and calculates/remits it (the big de-risk for an India-based founder billing US/EU). Costs ~3.5% per charge (≈3.5¢ on $0.99 — trivial). Finish the **"Get started with Managed Payments"** setup-guide step or tax won't actually calculate. Requires a business **origin address** set.
- **Billing Portal** (Settings → Billing → Customer portal) — enable **"Cancel subscriptions"**, set **"Cancel at end of billing period"** (keeps paid access until period end → matches our entitlement + `/terms`). Do NOT add a retention/save-offer step (dark-pattern / ROSCA risk). A non-blocking "cancellation reason" survey is fine. **Per-mode**: configure it in test AND again in live.
- **Statement descriptor** (Settings → Payments) — set `CHESSMASTI` so the card line isn't a mystery charge (FTC sore point). Under Managed Payments / MoR, Stripe may prefix its own entity — verify on a real charge that your name appears.
- **Webhook events to subscribe (live endpoint)**: exactly `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` — the only four the code handles.

## Verified in sandbox (2026-06-22) + gotchas that bit us
Full checkout→cancel loop was run end-to-end in the ChessMasti sandbox with the
Stripe CLI; every webhook returned `[200]`. Specifics worth keeping:

- **Trial is honored, no charge today** — checkout with a future `trial_end` fires `setup_intent.*` + `payment_method.attached` (card saved for later) and a **$0 `invoice.paid`**, not a real charge. Checkout shows "N days free, then $0.99 starting {date}".
- **API `2026-05-27.dahlia` moved fields:**
  - `current_period_end` is on `subscription.items[0]`, **not** the subscription (already handled in `syncStripeSubscription.currentPeriodEndMs`).
  - **Portal "cancel at period end" sets `cancel_at` (a timestamp) + `canceled_at`, and leaves `cancel_at_period_end: false`.** Reading the boolean alone misses portal cancels — `syncStripeSubscription` now treats `cancel_at_period_end || cancel_at != null` as scheduled-to-cancel. If you see a "cancelled but app shows active subscription" report after a Stripe upgrade, check this first.
- **Stripe-backed trial vs local no-card trial** are both `status: "trialing"`; only a `stripeSubscriptionId` distinguishes them (`entitlement.hasStripeSubscription`). The checkout route 409s an already-subscribed user to prevent a duplicate subscription / double-billing.
- **Resend a processed event for re-testing**: `stripe events resend <evt_id>` (re-runs the webhook against current code).
- **Stripe CLI install**: `brew install stripe/stripe-cli/stripe` failed on outdated Command Line Tools → used the **prebuilt binary** from the GitHub release into `/opt/homebrew/bin/stripe`.

## Tested via Stripe test clock (2026-06-22)
The **paid `active` → scheduled-cancel → `canceled`** path was validated with a
test clock: a no-trial subscription created `status: active` with a real $0.99
charge; setting `cancel_at_period_end` populated `cancel_at` too (dahlia); after
advancing the clock past the period end the subscription went `canceled`. Our
`mapStripeStatus` + `cancel_at`-aware mirror handle every state. (A test clock
uses a fresh customer, so this validates Stripe mechanics + webhook resilience,
not a real user's Firestore mirror — see below.)

## Still not validated (do at go-live)
- **Real-user mirror on the paid path** — a real signed-in user converting from
  trial to a charged `active` sub and cancelling. Can't be done with a test clock
  (you can't move an existing customer onto a clock); confirm at the live smoke
  test (step 7).
- Real **live-mode** charge with a real card (step 7 smoke test).

## Rollback
Set `FREEMIUM_ENABLED=false` (or unset) and redeploy → every user is treated as
premium again, instantly, no data migration. Existing subscriptions keep
billing in Stripe until you cancel them there.

## Notes / what's intentionally deferred
- `invoice.*` webhook events aren't handled — `customer.subscription.updated`
  already carries the `past_due`/`active` status, so entitlement stays correct.
- `usageCounters` Firestore docs (free-tier daily counters) have no TTL cleanup
  yet — add a cron later if the collection grows.
- The AEO/landing pages were softened from "fully free forever" to
  "free to start"; revisit them when you flip the flag if you want explicit
  Premium pricing on the marketing pages.
