# Puzzle Coach — Plan

Plan-only. No code yet. Per the engineering skill's "before non-trivial changes" rule, this exists so we can argue about scope and order before any of it ships.

Author: 2026-05-31. Driver: Aayan. Status: **draft, awaiting decisions on the open questions in §9.**

---

## 1. The product, in one paragraph

A chess puzzle coach that explains **why the solution works** — not just "the answer was 12.Rxd4" but "here Black's king is overloaded defending f7 and the c-file; the rook trade strips the only defender." Personalized to the user's actual attempt ("you played Bxh7+ first — that's the right tactical idea, but the move order matters because…"). Shipped in two surfaces:

1. **In-app** (chessmasti.com `/analysis`, `/practice`, and the inline chat-bubble puzzles). Already partially shipped in PRs #107 and #108.
2. **Browser extension** (Chrome + Firefox) that plugs into `chess.com/puzzles` and `lichess.org/training`. Reads the puzzle context from the page, fetches the explanation from our backend, renders it as an overlay.

The first surface is product polish. The second is distribution — every chess.com / lichess puzzle user is a potential chessmasti.com user once the extension is live.

---

## 2. Why this matters

Three things are simultaneously true:

- **Chess.com gates puzzle explanations behind Diamond ($14/mo).** Their explanations are also generic (they cover the tactical theme, not the user's actual try).
- **Lichess shows the solution but no "why."** Just an animation of the correct line.
- **Our coach already produces high-quality, personalized explanations.** PRs #107/#108 shipped the inline + /practice paths. The pipeline (Stockfish-grounded prompt + Anthropic Sonnet/Haiku + hallucination validator) is the moat. We're not building chess understanding from scratch — we're surfacing it.

The browser extension is the lever. Distribution-wise it's the difference between "people who already use chessmasti.com" and "every active chess.com/lichess puzzle user."

---

## 3. What's already shipped (don't rebuild this)

- `src/lib/prompts/puzzleExplanation.ts` — `PUZZLE_EXPLANATION_SYSTEM_PROMPT` + `buildPuzzleExplanationPrompt({fen, themes, solutionMoves, puzzleRating, solved, userAttemptedMove})`. Coach voice + structured prompt. Handles both solved and failed cases.
- `/api/chat` — accepts a single user-role message with the concatenated prompt. Returns the coach explanation. Auth-gated (`requireSession`).
- `src/components/InlinePuzzleCoach.tsx` (PR #107) — the prop-driven explainer card. Click "Coach: why this works" / "Coach: what to look for" → fetches + renders. Falls back to a local theme-keyed explainer on any non-2xx.
- `src/components/InlinePuzzleSet.tsx` — chat-bubble puzzle host, now wired to track `lastWrongMoveSan` and render `<InlinePuzzleCoach>` post-attempt.
- `src/sections/practice/PuzzleCoachExplanation.tsx` (PR #108) — same pattern on `/practice`.
- Cost dashboard tracking (PRs #86 + #96): every coach call surfaces on `/admin/cost`, including fallback events. Scaling cost is observable.
- Stockfish + hallucination validator pipeline: server-side, every coach response is cross-checked against `chess.js` board state. Won't claim "13.Rxe5 wins a pawn" if the pawn isn't there.

**What's missing** is the deeper coaching loop (§4) and the extension (§5–§6).

---

## 4. Phase 1: in-app puzzle coach polish

**Target**: 1–2 weeks of focused work. Each item is one PR, mergeable independently. Suggested order — earliest = highest impact-per-effort.

### 4.1 Auto-show coach explanation after final attempt
Currently the user has to click "Coach: why this works" to see the explanation. **Default behavior should be: auto-fetch + auto-expand once the user has finished the puzzle** (either solved OR hit `WRONG_ATTEMPTS_BEFORE_SKIP`). User can collapse it if they don't want it. Saves a click; makes the coaching feel like a natural part of the loop.

Risk: cost. Every solved puzzle = one Haiku call (~$0.0001). At current ~100 MAU + ~3 puzzles per session, ~$0.03/day. At 50k MAU it's $15/day. Live-bearable; revisit gating if it ever gets out of hand.

### 4.2 Solution-reveal animation
"Show me the solution" CTA. Animates the correct line ply-by-ply on the board — fade-in arrow from-to, ~600ms per ply. After the animation, the explanation card auto-renders. This is the "what was the solution" piece of the user's original request that's still missing from the inline UX.

Reuse the existing `lastMoveSquares` highlight mechanism. New: a queue of moves to play sequentially with timeouts. Skip button to fast-forward.

### 4.3 Variation walkthrough (not just one move)
The current explanation talks about the whole solution at once. The richer experience: a stepper widget — "Step 1 of 3: Rook to d4. Why? Black's only defender is the c-file rook…" → "Next →" → "Step 2 of 3: Black is forced to take with Qxd4…" → etc.

This needs a new prompt builder (`buildSteppedExplanationPrompt`) that asks the LLM for a structured array of `{ move, why, threat }` objects, validated server-side against the actual line. Mid-effort PR, ~1 week.

### 4.4 Streak + reinforcement
Track puzzle-solved-in-a-row count in IndexedDB. After 3 in a row: subtle "🔥 3 in a row" badge in the coach card header. After 5: confetti animation. After a miss: streak resets, no negative framing ("everyone misses sometimes — let's understand why").

Cheap, no LLM cost, big UX win for the feeling of momentum.

### 4.5 Tactical-motif library link
The coach explanation already names the theme ("This is a back-rank mate pattern"). Make that theme name a link → opens a small modal with a 2-3 puzzle mini-set on the same motif. Already have the puzzle DB (Neo4j theme queries). New UI: theme-link extractor on the LLM response → modal trigger.

### 4.6 Confidence-calibrated next puzzle
After a solved puzzle, the "Next →" button picks the next puzzle from a spaced-repetition queue (already in IndexedDB per `src/lib/spacedRepetition.ts`). Currently the inline set is a static 3-puzzle pack. Plumbing change: extend `InlinePuzzleSet` to accept a `getNextPuzzle` callback instead of a static array. Surfaces the existing SR system that's mostly unused.

### 4.7 "Coach: was my idea right?" mid-puzzle hint
For unsolved puzzles, a small "Hint" button below the board. Click → coach gives a one-line nudge ("look for a discovered attack along the a-file") **without revealing the move**. One additional LLM call per puzzle if used. New prompt: `buildPuzzleHintPrompt({fen, solution})`.

---

## 5. Phase 2: browser extension scaffolding

**Target**: 1–2 weeks. This is the moat-widening play.

### 5.1 Stack decisions
- **Manifest V3** (Chrome's mandated format from 2025; Firefox supports MV3 since v126).
- **Build tool**: `vite` + `@crxjs/vite-plugin` for the hot-reload-friendly dev loop. Familiar to the team (we already use Vite-style for the main app's Turbopack tree).
- **Single codebase, two targets**: chrome + firefox. The `@crxjs` plugin emits both manifests from one source.
- **Repo location**: monorepo it. New directory `extension/` at the repo root. Shares the `src/lib/` and `src/types/` chess primitives. Tests run in the same vitest config.

### 5.2 What ships in v1
- A content script that activates only on:
  - `chess.com/puzzles/*` (including the daily puzzle and rated puzzles)
  - `lichess.org/training/*`
- Injects a small CTA next to the puzzle board: **"Get Coach explanation"** (Ember-tinted, matches our brand). No auto-firing; opt-in click per puzzle.
- Click → extracts the FEN from the page DOM (each site exposes it differently — see §5.4) → fires `/api/og/insight/explain` or similar API → renders the response in an overlay panel anchored to the puzzle board.
- **Read-only v1**: no real-time attempt tracking. User solves the puzzle on chess.com / lichess as usual; clicks our CTA after the fact (or before, to get a hint) to see the explanation.

### 5.3 New backend surface
Build `/api/extension/explain` — auth-gated, accepts `{fen, solutionMoves?, themes?, userAttemptedMove?, source: "chess.com"|"lichess"}`. Returns `{explanation: string, motif: string}`. Same backend pipeline as the in-app coach, exposed under a route the extension can hit cross-origin (CORS allowlist for the extension's origin only — Chrome extensions get a stable `chrome-extension://<id>/` origin).

Per-request rate limiting at this surface: 5 free puzzles/day for unauthed extension users, unlimited for signed-in users. The rate limiter shares the existing pattern from CMIP submissions.

### 5.4 DOM-scrape resilience
This is the brittle part. Lichess and chess.com both change their DOMs.

- **Defensive selectors**: instead of `.puzzle-board__svg [data-fen]`, use multiple fallbacks: `data-fen` attribute, ARIA labels, even parsing the page's inline JS state.
- **Sentry breadcrumbs in the content script**: when extraction fails (no FEN found), log to Sentry with the page URL + a hash of the DOM structure. Tells us within hours when a site's DOM changes.
- **Manual override**: in the extension popup, a "Paste FEN" textarea so users can rescue themselves when the auto-extractor breaks.

### 5.5 Auth
Extension needs to know which chessmasti.com user it's acting for (for rate limiting + saving solved puzzles to spaced repetition).

- **Option A (preferred)**: read the `cm_session` cookie via the `cookies` API permission. Works because the extension can request `host_permissions` for `chessmasti.com`. User signs in on chessmasti.com → extension picks up the cookie → uses it on every API call. No new auth flow.
- **Option B (fallback)**: explicit "Connect your account" button in the extension popup that opens chessmasti.com in a new tab for OAuth-style consent. Heavier UX, only ship if Option A hits an MV3 restriction.

### 5.6 What ships in v1.5 (post-launch quick-follow)
- Real-time attempt tracking via `MutationObserver` on the move list. When the user's move is recorded by lichess / chess.com, our content script picks it up.
- Send the `userAttemptedMove` along with the explanation request → coach references the actual user move.

---

## 6. Phase 3: distribution & growth

### 6.1 Listing & launch
- Chrome Web Store + Firefox Add-ons + Edge Add-ons (free; all use the same MV3 build).
- Screenshots: one for chess.com puzzle, one for lichess puzzle, one for in-app coach explanation, one for the streak/badge UX.
- Listing copy positions on "the why" — *"Chess.com tells you the answer. We tell you why it works."*
- Initial distribution: Aayan tweets it; submit to r/chess; reach out to chess YouTube creators (Daniel Naroditsky, Hanging Pawns) for review.

### 6.2 Monetization
- **Free tier**: 5 puzzle explanations per day (per user via cookie/IP fingerprint for unauthed, per uid for signed-in).
- **Premium**: $5/mo or $40/yr. Unlimited explanations, the variation-walkthrough mode (§4.3), motif library access (§4.5), and the in-app spaced-repetition queue.
- Stripe Checkout for the subscription. The existing `users/{uid}` Firestore doc gets a `subscriptionStatus: "free" | "premium"` field; the rate limiter and feature gates read it.

The economics: at 5 free explanations/user/day, average ~$0.0005/user/day = ~$0.015/user/month. Premium at $5/mo gives a 300× margin on the LLM cost. Premium subsidizes the free tier in expectation.

### 6.3 Telemetry & feedback loop
- Every explanation served logs to `/api/admin/llm-stats` (already shipped). The dashboard already shows fallback events, cost, cache rate.
- New: extension-specific event `extension_explain_clicked` with `{ source, fen_hash }` (no PII). Sent to a lightweight `/api/telemetry/extension` endpoint. Drives the listing-store screenshots and the "we served N explanations this week" metric.
- Quality loop: a thumbs-up/down on every explanation. Flagged explanations land in Supabase's `intern_flags` table (existing CMIP plumbing) for the interns to review and mine for fine-tuning data.

---

## 7. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Chess.com / Lichess ToS violation accusation | Medium | High | Opt-in click per puzzle, no DOM scraping for game data outside the visible puzzle, no posting back to their servers. Read-only on their side. Document our position prominently in the listing. |
| Lichess / chess.com DOM changes break extraction | High | Medium | Defensive selectors + Sentry breadcrumbs + manual-FEN escape hatch (§5.4). |
| Anthropic rate-limit or outage on launch day | Medium | High | Existing fallback to OpenAI (PR #96 tracks fallbacks). Pre-warm the cache before launch. |
| Cost spike from a viral moment | Low-medium | Medium | Per-user rate limit (5/day free) + cost dashboard's burn-rate tile alerts above $5/hr trigger an admin-side daily cap. |
| LLM hallucinates a wrong chess line | Low (validator catches it) | High if it slips through | The hallucination validator (already shipped) cross-checks every coach claim against `chess.js`. Add: a periodic re-run of the validator on a sample of historical extension explanations, looking for slip-throughs. |
| Auth cookie sharing fails on Safari | Medium | Medium | Safari's MV3 extension support is partial as of 2026. v1 = Chrome + Firefox + Edge only. Safari is v2. |

---

## 8. Effort estimate (Aayan-time, assuming Claude Code assistance)

| Phase | Items | Estimate |
|---|---|---|
| Phase 1 (in-app polish) | §4.1, §4.2, §4.4 — early wins | **3–4 days** |
| Phase 1 (deeper) | §4.3, §4.5, §4.6, §4.7 | **1 week** |
| Phase 2 (extension scaffolding) | §5.1–§5.5 | **1.5–2 weeks** |
| Phase 2 (post-launch) | §5.6 real-time attempts | **3–4 days** |
| Phase 3 (launch + monetization) | §6.1, §6.2, §6.3 | **1–1.5 weeks** |
| **Total** | | **~5–7 weeks of focused work** |

Phases are mostly sequential. Phase 2 doesn't depend on every Phase 1 item — could be cleanly interleaved.

---

## 9. Open decisions (before any code ships)

1. **Phase order**: in-app polish first (Phase 1) or extension first (Phase 2)? Argument for in-app: better screenshots for the Claude for Education credit application, smaller surface, less ToS risk. Argument for extension: distribution lever, harder problem, more compounding value. **Recommendation: Phase 1 first. Have a great in-app demo before pointing extension users at it.**
2. **Free vs paid**: is the $5/mo extension premium tier worth building, or is the extension purely a chessmasti.com user-acquisition tool with no monetization on the extension surface itself? **Recommendation: free-only at launch for distribution; layer premium in only after we see usage > 10k DAU.**
3. **Branding**: "Chess Masti Coach" (consistent) or a distinct extension name like "Why It Wins" / "Chess Coach AI"? **Recommendation: Chess Masti Coach.** Brand consistency compounds.
4. **Naming the deeper variation walkthrough (§4.3)**: "Step-by-step", "Variation tour", "Why it wins". UX copy decision; defer until built.
5. **Investor framing**: is the extension part of the chessmasti.com narrative or a sibling product? Per memory (`project_investor_founder_framing.md`), chessmasti.com is the pitched product — the extension would be "a distribution channel for our core coaching engine."

---

## 10. What to do this week

If Aayan signs off on this plan:

1. **Ship §4.1** (auto-show coach after final attempt) — 1 day. Lowest-effort, highest-impact Phase 1 item.
2. **Ship §4.4** (streak + reinforcement) — 1 day. No LLM cost, pure UX win.
3. **Decide on the open questions in §9** (mostly recommendations stand; #1 and #2 need a yes/no).
4. **Spike on §5.4** (DOM scrape resilience) — half a day. Open chess.com puzzle page + lichess training page, document the most stable FEN-extraction selectors. Tells us if Phase 2 is even viable.

Phase 2 doesn't start until those four checkpoints clear.

---

## Cross-references

- **Architecture invariants**: `chess-coach-ai/.claude/skills/chess-masti-engineering/SKILL.md`. Inline puzzles in chat bubbles is locked in; the extension respects that pattern (overlay panel, not separate page).
- **Inline UX baseline**: `/preview/move-reveal` (memory note `project_move_reveal_puzzle_baseline.md`).
- **Design OS**: `project_design_os_chess_masti.md` (Obsidian Glass + Ember Core tokens). Extension UI follows these same tokens for visual consistency.
- **Existing puzzle backend**: `src/lib/chessPuzzlesService.ts`, `src/lib/puzzleRepository.ts`, Neo4j theme queries, `src/lib/spacedRepetition.ts`.

End of plan.
