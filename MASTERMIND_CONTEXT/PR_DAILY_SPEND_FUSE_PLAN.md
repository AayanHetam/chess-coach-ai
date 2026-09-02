# PR — Daily spend fuse (ships disarmed)

**Status:** implemented, shipped **default-off**.
**Branch:** `feat/daily-spend-fuse`
**Follows:** #469 (closed the anonymous flagship path).

## Why this and not a per-user cap

Aayan asked about capping per-user analysis. A per-user cap bounds **fairness,
not the bill** — it scales with users, so the number that protects a $50 bill
at 100 MAU protects nothing at 10 000, and nothing at all at the 1M-MAU goal.
This is the only brake whose protection does not degrade as the product grows.

It is also the brake that was missing on 2026-08-19: the Anthropic balance hit
zero with nothing watching, and the coach stayed dark for a month. **The outage
cost more than the bill did.** A ceiling you chose, that degrades loudly at a
number you picked, strictly dominates a balance that hits zero at a number the
month picked for you.

## Design, and the three choices that matter

**Default OFF.** With `DAILY_AI_BUDGET_USD` unset there is no ceiling and the
module only keeps a counter. Arming later is an env change, not a deploy — and
a bug here cannot take the coach down before anyone has chosen a number.

**Fails OPEN.** Firestore unreachable, slow, or returning junk ⇒ log loudly and
allow the call. A cost fuse that fails closed converts a storage blip into the
exact outage we just spent a month escaping. It is a backstop against a
runaway, not an accountant. A bad env value (`"abc"`, `"0"`, `"-5"`) disarms it
for the same reason.

**Approximate on purpose.** The day's total is read through a 60s per-process
cache and written fire-and-forget, so with several warm instances the real
ceiling overshoots by roughly (instances × 60s × burn rate). The alternative —
a synchronous read-modify-write on every call — puts Firestore in the latency
path of every coach reply to make a backstop precise. Local spend is added to
the cache immediately, so a burst inside one window still trips it.

## Where it hooks

- **Refusal** at the route: the existing
  `if (isAiDisabled()) return aiDisabledResponse();` line in all seven
  LLM-spending routes becomes `await aiRefusal()`, which checks the deliberate
  pause first and then the ceiling. Keeping it at the route is what lets the
  refusal be *honest* — see below.

  `aiRefusal` lives in a NEW server-only module (`lib/coach/aiGate.ts`), not in
  `aiAvailability`, and that split is load-bearing rather than tidy. The first
  attempt put it in `aiAvailability`, which is imported by CLIENT components
  for `isAiDisabledPublic()` — so `firebase-admin` landed in the browser bundle
  and `npm run build` died on `Can't resolve 'fs' / 'http2' / 'net'` with a
  completely clean `tsc`. That is the build gate earning its place; `tsc` alone
  would have shipped it.
- **Accounting** in the funnel: `account()` wraps the three places an
  `LLMResult` is actually constructed in `llmProvider` (two non-streaming
  provider calls plus the streaming `done`). Deliberately NOT per-route:
  `recordLLMCall` is a per-route convention and only two of seven routes ever
  adopted it, which is exactly how this rots. Never throws, never awaits.

## A third refusal state

`AI_PROVIDER_UNAVAILABLE` means "broke, retry may help".
`AI_TEMPORARILY_DISABLED` means "switched off for days".
Neither is true of a ceiling, so **`AI_DAILY_BUDGET_REACHED`** (503,
`Retry-After: 3600`) says the coach is fine and comes back tomorrow. This
matters beyond copy: the hourly heartbeat treats the deliberate pause as OK, so
without a distinct code a tripped fuse would be indistinguishable from a
healthy pause — the alarm would stay green through a spend emergency.

## Tests

`spendFuse.test.ts` (15) pins disarmed-by-default, never-refuses-while-disarmed
(and never even reads the store), fail-open, bad-value-disarms, trips within one
refresh window, one read per burst, day key in UTC, and pricing including
"unknown model returns 0 rather than inventing a price".

`everyLlmRouteIsGuarded.test.ts` is a source scan asserting every route that
calls `callLLM`/`callLLMStream` runs `aiRefusal` — with the health probes
explicitly exempt, because `/api/health/llm` is how you find out the provider is
reachable and a ceiling must not switch off the instrument that says when to
raise it. It carries a canary so it cannot pass vacuously.

Three mutants confirmed to fail these before they were trusted: one route drops
the gate, the fuse never trips, the fuse fails closed.

## Local suite note

The local full run shows 3 failing files; the **control run on unmodified
`main` shows 5** (the CPU-heavy contract/referee suites plus `courses/probes`,
which alone takes 244s in isolation and passes there). These are the
parallel-contention flakes `vitest.config.ts` already documents, not
regressions. CI on a clean machine is the gate.

## To arm it

Set `DAILY_AI_BUDGET_USD` in Vercel Production. Sizing: a flagship review is
~$0.057 all-in after #464/#465, and the whole measured history of `llm_calls`
is 105 calls. Something like $5–$25/day is 2–3 orders of magnitude above
current burn — a fuse, not a budget. Watch for `AI_DAILY_BUDGET_REACHED` in the
logs before tightening.
