# Privacy Policy — DRAFT

> **⚠️ DRAFT — NOT YET LEGAL-REVIEWED. NOT LEGAL ADVICE.**
> This was drafted by Claude (2026-06-13) from the codebase's actual data flows as a
> *starting point*. Before publishing it on chessmasti.com you must have it reviewed by
> someone qualified — **especially the Children's Privacy section**, because the audience
> includes minors and that triggers COPPA (US/FTC) and GDPR-K obligations a self-drafted
> policy does not satisfy on its own. Replace every **[BRACKETED]** placeholder.
> See [TRACKING_PLAN.md](TRACKING_PLAN.md) §4 for the technical controls behind these promises.

**Effective date:** [DATE]
**Last updated:** [DATE]

## 1. Who we are

Chess Masti ("we", "us") operates **chessmasti.com**, an AI chess-coaching service. For privacy
questions or to exercise your rights, contact us at **[privacy@chessmasti.com]**.

## 2. What we collect

**Account information** (when you sign up): email address, display name, a securely hashed
password (we never store your password in plain text), and — if you sign in with Google —
your Google account ID and profile photo. Optionally: a short bio, your Chess.com / Lichess
usernames, self-reported rating, and coaching preferences (coach tone, playing style, study
goals, favorite openings, board theme).

**Your chess activity** (to provide the service): games you save or import (PGN/FEN), positions
you analyze, and puzzle attempts.

**AI conversation content** (with your consent / under our Terms): the questions you ask the AI
coach and the coach's responses, together with the chess position and game they relate to. We
store these to operate the coach, improve answer quality, and debug errors.

**Usage and device information** (only with your consent — see Cookies below): pages you view,
features you use, puzzle and analysis activity, your browser type (user-agent), referring page,
and an **irreversibly hashed** form of your IP address. We do **not** store your raw IP address.

## 3. How we use your information

- To provide, operate, and personalize the coaching service.
- To improve answer quality and fix bugs (including reviewing AI conversations).
- To understand product usage in aggregate (analytics) — only with consent.
- For security, fraud prevention, and to meet legal obligations.

We do **not** sell your personal information, and we do not use your conversations to train
third-party advertising models.

## 4. Legal bases (EEA/UK users)

Performance of our contract with you (providing the service); your consent (analytics cookies
and behavioral tracking); and our legitimate interests (security, debugging, improving the
service), balanced against your rights.

## 5. Cookies and tracking

- **Strictly necessary** (always on): a signed session cookie (`cm_session`) that keeps you
  signed in, and a small cookie recording your consent choice (`cm_consent`).
- **Analytics / product** (only after you accept): an anonymous identifier and event beacons
  that tell us how the product is used.

On your first visit we show a consent banner — **Accept all**, **Reject non-essential**, or
**Manage**. If you reject, we use only strictly-necessary cookies. We also honor the
**Global Privacy Control (GPC)** signal as an opt-out of analytics and any sharing.

## 6. Who we share data with (service providers)

We share data only with vendors that process it on our behalf:

- **Anthropic** (Claude) — processes your chess questions to generate coaching responses.
  (We may use **OpenAI** as a fallback AI provider if our primary provider is unavailable.)
- **Supabase** — database hosting for usage events and stored AI conversations.
- **Google Firebase / Google Analytics** — account storage and (with consent) analytics.
- **Vercel** — application hosting and basic performance analytics.
- **Resend** — sending account emails (e.g. password resets).
- **Lichess / Chess.com** — only if you choose to connect or import games from them.

## 7. How long we keep it

- **Usage events, analytics, and AI conversation logs:** **1 year**, then automatically deleted.
- **Account data and saved games:** kept while your account is active; deleted on request or a
  reasonable period after account closure.

## 8. Your rights

Depending on where you live (GDPR, UK GDPR, CCPA/CPRA, and others), you may have the right to
access, correct, delete, or export your data, to withdraw consent, and to opt out of sale/sharing
(we do not sell data). To exercise any of these, contact **[privacy@chessmasti.com]**. Account
deletion purges your associated usage events, AI conversations, puzzle attempts, and analysis
records.

## 9. Children's privacy

[**REVIEW CAREFULLY — placeholder posture, confirm with counsel.**]

Chess Masti is intended for users aged **[13]** and over. We ask for date of birth at sign-up.
If you are under 13 (or the minimum age in your country), we place your account in a
**restricted mode**: behavioral analytics and retention of AI conversations are disabled unless
we obtain verifiable parental consent in accordance with COPPA. If you believe a child under 13
has provided personal information without parental consent, contact **[privacy@chessmasti.com]**
and we will delete it.

## 10. Security

We use hashed passwords, encrypted transport (HTTPS), service-role-only access to analytics
data, and IP hashing. No method of transmission or storage is 100% secure.

## 11. International transfers

Your information may be processed in the United States and other countries where our service
providers operate, with appropriate safeguards where required.

## 12. Changes

We may update this policy; we will revise the "Last updated" date and, for material changes,
provide a more prominent notice.

## 13. Contact

**[privacy@chessmasti.com]** — [mailing address, if required for your jurisdiction].
