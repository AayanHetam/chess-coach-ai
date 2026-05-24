# Mastermind cleanup follow-ups

Non-blocking cleanups that are surfaced during Mastermind PR work but kept out of the PR's scope to maintain plan-first discipline. Each entry is independent — can be picked up as its own small PR whenever Aayan signals.

**Format:** one entry per cleanup, dated to when it was first flagged. Drop entries from the file once they ship.

---

## 2026-05-25 — Flag flip rolled back after first production test

**Timeline:**
- **Flipped:** `MASTERMIND_VALIDATORS_ENABLED=true` added to Production env at ~2026-05-24 ~16:00 UTC (Sat). Redeployed via `vercel redeploy chess-coach-oczv6fvv1-aayan-hs-projects.vercel.app` to pick up the new env var. Post-flip deploy: `chess-coach-knme361jj-aayan-hs-projects.vercel.app` (3min build, Ready ~16:04 UTC).
- **First production test:** ~16:12 UTC. Single authenticated chat turn ("analyze my game") by Aayan against chessmasti.com.
- **Rolled back:** `MASTERMIND_VALIDATORS_ENABLED` removed from Production env at ~16:50 UTC. Redeployed → `chess-coach-ltyp2xf6o-aayan-hs-projects.vercel.app` (4min build, Ready ~17:00 UTC).
- **Duration on production with flag on:** ~1 hour.
- **User-facing impact during flag-on window:** Aayan's single test chat turn returned the `withPipelineTimeout` fallback string twice in sequence (one against `/api/enhanced-analysis`, one against `/api/chat`). No CMIP testers were exercising prod during the window. No other user reports.

