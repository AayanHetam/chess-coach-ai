# Legal review checklist — `/terms` (and adjacent compliance)

> **Status: the `/terms` page (`src/app/terms/page.tsx`) and the auto-renewal
> disclosures were AI-drafted from the actual product behavior as a starting
> point. They are NOT legal advice and have NOT been reviewed.** Do not treat the
> Premium launch as compliant until a qualified attorney (ideally one who does
> US internet/advertising + consumer-subscription law) has worked this list.
> Same caveat applies to `PRIVACY_POLICY_DRAFT.md` and the live `/privacy` page.

Context that shapes every item below: the operator is **based in India**, billing
**US (and potentially EU/UK/global) consumers**, the audience **includes minors**
(chess kids; Akanksha/Grandknights partner programs), Stripe is the **Merchant of
Record** (handles tax/VAT), and the product is a **$0.99/mo auto-renewing**
subscription with a **7-day no-card trial**.

## A. Must-decide (the page has no defensible default for these)
1. **Governing law / jurisdiction / dispute resolution.** The page currently
   states none. Decide the governing law, venue, and whether to include an
   arbitration + class-action-waiver clause. Non-trivial given India-operator →
   US-consumer. *Highest priority — affects enforceability of everything else.*
2. **Contracting entity.** Who is the counterparty to the user — an individual
   (sole proprietor) or a registered company? Name + contact must appear. (Stripe
   is seller-of-record for *payment* via Managed Payments, but the *service*
   contract is with you.)
3. **Refund policy** confirmed as **"final / non-refundable except where required
   by law."** Confirm this is enforceable in each market you sell to — notably the
   **EU/UK 14-day right of withdrawal** for digital services (often waivable for
   immediate digital delivery, but the waiver must be captured correctly).

## B. Minors / children (the product's biggest latent exposure)
4. **COPPA (US, under-13).** We added a "13+, under-13 needs parental
   involvement/consent" clause. Confirm the actual mechanism (age gate at signup?
   verifiable parental consent?) meets COPPA given the 2025 rule update (penalties
   up to ~$53k/violation). Cross-check what data is collected from minors via
   `/privacy` + `TRACKING_PLAN.md`.
5. **GDPR-K (EU, under-16 / member-state age)** and **India DPDP Act minors
   provisions** — if you serve those markets, confirm the age threshold + consent
   model. The single "13+" line may be insufficient outside the US.
6. **Akanksha / Grandknights comp-code cohorts** are explicitly kids — confirm the
   partner arrangement's consent/data posture.

## C. Auto-renewal / subscription law
7. **Federal ROSCA** — clear+conspicuous recurring-terms disclosure before
   billing, express consent, easy cancel. We added disclosures at the paywall +
   pricing CTAs and a self-serve Stripe portal cancel. Confirm sufficiency.
8. **California ARL** (stricter than ROSCA: separate acknowledgment, specific
   cancel-method disclosures, renewal reminders for longer terms) and **other
   state auto-renewal laws** if you have customers there. Confirm the flow meets
   the strictest applicable state.

## D. Advertising / claims (not in /terms, but same review pass)
9. **AI capability claims** — FTC "Operation AI Comply" targets unsubstantiated AI
   claims. Don't publish accuracy percentages the eval harness can't back. Review
   marketing copy for "master-level/99%-accurate" style claims.
10. **No fabricated metrics** — e.g. the launch-page "10,000+ MAU" figure (real is
    ~100). Deceptive-metric claims are an FTC §5 / Consumer Review Rule risk.
    Remove or substantiate before launch.
11. **Testimonials/reviews** — any insider/employee/intern-authored testimonial
    needs a disclosed relationship (Aug 2024 Consumer Review Rule).

## E. Liability / privacy / housekeeping
12. **Limitation of liability + "as is" warranty disclaimer** in `/terms` —
    confirm enforceable given consumer-protection limits in target markets.
13. **Privacy alignment** — `/privacy` now lists Stripe; reconcile the live page
    with `PRIVACY_POLICY_DRAFT.md` (cookie consent, retention, GPC, data-subject
    rights) and have it reviewed alongside `/terms`.
14. **Promo-code terms** — comp codes are described as limited/revocable/no-cash-
    value; confirm acceptable.

## Where the drafts live
- `src/app/terms/page.tsx` — the live ToS draft (items A, B4, C, E12, E14).
- `src/app/privacy/page.tsx` + `PRIVACY_POLICY_DRAFT.md` — privacy (item E13, B).
- Disclosure copy: `subscriptionBillingNote()` in `src/lib/billing/config.ts`,
  rendered in `PaywallDialog.tsx` + `pricing.tsx` (item C).
