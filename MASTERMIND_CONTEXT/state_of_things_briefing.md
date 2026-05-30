# Chess Masti — state of things briefing

**Audience.** Two readers in mind. First, large language models asked to brainstorm research-paper hooks out of the work being done here. Second, new interns who need to understand the product, the open workstreams, and where they fit. The doc is written for both at once: deep enough that an LLM can map it to existing research literatures, plain enough that a new intern can absorb the system without prior context.

**Scope.** What ships at chessmasti.com, what's wired but not yet shipped, what's strategic but not yet built, and what's experimental enough to be paper material. Cuts off at the smoke-recon completed today (PART 2 of the validator cost-calc verification, on a worktree off main + my unmerged PR #27).

**What this document is not.** Not the architecture audit (that's at [`architecture_audit.md`](architecture_audit.md), 1,115 lines, deeper on subsystem internals). Not the build plan (that's [`MASTERMIND_BUILD_PLAN.md`](MASTERMIND_BUILD_PLAN.md), executable). Not a cleanup tracker (that's [`cleanup_followups.md`](cleanup_followups.md), live). This is a briefing — it stitches state and intent together so a stranger can read once and know where things stand.

---

## 1. What just happened — the validator cost-calc verification (PART 2)

### Context in one paragraph

The Mastermind validator pipeline post-processes every server-side LLM coaching response against four ground-truth sources (Stockfish eval, computed feature deltas, opponent-scout data, user-history aggregates). When a validator catches a hallucinated claim, the pipeline regenerates with the offending claim itemised back to the model, up to a small retry budget; after that it falls back to a deterministic prose template built directly from the ground truth. The pipeline is gated behind a single env flag, `MASTERMIND_VALIDATORS_ENABLED`. The flag is unset in production right now. It was flipped on once (2026-05-24, ~16:00 UTC), tripped two findings within twelve minutes, and was rolled back — see thematic push #4 below. Since then, two PRs have addressed the rollback findings (PR #28 — AbortController for orphan cancellation; PR #38 — parallelised validator dispatch) and one PR (#27, still open) corrects a cost-calculation bug discovered during last week's smoke recon: the per-turn cost-estimator was subtracting `cache_read_input_tokens` from `input_tokens`, which is wrong because the Anthropic Messages API already returns `input_tokens` as the uncached portion. The smoke recon I just completed verifies PR #27's fix end-to-end against opponent_prep traffic.

### The smoke

- 10 turns of `opponent_prep` against a worktree of `mastermind/fix-cost-calc-prompt-caching` (PR #27's branch) cherry-picked off main.
- Worktree at `/Users/aayanhetamsaria/Downloads/Inspirit_project/chess-coach-ai-pr27-verify` with `node_modules` and `.env.local` symlinked to the primary worktree; dev server on port 3001 to avoid colliding with the other concurrent session's dev server on 3000.
- Warm-up turn (`concept_explanation --samples=1 --seed=999`) before the main run, gated on `pipeline_total_cost_usd > 0` to confirm PR #27's fix actually compiled into the served code path. Gate passed: warm-up cost surfaced as `$0.0162` (positive — would have been negative without the fix), classifier confidence `0.85`, retry count `0`, prep latency `1662ms`, all within the expected shape from prior smokes.

### Cost picture

| Metric | Value |
|---|---|
| Harness-tracked spend (student-question Haiku) | $0.0047 |
| Sum of `pipeline_total_cost_usd` across 7 pipeline-running turns | $0.110 |
| Per-turn cost (post-fix): mean / min / max / SD | $0.0157 / $0.014 / $0.018 / $0.0013 |
| True total Anthropic spend (harness + pipeline sum) | ~$0.115 |

**All 7 pipeline-running turns had positive `pipeline_total_cost_usd`.** The cost-calc fix is live in the served code. No negatives. The bug that PR #27 fixes did not regress.

### Validator firing pattern across the smoke

Aggregated from the dev-server's `mastermind-validator` log entries, filtered to this run's correlation IDs (~7 unique pipeline turns, each emitting a `validator_event` per check):

| check_name | fire_reason | count |
|---|---|---|
| `eval_claim` | `no_stockfish_eval` | 17 |
| `regenerate` | `passed` | 15 |
| `regenerate` | `regenerate_invoked` | 2 |
| `scout_citation_unsupported` | `unsupported_citation` | 2 |

The `eval_claim` skip is expected for `opponent_prep`: the category is non-move-focus, the request carries no `stockfishEval`, the validator early-returns with the skip telemetry rather than fabricating a comparison. The two `unsupported_citation` events are the interesting ones (next section).

### Citation rate

Zero passed `scout_citation` events. 1,097 scout opportunities counted across the seven pipeline turns. **Citation rate: 0%.** Per the decision tree set with Aayan: this falls in the 0-29% bucket — report as-is, flag as a Phase 2 prompt-engineering question, do not auto-conclude the validator or fixture pool is broken. The N=2 prior smoke produced 0% too; the N=10 result confirms the pattern is consistent, not a small-N artifact.

### The two retries — what actually triggered them

Both `unsupported_citation` fires were on `latest_rating` claim type, both quoting the LLM citing the *user's own* rating (not the opponent's):

```
corr=9cbbf18c
  span: "at your level (1500)"
  expected: { claim_type: "latest_rating", stated_rating: 1500 }
  actual:   { latestRating: 3011 }

corr=dd855e6e
  span: "For your rating level (1600)"
  expected: { claim_type: "latest_rating", stated_rating: 1600 }
  actual:   {}
```

The first is a real validator catch: the coach told a user "at your level (1500)" while the (synthetic) user's actual scout-recorded rating is 3011. The second is the same shape but against an empty user record. In both cases the regenerate produced a passing response on retry. So the pipeline *did* catch hallucinated user-rating claims, even though it failed to elicit (or to validate-pass) any opponent-fact citations.

### The new failure mode worth surfacing — cache-on-refusal

Three of the ten turns (1, 2, 6) returned identical responses in 296-382ms — far too fast for a real Sonnet call. All three were `Raghav_Chaturvedi` opponent attempts. Dev-server log confirms three cache HITs on the same key `f575bdfcb3c9...`. The cached payload is a *refusal*:

> "I'd love to help you prepare for your match against Raghav_Chaturvedi! However, I don't have access to external chess databases or the ability to look up specific players' game histories and opening repertoires."

This is the response-cache (`responseCache.ts`, LRU keyed by `FEN + skill + query-hash`) doing its job — but doing it on a *bad first response*. Turn 1 produced the refusal; subsequent same-opponent requests hit cache and got the same refusal back. The Sonnet flagship claims it can't access scout data, despite that data being present in the request body and surfaced in the prompt context with non-trivial size (Raghav has 95 scout opportunities — non-trivial dataset). So this is at root a *prompt-context-utilisation* failure that gets *amplified* by the response cache.

For the smoke this matters because the citation-rate denominator counted only the 7 pipeline-running turns (the cached ones bypassed the pipeline). For the broader product this matters because cached refusals propagate. Both are paper-worthy patterns (see §5 below).

### Three representative coach quotes (so the LLM-reader can ground its sense of voice + behaviour)

The pattern is consistent across the seven pipeline turns: the coach gives qualitative prep advice without making specific factual scout claims, and frequently includes a meta-disclaimer about data access.

**Turn 4 (gothamchess, normal pipeline):**

> Student: "Levy's d4 games show he loves sharp positions — should I focus prep on solid Anti-Queen's Indian setups, or would studying his e4 responses to 1...c5 be more practical for blitz?"
>
> Coach: "I appreciate your strategic thinking about preparation! However, I don't have access to specific data about Levy's games or playing patterns to give you the detailed analysis you're looking for. That said, I can offer some general preparation advice for facing aggressive players: For blitz specifically, I'd lean toward studying e4 responses to the Sicilian because blitz rewards pattern recognition over deep preparation..."

**Turn 7 (daniel_naroditsky, normal pipeline):**

> Student: "I'm 1700 rapid on chess.com facing Naroditsky soon — should I focus prep on stopping his Catalan endgame technique or learn a sharp Sicilian sideline to avoid his technical grind?"
>
> Coach: "I appreciate the strategic thinking, but I think you might be overthinking the prep! At 1700 level, the key to performing well against stronger players isn't trying to out-prepare them in their specialty areas — it's playing solid, principled chess and looking for your tactical opportunities. Here's my coaching perspective: Against the Catalan endgame approach: don't try to avoid his technical strength..."

**Turn 1 (Raghav_Chaturvedi, cached refusal):**

> Coach: "I'd love to help you prepare for your match against Raghav_Chaturvedi! However, I don't have access to external chess databases or the ability to look up specific players' game histories and opening repertoires. To get this kind of opponent analysis, you'll want to: For Opening Repertoire Research: Check chess.com's player profile..."

Across all three quotes: a polite refusal-of-data-access framing, even though the prompt context contains the data. The Naroditsky turn is the most interesting — it doesn't refuse outright, but it diverts to general advice ("playing solid chess") rather than engaging with the specific Catalan / Sicilian-sideline question. The coach's behaviour reads as risk-averse: it would rather give generic advice than cite a specific opponent fact and risk being wrong.

### Decision-tree outcome

Per the runbook lock-in:

| Branch | Citation rate observed | Outcome |
|---|---|---|
| ≥ 30% | Would have said: main sweep proceeds as planned, opponent_prep is fine, N=2 was noise | Did not trigger |
| 0-29% | Report as-is, flag as Phase 2 prompt-engineering question | **Triggered.** |
| Any turn fails or cost goes negative | Stop immediately, cost fix may have regressed | Did not trigger |

So: cost fix is verified live, but the prompt-engineering question is open.

---

## 2. The architecture that contains all of this

Compressed-down version. The 1,115-line audit at `architecture_audit.md` is the canonical reference. What follows is enough for a paper-brainstorm or an intern onboarding without forcing the full audit read.

### The coaching critical path

A request arrives at one of two server-side routes — `/api/enhanced-analysis` for first-turn deep analysis, `/api/chat` for follow-up turns against a server-cached analysis context. The route extracts the user's question and (when relevant) the game state. A Haiku-backed classifier sorts the question into one of six categories (`game_review | position_analysis | concept_explanation | opponent_prep | improvement_strategy | meta_motivational`). The category determines which validator sources get fetched (scout for opponent_prep; user-history for improvement/meta; computed feature delta for the move-focused categories) and which fields populate the moveContext (move-focus categories get FEN + Stockfish eval threaded through; non-move-focus categories deliberately omit them).

The route then makes the main coaching LLM call — Sonnet 4 flagship for first-turn, Haiku 4.5 for follow-ups — with a structured 5-category prompt (Threats / Best Moves / Plans / Piece Roles / Concepts) that tells the model to pick whichever subset of the five categories is relevant rather than fill all five. The response goes through the validator pipeline before being returned to the user.

### The validator pipeline

The pipeline's primary purpose: catch claims the model can't support against the data it was given, and either regenerate or fall back to deterministic prose. Four validators run in fixed order (eval-claim, feature-citation, scout-citation, user-history-citation); each parses the model's prose via a Haiku sub-call into structured claims and cross-checks them against its ground-truth source. If any claim fails, the regenerate loop appends the failing claims back to the conversation as a user turn ("your previous analysis had the following validation failures: ...") and re-prompts. After up to 2 retries (1 for follow-up chat), if validation still fails, `buildFallbackResponse` composes coaching prose deterministically from the same ground-truth data the validators were checking against — a band statement from the Stockfish eval, top-3 feature-delta phrases, threat summary, role-change hints — with an explicit no-apology constraint.

This is the project's strongest paper material. The pipeline is full of specific design choices grounded in production behaviour: validator parsers reject "metaphorical" prose (the model saying "Black's pieces are dancing around the kingside" is not an evaluative claim and shouldn't be checked against Stockfish); adjacent-band tolerance of 20cp prevents false-positives when the model lands one band off and Stockfish is near the boundary; per-claim-type opportunity counters distinguish "the model didn't have any scout-facts to cite" from "the model cited and was wrong"; the fallback's deterministic prose is the project's terminal commitment to grounded output.

### The retrieval pipeline (post-mistake reinforcement)

Separate from the coaching pipeline. When a user misses a position, the system serves reinforcement puzzles from a Neo4j puzzle graph (~100k Lichess puzzles, filtered at ingest by popularity ≥ 60, plays ≥ 50, rating-deviation ≤ 120). The retrieval is three stages: a deterministic concept detector classifies the anchor position into a small set of concept IDs; Neo4j returns candidates by concept overlap and rating band; the survivors get re-ranked by a closed-form weighting `0.5·concept_confidence + 0.35·structural_similarity + 0.15·rating_proximity`. The structural similarity is a 49-dimensional handcrafted FEN feature vector (material per side, pawns per file, pawn weaknesses, king position, piece centralisation, phase, castling/special) compared by cosine. The final top-N is picked by max-marginal-relevance with `lambda = 0.3` so the user sees the same concept in varied surface forms.

### The five external sources the coaching path touches

- **Stockfish 17 (WASM)** — runs in the browser as a Web Worker. The server doesn't talk to Stockfish directly; the route consumes eval-vectors that were computed client-side and persisted into `gameEval.positions`.
- **Anthropic Messages API** — primary LLM for all server-side coaching. Sonnet flagship and Haiku fast. Prompt caching enabled (5-min TTL). OpenAI fallback wired but `OPENAI_API_KEY` is not configured in production today.
- **Maia-2 (NeurIPS 2024)** — human-likeness move prediction. Runs as a FastAPI/PyTorch microservice on Hugging Face Spaces (Vercel serverless can't host PyTorch). Vercel cron keeps the Space warm every 12h. Maia predictions are threaded into the coach prompt for the "what humans at your level play" framing, and into the insight-card rendering via a `[MAIA_CONTINUATION:...]` token.
- **chess.com + Lichess public APIs** — for opponent scouting and user game history. The scout pipeline (`scoutService.buildOpeningTree`) builds an opening tree weighted by per-player frequency; aggregates produce the ATK/DEF/TIME/MIND/OVR profile and "Stalker Score" surfaced on the scout dashboard.
- **Jhamtani et al. (ACL 2018) ChessCommentaryGeneration corpus** — preloaded under `data/chess-commentary/`. Loader and `:Commentary` Neo4j schema exist but the live Aura state is unclear; the `/api/commentary-by-fen` route exists but has zero in-app callers.

### What's gated and what isn't

- **`MASTERMIND_VALIDATORS_ENABLED`** — pipeline runs only when set true. Currently unset in production; set true in local dev for the smoke recon I just completed. Lives behind an env flag because the routes' flag-off branch is contractually byte-identical to pre-validator-pipeline behaviour. Tested.
- **`VERCEL_ENV === "preview"`** — when set, the route inlines `pipeline.telemetry` into the JSON response (so the synthetic-tester harness can capture it). When unset, the structured logger still emits telemetry events to stdout / Vercel Log Drain on every env — the gating is response-shape only, not logging.
- **Stage C cache fallback** — only fires when both `VERCEL_ENV === "preview"` AND the username matches one of the four cached test users (Lazer_Wizard, JSNoverPuka, Chilllychess, gothamchess). Production traffic and any other username are unaffected.

---

## 3. The last two weeks of work, themed

These are not commit lists — they're the coherent multi-PR pushes that each represent something the team was actually trying to accomplish.

### 3.1 Cutover to `/preview/analysis` (the new dark surface)

**Active.** PRs #55, #56, #57, #58. The new dark-glass analysis surface landed at `/preview/analysis` as a non-cutover redesign (PR #55), then PR #56 wired all production analysis features into it: the G1-G17 game-review rendering, the insight carousel (DecodeChess-style paginated `[INSIGHT:...]` blocks), the concept→puzzle CTA pipeline, the NavPill account UI, and OAuth error-state preservation. PR #57 fixed a cursor-desync bug in the Masters panel where the chess.js engine state didn't advance with the display cursor (manifested as `Invalid move: e7-e5` after ply 1). PR #58 promoted `savedEvalsAtom` to `atomWithStorage` so cross-page hydration actually persists.

PR #56 is OPEN and ready for merge. PR #57 and #58 are merged. This is the only thing actively in-hand in the last 12 hours; everything else has shipped or is paused.

For interns: when the user says "the new analysis page" they mean `/preview/analysis`. Legacy `/analysis` still ships, both have real-time streaming now (see push 3.6).

### 3.2 Chrome Extension MVP + Web Store push

**Code complete, store submission not yet pulled the trigger.** PRs #37, #39, #45, #46, #48, #50. PR #39 ships the extension itself: an "Analyze with Chess Masti" button injected into Lichess and Chess.com game pages. The extension extracts the PGN and hands it off via a deep-link query parameter. PR #37 is the receiving side on chessmasti.com — `/analysis?pgn=...` parses the param and loads the game. PR #46 extends that to `?autoAnalyze=1` which auto-triggers the analysis on load and locks chat until ready. PR #45 adds diagnostic logging and a floating-button fallback if the page-injection target isn't found. PR #48 is the Web Store submission prep: icons, a `/privacy` page, listing copy. PR #50 adds the install-this-extension pathway on chessmasti.com itself.

The Web Store submission hasn't been filed. This is the biggest deferred revenue lever right now — the extension is the project's single highest-leverage acquisition channel (every chess.com / Lichess game becomes an entry point) and it's sitting one form away from being live.

### 3.3 Privacy disclosure audit

**Shipped.** PRs #44, #51, #52. PR #44 hardens the OAuth `returnTo` parameter against open-redirect attacks and preserves the intended destination across the auth flow. PR #51 updates the contact email. PR #52 is the audit itself — what data the product collects, what third parties touch it (Maia microservice, Sentry, Vercel Analytics, scout fetches against chess.com / Lichess public APIs, opponent usernames flowing through the scout pipeline, the extension's content-script scope). These are preconditions for the Chrome Web Store submission and for any forthcoming user-facing trust framing.

### 3.4 Mastermind orchestrator — Phase 1 foundation

**Phase 1 substantially shipped. Phase 2 not yet started. Phase 3 blocked.** PRs #26, #27, #28, #38.

PR #26 was the big merge — 69 commits — landing Stage A (the validator foundations: eval-claim, feature-citation, scout-citation, user-history-citation), Stage B (route wiring: flag-gated invocation from both `/api/enhanced-analysis` and `/api/chat`, including `prepareMastermindContext`, `wireValidators`, `pipelineTimeout`, `routeHelpers`, and `validatorTelemetry`), and Stage C Follow-ups A and B (the synthetic-tester harness against preview deploy, with `pipeline_*` CSV columns and the position-anchored two-step flow for `game_review` / `position_analysis` live turns).

PR #27 (OPEN as of writing) corrects the prompt-caching cost calculation. Pre-fix the per-turn cost-estimator computed `inputUncached = inputTokens - cacheRead`, which is wrong because Anthropic's `input_tokens` field is *already* the uncached portion (per `platform.claude.com/docs/en/build-with-claude/prompt-caching`: "Number of input tokens which were not read from or used to create a cache (that is, tokens after the last cache breakpoint)"). The subtraction produces negative cost values when the cache is warm, which is the common case for the cache-heavy validator pipeline. The fix also accounts for `cache_creation_input_tokens` at the documented 1.25× base-input rate for the 5-min TTL, which was previously ignored entirely. Three files affected (same bug duplicated across `regenerate.ts`, `evalClaim.ts`, `categoryClassifier.ts`); regression tests added to all three; 613/613 vitest pass at branch tip.

PR #28 fixes both findings from the 2026-05-24 production flag-flip rollback. The flip was tripped at 16:00 UTC, Aayan tested one chat turn at 16:12 UTC, and rolled back by 16:50 UTC. Two findings: (1) the validator parser LLM call stalled at 60s with 9 output tokens, attributed to a *later* `/api/maia-status` request (because the underlying LLM promise kept running after the route's timeout fallback returned); (2) post-timeout telemetry didn't reach Vercel logs. Both had the same root cause: `Promise.race` doesn't cancel the loser. PR #28 threads an `AbortController` through every layer (factory → `withPipelineTimeout` → `runValidationPipeline` → `regenerate` → `validate` → `parseCall` → `callLLM` → `fetch`), so when the timer fires, the in-flight fetch aborts cleanly and `callLLM` doesn't re-spawn the orphan via the OpenAI fallback path.

PR #38 parallelises the validator pipeline dispatch — the four validators now fan out concurrently rather than running sequentially.

What's left for Phase 1: nothing, basically. What's Phase 2: the orchestrator UI workstream tagged 2.F (the in-product surface that lets the coaching agent reason about *which tools to use* given a user question, rather than relying on a single Sonnet pass). No PRs yet. This is the real strategic gap. What's Phase 3: CMIP-2 (the intern-feedback portal feeding ratings back into the validator-eval loop) plus a correlation analysis. Blocked on CMIP-1 finishing (only the 1.A sub-PR has shipped; 1.B, 1.C, 1.D are pending and stagnant since 2026-05-24).

### 3.5 Coach insights, sharing, and snippet permalinks

**Shipped.** PRs #29, #30, #31, #32, #33, #40, #41, #43. PR #29 ships the snippet dialog and polishes the scout-card share UX. The next four (#30 through #33) are the rasterizer fight: the snippet dialog renders a coach-analysis insight as an SVG, then rasterises to PNG for sharing. The original implementation used `Backdrop` + `DOMParser` and broke in production with cryptic errors; the fix sequence is `Backdrop`→`Dialog`, inline real piece SVGs into the snippet (rather than referencing externally-loaded ones), bypass `DOMParser` for snippet-sized rasterizer, surface real rasterizer errors, replace `&middot;` HTML entity with literal `·` for cross-browser snippet brand-footer rendering. PR #40 adds permalinks for the rendered snippets (so they can be shared as URLs, not just images). PR #41 does the same for scout reports — a snapshot URL that captures the rendered scout dashboard at a point in time. PR #43 introduces two share modes — single insight versus whole conversation.

For interns: this push closed the *viral-loop infrastructure*. Every coach insight and every scout report can now be shared as a permalinked image-or-URL. The product previously had analysis output but no shareable artifact; now every interesting moment in the product has a one-click external surface.

### 3.6 Analysis flow hardening

**Shipped.** PRs #34, #42, #47. PR #34 guards `handleSend` against double-send (a user hitting Send twice while the prior request is still in-flight) and against mid-analysis dispatch (sending a chat turn while the underlying game-analysis Sonnet call hasn't returned yet). PR #42 syncs the board cursor with the loaded PGN — previously the board could end up displaying a different position than the move list cursor pointed at. PR #47 wires real-time streaming for `game_review` turns and bumps the pipeline timeout from 30s to 55s, accommodating the longer Sonnet-flagship responses now that the validator pipeline adds parser-call overhead.

### 3.7 Project skills install + design-OS adoption

**Shipped.** PR #54. Installed 51 skills across four packs: `stop-slop` (a writing-quality enforcer), the `ui-ux` pack (7 design-related skills), `remotion` (programmatic video), and a 42-skill marketing pack. Companion memory entry committed so UI work pulls from the project's Design OS by default — glass tokens, the Obsidian Glass colour vibe, MUI-not-Tailwind constraint, the existing `src/components/ui/` primitives.

### 3.8 Planning artifacts (not PRs, but in-flight intellectual work)

The `MASTERMIND_CONTEXT/` directory holds 13 plan documents that collectively define Phase 1 of the orchestrator architecture: the codebase map (which file backs which capability), competitor positioning, the data inventory (what's preloaded, what's live-fetched, what's gated), failure modes (10 documented classes with cited code paths and recovery paths), strengths (where the product measurably beats competitors today), Tier-A content gaps (seven gaps in `data/` requiring human authoring before the orchestrator reaches Tier-A coverage), the tool inventory (17 wrapped, 6 partial, 29 design-only), and the user-model (every persistent attribute the agent can read about a user).

There are 6 sub-plans under PR_1C_ covering data audit, pipeline sources, scout citation, user-history aggregates, Stage B route wiring. CMIP-1 has its own plan (`PR_CMIP_1_PLAN.md`) with four sub-PRs (1.A done; 1.B/C/D pending). `FUTURE_LANDING_V2.md` captures the parked WebGL-landing roadmap. `FUTURE_IDEAS.md` and `FEATURE_ROADMAP.md` are the backlog docs. `LICHESS_PUZZLE_SCALING_PLAN.md` is the scaling roadmap for the puzzle corpus beyond the current ~100k.

---

## 4. The strategic gaps

Five things to notice about the patterns above.

**Only one workstream is actively in hand.** The `/preview/analysis` cutover (PR #56 ready for merge) is the only thing being driven forward right now. Everything else has either shipped or is paused. This is healthy in the sense that the team isn't multi-tasking destructively, but it's worth noting because the "paused" pile is large and some of it is high-leverage.

**The Chrome Extension is store-ready but unsubmitted.** This is the single biggest deferred revenue lever. The code is done, the privacy disclosure audit is done, the install pathway on chessmasti.com is wired. The remaining work is a Web Store submission form. Every day this sits unsubmitted is a day Lichess and chess.com users aren't seeing the entry-point button.

**Mastermind Phase 2 has zero PRs.** Phase 1 finished a week ago. The plan calls for Phase 2 = the orchestrator UI workstream (tagged 2.F), which is the in-product agent loop that decides which tools to invoke. There are no branches, no plan docs beyond a one-paragraph mention in the build plan. This is the real strategic gap — Phase 1 built the validator scaffolding but the agent loop that uses it intelligently is unbuilt.

**CMIP has been stagnant since 2026-05-24.** CMIP-1 (intern allowlist + auth wiring) shipped sub-PR 1.A. Sub-PRs 1.B (intern flag-marking on feedback events), 1.C (feedback ingest pipeline), and 1.D (intern-only dashboard) have not started. CMIP exists to feed real-coach-response ratings into the validator-eval loop — without it, the validator gates are calibrated against synthetic-tester output only, which is much narrower than the real coaching surface.

**No active branches for the next-in-memory items.** The user's project memory flags 2.F (Mastermind Phase 2 orchestrator UI) and CMIP-1.B as the next things to work on. Neither has a branch. The branch list is dominated by 4 concurrent sessions doing other things (scout improvements, signin-return-to fix, parallel-validator-pipeline work that was already merged).

---

## 5. What's paper-worthy

The audience for this section is the LLM that's going to be brainstorming research-paper hooks. I'll list candidates by how much novel infrastructure they sit on top of, and surface the empirical observations that could anchor each one.

### 5.1 The validator-pipeline architecture itself

The strongest paper material. The pipeline is full of decisions that don't have obvious analogues in the published literature on grounded LLM generation:

- **Per-claim-type opportunity counters distinguish "didn't cite" from "wrong cite".** Most published work on grounded generation reports a single hallucination rate. The pipeline here separately tracks the *denominator* (how many citable facts existed in the ground-truth data) and the *numerator* (how many the model cited correctly versus incorrectly). This separation enables the `citationRate` metric (per `citationRate.ts`), which is the per-category gate metric for the Stage C sweep.
- **The "metaphorical" prose classification in the eval-claim parser.** The parser explicitly distinguishes evaluative band-naming ("Black is winning") from descriptive verbs ("Black's pieces are dancing around the kingside") and only checks the former against Stockfish. Most published validator work treats the model output as a flat string; this carves out a "non-claim" subspace.
- **Adjacent-band tolerance with boundary-proximity check.** The qualitative-band validator's 20cp tolerance is conditional on Stockfish's cp being near the band boundary, not unconditional. This is a concrete instance of the broader "calibrate validators against the granularity of the ground truth itself" pattern, with hand-tuned numbers.
- **The deterministic fallback's no-apology constraint.** Most grounded-LLM systems handle validation failure by appending a "may be inaccurate" disclaimer to the model's output. The pipeline here rejects that pattern explicitly: `buildFallbackResponse` composes prose from ground truth and refuses to add caveats. This is a *trust-design* choice and the codebase carries the rationale explicitly (cited in `fallback.ts:155-165` and audit §C.7).

Paper-shape: "Layered validation for LLM-coaching pipelines: a per-claim-type taxonomy and a deterministic-fallback contract." Empirical material exists: 6 categories × multiple validators × synthetic-tester sweep data (when Stage C lands). The audit doc at `architecture_audit.md` already documents the taxonomy.

### 5.2 The cache-on-refusal failure mode (today's smoke finding)

When an LLM produces a confident refusal ("I don't have access to that data"), and that refusal gets cached by a downstream response cache keyed on lossy features of the request (here: FEN + skill + query-hash), subsequent semantically-similar requests get the same refusal *amplified*. This is a *cache-augmented retrieval failure*: the cache is doing what it's supposed to do (deduplicate near-identical requests), but the artifact it's caching is a system failure rather than a system success.

Empirical instance: 3 of 10 opponent_prep requests in today's smoke (same opponent, slightly different student questions) returned the identical cached refusal in <400ms. The Sonnet model claimed it couldn't access scout data despite the data being in the request body. The pattern is paper-worthy because:

- It's a general failure mode for any retrieval-augmented generation pipeline with downstream caching.
- It has measurable harm (cache hit rate × refusal rate × downstream user trust impact).
- It has a few non-obvious mitigations: validate-then-cache (don't cache responses that fail a quality gate), confidence-bounded caching (cache only when the model's response signals high confidence), invalidate-on-refusal-pattern, or per-response-type cache keying (refusals get their own short-TTL bucket).

The audit also documents a related anti-pattern: the legacy `aiResponseValidator.ts` *skips* validation when given an invalid FEN and silently writes the model output to cache with a generic disclaimer appended — same root pattern, different surface.

### 5.3 The 49-dim handcrafted FEN feature + cosine + MMR retrieval pipeline

The 49-dim vector is hand-designed (material per side, pawns per file, pawn weaknesses, king position, centralisation, phase, special) and combined via cosine. The retrieval pipeline then runs three stages: hard-filter by concept overlap, soft-rerank with `0.5·concept_confidence + 0.35·structural_similarity + 0.15·rating_proximity`, then MMR with `lambda = 0.3` for diversity.

This is competitive with learned embedding approaches in several ways worth measuring:

- **Interpretability per dimension.** Every dimension has a chess-meaning. Failure modes (e.g., trivial endgames produce near-zero vectors that cluster artificially — documented in `MASTERMIND_FAILURE_MODES.md` §5) are diagnosable from the vector itself.
- **Ingest-pipeline complexity.** The handcrafted vector is computed in pure JS from FEN; no embedding model needs to be hosted.
- **MMR diversity rationale.** The pipeline cites the "interleaving principle" from spaced-practice pedagogy, not the typical IR-literature MMR application — using the diversity term to maximise the number of distinct surface forms of the same concept the student sees.

Paper-shape: "Handcrafted-feature retrieval for educational reinforcement: a chess case study with interpretability and diversity grounding." Empirical material: the Neo4j corpus (~100k puzzles, varied ratings), the MMR `lambda = 0.3` rationale (interleaving), the documented degenerate-endgame failure mode.

### 5.4 Twin Bot — book-then-engine opponent simulation

A two-phase opponent simulator: book phase walks the actual opponent's opening tree (built from their public games on chess.com / Lichess), weighted by per-move frequency; engine phase delegates to Stockfish with `UCI_LimitStrength` and `UCI_Elo` set to the opponent's *phase-specific* rating (separate for opening, middle, endgame). The output declares its source explicitly (`book | engine | fallback`) so the UI can show "your opponent played this move in 67% of their 30 games here."

This is paper-worthy as a hybrid retrieval-and-simulation pattern. Most "play against a specific opponent" tools either use a generic opponent model (Maia) or a static book. The combination — specific-opponent book + level-clamped engine, with source attribution per move — is the project's novelty. The empirical hook is the per-opponent rehearsal-fidelity measurement: how often does the bot's chosen move match what the opponent actually plays in a held-out set of their games?

### 5.5 The CMIP feedback portal as eval-data pipeline

When CMIP-1.B, 1.C, 1.D land, the system will have a continuous stream of intern-rated coach responses. The interesting paper hook is the *delta* between validator-pipeline gates and intern ratings: where do they agree, where do they diverge, and what does the divergence tell us about which validator-pipeline checks are over-confident, under-confident, or pointing at the wrong axis of quality?

This is paper-worthy because most LLM-as-judge work compares a single auto-judge to human ratings. The architecture here has *multiple* structured auto-judges (per validator) plus *multiple* axes of human rating (per CMIP-2 design — pedagogy, accuracy, voice, etc.). The space to measure is bigger.

### 5.6 The Stage C synthetic-tester sweep methodology

Six categories × multiple personas × controllable-seed RNG × CSV-shape telemetry. The harness is designed so a sweep run produces N=60-100 turns of (game, persona, question, coach response, validator verdict) tuples for manual grading, with per-turn cost tracking and a budget cap that aborts cleanly.

The paper hook is *methodological* rather than result-driven: how do you stress-test a multi-validator coaching pipeline without paying for either huge human-labelling budgets or LLM-as-judge bias? The harness's answer is a synthetic-student-persona stack (9 personas, each with a YAML frontmatter + system-prompt body) where each persona is its own Haiku-generated student question, against position checkpoints picked from real games with documented pick-policy (60% swing / 20% quiet / 20% spread).

### 5.7 Cost-calc bug + pricing-API-contract paper

This is a small finding but cleanly paper-worthy as a "lessons from production" piece: cost-tracking for LLM API consumers gets subtle wrong-by-default when prompt caching is involved, because the standard intuition ("`input_tokens` is total input") is exactly backwards under caching ("`input_tokens` is the post-breakpoint uncached portion only"). The bug shows up as negative cost values rather than as incorrect-but-positive ones, which is the giveaway. Three duplicate implementations across the validator family all had it (`regenerate.ts`, `evalClaim.ts`, `categoryClassifier.ts`) — same misreading of the API contract, replicated three times. PR #27 fixes it, with regression tests, and adds the missing `cache_creation_input_tokens × 1.25` term that was previously dropped entirely.

The general pattern: anywhere you're computing cost across a layered prompt-caching API, the right formula is `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` summed at their respective per-token rates, not a subtraction-based factoring.

---

## 6. Intern onboarding — where to start reading

For someone new to the codebase, in order:

1. **`CLAUDE.md`** at the project root. Three-page orientation — what the product is, what the AI architecture looks like, the rules that bit the team during the audit, which persistence layer to touch.

2. **`MASTERMIND_CONTEXT/MASTERMIND_INDEX.md`**. Index of the 9 plan documents in the directory, with load order and trigger conditions. Read the SUMMARY blocks of MASTERMIND_STRENGTHS, MASTERMIND_USER_MODEL, MASTERMIND_TOOLS — that's the foundational ~600 words.

3. **`MASTERMIND_CONTEXT/MASTERMIND_CODEBASE_MAP.md`**. Module-by-module map of `src/lib/` and `src/app/api/`. Useful for "where does X live?" lookups while reading code.

4. **`MASTERMIND_CONTEXT/architecture_audit.md`**. The 1,115-line deep audit. Long but comprehensive. The "Published-work references found in the codebase" section at the end is the citation map for the project's external dependencies (Maia, Jhamtani corpus, CYHSM surprise-analyzer, etc.).

5. **`MASTERMIND_CONTEXT/cleanup_followups.md`**. The live tracker of non-blocking cleanups, in-flight investigations, and known issues. Update it when you find something worth tracking but out-of-scope for the PR you're in.

6. **`MASTERMIND_CONTEXT/MASTERMIND_FAILURE_MODES.md`**. Ten documented failure classes with code citations and recovery paths. Read this before debugging anything mysterious.

A few conventions to internalise:

- **Plan-first discipline for non-trivial Mastermind work.** Write the plan doc to `MASTERMIND_CONTEXT/PR_NX_PLAN.md`, pause for Aayan review, then implement. Chess and coaching decisions go to Aayan; architecture, scope, and cost decisions go to the tech lead.
- **Don't merge other people's PRs.** Open them, get them reviewed by Aayan, let him merge.
- **`MASTERMIND_VALIDATORS_ENABLED` is the env gate** that determines whether the validator pipeline runs. Off in production. On in local dev (during PR #27 verification at least). The flag-flip protocol per the 2026-05-24 rollback cleanup says: do not re-flip in production until the rollback-finding fixes (PR #28, PR #38) have a real verification on Preview.
- **Branches are cheap.** When working on multiple things in parallel, use `git worktree add` (the PART 2 verification this session used a worktree to run a dev server on port 3001 with my unmerged PR #27, in parallel with another session's dev server on 3000).

---

## 7. Open threads as of this writing

- **PR #27** (cost-calc fix) — still OPEN, ready for review. PART 2 verification completed against a worktree; all assertions hold.
- **PR #56** (production analysis features wired into `/preview/analysis`) — OPEN, ready for merge.
- **Chrome Web Store submission** — code complete, form not filed.
- **Mastermind Phase 2 (orchestrator UI 2.F)** — no PRs, no branches, no plan doc beyond the build-plan mention.
- **CMIP-1.B / 1.C / 1.D** — pending since 2026-05-24, no branches.
- **Production flag-flip** — gated behind the rollback-finding verification window. PR #28 fixes the orphan-pipeline root cause; PR #38 parallelises dispatch. Verification on Preview with focused chat-turn smoke that captures parser timing per-call would be the next concrete step before any re-flip.
- **Worktree at `chess-coach-ai-pr27-verify`** — still active from this session's PART 2 verification. Dev server on port 3001 running. Awaiting cleanup once Aayan signs off on the verification result.

---

*Document compiled 2026-05-29 from the audit at `architecture_audit.md`, the live `cleanup_followups.md`, the PR list provided, and the PART 2 smoke-recon I just completed on a worktree off PR #27.*
