# Coach Accuracy Fix Plan

**Date:** 2026-07-05 · **Companion to:** [COACH_ARCHITECTURE_AND_ACCURACY_AUDIT.md](./COACH_ARCHITECTURE_AND_ACCURACY_AUDIT.md)
**Goal:** close every hole the audit found, in impact order, with each workstream shipping as an independently-verifiable PR. Defect numbers (#N) reference the audit's §3 census.

## STATUS — all seven workstreams SHIPPED to main (2026-07-05, overnight autonomous run)

| PR | Workstream | GitHub | State |
|---|---|---|---|
| A | Truth fixes (chessdb labels, DTM units, Black-mate, sortLines, sentinel, positionalClaim degraded mode, Maia /predict repoint) | #209 | ✅ merged |
| B | Enforcement on streamed game_review (post-stream surgical correction, severity-aware gating) | #211 | ✅ merged |
| C | Haiku follow-up surface (per-turn relational facts, current-FEN chat schema, uid-scoped contextId) | #210 | ✅ merged |
| D | Cache hygiene (moveHistory key, no placeholder/fallback caching, contextId on hits) | #213 | ✅ merged |
| E | Measurement resurrection (vendored fixtures, CI validator gate, fresh flagship numbers) | #212 | ✅ merged |
| F | Prompt integrity 3.6 (opening-rule dedup, dead BOOK_* branch, marketing claim, SAN-truncation note) | #214 | ✅ merged |
| G | Dead-code + hardening (in-process puzzle recs, env trims, temperature clamp, dead-file removal) | #215 | ✅ merged |

Every PR verified locally (`tsc --noEmit` + `next build` + `vitest`, plus the deterministic validator gate) and merged on green CI. **Fresh accuracy numbers (claude-sonnet-4-6, first since the June model swap): ChessQA short_tactics 24% → 96% (+72pp) with grounding; motifs 48% → 48% (detector layer still the lever); 2×2 factual Haiku 2.44 ungrounded → 4.36 grounded.** Founder-gated items below (Lc0 deploy, TRACKING_ENABLED flip, depth-16 default, contract-architecture inversion) remain deliberately unshipped.

## Ground rules

- Every PR: `tsc --noEmit` + `next build` + `vitest` locally before push (standing rule: don't make CI the first failure-detection layer). New logic gets unit tests.
- No fix ships "on faith": each PR states how we'll know it worked (test, fixture, or measured number). The measurement PR (E) exists so the others can be judged.
- Prompt changes bump `PROMPT_VERSION` (cache invalidation).
- Anything touching prod infra state (Supabase SQL, env flags, service deploys) is **staged but not flipped** — flag flips remain founder-only, consistent with existing go-live discipline.

---

## PR-A — "Stop lying to the model" (truth fixes) — P1, low risk, high win

Fixes #8, #9(partial), #12, #13, #14, #15, #16(doc), #29, and the positionalClaim false-fire arm of #11.

| Change | File | Detail |
|---|---|---|
| chessdb outcome labels | `src/lib/grounding/chessdb.ts` | `scoreToOutcome`: \|cp\|<50 → "balanced"; 50–199 → "slightly better for side to move" (never "draw"); fix `chessdbResultToContext` wording so prompt text matches the eval it quotes |
| Syzygy DTM units at injection | `src/app/api/enhanced-analysis/route.ts:1464`, `src/lib/grounding/voter.ts:224` | convert signed plies → full moves (`Math.ceil(Math.abs(dtm)/2)`) with side annotation, same normalization the validator already uses |
| Mate-for-Black grounding | `src/lib/grounding/voter.ts:116-120` | sign-aware mate handling (`mate !== 0`, direction checked against side); align the chessdb-outcome AND-condition to the same perspective |
| `sortLines` mate comparator | `src/lib/engine/helpers/parseResults.ts:61-63` | mixed-sign mate ordering: for the side to move, +mate beats cp beats −mate; add table-driven unit test |
| Timeout sentinel | `src/lib/engine/uciEngine.ts:335-338` + consumers | mark stalled positions `{unavailable: true}`; exclude from mistake detection and narrate as "(engine data unavailable for this move)" instead of fake 0.00 |
| Misleading "Lc0 not consulted" line | `src/lib/grounding/voter.ts:271-276` | emit the medium-confidence caveat in the correct branch |
| positionalClaim degraded mode | `src/lib/mastermind/validators/positionalClaim.ts` | when Lc0 is unconfigured, strong positional phrases validate against an SF band (\|cp\|≥300 passes) instead of an unreachable two-engine HIGH — stops guaranteed warn-fires and regen burns |
| Eval-perspective note on flagship path | `src/app/api/enhanced-analysis/route.ts` (MOVE-BY-MOVE header) | one header line: "All evals in pawns from White's perspective" |
| Doc/typo traps | `src/lib/grounding/maia.ts:53`, escapability header | fix the copy-paste doc claims so future editors aren't misled |

**Verify:** new unit tests per change; `validator-gate-dryrun` still green; prompt-snapshot test showing corrected chessdb/DTM text.

## PR-B — "Enforcement where users are" (the P0 hole) — highest impact

Fixes #1, #2(scoped), #3, #4(partial), #31; uses existing client `metadata.corrected` support.

1. **Post-stream enforcement on the game_review streaming wing** (`route.ts:1698-1889`): await the async snapshot + run the full log-only bundle as today, but when validators find **errors** (not warns), run the cheap Haiku surgical-edit path (already built, `regenerate.ts:254-307`) against the streamed text and emit the corrected text via the existing `metadata.corrected` mechanism the client already renders (AICoachChat.tsx:2592-2600). Warns → append the *specific* per-issue footnotes (the `footnotes` string exists and is currently discarded, #31/aiResponseValidator.ts:72-76) instead of nothing.
2. **Extend Stage-9/eval validators to game_review in correction mode** — not the blunt regen loop (the per-claim-anchoring concern that got this deferred applies to *regeneration*, not to targeted surgical edits + footnotes).
3. **Fail-open → fail-visible**: when evalClaim/relationalClaim parsers throw, don't silently pass — mark the turn `validation: "degraded"` in telemetry and (position-anchored categories only) append the generic disclaimer.
4. **Move-suggestion validation against the right board** (#31): resolve "best was X at move N" claims against the ply-anchored `relationalFenMap` (already built for relationalClaim) instead of the final FEN; stop score-penalizing long correct reviews.

**Verify:** fixture suite — 6 known-bad streamed reviews (invented pin, wrong mate distance, phantom material win, wrong-square piece, stale suggestion, correct-control) asserting corrected/footnoted output; latency budget test (correction path adds ≤1 Haiku call post-stream).

## PR-C — "Fix the Haiku surface" (most user turns)

Fixes #18, #19, #20; the audit's §3.4.

1. **Give follow-ups the facts the prompt demands**: inject `buildRelationalFacts` (chess.js oracle, cheap) for the discussed position into the condensed context so the v3.5 hard constraint is satisfiable.
2. **Un-freeze the position**: add optional `fen` (+ `moveIndex`) to `chatSchema`; client sends the currently-displayed board; server rebuilds `buildCurrentPositionFacts` + relational facts for *that* FEN and validates against it. Fallback to analysis-time FEN when absent.
3. **Scope contextId per user**: mix session uid into `generateContextId`; on lookup mismatch → rebuild rather than serve someone else's persona/analysis.
4. **Flag-off false disclaimers** (#19 tail): apply the same category-based suppression the flag-on wing has.

**Verify:** unit tests on context assembly; manual SSE probe: navigate to move 12, ask "what should I play here" → response references move-12 board.

## PR-D — "Cache hygiene"

Fixes #22, #23, #24.

1. Never `setCachedResponse` when `timedOut` or `finalOutcome === "fallback"` — both wings + chat.
2. Key `responseCache` on `md5(moveHistory)` in addition to final FEN (kills wrong-game narration + transposition collisions).
3. Cache hits return a `contextId` (store it with the payload; re-`storeAnalysisContext` on hit) so follow-ups stay on the cheap path.
4. (Deferred, noted: move both caches to a shared store — Vercel KV/Upstash — separate infra PR.)

**Verify:** unit tests for cache key + skip conditions; integration test that a cache hit still yields a working follow-up contextId.

## PR-E — "Measurement resurrection" (the standing capability)

Fixes #32-35. Without this, nothing else is provable.

1. **Vendor fixtures into the repo** (`scripts/eval/fixtures/`): pinned ChessQA subsets (CC-licensed, CSSLab) + the v3.2/v3.5 prompt snapshots + a `requirements.txt`; kill every `/tmp` dependency. Add `tsx` as a devDependency.
2. **Re-run Track A (short_tactics + motifs) and the 2×2 on `claude-sonnet-4-6`** — first accuracy numbers for the model actually in production; commit results JSON with model/date stamped.
3. **CI gate**: `validator-gate-dryrun` (deterministic, no network) into the test workflow; eval harness smoke (`--dry-run`) so bit-rot fails loudly.
4. **Judge hygiene**: 2×2 judge switched to a non-generator model tier or dual-judge (note in results which judge); keep n small but repeat-run (2 seeds) so sign-flips like Track B's are visible.
5. **Prod telemetry staging**: commit the Supabase `SETUP.sql` verification script + a documented go-live checklist; **no flag flip** (consent-gated, founder-only).

**Verify:** CI green with the new gate; fresh results JSONs in `scripts/eval/results/` with `claude-sonnet-4-6` stamps.

## PR-F — "Prompt integrity 3.6"

Fixes #26-28, #30, and the marketing-claim line; bumps `PROMPT_VERSION` to 3.6.

- One canonical opening-move policy (blunders/misses always covered; otherwise skip moves 1-10) replacing the four contradictory rules.
- Delete the dead `BOOK_SOLID/BOOK_DUBIOUS` branch; make `[MAIA_CONTINUATION]` conditional on Maia data presence.
- Replace the "200,000+ REAL PUZZLES / Neo4j" assertion with capability-neutral wording.
- SAN-replay truncation (#30): on invalid SAN, annotate the context ("move list truncated at ply N — analysis covers moves before this point") instead of silently checking the wrong board.

**Verify:** prompt snapshot tests; goldStandardExamples still select; cache-version bump confirmed.

## PR-G — "Dead code, live hazards"

Fixes #36-38 (selective — behavior-preserving).

- `generatePuzzleRecommendations`: call the mistake-puzzles logic in-process (extract lib function) instead of `http://localhost:3000` (#36) — revives a dead prod feature.
- Trim-harden `AUTH_ENFORCED`, `SKIP_RETRIEVAL_SELFTEST`, `ANTHROPIC_API_KEY` (`.trim()` at read).
- Clamp client `temperature` to [0,1] on the chat fallback; delete the dead `model` field.
- chessdb → `https://` (with fallback), CRON_SECRET warning log, delete the jsdelivr CDN worker + `stockfish.worker.js`.
- Remove: `criticalMoments.ts`/`complexity.ts`, `gameDebrief.ts`, `openingExplanation.ts`, `chessMoveExplainer.ts`, local Maia/lc0 spawner quartet, `buildSyncVoterSnapshot` (update tests).

## Deliberately NOT in scope (with reasons)

- **Lc0 service deployment** — infra + cost decision (HF Space/Render), founder call; PR-A makes the voter honest about its absence so nothing false-fires meanwhile.
- ~~Maia `/predict_at_rating` redeploy~~ — **superseded by a verified finding**: the endpoint *never existed* in `maia-service/maia_server.py` (only `/health`, `/predict`, `/`). The zero-deploy fix — repoint `queryMaiaAtRating` at the existing `/predict` (which accepts `{fen, rating, opponent_rating}`) and derive `prob_plays_best` from its move table (upper-bounded when the move is outside the returned top-5) — moves into **PR-A**, *paired mandatorily* with severity-aware retry gating in **PR-B** (warns must stop failing validation before the visibility validator can arm, per the documented regen-storm warning).
- **TRACKING_ENABLED flip / Supabase SQL execution** — consent-gated, founder-only; PR-E stages everything.
- **Depth-16 sweep default / server-side engine re-verification** — product latency tradeoff; proposal noted in audit §6, needs a product decision.
- **Contract-architecture inversion (audit §5.4/TTT model)** — the right long-term direction; too large for overnight; deserves its own design doc after PR-B proves the correction loop.

## Sequencing

A ∥ C ∥ E (disjoint files) → B (route.ts core) → D (route.ts caching, atop B) → F, G. Stack verified at tip before each merge; merge on green CI.
