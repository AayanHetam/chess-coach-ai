# PR — Close the anonymous flagship path, bound the request body

**Status:** implemented.
**Branch:** `fix/anon-flagship-exposure`
**Trigger:** Aayan asked (2026-09-01) about capping per-user analysis. The
assessment said a cap is the wrong first move and named this instead. His
answer: "start your plan, we don't need a cap."

## Why a per-user cap was not the answer

A cap keyed on a user bounds **fairness, not the bill** — it scales with MAU.
At 100 MAU a 5/month cap still permits ~$29/mo; at 10 000 MAU, ~$2 855; at the
1M-MAU goal it is unbounded. Worse, it would have been pointed at the wrong
door: `/api/enhanced-analysis` is already behind `requireSession()`. The route
with no door at all was `/api/puzzle-chat`.

It is also unenforceable today and trivially evaded: there is no durable
per-user ledger anywhere (`captureLLMCall` is a permanent no-op,
`llmStatsAggregator` is per-instance memory, `analysis_sessions` has never
received a row), and signup needs only a handle and a 10-character password —
email optional, no verification, no CAPTCHA, no throttle.

## What was actually open

`/api/puzzle-chat`, verified anonymous in production at zero cost (a
cookie-less malformed-JSON POST returned `400 Invalid JSON`, not `401`):

1. **The caller picked the model.** `tier = turnIndex === 0 ? "flagship" : "fast"`,
   and `turnIndex` is a field of the request body. Sending `0` forever pinned
   Sonnet. The schema header claimed the opposite — "the tier choice is
   server-driven via `turnIndex`, not client-supplied" — a comment that
   outlived the guarantee it described.
2. **The payload was huge.** `history` allowed 32 × 8 000 chars, and
   `llmProvider` marks only the first SYSTEM block `cache_control`, never
   `messages`. So ~64k uncached input tokens ≈ **$0.19 per anonymous request**.
3. **No brake.** The repo's only limiter was wired to `puzzle-hint` and
   `ratings/preview` — the two cheaper routes.

## What changed

- **Tier is now a server observation.** `isInitialTurn = history.length === 0
  && no typed message`. Flagship is reachable only on a genuinely initial turn,
  which is also the smallest possible prompt — so "Sonnet with a 32-turn
  history" is unreachable by construction rather than by convention. The real
  client already calls it exactly this way (`PuzzleCoachPanel` fires turn 0
  only when `turns.length === 0`, with no `userMessage`), so no behaviour
  changes. `turnIndex` survives as a prompt depth hint, clamped to ≥1 whenever
  history exists, and the claimed value is logged beside the effective one.
- **`maxTokens` follows the same derivation** — it was also reading the
  client's `turnIndex`.
- **Total history budget** of 32 000 chars, alongside the existing per-turn
  cap. Sized ~25% above the largest realistic session (32 turns bounded by the
  route's own 350–600 output budget and `userMessage`'s 2 000), so it cannot
  truncate a real conversation while cutting the abusive worst case 8×.
- **Courtesy throttle** on `puzzle-chat`, the same 20/60s per IP that
  `puzzle-hint` uses, applied *before* body parsing. Honest about what it is:
  `ipRateLimit` documents itself as per-warm-instance and "NOT a security
  control". It stops a naive single-source script; a real limiter still needs a
  shared store.
- **`moveHistory` bounded** — was an unbounded array of unbounded strings, and
  the contract builder replays it move by move, so it bought CPU too. Now
  ≤1 000 plies of ≤16 chars: far above the longest recorded master game
  (~269 moves = 538 plies).
- **`/api/chat` `max_tokens` clamped** to the server's own 3 000. `chatSchema`
  allowed 16 000 and the route forwarded it verbatim, so the caller set its own
  output bill. The `temperature` on the line above was already clamped for
  exactly this reason. `InlinePuzzleCoach` asks for 800 and is unaffected.

Combined, the anonymous worst case drops from ~$0.19 per request to roughly
$0.008 — Haiku on a bounded prompt — about 24×.

## Tests

`puzzle-chat/__tests__/tierCannotBeForced.test.ts` pins the exploit closed:
`turnIndex: 0` with a history gets Haiku, a genuine initial turn gets Sonnet,
the output budget follows, oversized history is refused, a realistic 32-turn
session still passes, and the throttle returns 429 *before* the provider call.
`validation/__tests__/requestBounds.test.ts` pins the `moveHistory` caps.

Four mutants were confirmed to fail these tests before they were trusted:
tier back on the client's `turnIndex` (the original exploit — fails 2),
`maxTokens` back on it, throttle removed, total-history budget removed. Plus a
fifth on `moveHistory`.

## Deliberately not done

- **A shared-store limiter (Upstash/Redis).** The honest fix for durable rate
  limiting, and still the deferred Phase 3 work. Nothing here pretends
  otherwise.
- **A global daily spend circuit-breaker.** This is the only mechanism that
  bounds the bill regardless of user count, and the one that would actually
  have caught the 2026-08-19 exhaustion. It needs a durable counter and a
  refusal path distinct from the deliberate `AI_COACH_DISABLED` pause, so it is
  its own PR — next.
- **Signup hardening** (email verification / CAPTCHA / throttle). Relevant only
  once something is keyed on account identity.
