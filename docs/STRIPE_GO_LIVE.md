# Pricing pivot — go-live checklist

Everything in the `feat/pricing-pivot` branch (PR #189) ships **dark**: with
`FREEMIUM_ENABLED` unset/false, nothing is gated and no money moves. This doc is
the exact sequence to turn it on. None of it can be done from the codebase — it
needs your Stripe + Supabase accounts.

> Order matters: do steps 1–6 in **test mode** first, verify, then repeat 1–3
> with live keys and flip the flag.

## 1. Create the Stripe product + price
1. Stripe Dashboard → **Test mode** (toggle, top right).
2. Products → **Add product**: name `Chess Masti Premium`.
3. Pricing: **Recurring**, **$0.99 USD / month**. Save.
4. Copy the price id (`price_…`) → this is `STRIPE_PRICE_ID`.

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