**What happened.** Both routes' flag-on wings hit the 30s `withPipelineTimeout` and returned the synthetic fallback response to the user:
- `/api/enhanced-analysis` returned *"Still analyzing — the deep-validation pass took longer than expected. Please ask again or rephrase."* ([route.ts:1716](../src/app/api/enhanced-analysis/route.ts#L1716)).
- `/api/chat` returned *"Still thinking — the deep-validation pass took longer than expected. Try asking again."* ([route.ts:174](../src/app/api/chat/route.ts#L174)).

**Two findings from log investigation:**

**Finding 1: validator parser LLM call stalled at 60s with 9 output tokens.** Vercel runtime logs show a `tier=fast` Haiku call (`claude-haiku-4-5-20251001`) at 16:15:13Z with `inputTokens: 3929, outputTokens: 9, elapsedMs: 60009`. This is orphaned to a `/api/maia-status` request line (function instance reused after the original chat request's response had returned, but the underlying LLM promise kept running and logged on completion). The shape — large input, near-zero output, 60s elapsed — is consistent with the eval-claim / feature-citation parser stalling. **Normal parser calls complete in 3-8s.** Production-scale behavior diverges from preview-smoke behavior measured during Stage C Follow-up B. Root cause unknown; could be Anthropic queue/rate limiting at prod cookie scope, cold-start variance, or a real parser bug surfacing only at production input shapes.

**Finding 2: post-timeout telemetry not reaching Vercel logs.** When `withPipelineTimeout` resolves with the synthetic timeout result, the route is supposed to emit two things to the structured logger before returning the response: (i) `console.log("coach.tokens", {...})` at [enhanced-analysis/route.ts:1726](../src/app/api/enhanced-analysis/route.ts#L1726), and (ii) `forwardPipelineTelemetryForRoute({...})` at [enhanced-analysis/route.ts:1860](../src/app/api/enhanced-analysis/route.ts#L1860). The latter iterates the timeout result's `telemetry` array (which always contains at least the `pipeline_timeout`/`fallback_used` event from [pipelineTimeout.ts:80](../src/lib/mastermind/pipelineTimeout.ts#L80)) and calls `log.error("mastermind validator fallback", ...)`. **Neither log entry appeared** in Vercel logs for the production chat turn. The `--level error` query returned zero entries. `-q mastermind`, `-q pipeline`, `-q timeout`, `-q coach.tokens`, `-q validator_event` all returned zero matches. By contrast, `llm-provider`'s `"LLM call succeeded via Anthropic"` info-level logs DO appear, so the logger mechanism itself works. Suspected cause: log buffer loss on synchronous return-after-timeout path in Vercel serverless. Untested in smokes (preview smokes always include `VERCEL_ENV === "preview"` which inlines telemetry in the response body — a separate observability path that bypasses the structured logger gap surfaced here).

**Rollback procedure executed cleanly.** Steps + verification:
1. `npx vercel env rm MASTERMIND_VALIDATORS_ENABLED production` — confirmed empty `vercel env ls production` grep.
2. `npx vercel redeploy chess-coach-oczv6fvv1-aayan-hs-projects.vercel.app` — triggered rebuild with current (now-empty) env. Note: `vercel --prod` from local would have failed due to untracked landing-v2 files with `@react-three/fiber` import; `vercel redeploy` of a known-good deploy bypasses this.
3. New prod deploy: `chess-coach-ltyp2xf6o-aayan-hs-projects.vercel.app`, Ready in 4min.
4. Public surface verified: `https://chessmasti.com/` 200/782ms; `/api/health/llm` returns `ok: true, livePath: "anthropic"`, Anthropic responding in 806ms.
5. `vercel logs --deployment chess-coach-ltyp2xf6o ... -q mastermind` returns zero matches (correct flag-off behavior — pipeline doesn't run, no telemetry emitted).
6. Total rollback time from `env rm` to `Ready`: ~5 min, matching the documented rollback envelope from the prior cleanup_followups entry.

**Next gate.** **Do NOT re-flip the production flag until both findings are understood and verified-fixed on Preview.** Specifically:

- **For Finding 1 (parser stall):** investigate on Preview with a focused chat-turn smoke that captures parser timing per-call. Compare against the Follow-up B preview smokes (which showed parser calls in 1-10s range against the same Haiku model). Hypotheses to test: cold-start cost on prod-region containers, Anthropic queue depth under prod-scale concurrency, parser prompt-cache hit-rate differences between preview and prod, request-shape differences (prod chats have more conversation history loaded; preview chats are one-shot).
- **For Finding 2 (telemetry gap):** test whether the structured logger emits reliably from `forwardPipelineTelemetryForRoute` after a `withPipelineTimeout` resolution. Possible test: a Preview smoke where the LLM is deliberately slow (mocked or rate-limited) to force the timeout path, then verify `mastermind validator fallback` appears in Vercel logs. If it doesn't appear on Preview either, the logger code itself has a bug. If it appears on Preview but not Prod, it's a Vercel runtime difference.
- **CMIP impact:** interns start ~next weekend. Cannot ship flag-on for CMIP without Finding 1 fixed. Three options for CMIP: (a) keep flag off and let CMIP test the legacy callLLM path qualitatively (no validator coverage but no risk), (b) ship flag-on to a small subset of intern accounts via a per-user feature toggle (substantial new infrastructure work), (c) defer CMIP-vs-sweep comparison to post-investigation.

**Source-of-truth for the rollback:** this entry + the preceding "Mastermind merged to main (PR #26)" entry. Merge commit `1715e5c` remains on main; only the runtime flag was flipped and rolled back. No code revert needed.

---

## 2026-05-24 — Mastermind merged to main (PR #26)

**Merge commit:** [`1715e5c`](https://github.com/AayanHetam/chess-coach-ai/commit/1715e5c) ("Merge pull request #26 from AayanHetam/mastermind/stage-3-validators")
**Merged at:** 2026-05-24T15:16:00Z
**Production deploy serving the merge:** `chess-coach-ipz94vo90-aayan-hs-projects.vercel.app` (Ready, 3min build, auto-deployed from `main` HEAD)
**Source branch:** `mastermind/stage-3-validators` (preserved, NOT deleted — recovery point)
**Scope:** 69 commits landing Stage A validator foundations + Stage B route wiring + Stage C harness + Follow-up A (telemetry inline) + Follow-up B (chat-side eval validation + four off-by-one bug-class fixes) + audit/docs.

**Verification confirmed (2026-05-24, post-deploy):**
- Public surface healthy: `https://chessmasti.com/` → HTTP 200 in 889ms; `/api/health/llm` returns `ok: true, livePath: "anthropic"`, Anthropic model live in ~1s.
- One authenticated chat-turn smoke performed manually by Aayan against the production deploy. Response came back cleanly, normal latency, no errors. Flag-off path (`MASTERMIND_VALIDATORS_ENABLED` unset in Production env) confirmed running unchanged from pre-merge behavior. **Synthetic-tester correctly refused automated execution** against `chessmasti.com` per the production guard at [`scripts/synthetic-tester/run.ts:279-282`](../scripts/synthetic-tester/run.ts#L279-L282); that guard exists precisely to prevent unintended prod spend, and it worked as designed.
- OpenAI fallback shows pre-existing 429/`insufficient_quota` — independent of this merge; surfaces on every prod health check.

**Next gate: flag-flip observation period (1 week from merge).** Production runs with `MASTERMIND_VALIDATORS_ENABLED` unset through approximately 2026-05-31. During this window, the merged code is a NO-OP for users (validators not invoked from either route handler's flag-on branch). Watch Vercel runtime logs and any user-facing chat anomalies. **DO NOT flip the flag earlier than 2026-05-31 without explicit authorization from Aayan.** The audit at [`MASTERMIND_CONTEXT/production_telemetry_audit.md`](production_telemetry_audit.md) tracks the post-flip prerequisites (telemetry destination + verification chat turn).

**Rollback procedure** (in case anomaly surfaces during observation window):
1. `git revert 1715e5c` on local `main`
2. `git push origin main`
3. Vercel auto-redeploys the prior `main` HEAD (`a36fa12`) within ~3 minutes
4. No env-var changes needed, no state cleanup (no migrations, no schema changes, no Firestore writes from the merge itself)
5. Verify rollback via `npx vercel ls --prod` showing the pre-merge SHA Ready
6. The `mastermind/stage-3-validators` branch remains intact for re-investigation post-rollback

**Source-of-truth for the merge:** [PR #26](https://github.com/AayanHetam/chess-coach-ai/pull/26) (MERGED) + [`MASTERMIND_CONTEXT/mastermind_main_merge_plan.md`](mastermind_main_merge_plan.md) (the Phase 1 investigation that scoped the merge).

---

## Stage C Follow-up sequence — source of truth

The Stage C validation sweep (synthetic-tester against preview deploy) ships in a lettered Follow-up sequence. Each Follow-up addresses a gap surfaced in the prior pause-point dry-run, with a pause for Aayan review between each. **From 2026-05-23 forward this is the canonical record of the sequence — the lettering existed only in compacted chat history before this entry.**

- **Follow-up A — shipped at `437e852` (2026-05-23).** Pipeline telemetry capture in sweep CSV: 8 new columns (`pipeline_final_outcome`, `pipeline_retry_count`, `pipeline_total_cost_usd`, `pipeline_category`, `pipeline_classifier_confidence`, `pipeline_prep_ms`, `pipeline_timed_out`, `pipeline_telemetry_json`). Coordinated route extension on `/api/enhanced-analysis` to inline `gameAnalysis.pipeline.telemetry` when `VERCEL_ENV === "preview"` (production responses byte-identical).
- **Follow-up B — shipped across four commits (2026-05-23):**
  - **`1e5bf8c`** — initial position-anchored two-step flow for `game_review` / `position_analysis` live turns: real game → stockfish checkpoint → `analyzeGame` (`/api/enhanced-analysis`, Sonnet flagship) → `chatFollowUp` (`/api/chat`). Replaces the stub position context that caused the "Invalid FEN, skipping validation" warning in the Pause Point 4 dry-run. Coordinated route extension on `/api/chat` mirrors Follow-up A's pattern: inlines `pipeline.telemetry` when `VERCEL_ENV === "preview"`. Mock-mode path keeps the stub for $0-cost development.
  - **`be1515d`** — truncation (α): slice `moveHistory` + `gameEval.positions` to `cp.ply` before sending. Route's `deriveMastermindMoveContext` picks "last move of moveHistory" as the validator's operating position; without truncation that anchored the END of the game instead of the harness's checkpoint. Truncation makes the route's default produce the checkpoint FEN.
  - **`7341fa1`** — starting-position prepend (α-extension): the harness's `buildGameEval` produced `positions.length === moveHistory.length`, but production's `getEvaluateGameParams` (`src/lib/chess.ts:11-12`) pushes the starting FEN first so production sends `positions.length === moveHistory.length + 1` with `positions[0] = starting state`. Harness was off by 1 (missing the starting entry); route's `positions[lastIdx]` lookup returned `undefined` against the harness's shape. Aligned harness to production's convention.
  - **`cc10524`** — validator skip on undefined stockfishEval (β): `validateEvalClaim` now early-returns with a `fire_reason: "no_stockfish_eval"` telemetry event when both `cp` and `mate` are undefined, instead of letting `evalToCp` silently default to 0 and firing false-positive `eval_mismatch_numeric` / `eval_mismatch_qualitative` against fabricated ground truth. Skips the parser call too (no Haiku cost when there's no ground truth to validate). Defense-in-depth: catches the chat-route's `gameEval: undefined` path that (α)/(α-ext) can't reach.
- **Main sweep — parameters TBD, expected $10-15 envelope.** Scoping to happen after Follow-up B closes. Three smoke data points (`be1515d`, `7341fa1`, `cc10524`) give cost per turn in the $0.003–0.013 range; sizing decision pending. Surface targets include per-claim-type firing-rate aggregation (≥3-never-fire claim types flagged for review, not auto-merged).

**Sequence pause discipline.** Aayan reviews the smoke output between each Follow-up and approves the next step explicitly. No chaining into the main sweep without explicit confirm.

---

## Pre-paper provenance gaps

Tracked separately from the chronological cleanup stream — these are provenance-of-constants questions surfaced by the architecture audit at [`architecture_audit.md`](architecture_audit.md). Each blocks a defensible methods-section claim in Paper 1; none block any code work in flight.

### Neo4j ingest threshold provenance

**Status:** flagged 2026-05-23 by architecture audit (§H.3).

**Context:** the Neo4j puzzle-ingest filters `MIN_POPULARITY ≥ 60`, `MIN_NB_PLAYS ≥ 50`, `MAX_RATING_DEVIATION ≤ 120` ([`scripts/build-puzzle-db.py:31-33`](../scripts/build-puzzle-db.py#L31-L33)) are anchored in product copy per the architecture audit, not in measured retrieval quality or cited Lichess puzzle documentation. Paper 1's methods section needs either a citation or an ablation.

**Recommended trigger:** Paper 1 methods-section draft begins. First-pass response is a citation hunt against Lichess puzzle DB documentation. Ablation deferred unless a reviewer requests one.

### Skill-tier boundary provenance

**Status:** flagged 2026-05-23 by architecture audit (§G).

**Context:** the rating boundaries 1000 and 1600 used by `deriveSkillTier(rating)` in [`src/lib/prompts/coachChatPrompt.ts:98-102`](../src/lib/prompts/coachChatPrompt.ts#L98-L102) — `<1000 → beginner`, `<1600 → intermediate`, `≥1600 → advanced` — are unsourced per the architecture audit. Paper 1's skill-calibration claims need defensible boundaries.

**Recommended trigger:** Paper 1 methods-section draft begins. Cite chess.com / Lichess rating distributions or USCF skill descriptors. Ablation only if reviewers push.

---

## 2026-05-23 — Magic numbers in chess-intelligence layer have unsourced provenance

**Status:** flagged 2026-05-23 by architecture audit (§A.3, §A.5, §A.6). Deferred.

**Context:** three constant-provenance gaps surfaced by the architecture audit:
- [`src/lib/mastermind/complexity.ts:12-13`](../src/lib/mastermind/complexity.ts#L12-L13) — `FAN_OUT_NORMALIZATION = 35` (legal-moves divisor) and `SPREAD_NORMALIZATION_CP = 200` (top-vs-3rd-line cp normalizer). Origin not surfaced in comments.
- [`src/lib/mastermind/pieceRoles.ts:31-32`](../src/lib/mastermind/pieceRoles.ts#L31-L32) — `OUTPOST_RANKS_WHITE = [4,5,6]`, `OUTPOST_RANKS_BLACK = [3,4,5]`. Standard chess heuristic, no citation in code.
- [`src/lib/mastermind/threatTree.ts:22`](../src/lib/mastermind/threatTree.ts#L22) uses Stockfish HCE-style piece values `{p:100, n:320, b:330, r:500, q:900}` while [`src/lib/mastermind/featureDelta.ts:11`](../src/lib/mastermind/featureDelta.ts#L11) uses textbook `{p:1, n:3, b:3, r:5, q:9}` — same module family, two scales, no comment surfaces the discrepancy.

Provenance needed before any of these appear in a published methods section.

**Recommended trigger:** Paper 1 outline confirms whether these constants appear in a methods-section claim. Defer until then — if Paper 1 doesn't surface them, leave as code-only magic numbers. If it does, citation hunt or ablation per the section's needs.

---

## 2026-05-23 — Off-by-one in `deriveMastermindMoveContext` positions lookup

**Status: RESOLVED** across three layers (Layer 1: `7341fa1`, Layer 2: `32f6477`, Layer 3: this commit, see "Three layers" paragraph below). Defensive boundary checks shipped alongside Layer 3 to catch any fourth surface loudly.

**Boundary contract documentation.** The canonical contract — `gameEval.positions.length === moveHistory.length + 1` with `positions[0]` = starting state and `positions[N]` = after the Nth move — was undocumented across three layers of the codebase before Layer 3. It now lives in three grep-able places: the WHY comment at [`scripts/synthetic-tester/client.ts:343`](../scripts/synthetic-tester/client.ts#L343), the harness-side invariant at [`scripts/synthetic-tester/client.ts:analyzeGame`](../scripts/synthetic-tester/client.ts) (throws on violation in dev/test/CI), and the route-side warning at [`src/lib/mastermind/routeHelpers.ts:prepareMastermindContext`](../src/lib/mastermind/routeHelpers.ts) (logs to Log Drain in production). Any future developer touching gameEval shape should grep for either signature and find this entry.

**Original surface (2026-05-23).**

**Where:** [`src/lib/mastermind/routeHelpers.ts:113-145`](../src/lib/mastermind/routeHelpers.ts#L113-L145), function `deriveMastermindMoveContext`. The non-degraded branch with non-empty `moveHistory` looks up `gameEval?.positions?.[lastIdx]` where `lastIdx = moveHistory.length`.

**Symptom:** the harness's `buildGameEval` ([scripts/synthetic-tester/client.ts:335-352](../scripts/synthetic-tester/client.ts#L335-L352)) produces `positions.length === moveHistory.length` (0-indexed: positions[i] is PositionEval for state after move i+1). So `positions[lastIdx]` is always undefined (out of bounds by 1). The route then sets `stockfishEval: { cp: undefined, mate: undefined }`, which means the **eval_claim validator has no stockfish ground truth to compare LLM claims against and can't fire numeric_mismatch events.** Likely explains why the Follow-up B smoke produced only the terminal `regenerate` event with no individual validator check events — eval_claim's primary firing condition can't be met.

**Two interpretations, not resolving here:**
- (a) Route expects positions to be 1-indexed (positions[0] = starting state, positions[N] = after Nth move). Harness produces 0-indexed.
- (b) Off-by-one bug on route side; should be `positions[lastIdx - 1]`.

Production callsites (webapp's enhanced-analysis path) probably hit the same offset, so fixing this could change production validator behavior — needs careful audit before fix.

**Why it matters now:** prime suspect if the post-truncation Follow-up B smoke still produces only the regenerate event. Truncation aligns the operating *position* with the harness checkpoint, but does not fix the gameEval lookup — so eval_claim still won't have ground truth even after truncation if interpretation (b) is correct. If smoke surfaces this gap, this becomes the next investigation in its own scope.

**Status:** tracked, not fixed in this commit. Separate read-only investigation will scope the fix and check production callsite impact before any code change.

**Resolved at `cc10524` (2026-05-23).** Root cause turned out to be harness-side, not the route: production's `getEvaluateGameParams` produces `positions.length === moveHistory.length + 1` with `positions[0] = starting state`, and the route's `positions[lastIdx]` lookup is correct against that shape. The harness was off by 1 (missing the starting-state entry). Fix shipped in two layers: `7341fa1` aligned the harness to production's convention by prepending the starting eval; `cc10524` added a defensive skip in `validateEvalClaim` for any caller that still produces `stockfishEval: { cp: undefined, mate: undefined }` (the chat-route's `gameEval: undefined` path remains — see (γ-route) entry below). The route's indexing stays untouched. Neither interpretation (a) nor (b) above was the answer.

**Three layers (2026-05-24 addendum).** The "Resolved at cc10524" statement above was premature — the bug surfaced a third time during the (γ-route) smoke. The same conceptual off-by-one against the undocumented `positions.length === moveHistory.length + 1` contract appeared in three independent surfaces, all closed across separate commits:

- **Layer 1 (route-side lookup looking like off-by-one):** resolved at `7341fa1` by aligning the harness's `buildGameEval` to production's convention (prepend the starting-position PositionEval). The route's `positions[lastIdx]` indexing was correct all along; the harness was missing the index-0 entry.
- **Layer 2 (chat-route silently passing `gameEval: undefined`):** resolved at `32f6477` ((γ-route)) by threading `gameEval` through `AnalysisContext` from the enhanced-analysis store-site to the chat-route consumer. Pre-(γ-route), chat-route pipelines had no eval-claim ground truth regardless of what the harness sent.
- **Layer 3 (harness truncation slicing the +1 entry off):** resolved at *this commit* by changing `gameEval.positions.slice(0, cp.ply)` to `slice(0, cp.ply + 1)` at the position-anchored two-step site. `moveHistory.slice(0, cp.ply)` stays as-is; positions now has `cp.ply + 1` entries so that `positions[cp.ply]` is the checkpoint's PositionEval. Without this slice fix, (γ-route)'s threading delivered a wrong-shape `gameEval` to the chat-route pipeline, which then routed through the (β) skip path — Layer 2's fix exposed Layer 3.

**Defensive boundary checks (shipped with Layer 3).** Three surfaces in three days against an undocumented contract is the rationale for failing loudly on the fourth: (b1) at the harness/route boundary, `analyzeGame` throws if `positions.length !== moveHistory.length + 1` (dev/test/CI hard-fail before fetch); (b2) at the route's request-body boundary, `prepareMastermindContext` emits a structured `log.warn` to Log Drain when the contract is violated for move-focused categories — production keeps degrading via the (β) skip path, but the warning makes the next variant visible in monitoring.

---

## 2026-05-23 — (γ-route) Thread `gameEval` through `AnalysisContext` for chat-route turns

**Status:** scoped during Follow-up B (α) re-smoke. Deferred.

**Where:** [`src/app/api/chat/route.ts:120-127`](../src/app/api/chat/route.ts#L120-L127) currently passes `gameEval: undefined` to `prepareMastermindContext`. The `AnalysisContext` cache ([`src/lib/analysisContextCache.ts:14-27`](../src/lib/analysisContextCache.ts#L14-L27)) does not persist `gameEval` between the initial `/api/enhanced-analysis` call and follow-up `/api/chat` calls.

**Symptom (pre-(β)):** chat-route pipeline's `prep.moveCtx.stockfishEval` came back as `{ cp: undefined, mate: undefined }`. `validateEvalClaim` ran against fabricated ground truth (0/equal) and fired false-positive `eval_mismatch_*` events on every non-near-zero LLM eval claim.

**Symptom (post-(β)):** `validateEvalClaim` now emits a `no_stockfish_eval` skip event. False positives gone, but the chat-route's pipeline still has no real eval-claim validation coverage — it always skips.

**Cleanup task.** Persist `gameEval` (or the relevant `positions[lastIdx]` PositionEval, or `stockfishEval` directly) into `AnalysisContext` at the enhanced-analysis store-site ([`src/app/api/enhanced-analysis/route.ts:1835`](../src/app/api/enhanced-analysis/route.ts#L1835)), retrieve in the chat route, thread through to `prepareMastermindContext`. Lets chat-route pipelines actually validate eval claims against real ground truth instead of skipping.

**Why deferred.** Changes production behavior on every chat-route turn (chat pipeline gains eval-claim ground truth where today it has none). Could meaningfully change production firing rates and surface real LLM eval-claim errors that production has been silently shipping. Needs its own study + audit before flipping.

**Re-evaluation trigger.** Main sweep firing rates. If sweep produces mostly-skip events on chat-route turns (i.e., almost no real eval-claim validation coverage because validators always skip), (γ-route) becomes the next eval-infrastructure priority. If sweep finds real LLM eval errors via other validators (feature_citation, scout_citation, user_history_citation), (γ-route)'s urgency drops — the eval-claim gap is only one of several validator surfaces.

---

## 2026-05-23 — Stale comment at `src/app/api/chat/route.ts:124-126`

**Status:** trivial cleanup, flagged during Follow-up B (β).

**Where:** the comment block at [`src/app/api/chat/route.ts:124-126`](../src/app/api/chat/route.ts#L124-L126) reads *"gameEval: not threaded through analysisContext today; chat path is happy with stockfishEval={} (degraded mode means the eval-claim validator just doesn't fire on this turn)."*

**Why stale.** Pre-(β) the second sentence was wrong (validator fired false positives, not "just doesn't fire"). Post-(β) the validator emits an explicit `no_stockfish_eval` skip event — closer to "doesn't fire as a real check" but still not literally "doesn't fire." The wording implies silent no-op, but the actual behavior is "emits a skip telemetry event but raises no issue."

**Cleanup task.** Reword to something like: *"gameEval: not threaded through analysisContext today (see (γ-route) entry in cleanup_followups.md). Chat path's stockfishEval comes back undefined; validateEvalClaim handles this by emitting a `no_stockfish_eval` skip telemetry event and skipping the parser call entirely."* One-line change.

**Why deferred.** Not load-bearing; only relevant if (γ-route) ships (at which point this comment gets replaced entirely) or someone reads the comment cold and gets misled. Fold into any future chat-route touch.

---

## 2026-05-23 — `buildFallbackResponse` asserts "balanced" when no stockfish ground truth

**Status:** contract-incorrect, surfaced during Follow-up B (β) investigation.

**Where:** [`src/lib/mastermind/validators/fallback.ts:166-194`](../src/lib/mastermind/validators/fallback.ts#L166-L194), `buildFallbackResponse`. At line 168, `const stockfishCp = evalToCp(opts.stockfishEval)`. When `opts.stockfishEval = { cp: undefined, mate: undefined }`, `evalToCp` returns 0 ([`qualitativeBands.ts:105`](../src/lib/mastermind/validators/qualitativeBands.ts#L105)), `cpToBand(0)` returns `"equal"`, and the fallback response opens with the equal-band phrase: *"The position is balanced — neither side has a clear advantage."* (or the corresponding `blunt` / `playful` variant).

**Why not a false-positive in the (α)/(β) sense.** `buildFallbackResponse` is a phrase-builder, not a telemetry-emitting validator — it doesn't fire `eval_mismatch_*` events. But it does assert an eval claim ("balanced") it has no ground truth for, which violates the function's own docstring constraint at line 162: *"Never invents claims beyond what the inputs prove."*

**Cleanup task.** When both `cp` and `mate` are undefined, pick a phrase that makes no eval claim. Examples (warm tone): *"Here's what I can tell you about this position..."* or *"Let me describe what's happening on the board..."*. Then proceed with `featureDelta` / `threatTree` / `pieceRoleDiff` sections as today — those have their own ground truth and are unaffected.

**Why deferred.** Today the fallback path only triggers after the regenerate pipeline exhausts retries — relatively rare. When the chat-route hits it with `gameEval: undefined`, the user sees a "balanced" assertion that may not be accurate. Post-sweep cleanup; track whether actual users hit this path frequently before prioritizing.

---

## 2026-05-23 — LLM phrases eval-cp drops as "lost N pawns"

**Status:** observed during Follow-up B (β) smoke. Pattern, not yet a fix.

**Symptom.** The coaching LLM (Sonnet 4) describes eval shifts using material vocabulary: *"eval dropped from +2.79 to +2.15 (lost 0.6 pawns)"*, *"eval staying at +3.14"*, *"the +2 or +3 advantage you had in the middlegame"*. The `feature_citation_unsupported` validator parses *"lost 0.6 pawns"* as a literal material-change claim, checks `featureDelta.change`, finds 0 (no actual pawn loss), and fires `unsupported_citation`. The (β) smoke fired three such events on a single turn before the retry produced cleaner phrasing.

**Why not a validator bug.** The validator is doing its job — the LLM said "lost 0.6 pawns," there was no material change, the citation is unsupported. The LLM was using material vocabulary as colloquial gloss for eval-centipawn shifts, but the validator (correctly) can't distinguish gloss from claim. Either the LLM stops doing this, or the validator routes "lost N pawns" patterns to `eval_claim` instead of `feature_citation`, or we treat it as a pedagogy finding.

**Three possible directions (not picking one here):**
- **(i) Prompt hygiene.** Add an instruction to the coaching system prompt telling the model not to gloss eval-cp drops as material loss. Cheapest. Risk: prompt churn touches a load-bearing surface.
- **(ii) Architectural.** Extend the `feature_citation` parser to recognize *"lost N pawns"* / *"gained N pawns"* patterns adjacent to eval-numeric context and route them to `eval_claim` instead. Larger change. Better long-term separation of concerns.
- **(iii) Paper observation only.** LLM coaches misusing material vocabulary for eval shifts is itself a pedagogy finding the validator caught. Track as data, not a bug — surfaces the LLM's mental model gap and may be informative for the Mastermind eval study.

**Re-evaluation trigger.** Main sweep firing rates. If `feature_citation_unsupported` events on "lost N pawns" spans dominate the failure mode across personas + categories, (i) becomes urgent. If it's a one-off persona thing (only confused_beginner provokes verbose eval-as-material narration), it's data and we leave it.

---

## 2026-05-18 — `extractPgnHeaders` utility consolidation

**Status:** flagged during PR 1.C Stage A.7 (`a067d3b`).

**Background.** Stage A.7 needed PGN header extraction (ECO / Opening / Variation) for the `aggregateScoreByOpening` helper. A grep surfaced an existing private implementation at [`src/lib/repertoireParser.ts:61`](../src/lib/repertoireParser.ts#L61) — `function extractHeaders(pgn: string)` with the same `/\[(\w+)\s+"([^"]*)"\]/g` regex. Not exported.

Per Stage A.7 plan T2 refinement, the shared utility lives at [`src/lib/utils/pgnHeaders.ts`](../src/lib/utils/pgnHeaders.ts) (created `src/lib/utils/` directory). Stage A.7's `userHistoryAggregates.ts` imports from there.

**Cleanup task.** Migrate `repertoireParser.ts:61`'s private `extractHeaders` to import from the shared utility:

```typescript
// Before (current state — repertoireParser.ts:61-69):
function extractHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const headerRegex = /\[(\w+)\s+"([^"]*)"\]/g;
  let match;
  while ((match = headerRegex.exec(pgn)) !== null) {
    headers[match[1]] = match[2];
  }
  return headers;
}

// After:
import { extractPgnHeaders } from "@/lib/utils/pgnHeaders";

// Then replace all extractHeaders(...) callsites with extractPgnHeaders(...)
// — there are two in repertoireParser.ts (lines 104 + 128).
```

Three-line change effectively: remove the private function, add the import, rename the two callsites. Drop this entry from `cleanup_followups.md` when shipped.

**Why deferred.** Touching `repertoireParser.ts` is outside PR 1.C's validator surface; consolidating during Stage A.7 would expand scope to a non-Mastermind file. The duplicated regex isn't broken; just non-DRY.

**Risk if left:** the two copies could drift over time (e.g., one gains tag-name normalization, the other doesn't). Low probability — the regex is short and stable, and the PGN header format hasn't changed in 25 years.

**Recommended trigger:** if any future PR touches `repertoireParser.ts` for an unrelated reason, fold this consolidation in. Otherwise wait until cleanup PR cadence resumes.

---

## 2026-05-18 — Future expansion: move-sequence-based opening repertoire validation

**Status:** flagged during PR 1.C Stage A.8 plan approval (C2 / T3).

**Background.** Stage A.8's `userHistoryCitation` validator handles `opening_repertoire_performance` claims that name the opening (e.g., "your Najdorf as black has been 41%") or the ECO code. Move-prefix claims like "you score 65% in 1.e4 e5 lines" or "your French Defense after 1.e4 e6 2.d4 d5" route to `qualitative_commentary` and skip validation — the parser can't reliably resolve a move-prefix to the ECO/Opening that the aggregator stores.

The existing [`scoutEco.ts`](../src/lib/scoutEco.ts) is a SAN-prefix → ECO lookup table designed for the Scout UI's opening labeling — could *in principle* be extended into the parser pipeline to resolve move-prefix claims at parse time. But the parsing is fragile (LLMs phrase move sequences inconsistently — "1.e4 e5", "after 1...e5", "the e5 pawn structure", "the King's Pawn opening lines"), and Stage A.8 defers to keep MVP scope tight.

**Cleanup task (future expansion).** When the time comes, build move-sequence-based opening repertoire validation:

1. Extend the `USER_HISTORY_CITATION_PARSER_SYSTEM` prompt to recognize SAN-prefix patterns in claims and emit them in `expected_in_data.move_prefix`.
2. Add a new helper `resolveMovesToOpening(moves: string[]) → { eco, opening, variation } | null` that walks `scoutEco.ts` to find the deepest matching ECO entry.
3. In `userHistoryCitation.ts`'s `opening_repertoire_performance` branch, if the claim's `move_prefix` is present and `opening_name`/`opening_eco` are not, resolve via the helper before cross-checking.
4. Tests covering common SAN-prefix phrasings.

Estimated size: ~200 LOC + ~100 test. Real infrastructure when it lands — not a one-line patch.

**Recommended trigger:** Stage C sweep observes ≥5% of `opening_repertoire_performance` claims firing as `qualitative_commentary` because they cite move-prefix instead of opening-name. Below 5% the expansion isn't load-bearing.

---

## 2026-05-18 — Cross-platform user-identifier reconciliation

**Status:** flagged during PR 1.C Stage A.8 plan approval (C4).

**Background.** Stage A.7's `detectUserColor` matches `userName` as a case-insensitive substring against `Player.name`. Single-identifier MVP — works fine when the user plays under one consistent name. Doesn't handle the common case of one user playing under different usernames on Lichess vs Chess.com (e.g., "Aayan_K" on Lichess, "aayanhetam" on Chess.com).

**Consequence today.** When the validator runs `userHistoryCitation` with a single `userName`, games where the user played under the OTHER platform's name are silently excluded from the aggregator output. The citation-rate denominator under-counts opportunities for that user; some valid citations may surface as `unsupported_citation` fires because the relevant games weren't aggregated.

**Cleanup task.** Add cross-platform identity reconciliation, post-PR-1.E (where the user profile data model is expanded):

1. Extend `UserProfile` (Firestore) with a canonical list of aliases: `{ lichessUsername?, chesscomUsername?, otherAliases?: string[] }` (the first two already exist).
2. Update the route handler that calls `validateUserHistoryCitation` to pass the user's full alias set instead of a single `userName` string.
3. Update `detectUserColor` to test the game against ANY alias in the set, returning the color of the first match.
4. Tests covering the multi-alias case + the (unchanged) single-name case.

**Recommended trigger:** PR 1.E lands and the user-profile shape gains the alias fields, OR Stage C sweep surfaces user-history citation-rate gaps that trace back to single-alias undercounting.

---

## 2026-05-18 — `TimeControlClass` ↔ `ScoutTimeClass` type derivation

**Status:** flagged during PR 1.C Stage A.8 approval (Aayan, post-impl note).

**Background.** Stage A.8 introduced [`TimeControlClass`](../src/lib/utils/timeControlClass.ts) (`"bullet" | "blitz" | "rapid" | "classical" | "daily" | "unknown"`) — the narrow return type of `classifyTimeControl`. [`ScoutTimeClass`](../src/lib/mastermind/validators/types.ts) (`"bullet" | "blitz" | "rapid" | "classical" | "daily"`) was introduced in Stage A.6 for scout's `rating_by_timeclass` claim type. The two types are structurally identical except `TimeControlClass` adds `"unknown"`.

Today the validators compose without explicit casts (TypeScript's structural typing handles the equivalence after `if (cls === "unknown") continue;` narrowing). But the parallel type declarations are subtly fragile — if either side adds a value (e.g., scout adds `"correspondence"`), the other doesn't get the update automatically and the structural compatibility breaks silently.

**Cleanup task.** Refactor so `ScoutTimeClass` is derived from `TimeControlClass` via exclusion (or vice versa):

```typescript
// Option A (preferred): ScoutTimeClass derived from TimeControlClass
import type { TimeControlClass } from "@/lib/utils/timeControlClass";
export type ScoutTimeClass = Exclude<TimeControlClass, "unknown">;

// Option B: TimeControlClass derived from ScoutTimeClass
import type { ScoutTimeClass } from "@/lib/mastermind/validators/types";
export type TimeControlClass = ScoutTimeClass | "unknown";
```

Option A is preferred because the classifier utility is the primary source of truth for the underlying classes (it owns the bucketing thresholds). Drop this entry when shipped.

**Why deferred.** Stage A.9 is the final Stage A commit. Touching either type definition during A.9 expands scope. The structural-typing compatibility is sufficient today; the refactor is preventative.

**Recommended trigger:** any future PR that adds a new TimeClass value (e.g., `"correspondence"` becoming first-class instead of folded into `"daily"`). At that point the divergence becomes a real bug rather than a latent fragility.

---

## 2026-05-18 — `feature_delta` opportunity counter not shipped in A.9

**Status:** flagged during PR 1.C Stage A.9 plan approval (C2 / T4).

**Background.** Stage A.9's `citationRate.ts` aggregates citations per source against per-source opportunity arrays. Stage A.6 shipped `countScoutOpportunities`; Stage A.8 shipped `countUserHistoryOpportunities`. **No equivalent `countFeatureDeltaOpportunities` exists** for the `feature_delta` source.

**Consequence for the Stage C sweep:** the `game_review` and `position_analysis` categories' citation-rate floors (90% and 70% per [PR_1C_PLAN.md §5.3.2](../MASTERMIND_CONTEXT/PR_1C_PLAN.md)) produce **hallucination-check data only** (PR 1.B's `featureDeltaCitation` still fires on unsupported claims) but **no citation-rate denominator** (we can count the citations the coach made, but not the opportunities they passed over).

`citationRate.ts` handles this by returning `null` for the `feature_delta` source bucket when no opportunity array is provided. Stage C sweep treats null as "not measured" — the hallucination ceiling still applies (the LLM can't fabricate feature-delta claims; PR 1.B catches that). The citation-rate metric is one of multiple; one being unmeasured doesn't invalidate the rest.

**Cleanup task.** Build `countFeatureDeltaOpportunities(delta: PositionFeatureDelta): FeatureDeltaOpportunity[]`. Each "non-default" entry in the delta counts as one opportunity. Existence-based thresholds, mirroring `countScoutOpportunities`:

- Each entry in `passedPawnsGained.{white,black}` → 1 opp
- Each entry in `passedPawnsLost.{white,black}` → 1 opp
- Each entry in `openFilesGained` / `openFilesLost` → 1 opp
- `materialDelta.{white,black}` non-zero → 1 opp each
- `kingSafetyDelta.{white,black}` non-zero → 1 opp each
- Each entry in `hangingPiecesDelta.{newlyHanging,nowDefended}` → 1 opp
- Each entry in `threatsDelta.{newThreats,resolvedThreats}` → 1 opp
- Doubled/isolated pawn changes → 1 opp each when non-zero

Plus a corresponding `featureDelta?: FeatureDeltaOpportunity[]` field on `citationRate.ts`'s `opportunities` input, populated from `wireValidators.ts`.

Estimated size: ~120 lib + ~150 test = ~270 LOC.

**Why deferred.** Stage A.9 plan §1.1 explicitly defers; per C2, building the counter without CMIP data on what coaches actually cite in feature_delta is speculation. CMIP-2 ratings + correlation analysis will inform what "non-default" actually means in this source.

**Recommended trigger:** CMIP-2 surfaces real coach behavior on feature_delta claims, OR Stage C sweep shows game_review / position_analysis hallucination rates passing but the categories feel under-measured against coaching quality.

---

## 2026-05-22 — `Collisions` not wired into `wireValidators.ts` scout source

**Status:** flagged during PR 1.C Stage B commit `1.C.B.1` (`b578168`).

**Background.** PR_1C_STAGE_B_PLAN.md §3.1 #4 says the scout source returns `{ scout, collisions, opponentUsername, primaryTimeClass }`, with both `scout: ScoutAnalytics` and `collisions: Collisions` populated. Collisions detection is the cross-reference between the user's opening repertoire and the opponent's tendencies — what scout calls "your weapons vs their preparation gaps." [`src/lib/collisionAnalysis.ts`](../src/lib/collisionAnalysis.ts) is the compute path; it consumes a user-repertoire input alongside the scout's opening tree.

**Consequence today.** [`wireValidators.ts`](../src/lib/mastermind/wireValidators.ts) leaves `collisions: undefined` in the scout payload. The pipeline's `validateScoutCitation` validator already handles undefined collisions gracefully (per Stage A.6 — `collisions?: Collisions` in `ScoutCitationOpts`), so the validator runs without collision-specific claim checks. The hallucination ceiling still applies via the per-claim-type cross-checker; the gap is opportunity-coverage, not safety.

**Cleanup task.** Wire user-repertoire-based collision detection into `wireValidators.ts`:

1. Fetch the user's opening repertoire — currently stored in Firestore under `users/{uid}/repertoire` per [`src/lib/repertoireParser.ts`](../src/lib/repertoireParser.ts) (verify exact path during the cleanup PR).
2. Build a `userRepertoireTree` via `buildOpeningTree(...)` from `scoutService.ts` against the user's saved games.
3. Compute `collisions` by intersecting `userRepertoireTree` with `dataSources.scout.scout.openingTree` via `collisionAnalysis.ts`.
4. Return `collisions` alongside `scout` in the wireValidators scout payload.
5. Tests covering: user with rich repertoire + opponent with overlapping prep → collisions populated; user with no repertoire → collisions undefined; failure of repertoire fetch → collisions undefined, scout still returned.

Estimated size: ~80 LOC + ~80 test = ~160 LOC.

**Why deferred.** Stage B's scope is the four-source fetch + telemetry forwarding. Collisions adds a fifth fetch path (user repertoire from Firestore) with its own failure mode, plus the compute step — meaningful surface for a cleanup PR but not load-bearing for the citation-rate floors that gate PR 1.C merge. The repertoire data shape is also in flux (the repertoire parser is among Stage A.7's `cleanup_followups` items).

**Recommended trigger:** Stage C sweep surfaces a real prep-collision-needed signal — e.g., opponent_prep responses citing collision-style claims (`"they're weak against your French"`, `"their Najdorf prep doesn't cover your Sveshnikov line"`) and firing as `unsupported_citation` because the validator has no collisions data to cross-check. Sub-5% rate of these claims means the cleanup is low-priority; above 10% it becomes load-bearing for opponent_prep's 85% citation-rate floor.

---

## 2026-05-22 — `enhanced-analysis` route has 2 raw `console.*` calls outside the structured logger

**Status:** flagged during PR 1.C Stage B commit `1.C.B.3.5` (audit of route file).

**Background.** The audit at [PR_1C_STAGE_B_PLAN.md §3.7.8](PR_1C_STAGE_B_PLAN.md) surfaced two telemetry emissions in [`src/app/api/enhanced-analysis/route.ts`](../src/app/api/enhanced-analysis/route.ts) that bypass the structured logger:

1. **`console.log("coach.tokens", {...})`** at line 1240 (streaming branch) and line 1348 (non-streaming branch) — token-usage tracking that emits as plain console.log JSON-ish output, NOT routed through `logger.info`. Misses the structured `requestId` / `module` correlation that the rest of the route uses.
2. **`console.error("Failed to fetch puzzles for mistake at move N", ...)`** at line 983 in `generatePuzzleRecommendations` — per-mistake failure log that bypasses `logger.error` so it doesn't carry the request-context fields and doesn't surface to Sentry consistently.

**Consequence today.** Token usage and puzzle-fetch failures aren't queryable by `requestId` in Vercel Log Drain (they're text-not-JSON for `coach.tokens`) and aren't correlated with the rest of the route's logging in Sentry. Low-severity discipline drift, not a correctness bug.

**Cleanup task.** Three-line migration per call site:

```typescript
// Before:
console.log("coach.tokens", { input: ..., output: ..., promptVersion: PROMPT_VERSION, streamed: true });

// After:
log.info("coach.tokens", { input: ..., output: ..., promptVersion: PROMPT_VERSION, streamed: true });
```

Same shape for the `console.error` in `generatePuzzleRecommendations` → `log.warn` (failure to fetch puzzles for one mistake is recoverable; warn-level matches the surrounding pattern at line 1292's `log.warn("puzzle recs failed in stream", ...)`).

Estimated size: ~5 LOC change. Net trivial.

**Why deferred.** Stage B's flag-on wing has plenty of surface; touching `coach.tokens` mid-stream during 1.C.B.4 risks the byte-identical-flag-off invariant getting harder to reason about (the audit relies on the existing console.log lines being unchanged when the flag is off). Cleanup PR after Stage B lands.

**Recommended trigger:** any future PR that touches the route file for an unrelated reason, OR a dedicated cleanup PR resuming the structured-logger migration cadence.

---

## 2026-05-23 — GitHub Actions CI doesn't run `next build`, allowing build-fatal lint errors to slip through to Vercel

**Status:** flagged during PR #26 (`mastermind/stage-3-validators` → main) when the first Vercel preview build failed on an ESLint `no-constant-condition` error in `route.test.ts` that CI hadn't caught.

**Background.** Today's CI workflow runs `tsc --noEmit` + vitest. Neither invokes `next build`. Vercel's preview builds DO run `next build`, which lints the codebase (including `__tests__/` directories) as part of the build. Build-fatal ESLint errors (e.g., `no-constant-condition`, `no-unused-vars` at error level) slip through CI green and surface as Vercel build failures on the PR.

**Consequence today.** CI green doesn't guarantee Vercel green. Discovered the hard way on PR #26: commit `5ace169` passed CI but failed Vercel; fix landed at `67b7c50` after one Vercel rebuild cycle.

**Cleanup task.** Add an `npm run build` step to the GH Actions workflow (or a CI-specific build script that mirrors what Vercel runs). Place after the tsc + vitest steps. Caches the `.next/` directory between runs to keep the step cheap.

```yaml
# Sketch — add after the existing typecheck-and-test job
- name: Vercel-parity build check
  run: npm run build
  env:
    SKIP_ENV_VALIDATION: "true"
    NODE_OPTIONS: "--max-old-space-size=4096"
```

Estimated size: ~10 LOC YAML + a build-cache directive. Trivial.

**Why deferred.** Not 1.C scope; Vercel green is the gate that matters for PR 1.C merge. Cleanup PR can land alongside any future infra-touching change.

**Recommended trigger:** any future Vercel build failure that should have been caught in CI (i.e., this issue happening twice), OR a dedicated infra cleanup PR.

**2026-05-23 update — second instance of the same gap.** The Stage C
Step 2.3.3 + cache wiring commit (`9436e5f`) deployed by Vercel failed
because `.vercelignore` excluded `scripts/` — but the new
`src/lib/mastermind/stageCcacheFallback.ts` statically imports
`scripts/synthetic-tester/fixtures/user_history_cache/*.json` at build
time. With `scripts/` excluded, the JSONs weren't uploaded to Vercel's
build machine, webpack couldn't resolve the imports, and `next build`
failed. Local builds passed (no analog ignore locally). CI passed
(`tsc + vitest`, no `next build` step). The same root cause as
the no-constant-condition issue at commit `5ace169`, different
mechanism — this time it's build context exclusion via `.vercelignore`
rather than ESLint rule. Fixed at commit `bc845ab` by replacing the
broad `scripts/` exclude with a targeted `scripts/data-pipeline/` (33 MB).

Updated cleanup task: the CI `next build` step should be the gate for
both ESLint errors AND build-context resolution. Same single workflow
addition catches both categories.

---

## 2026-05-23 — CLAUDE.md note 1 references `ignoreDuringBuilds:true` which is no longer set; lint is now an active build gate

**Status:** flagged during PR #26 alongside the CI-gap entry above. The two findings are paired — both surfaced from the same Vercel build failure investigation.

**Background.** [CLAUDE.md](../CLAUDE.md) note 1 ("Rules that bit us in the audit") states:

> `npm run build` and `npm run lint` are not quality gates. [next.config.ts](next.config.ts) sets `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true`; [.eslintrc.json](.eslintrc.json) has `"ignorePatterns": ["**/*"]` so `next lint` lints zero files. **Use `npx tsc --noEmit` as the pre-commit check.** Today it runs clean (0 errors) — keep it that way.

The `eslint.ignoreDuringBuilds` flag is **no longer present** in [next.config.ts](../next.config.ts) — likely removed during one of the recent infra hardening passes (auth migration / Sentry wiring). `next build` now treats ESLint errors as build-fatal. The note is stale; future-Claude reading CLAUDE.md will assume lint is permissive when it isn't.

**Cleanup task.** One-line CLAUDE.md edit to note 1. Reframe:

> `npm run build` lints the codebase as a hard gate (Vercel parity). ESLint errors in any file under `src/` (including `__tests__/`) fail the build. `typescript.ignoreBuildErrors: true` is still set so tsc warnings don't fail, but lint does. **Use `npx tsc --noEmit && npx next lint` together for pre-commit parity with Vercel.**

Estimated size: 2-3 line edit. Trivial.

**Why deferred.** Documentation correctness, not a code or behavior change. Folds naturally into the CI-gap cleanup PR above (same context, single PR for both).

**Recommended trigger:** same as CI-gap — any future incident traceable to this stale note, OR the same infra cleanup PR.
