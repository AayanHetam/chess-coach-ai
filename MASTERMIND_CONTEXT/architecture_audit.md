# Architecture Audit — Chess Masti coaching critical path

Read-only research-mapping pass. Comprehensive coverage at summary depth. Source-restricted sections (Stage C WIP code) carry an explicit banner; rationale for those sections is drawn from `MASTERMIND_CONTEXT/PR_1C_*` plan docs, commit messages, and import-block signatures only.

Conventions:
- File paths are relative to `chess-coach-ai/`.
- LOC figures are file LOC, not audit-text LOC.
- Quotes from comments / commits are verbatim with `file:line` or commit SHA citation.
- "**No design rationale surfaced**" is itself a finding — flagged explicitly when comments/commits don't justify the design.

---

## A. Chess Intelligence Layer (pre-LLM)

What runs **before** the LLM and gets fed into the prompt context: Stockfish invocation, the structured analytics that produce `featureDelta` / `pieceRoleDiff` / `threatTree` / `criticalMoments`, and the candidate-gap heuristic for "surprise" detection.

### A.1 Stockfish WASM driver

**Files**
- `src/lib/engine/stockfish17.ts` (28 LOC), `stockfish16_1.ts` (28), `stockfish16.ts` (38), `stockfish11.ts` (14), `shared.ts` (40)
- `src/lib/engine/uciEngine.ts` (431 LOC) — UCI worker pool + multipv/elo wrapper
- `src/lib/engine/worker.ts` (66 LOC)
- `src/constants.ts:22-23` — `DEFAULT_ENGINE: Stockfish17Lite`, `STRONGEST_ENGINE: Stockfish17`

**Purpose.** In-browser Stockfish 17 (WASM, Web Worker) producing PV/eval. Browser-only — server-side coaching paths consume engine output that was previously computed client-side and persisted into `gameEval.positions`.

**Design rationale.** `stockfish17.ts:11-16` switches to a `-single` binary when `isMultiThreadSupported()` is false ("Single thread mode"). `shared.ts:7,13` gates on `isWasmSupported()` / `isMultiThreadSupported()` — no SharedArrayBuffer / no COOP-COEP → automatic degrade to single-thread. UCI driver caps multipv at `[2,10]` and Elo at `[1320, 3190]` (`uciEngine.ts:87-89`, `:102-103`) — both are stated as Stockfish UCI constraints, not chosen thresholds.

**Implementation specifics.**
- Multi-binary selection by engine variant + WASM capability + Lite/Full size (`stockfish17.ts:14-16` builds path string).
- Worker pool with job queue (`uciEngine.ts:55-82`); `multiPv = 3` default (`:29`), reset only when caller asks for a different value.
- No depth/time policy embedded in the driver — caller passes depth via `getEngineNextMove(fen, elo, depth)`.

**External deps.** Stockfish 17 (and lite) — public binaries; no published-work citation. UCI protocol implicit.

**Novelty flags.** None.

**Empirical data.** No telemetry in the driver itself. WASM serves at `/engines/stockfish-16/*.wasm` per `CLAUDE.md`. `engine/testRealEngine.ts` is a developer harness, not a regression suite.

### A.2 Critical-moment detector

**File.** `src/lib/mastermind/criticalMoments.ts` (132 LOC).

**Purpose.** Picks the top-N "criticality-weighted" moves from a played game — `criticality = 0.6·dropNorm + 0.3·complexity + 0.1·phaseWeight` (`:27-29, :22-25`).

**Design rationale.** Replaces a prior route-side top-by-raw-drop selector: "Replaces the route's existing top-by-raw-drop selection at `route.ts:551-574`" (`criticalMoments.ts:80`). Phase weight is hand-tuned (`phaseWeight()` at `:45-52`): endgame=1, opening=0.4, middlegame=0.7 — rationale stated as "endgame errors tend to be more decisive than opening ones" (`:77-79`).

**Implementation specifics.** Cp-drop thresholds (`:22-25`): BLUNDER=300, MISTAKE=150, TURNING_POINT=100, INACCURACY=50. Mate sentinel ±10000 (`:33`). Replays moves rather than trusting input alignment ("the engine output and UCI history can be misaligned if intermediate positions failed to evaluate"; `:55-57`).

**External deps.** None named.

**Novelty flags.** None.

**Empirical data.** Unit tests at `src/lib/mastermind/__tests__/criticalMoments.test.ts` (filename only — modified in Stage A.x, not Stage C; safe).

### A.3 Position-complexity score

**File.** `src/lib/mastermind/complexity.ts` (91 LOC).

**Purpose.** 0–1 complexity for a position, blended from `fanOut/35`, top-vs-3rd-line cp spread normalized to 200cp, and a binary `forcing` flag (check / capture in PV / mate present).

**Design rationale.** Weights stated explicitly: `FAN_OUT_WEIGHT=0.4, SPREAD_WEIGHT=0.4, FORCING_WEIGHT=0.2` (`:14-16`). Use stated at top of file: "Used to decide whether to spend flagship (Sonnet) or fast (Haiku) tier on a coaching turn" (`:23-25`). Origin of normalization constants (35 moves, 200cp) **not surfaced** — magic numbers.

**External deps.** None.

**Novelty flags.** None.

### A.4 Feature delta (position-change vector)

**File.** `src/lib/mastermind/featureDelta.ts` (351 LOC).

**Purpose.** Produces `PositionFeatureDelta`: material, pawn structure (doubled/isolated/passed gained/lost + open/semi-open files), king safety, piece-activity, hanging pieces, threats — computed between `fenBefore` and a `resolutionFen` (PV-walked quiescent position).

**Design rationale.** Resolution-point heuristic with hard caps: `QUIESCENCE_EVAL_TOLERANCE_CP=30`, `RESOLUTION_MAX_PLIES=12` (`:12-13`). Quiescence definition aligned with `MASTERMIND_FAILURE_MODES.md §10` description ("no captures pending, no checks, eval stable within 30cp"). Strict invalid-FEN handling via `InvalidFenError` thrown rather than swallowed (`:70-83`) — explicitly the "do NOT replicate the validator's silent-warn pattern" anti-pattern flagged in `FAILURE_MODES.md §10e`.

**Implementation specifics.** `PIECE_VALUES = {p:1,n:3,b:3,r:5,q:9,k:0}` (`:11`) — standard textbook values; origin not cited. `ResolutionReason` discriminant of 5 cases (`quiescent | forced-end | depth-limit | no-pv | no-resolution-needed`).

**External deps.** Consumes `positionAnnotator.ts`'s `PositionAnnotation` shape (`:2-9`).

**Novelty flags.** None directly in the file, but flagged externally in `MASTERMIND_STRENGTHS.md §6 Caveats` ("feature deltas at the resolution point are not yet wired in" pre-2026-05-08, then shipped; "Stage 3 grounding" in `FAILURE_MODES.md §10`).

**Empirical data.** Tests at `__tests__/featureDelta.test.ts`.

### A.5 Piece-role classifier and diff

**File.** `src/lib/mastermind/pieceRoles.ts` (330 LOC).

**Purpose.** Per-piece role list across `attacker | defender | pinned | pinning | overworked | outpost | bad-bishop | tactical-anchor`; diff between two positions produces `RoleChange[]` consumed by validator (`featureDeltaCitation.matchClaim()` for `role_gained|role_lost|new_outpost|...`).

**Design rationale.** Outpost rank constants (`OUTPOST_RANKS_WHITE=[4,5,6]`, black=[3,4,5], `:31-32`) — standard chess heuristic, origin not cited. `rawAttackSquares()` documents the design choice: differs from chess.js `moves()` because "for piece-role analysis ('what is this piece defending?') we need the full attack pattern" including own-piece squares (`:66-72`).

**External deps.** None named; pure chess.js + custom geometry.

**Novelty flags.** None.

### A.6 Threat tree

**File.** `src/lib/mastermind/threatTree.ts` (170 LOC).

**Purpose.** Opponent-move tree: threats winning ≥200cp material or check/mate, with per-threat top-3 defenses ranked.

**Design rationale.** Thresholds: `MATERIAL_THREAT_THRESHOLD_CP=200`, `MAX_DEFENSES_PER_LEVEL=3` (`:22-24`). Rationale: "so the tree doesn't explode" (`:28-30`). Piece-value table at `:22` uses `n=320,b=330` (Stockfish HCE-style values), distinct from `featureDelta.ts`'s `n=3,b=3` — **no comment surfaces the discrepancy**.

**External deps.** None named.

**Novelty flags.** None.

### A.7 Lichess tablebase fetcher (Stage 3 future-grounding)

**File.** `src/lib/mastermind/lichessTablebase.ts` (167 LOC).

**Purpose.** Wrap `https://tablebase.lichess.ovh/standard` with 24h cache (`:4`), 7-piece eligibility gate (`:5`), 5s fetch timeout (`:6`).

**Design rationale.** Constants stated as Lichess endpoint constraints. Gating logic (`isTablebaseEligible` at `:57`) prevents wasted upstream calls. Rationale + failure handling cross-referenced in `MASTERMIND_FAILURE_MODES.md §10c-10d`.

**External deps.** Lichess Syzygy tablebase API (named; not a paper).

**Novelty flags.** None.

### A.8 Surprise analyzer (candidate-gap heuristic)

**File.** `src/lib/engine/surpriseAnalyzer.ts` (312 LOC) + `surpriseEngineService.ts` (193 LOC) + `testSurpriseAnalyzer.ts` (81 LOC).

**Purpose.** Compares low-depth (human-like) vs high-depth (engine-like) Stockfish evaluations to compute a per-move "surprise score" and classify move purpose.

**Design rationale.** Cited directly in file header (`surpriseAnalyzer.ts:29-37`):
> "Chess Surprise Analysis based on CYHSM/chess-surprise-analysis repository / Core methodology: 1. Compare low-depth (human-like) vs high-depth (engine-like) evaluations / 2. Calculate 'surprise score' as the difference / 3. Classify moves based on surprise score and characteristics / 4. Generate explanations for why moves are surprising"

`surpriseScore > 1.0` is the "significant" threshold (`:91`). Magnitude origin not cited beyond the upstream CYHSM repo. Cross-referenced into the chessprinciples layer at `chessprinciples/enhancedMoveAnalyzer.ts:92` ("SURPRISE ANALYSIS (from chess-surprise-analysis)") and `aggressiveMoveAnalyzer.ts:51`.

**External deps.** `CYHSM/chess-surprise-analysis` — open-source GitHub repo, **only named external work in the chess-intelligence layer**. Not a peer-reviewed paper.

**Novelty flags.** None — explicitly attributed to the upstream repo.

**Empirical data.** None surfaced.

### A.9 Branch-point / candidate-gap analysis

**Status.** No file with a dedicated "branch-point analysis" symbol surfaced via grep. The closest is `complexity.ts`'s top-vs-3rd-line spread component (`:38-51`) — low spread ⇒ many similar candidates ⇒ harder choice. **No standalone branch-point detector exists** — the user-task prompt mentions it but the codebase folds it into complexity-component math. Flagged as a discrepancy between prompt scope and shipped code.

---

## B. LLM orchestration

### B.1 Unified two-tier provider with fallback

**Files**
- `src/lib/llmProvider.ts` (504 LOC) — primary, fully audited
- `src/lib/responseCache.ts` (140 LOC)
- `src/lib/analysisContextCache.ts` (136 LOC) — **⚠ working-tree dirty; not read**

**Purpose.** Single `callLLM(opts)` entry point that routes by `tier` ("flagship" → Sonnet 4 `claude-sonnet-4-20250514` / "fast" → Haiku 4.5 `claude-haiku-4-5-20251001`; `:83-92`), retries on OpenAI (`gpt-4o` / `gpt-4o-mini`) on any Anthropic error, and exposes a streaming variant `callLLMStream`.

**Design rationale.** Top-of-file comment is explicit (`:1-16`):
> "Tries Anthropic Claude first … then falls back to OpenAI … Any auth / network / 5xx failure from Anthropic triggers an immediate retry on OpenAI so a single user request is never dropped … Call sites pass a `tier` instead of a concrete model name so they stay agnostic of which provider actually serves the request."

Tier-not-model abstraction is a deliberate boundary; key-prefix pre-flight (`isValidAnthropicKey` requires `sk-ant-`, `isValidOpenAIKey` requires `sk-` or `sess-`; `:32-37`) "Catches the 'ssk-ant-' style typos that otherwise waste a full round-trip" (`:30-31`).

**Implementation specifics.**
- Streaming: Anthropic native SSE; OpenAI falls back as non-streaming single chunk (`:214-218`) so callers see uniform shape.
- Defaults: `temperature=0.7`, `maxTokens=1500` (`:126-127`).
- Logged fields per call: tier, model, input/output/cacheCreation/cacheRead tokens, elapsedMs (`:435-443`).
- `LLMError` carries provider + status + 300-char detail slice (`:135, :387-396`).

**External deps.** Anthropic SDK (HTTP only — no client lib), OpenAI Chat Completions.

**Novelty flags.** None.

**Empirical data.** Per-call structured logs (`logger.child({module: "llm-provider"})`, `:20`). Cache-hit rate **not aggregated server-side** — would need offline log analysis. Validators independently estimate cost via fixed per-million prices (see `regenerate.ts:34-39`).

### B.2 Server-side prompt cache (Anthropic ephemeral)

**Where.** Implemented inline in `llmProvider.ts:56-64, :106-113, :235-238`.

**Purpose.** When caller sets `cacheSystem: true`, the system prompt is wrapped in `[{type:"text", text:opts.system, cache_control:{type:"ephemeral"}}]`. Subsequent calls within ~5 minutes hit the cache.

**Design rationale.** From `:56-64`:
> "If true (Anthropic only), send the system prompt with an ephemeral prompt-cache marker. The first call after a 5-min idle will be a cache write (`cacheCreationTokens > 0`); subsequent calls reusing the same system prompt become cache reads (`cacheReadTokens > 0`), which are faster and ~10× cheaper."

API "silently skips the cache when the block is below the model's minimum cacheable size, so this is safe even for short prompts" (`:107-109`).

**Implementation specifics.**
- Cache key construction: implicit — Anthropic side; not constructed by callers.
- TTL: 5 minutes (Anthropic-side default; not configurable here).
- Cached system prompts: `EVAL_CLAIM_PARSER_SYSTEM`, `FEATURE_CITATION_PARSER_SYSTEM`, `SCOUT_CITATION_PARSER_SYSTEM`, `USER_HISTORY_CITATION_PARSER_SYSTEM`, `CATEGORY_CLASSIFIER_SYSTEM` (all in `parserPrompts.ts` and `categoryPrompts.ts`, each with explicit "Sent with `cacheSystem: true`" header rationale).
- Validator cost depends on this caching being live; `parserPrompts.ts:5-7`: "Validator cost depends on this caching being live; PR_1B_PLAN.md §10.2."

**Novelty flags.** None.

**Empirical data.** `cacheCreationTokens` / `cacheReadTokens` returned per call; not aggregated.

### B.3 Response cache (LRU, keyed by structured input)

**File.** `src/lib/responseCache.ts` (140 LOC) — read; LRU keyed by `generateCacheKey(fen + skill + query-hash)`. Per `MASTERMIND_CODEBASE_MAP.md` row: "LRU cache for AI coaching responses".

**Pending integration.** `coachChatPrompt.ts:18-20` comments: "Phase 2 will fold this into the response-cache key prefix so cross-deploy stale entries become unreachable." `PROMPT_VERSION = "3.0"` (`coachChatPrompt.ts:22`) is the cache-key versioning hook, not yet wired into the key prefix.

### B.4 OpenAI fallback — operational status

**Status.** Coded but not env-configured per `CLAUDE.md` "Runtime readiness" table and `MASTERMIND_FAILURE_MODES.md §9`:
> "OpenAI fallback — Operational-level — OPENAI_API_KEY is not set in production per CLAUDE.md. The fallback is dead code in the live deploy until the key is configured."

Cross-checked: matches the user's auto-memory entry `project_openai_fallback_status.md`.

---

## C. Hallucination validator architecture (the paper's core)

**Pipeline orchestrator.** `src/lib/mastermind/validators/index.ts` (205 LOC) — `runValidationPipeline()` composes eval + feature + (optional) scout + (optional) user-history validators, dispatches sequentially in fixed order (`index.ts:128-130`: "order matters for telemetry sequence. scout runs before user-history per the established order"), then hands to `regenerateUntilValid`. The PR 1.B contract — byte-identical output when `dataSources` is undefined — is enforced via a pipeline preservation test (`index.ts:96-99`).

**Shared types.** `src/lib/mastermind/validators/types.ts` (250 LOC) — `CheckName`, `FireReason`, `FinalOutcome`, `ValidatorIssue`, `TelemetryEvent`, `ValidatorResult`, all per-validator `ParsedXClaim` shapes, `PARSER_LOW_CONFIDENCE_THRESHOLD = 0.5` (`:107`), `EVAL_NUMERIC_THRESHOLD_CP = 150` (`:108`).

**Cached parser prompts.** `src/lib/mastermind/validators/parserPrompts.ts` (414 LOC) — Haiku-backed parser system prompts, all sent with `cacheSystem: true`. Header (`:1-7`): "Sent with `cacheSystem: true` so the first warm-up call writes to the 5-min prompt cache and every subsequent call within the window hits it … Validator cost depends on this caching being live; PR_1B_PLAN.md §10.2."

The eval-claim parser prompt (`:9-60`) includes notable design points: an `ATTRIBUTION RULE` that downgrades claims attributed to a third party (engine, opponent, commentator) to `metaphorical` ("the LLM is reporting, not asserting"; `:43-44`); a `CLASSIFICATION RULES` block that explicitly distinguishes evaluative band-naming from dramatic descriptive verbs ("dancing", "looming", "screaming" — descriptive ≠ evaluative; `:38-40`). This is non-trivial natural-language disambiguation engineered into the validator's parser.

### C.1 Qualitative bands (shared utility)

**File.** `src/lib/mastermind/validators/qualitativeBands.ts` (106 LOC).

**Purpose.** 7-band classification of cp-evals (`losing | much_worse | slightly_worse | equal | slightly_better | much_better | winning`) with adjacent-band tolerance.

**Design rationale.** Half-open interval boundaries surfaced verbatim (`:41-50`):
> "Half-open interval convention so each band is unambiguous. / losing cp ≤ -300 / much_worse -300 < cp ≤ -150 / slightly_worse -150 < cp ≤ -50 / equal -50 < cp < 50 / slightly_better 50 ≤ cp < 150 / much_better 150 ≤ cp < 300 / winning 300 ≤ cp"

`ADJACENT_BAND_TOLERANCE_CP = 20` (`:20`) is plan-anchored: "Adjacent-band tolerance per PR 1.B plan §4.1 (Aayan 2026-05-11: 20 cp)" (`:76-77`). `MATE_CP_SENTINEL = 10000` (`:99`).

### C.2 `validateEvalClaim` — eval-mismatch checker

**⚠ Source-restricted (Stage C WIP):** `evalClaim.ts` is off-limits per carve-out (modified today 2026-05-23 as a focused `eval_mismatch` skip fix). Description below is from `types.ts` exports, `index.ts` call signature, `parserPrompts.ts` (parser prompt is readable), `MASTERMIND_CONTEXT/PR_1C_PLAN.md` plan refs, and `MASTERMIND_STRENGTHS.md` / `MASTERMIND_FAILURE_MODES.md`.

**Ground truth source:** Stockfish eval (`stockfishEval: { cp?: number; mate?: number }` passed in from pre-computed `gameEval.positions`).

**Purpose.** Parses LLM coaching prose for evaluation claims (band statements and numeric +/-cp citations) via a Haiku sub-call (`EVAL_CLAIM_PARSER_SYSTEM` at `parserPrompts.ts:9-60`); compares the parsed `stated_band` and `stated_cp` against the actual Stockfish eval bucketed via `cpToBand()`.

**Fire / skip / pass.**
- **Fire** `eval_mismatch_numeric`: numeric LLM eval vs Stockfish cp differs by ≥ `EVAL_NUMERIC_THRESHOLD_CP = 150`.
- **Fire** `eval_mismatch_qualitative`: stated band differs from Stockfish band by more than the adjacent-band tolerance (`isWithinTolerance` in `qualitativeBands.ts:81`).
- **Skip** `no_stockfish_eval`: when `stockfishEval` is missing — per today's commit `cc10524` "validateEvalClaim skips eval_mismatch checks when stockfishEval is missing". Cross-cited at `src/app/api/chat/route.ts:128` ("skip path in validateEvalClaim emits a no_stockfish_eval").
- **Skip** `parser_low_confidence` / `parser_json_invalid`: parser sub-call returned malformed JSON or confidence below `PARSER_LOW_CONFIDENCE_THRESHOLD = 0.5`.
- **Pass**: per-claim `passed` telemetry event emitted; consumed by `citationRate.ts` (`SOURCE_PASSED_CHECK_NAME.feature_delta = "feature_citation"`, etc.).

**Implementation specifics.** Default exported parser callback `defaultEvalParserCall` re-used as the parser for every other validator (`featureDeltaCitation.ts:5`, `userHistoryCitation.ts:1`, `scoutCitation.ts:1`) — single Haiku entry point per validator family. Cost estimation per `regenerate.ts:34-39` Sonnet/Haiku price table.

**Novelty flags.** None surfaced from accessible files.

### C.3 `validateFeatureDeltaCitations` — feature-citation checker

**File.** `src/lib/mastermind/validators/featureDeltaCitation.ts` (334 LOC) — fully audited.

**Ground truth source:** chess.js board state + computed `PositionFeatureDelta` (from `featureDelta.ts`) + `RoleChange[]` (from `pieceRoles.ts`). NOT Stockfish eval.

**Purpose.** Parses LLM prose for factual feature-change claims (one of 21 `FeatureClaimType` discriminants in `types.ts:70-91`: `material_change | lost_piece | lost_bishop_pair | king_safety_change | new_passed_pawn | new_outpost | new_open_file | new_isolated_pawn | role_gained | new_threat | hanging_piece | now_defended | …`); cross-checks each `factual_delta_claim` against the computed delta via `matchClaim()` (`:74-213`).

**Fire / skip / pass.**
- **Fire** `feature_citation_unsupported`: parser returned a `factual_delta_claim` whose `expected_in_delta` doesn't match the computed delta.
- **Skip** `parser_json_invalid` / `parser_low_confidence`: malformed parser output or confidence < 0.5.
- **Skip** non-`factual_delta_claim` claims (i.e. `qualitative_commentary` / `conditional_speculation` are filtered out; `:276`).
- **Pass**: `check_name: "feature_citation"`, `fire_reason: "passed"` — counted as a citation by `citationRate.ts`.

**Explicit scope contract** (`:229-237`):
> "Scope (Aayan 2026-05-11, PR_1B_PLAN.md §6.4): deltas only. Absolute-state claims like 'the bishop is undefended' are out of scope; a future validator handles them — see FAILURE_MODES.md §10f."

**Implementation specifics.**
- Per-claim type dispatch via a single 130-line `switch`. Bishop-pair / knight-pair checks recompute counts on `fenBefore` and `resolutionFen` directly with chess.js (`:38-66`).
- `new_backward_pawn`: hardcoded `matched: false` with note "backward_pawn not tracked by positionAnnotator yet" (`:165-167`) — known gap.
- Fence-matched JSON parsing handles both fenced ```` ```json ```` and raw payloads (`:215-227`).

**Novelty flags.** None claimed by author. The 21-discriminant taxonomy itself is project-specific (no published-work citation).

**Empirical data.** Unit tests at `__tests__/validators/featureDeltaCitation.test.ts` (filename only).

### C.4 `validateScoutCitation` — scout-citation checker (Stage A.6)

**File.** `src/lib/mastermind/validators/scoutCitation.ts` (679 LOC). Top section audited; full impl skimmed for tolerance constants and `matchClaim()` dispatch shape.

**Ground truth source:** `ScoutAnalytics` + optional `Collisions` from `src/lib/scoutAnalytics.ts` (built from opponent's public games via `scoutService.buildOpeningTree`); resolves opponent username + primary time class.

**Purpose.** Parses LLM prose for 26 scout-claim types organized into 5 groups (`types.ts:114-145`):
- **Opening/prep (3):** `opponent_plays_opening`, `opponent_strength_opening`, `opponent_weakness_opening`
- **Profile (8):** `archetype`, `profile_dimension`, `rating_by_timeclass`, `peak_rating`, `low_rating`, `latest_rating`, `recent_form_trend`, `phase_elo`
- **Stalker (2):** `stalker_total`, `stalker_factor`
- **Psychology (8):** `tilt_pattern`, `timeout_pattern`, `resign_pattern`, `checkmate_rate`, `quick_loss_pattern`, `long_game_pattern`, `streak_claim`, `avg_game_length`
- **Rivals/collisions/novelty/checklist/recent-form (5):** `rival_record`, `collision_edge`, `novelty_finding`, `checklist_item`, `recent_form_bucket`

**Fire / skip / pass.**
- **Fire** `scout_citation_unsupported`: parsed `factual_scouting_claim` with values outside published tolerances.
- **Skip** `qualitative_commentary` / `conditional_speculation` claim_classes, low-confidence parser output, invalid JSON.
- **Pass**: emitted with `check_name: "scout_citation"`.

**Tolerances** (verbatim from `:36-51`):
> "SCOUT_TOLERANCE = { pct: 5  // ±5 percentage points for any %-valued claim, rating: 25  // ±25 ELO for any rating claim, phaseDelta: 50  // ±50 cp for phase-vs-phase ELO delta, factorScore: 10  // ±10 for stalker factor scores (0-100 scale), scoreOutOfHundred: 5  // ±5 for stalker total + profile dimensions, count: 1  // ±1 for streak counts and recent-form W/D/L counts, plies: 10  // ±10 plies for average game length }"

Tolerances cite the plan: "(per PR_1C_SCOUT_CITATION_PLAN.md §3 / §5). Codified as constants so the implementation is auditable and the test suite can exercise boundary conditions deterministically." (`:30-34`).

**Opportunity counter (citation-rate denominator).** Thresholds at `:57-74` — claim is "notable" enough to count as an opportunity only when the underlying metric crosses a bar (timeoutRate > 5%, tiltDelta ≥ 5pp, streak ≥ 4, etc.).

**Implementation specifics.** Fuzzy matching extracted to `src/lib/utils/fuzzyMatch.ts` during Stage A.8 to share with `userHistoryCitation` (`:96-99`): "extracted … so userHistoryCitation can reuse the same matcher for opening-name claims".

**Novelty flags.** None claimed.

**Empirical data.** "107 tests" per commit `4f6cc3a` ("Stage A.6 — scoutCitation validator + 107 tests (Option A, all 26 claim types)").

### C.5 `validateUserHistoryCitation` — user-history citation checker (Stage A.8)

**File.** `src/lib/mastermind/validators/userHistoryCitation.ts` (468 LOC). Header + tolerances + date-range resolver audited.

**Ground truth source:** Firestore `users/{uid}/games` (server-read via Firebase Admin), aggregated by three pure functions in `userHistoryAggregates.ts` (`aggregateWinRateByTimeControl`, `aggregateScoreByOpening`, `countGamesInDateRange`).

**Purpose.** Parses LLM prose for 3 user-history claim types (`types.ts:202-205`): `time_control_performance`, `opening_repertoire_performance`, `hours_played_claim`; cross-checks against the aggregated history.

**Tolerances.**
- `USER_HISTORY_TOLERANCE.pct = 5` for score/win-rate claims (`:32-35`).
- `hoursPlayedTolerance(statedCount) = max(2, round(0.05 * statedCount))` — hybrid scale, plan-anchored (`:37-52`):
  > "Hybrid tolerance for hours_played_claim counts: at least 2, or 5% of the stated value rounded to the nearest integer (per Aayan 2026-05-18 C1). Flat ±2 is too strict for large counts (1000 games → ±2 is too tight); roughly right for small counts (10 games → ±2 is reasonable). Math.max picks the right scale automatically."

**Opportunity thresholds.** `OPP_TIME_CLASS_MIN_GAMES = 10`, `OPP_OPENING_MIN_GAMES = 5` (`:54-57`) — minimum games-in-bucket before the bucket counts as a citation opportunity.

**Date-range resolver** (`resolveDateRange`, `:83-100+`): UTC throughout — "A.8 plan T5 default. Non-UTC-timezone edge cases … accepted as Stage C surface item; revisit if it fires."

**Fire / skip / pass.**
- **Fire** `user_history_citation_unsupported`: parsed `factual_user_history_claim` outside tolerance.
- **Skip / Pass** patterns mirror the scout validator.

**Novelty flags.** None.

### C.6 `regenerateUntilValid` — retry orchestrator

**File.** `src/lib/mastermind/validators/regenerate.ts` (182 LOC) — fully audited.

**Purpose.** Initial LLM call → validate → retry up to `maxRetries=2` with `buildRetryInstruction(issues)` appended as a user turn → fallback (deterministic template) on retry exhaustion.

**Design rationale** (`:81-86`):
> "Regenerate state machine. Initial call → validate → retry up to maxRetries → fallback. Same-tier retries (Sonnet → Sonnet, Haiku → Haiku) per PR 1.B spec; cost ceiling discussion is Interpretation A (BUILD_PLAN §9.4 / PR_1B §10.3) — overhead-only, retries are replacements not additions."

**Retry instruction shape** (`:53-73`): orders issues by priority (`eval_mismatch*` → 0, `feature_citation_unsupported` → 1, others → 2; `:75-79`); explicit "Maintain coaching tone; do not add disclaimers or apologies." footer. Comment at `:53-57`: "No 'may be inaccuracy' apology — the response is going to be regenerated, not amended." This is a deliberate departure from the legacy `aiResponseValidator.ts`'s footnote-append pattern.

**Cost estimation.** Per-million pricing hardcoded (`:34-39`): Sonnet input=$3, output=$15, cache-read=$0.30; Haiku input=$1, output=$5, cache-read=$0.10. Sums into `totalCostUsd` in the result.

**FinalOutcome discriminant.** `passed_initial | passed_after_retry | fallback_used` (`types.ts:22-25`).

### C.7 `buildFallbackResponse` — deterministic prose template

**File.** `src/lib/mastermind/validators/fallback.ts` (194 LOC) — fully audited.

**Ground truth source:** Stockfish eval (band-bucketed) + `PositionFeatureDelta` + `RoleChange[]` + optional `ThreatNode[]`. **Pure function. No LLM call.**

**Purpose.** When retries exhaust, compose coaching prose directly from ground truth. Three sections: band statement → "What changed" bullets (top 3 by importance) → optional tactical threat sentence → optional piece-role hints (top 2).

**Design rationale** (`:155-165`):
> "Compose coaching prose from ground truth (Stockfish eval + Stage 3 feature delta + threat tree). Pure function, deterministic. No LLM call. Used as the regenerate fallback path after retries exhaust — see PR_1B_PLAN.md §8. Constraints: Never invents claims beyond what the inputs prove. No 'may be inaccurate' disclaimer (response is built FROM ground truth). Section omitted when its corresponding input is empty."

**Implementation specifics.**
- 7 bands × 2 perspectives × 3 tones (`warm | blunt | playful`) phrase table (`:24-60`). Tone defaults to `warm` (`:166`).
- Per-feature importance scores: material loss=9, hanging piece=8, passed-pawn gained=8, king-safety drop=7, open-file gained=5 (`:81-121`).
- Black-perspective composition uses string `.replace(/White/g, "Black").replace(/Black/g, "White")` after band-flip — order matters (`:72-73`).

**Novelty flags.** **Yes (implicit).** Validator-grounded fallback as the *terminal* node of a retry loop, with explicit "no apology" constraint, is rarely-seen in published LLM-coaching pipelines. Not explicitly claimed in comments.

### C.8 Telemetry helpers

**Files.**
- `src/lib/mastermind/validators/telemetry.ts` (46 LOC) — `createTelemetryEvent()` helper.
- `src/lib/mastermind/validatorTelemetry.ts` (257 LOC) — **⚠ Stage C WIP, not read.** Per `wireValidators.ts` import block: hosts `forwardTelemetry` + `RouteContext` types consumed by route handlers.

**Citation-rate aggregator.** `src/lib/mastermind/citationRate.ts` (190 LOC) — fully audited. Pure helper, not a validator (`:13-15`): "Placement at src/lib/mastermind/citationRate.ts (NOT validators/) per T5 ratified 2026-05-18 — matches userHistoryAggregates.ts pattern. Validators check claims; aggregators consume validator output."

Maps category → primary source for citation-rate floor (`:101-108`):
- `game_review → feature_delta`
- `opponent_prep → scout`
- `position_analysis → feature_delta`
- `concept_explanation → null` (deferred, PR 1.D)
- `improvement_strategy → user_history`
- `meta_motivational → user_history`

Sources counted by `check_name` prefix in telemetry (`:119-124`).

### C.9 Legacy / predecessor — `aiResponseValidator.ts`

**File.** `src/lib/aiResponseValidator.ts` (249 LOC) — fully audited.

**Current wiring status: actively wired in parallel.** Per `MASTERMIND_CODEBASE_MAP.md` row and confirmed by grep:
> "[aiResponseValidator.ts] Hallucination validator: chess.js cross-check on LLM claims. `validateAIResponse`, `ValidationResult`, `ValidationIssue`. [api/chat/route.ts:115], [api/enhanced-analysis/route.ts:1272,1388]"

So `aiResponseValidator` fires **on every server-side coaching response today**, and the Stage A–C Mastermind validator pipeline runs alongside it as new additional checks. Not deprecated; both run.

**Ground truth source:** chess.js board state constructed from FEN.

**Three checks** (`:38-86`):
1. `validatePieceOnSquareClaims` — regex `"\b(white|black|your|...)\s+(pawn|knight|bishop|rook|queen|king)\s+(on|at)\s+([a-h][1-8])\b"` then chess.js `game.get(square)` (`:92-148`).
2. `validateMoveSuggestions` — regex around "play|consider|try|suggest|recommend|best (was|move|is)" + SAN extraction; chess.js `move(san)` legality probe (`:154-194`).
3. `validateSquareReferences` — `\b([a-i])([0-9])\b` then reject anything outside a1-h8, gated by chess-context (`:199-232`).

**Behaviors flagged as anti-patterns by the new pipeline.**
- **Footnote-append on error** (`:71-78`): appends "⚠️ Some claims in this analysis may be inaccurate" rather than regenerating. The new `regenerate.ts:53-57` explicitly rejects this pattern.
- **Invalid-FEN silent swallow** (`:60-63`): catches `new Chess(fen)` errors and "passes the response through unvalidated with a console.warn". `FAILURE_MODES.md §3` documents this; `featureDelta.ts:70-83` deliberately throws `InvalidFenError` instead.
- **`eval_mismatch` declared but unimplemented** (`:17` enum entry; never wired). Replaced by `validateEvalClaim`.
- **Bypassed by the legacy client-side `enhancedOpenAIService.ts`** (`enhancedOpenAIService.ts` does not import `validateAIResponse`) — `STRENGTHS.md §2 Caveats` and `FAILURE_MODES.md §3` document.

**Implementation specifics.** Score formula `score = max(0, 1 - errors*0.2 - warnings*0.05)` (`:68`). `quickHallucinationCheck()` (`:235-249`) provides a regex pre-screen for common red flags (rank 9, file i, "triple check") — used as a fast pre-filter; origin/use sites not surfaced beyond the function definition.

**Novelty flags.** None claimed. The pattern itself (regex extraction + chess.js cross-check) is the project's original 2025-era approach, predating the parser-based Mastermind validators.

---

## D. Pipeline runner

**⚠ Source-restricted (Stage C WIP):** `wireValidators.ts`, `pipelineTimeout.ts`, `stageCcacheFallback.ts`, `validatorTelemetry.ts`, `routeHelpers.ts` are signatures + JSDoc only per carve-out. Route handlers (`chat/route.ts`, `enhanced-analysis/route.ts`) are working-tree dirty and not read. Rationale below from JSDoc, import blocks, and `PR_1C_STAGE_B_PLAN.md` references.

### D.1 Four-source fetch helper

**File.** `src/lib/mastermind/wireValidators.ts` (370 LOC) — header + exports only.

**Purpose.** Resolves all four `ValidatorDataSources` for one turn with failure independence so the route never has to think about partial failures.

**Design rationale** (verbatim, `:1-19`):
> "Stage B 1.C.B.1 — wireValidators.ts / The Mastermind validator pipeline (PR 1.B + Stage A) accepts up to four data sources via runValidationPipeline's optional `dataSources` field. This module is the *fetch helper* that resolves all four sources for one turn — with failure independence — so the route never has to think about partial failures. / See PR_1C_STAGE_B_PLAN.md §3 for the canonical spec. Key invariants: / - featureDelta failure THROWS — route catches and falls back to flag-off. / - pieceRoleDiff failure returns []; pipeline runs without role checks. / - scout / userHistory failure returns undefined; pipeline skips that validator … / - All four sources fetched concurrently via Promise.allSettled with a 3s per-source timeout (T1 default; §3.3)."

**Imports** (load-bearing for "which validators are currently wired"):
- `compute_feature_delta` from `featureDelta.ts`
- `classifyPieceRoles, diffPieceRoles` from `pieceRoles.ts`
- `computeAnalytics` from `scoutAnalytics.ts`
- `fetchOpponentGames` from `server/scoutFetch.ts`
- `getAdminFirestore` from `server/firebaseAdmin.ts`
- `extractPgnHeaders` from `utils/pgnHeaders.ts`
- `tryReadStageCUserHistoryCache` from `stageCcacheFallback.ts`
- `ScoutAnalytics, Collisions` from `@/types/scout`
- `UserHistoryGame` from `userHistoryAggregates.ts`
- `ScoutTimeClass` from `validators/`

**Exports.** `FetchedDataSources`, `FetchOpts`, `fetchDataSources`, `resolveOpponent` (per exports grep at `:41, :60, :132, :287`).

### D.2 Top-level pipeline timeout

**File.** `src/lib/mastermind/pipelineTimeout.ts` (108 LOC) — header + exports only.

**Purpose.** Top-level timeout wrapper for `runValidationPipeline`. On timeout, **resolves** (rather than rejects) with a synthetic `PipelineResultWithTimeout` so SSE can emit a graceful `done` event with `metadata.pipeline.timedOut: true` instead of `error` / 502.

**Design rationale** (verbatim, `:1-20`):
> "Different from wireValidators.ts's internal `withTimeout`: that's a per-source 3s timeout that REJECTS on expiry (caller catches and marks the source as failed). This module is route-level, defaults to 30s, and never rejects — the timer always resolves with a fallback payload so the user sees a response rather than a connection drop. / See PR_1C_STAGE_B_PLAN.md §10.3.1 case 'Flag on, pipeline times out at 30s' — was deferred from 1.C.B.4 (see 1.C.B.4 commit body deviation #2); lands here in 1.C.B.5."

**Constant.** `DEFAULT_PIPELINE_TIMEOUT_MS = 30_000` (`:30`).

### D.3 Stage C cache fallback (sweep-only)

**File.** `src/lib/mastermind/stageCcacheFallback.ts` (64 LOC) — header + signatures only.

**Purpose.** Bridges synthetic-tester pre-populated user-history cache into the route's flag-on userHistory fetch path. **Two strict gates** (`:14-22`): `VERCEL_ENV === "preview"` AND username in {`Lazer_Wizard, JSNoverPuka, Chilllychess, gothamchess`}. Production traffic is unaffected.

**Design rationale** (verbatim, `:1-25`):
> "Stage C user-history cache fallback. … Real users with real Firestore data are unaffected; the fallback fires only for sweep traffic. See CATEGORY_GENERATOR_DESIGN.md O2 and 1.C.B.5 follow-up directives for the rationale."

**Static imports** of four JSON fixtures (`:30-33`). `STAGE_C_CACHED_USERNAMES` exported as readable allowlist.

### D.4 Pipeline composition + flow

From `validators/index.ts:105-205` (audited):

1. Caller invokes `runValidationPipeline(opts)` with at minimum: `initialRequest, stockfishEval, featureDelta, pieceRoleDiff, playerPerspective, correlationId`, optional `dataSources`.
2. Builds a `validate(response)` closure that:
   - Always runs `validateEvalClaim` + `validateFeatureDeltaCitations`.
   - Conditionally runs `validateScoutCitation` if `dataSources.scout` is present.
   - Conditionally runs `validateUserHistoryCitation` if `dataSources.userHistory` is present.
   - Aggregates issues / telemetry / costUsd in fixed scout-before-user-history order.
3. Builds a `buildFallback()` closure binding `buildFallbackResponse` to ground-truth inputs.
4. Delegates to `regenerateUntilValid` with both closures.

**Preservation contract.** When `dataSources` is undefined, pipeline output is byte-identical to PR 1.B (eval + feature-citation only). Enforced by `pipeline.test.ts`'s preservation-contract test (`index.ts:96-99`).

---

## E. Mastermind context preparation

**⚠ Source-restricted (Stage C WIP):** `routeHelpers.ts` is signatures + JSDoc only.

**File.** `src/lib/mastermind/routeHelpers.ts` (322 LOC).

**Purpose.** Houses the helpers both routes (`/api/enhanced-analysis`, `/api/chat`) call: per-turn move-context derivation, classifier + sources prep, pipeline-telemetry forwarding. Extracted from `enhanced-analysis` during 1.C.B.5 so `/api/chat` can reuse without duplicating ~250 LOC.

**Design rationale** (verbatim, `:1-12`):
> "Stage B 1.C.B.5 — shared route helpers. … The route files still own their request-shape mapping (which inputs become which moveHistory/fen/etc.). / See PR_1C_STAGE_B_PLAN.md §3 + §3.7 for the canonical design; §3.7.9 insertion-point B+F describe the call surface."

**Exports** (per grep at `:46, :52, :59, :82, :113, :169, :194, :257, :272`):
- `MastermindGameEval`, `MastermindMoveContext`, `MastermindPrepResult` — shape types
- `NON_MOVE_FOCUS_CATEGORIES: ReadonlySet<QuestionCategory>` — set used to decide which categories deliberately skip move-context fields (the `degraded` mode contract). Per category mapping: `concept_explanation, improvement_strategy, meta_motivational, opponent_prep` are the non-move-focus categories (inferred from C.G.E.N.E.R.A.T.O.R. design doc §4-8 plus the `null` primary-source mapping in `citationRate.ts:101-108`).
- `deriveMastermindMoveContext(...)` — accepts category + raw move/eval data; returns category-aware moveCtx (skips fen/eval for non-move-focus categories; passes through otherwise).
- `prepareMastermindContext(opts)` — main entry: runs `classifyQuestion`, calls `fetchDataSources`, returns a single bundled `MastermindPrepResult` for the route to consume.
- `forwardPipelineTelemetryForRoute(args)` — telemetry forwarder.

**Call sites.** `chat/route.ts:120`, `enhanced-analysis/route.ts:1255` and `:1675` (multiple turn paths within enhanced-analysis).

**`gameEval` shape contract.** Inferred from `MastermindGameEval` interface name (line 46) — bundled Stockfish output per position. Not read in detail (function body restricted).

**Novelty flags.** None surfaced in the JSDoc.

---

## F. Five-category structured explanations

### F.1 Six-category classifier (Haiku-backed)

**File.** `src/lib/mastermind/categorization/categoryClassifier.ts` (149 LOC) + `categoryPrompts.ts` (96 LOC) — both fully audited.

**Six categories** (`categoryClassifier.ts:8-14`):
`game_review | opponent_prep | position_analysis | concept_explanation | improvement_strategy | meta_motivational`.

**Routing.** Haiku call (`tier: "fast"`, `temperature: 0`, `maxTokens: 200`, `cacheSystem: true`; `:60-66`) returns `{category, confidence ∈ [0,1], rationale}`. Threshold `CLASSIFIER_LOW_CONFIDENCE_THRESHOLD = 0.5`.

**Default low-confidence route.** `meta_motivational` (`:31`):
> "Default fallback when the parser returns malformed output or the parsed confidence falls below the threshold. `meta_motivational` is chosen because it carries the lowest citation-rate floor (20%) per §5.3.2 — an ambiguous question routed to a high-floor category would cause spurious gate failures."

This is a deliberate routing-bias decision tied to the validator-gate metric.

**Classifier prompt** (`categoryPrompts.ts:9-92`). Detailed per-category definitions + a `RULE OF THUMB` block re-asserting that `meta_motivational` is "a last resort, NOT the default for borderline coaching questions." Example: "'I'm always confused about pawn structures' reads as concept_explanation with frustration framing — not the other way around. Classify as concept_explanation at ~0.6, not meta_motivational at 0.4." (`:88`).

**Fail-soft.** Invalid JSON / unknown category / out-of-range confidence treated as `confidence=0`, routed to default — "fail-soft so a classifier hiccup doesn't break the downstream pipeline" (`:101-112`).

### F.2 Per-category coaching prompt (5-category structured)

**File.** `src/lib/prompts/coachChatPrompt.ts` (458 LOC) — fully audited.

**Per-category mapping.** The category classifier (`F.1`) routes the question; the resulting category drives `deriveMastermindMoveContext` (`E`) which conditionally omits move/eval fields; the coach prompt itself is a single template that the LLM picks subset-of-5 from internally.

**The 5 explanation categories** (selected by the LLM per turn — not the same as the 6 routing categories):
**Threats / Best Moves / Plans / Piece Roles / Concepts** — per `STRENGTHS.md §6` and the system prompt's `CHAIN-OF-THOUGHT REASONING` step 5 (`coachChatPrompt.ts:170`):
> "STRUCTURE: Select which of the 5 explanation categories (Threats, Best Moves, Plans, Piece Roles, Concepts) are most relevant for this specific position."

The prompt explicitly tells the model to pick subset, not fill all five (also stated in `STRENGTHS.md §6`).

**Prompt versioning.** `PROMPT_VERSION = "3.0"` (`:22`):
> "Bumped from '2.0' (legacy chessPrinciples wrapper, deleted in Phase 0) to '3.0' (this module). Phase 2 will fold this into the response-cache key prefix so cross-deploy stale entries are unreachable."

**Personalization block.** User-set `coachTone | playingStyle | studyGoals | favoriteOpenings` are threaded in via `renderCoachingPrefs` (`:72-96`). Tones: `friendly | strict | masti`; styles: `tactical | positional | balanced`; goals: `tactics | endgames | openings | time-management`.

**`CRITICAL: PLAYER PERSPECTIVE ONLY` block** (`:157-163`) — hard constraint: only the player's moves are analyzed in detail; opponent mistakes are at most noted. Stated rationale: "The player cannot control what the opponent does."

**INSIGHT card format.** `[INSIGHT:<moveNumber>:<color>:<classification>:<evalBefore>:<evalAfter>:<playedMove>:<bestMove>] … [/INSIGHT]` strict-format blocks (`:285-307`) — DecodeChess-style paginated carousel. `HEADLINE RULES (NON-SPOILER)` (`:316-320`): headline visible BEFORE reveal must not spoil the best move/fix.

**Continuation tokens** (`:329-332`):
> "Always include BOTH tokens inside [WHY] for every insight. … NEVER write out move sequences yourself — they WILL be wrong."

`[CONCEPT:<themeKey>:<Display Name>]` is the practice-puzzle hook (no separate `[PRACTICE:...]` token allowed; `:336-339`).

**Skill calibration** (see Section G).

**External deps.** DecodeChess "five-category breakdown" — named in `STRENGTHS.md §6`: "The Quality Improvement Plan names DecodeChess's five-category breakdown as the structure that makes professional-grade chess feedback feel complete." Not a peer-reviewed citation.

**Novelty flags.** The combination — 5-category structured prompt + non-spoiler insight cards + per-card concept-tagged practice hook — is project-original assembly; competitors approximate parts (DecodeChess for category structure; Sensei Chess for conversational coach) but not the assembly.

### F.3 Category → validator wiring (summary table)

Computed from `citationRate.ts:101-108` + the validator dispatch in `validators/index.ts`:

| Category | moveCtx populated? | Validators wired (when sources present) | Primary citation source | Floor |
|---|---|---|---|---|
| `game_review` | yes | eval, feature, scout?, user_history? | feature_delta | 90% |
| `position_analysis` | yes | eval, feature, scout?, user_history? | feature_delta | 70% |
| `opponent_prep` | no | (eval skipped via stockfishEval=missing path), scout | scout | 85% |
| `concept_explanation` | no | eval, feature | null (deferred PR 1.D) | n/a |
| `improvement_strategy` | no | user_history | user_history | 50% |
| `meta_motivational` | no | user_history (if attached) | user_history | 20% |

Floor percentages from `CATEGORY_GENERATOR_DESIGN.md §12`. The "no moveCtx" categories deliberately let `validateEvalClaim` hit its `no_stockfish_eval` skip path.

---

## G. Skill calibration

**Where.** User rating enters from three sources:
1. **Server-side Firestore** `users/{uid}.rating` (single scalar) — read via Firebase Admin SDK; threaded into prompt via `coachChatPrompt.userRating`.
2. **Client localStorage** `playerProfile.ts` — jotai atoms; client-only.
3. **External platforms** `chess.com` / `lichess` usernames passed into the prompt (see USER CONTEXT block, `coachChatPrompt.ts:127-138`).

**How it enters the prompt.** `deriveSkillTier(rating)` at `coachChatPrompt.ts:98-102`:
```
< 1000 → beginner
< 1600 → intermediate
≥ 1600 → advanced
```
Bands cited from `coachChatPrompt.ts:428-444` (SKILL-LEVEL CALIBRATION section):

> **BEGINNER (Under 1000):** Plain English. No jargon. "Your knight can attack two pieces at once" not "knight fork on e6". Focus on material safety, basic threats, one-move tactics, development. ONE best move + ≤2-3 moves of variation. Encouraging + patient tone.
> **INTERMEDIATE (1000-1600):** Brief term context. "This is a knight fork on e6, where your knight attacks both queen and rook." Tactical patterns, pawn structure, piece activity, opening principles. Top 2 moves + 4-5 move variations.
> **ADVANCED (1600+):** Standard terminology freely. "Ne6 creates a royal fork with tempo." Strategic imbalances, prophylaxis, long-term plans, complex endgame. Top 3 moves + full PVs.

**Beginner-specific gate** for game-review insight inclusion (`:327`):
> "For beginners (rating < 1000): only include blunder, miss, brilliant, or great. Skip inaccuracies entirely — do not nit-pick."

**Post-adjustment.** None — the LLM is expected to calibrate during generation. There is **no post-processing pass that adjusts difficulty / vocabulary** after the LLM output.

**Other places rating enters.**
- Validator floors per category (`F.3` table) — gate-pass thresholds, not user-facing calibration.
- Puzzle retrieval rating-band: `RATING_BAND = 300` (`conceptRetrieval.ts:47`); clamped to `[400, 3000]` (`:238-239`).

**No design rationale surfaced** for the specific 1000/1600 bucket boundaries beyond the calibration block itself.

---

## H. Neo4j puzzle graph

**Files**
- `src/lib/neo4j.ts` (128 LOC) — driver singleton
- `src/lib/puzzleRepository.ts` (266 LOC) — read queries
- `scripts/neo4j-loaders/` — ingest scripts (`load-puzzles.mjs`, `load-commentary.mjs`, `setup-graph.mjs`, `fen-analyzer.mjs`)
- `scripts/build-puzzle-db.py` — alt ingest path

### H.1 Driver

`neo4j.ts` (audited). `getDriver()` lazy singleton, `maxConnectionPoolSize: 50`, `connectionAcquisitionTimeout: 10s`, `disableLosslessIntegers: true` (`:32-36`). `executeRead` / `executeWrite` (no `defaultAccessMode` per the Aura 2026.02 driver constraint noted at `:60`).

### H.2 Schema (position-as-hub)

From `MASTERMIND_DATA_INVENTORY.md §Neo4j` (audited):

```
                    ┌──────────────┐
               ┌────│   Position   │────┐
               │    │  {fen: str}  │    │
               │    └──────────────┘    │
       [:FROM_POSITION]          [:FROM_POSITION]
               ▼                        ▼
       ┌──────────────┐        ┌──────────────┐
       │    Puzzle    │        │  Commentary  │
       │  {id, moves, │        │   {text}     │
       │   rating, …} │        └──────────────┘
       └──────────────┘                │
               │                  [:IN_OPENING]
        [:HAS_THEME]                   │
               ▼                       ▼
       ┌──────────────┐        ┌──────────────┐
       │    Theme     │        │   Opening    │
       │  {id, name}  │        │  {name,eco}  │
       └──────────────┘        └──────────────┘
```

Plus: `(Puzzle)-[:EXERCISES]->(Concept {id})` from `conceptRetrieval.ts:218-222` Cypher.

**Properties** (`puzzleRepository.ts:7-15, :68-88` per data inventory):
- `Puzzle`: `puzzleId, fen, moves (space-separated UCI), rating (int), popularity (0-100), nbPlays (int)`
- `Theme`: `{id (kebab-case), name}`
- `Concept`: `{id}` with relationship `confidence` on `:EXERCISES`

### H.3 200K filter thresholds (ingest)

**`scripts/build-puzzle-db.py:31-33`** (verbatim from `DATA_INVENTORY.md`):
```python
MIN_POPULARITY = 60
MIN_NB_PLAYS = 50
MAX_RATING_DEVIATION = 120
```
Justification stated only as "matching the prompt's stated thresholds exactly" in `DATA_INVENTORY.md` — i.e., **values are anchored in product copy, not in measured-quality research**. No comment cites why these specific thresholds were chosen.

**Discrepancy:** `scripts/import-lichess-puzzles.mjs:49` defaults `MIN_NB_PLAYS = 100` (vs 50 in the .py). Unresolved — depends on which loader actually ran most recently. Flagged in `DATA_INVENTORY.md §Discrepancy table`.

**Corpus size discrepancy.** Per `DATA_INVENTORY.md`: the 200K figure was corrected on 2026-05-17 → actual CSV is 100K rows; public copy says "100,000+". Earlier doc figure of 200K still appears in `STRENGTHS.md`. Live `count(p:Puzzle)` against Aura **not verified**.

### H.4 Jhamtani commentary join

**Loader exists.** `scripts/neo4j-loaders/load-commentary.mjs` (default `--limit=500`). Produces `:Commentary` nodes joined to `:Position` via `[:FROM_POSITION]` and to `:Opening` via `[:IN_OPENING]`.

**Route surface.** `src/app/api/commentary-by-fen/route.ts:47` comment: "from the Jhamtani dataset (298k+ move-commentary pairs)."

**But: live state unknown.** Per `DATA_INVENTORY.md §Jhamtani row` + `PR_1C_DATA_AUDIT.md §A`: "Aayan may have removed Commentary nodes per 2026-05-17, and the route has zero in-app callers outside itself. Concept retrieval pipeline does not reference Commentary nodes." Reserved slot for jhamtani validator in `validators/index.ts:51-66` ("Forward-compat: jhamtani slot reserved per PR_1C_PLAN.md §6.4 deferral to PR 1.D. The validator doesn't exist yet").

**External deps.** Jhamtani et al., ACL 2018 ChessCommentaryGeneration dataset (`data/chess-commentary/Code, Data, README.md` per `DATA_INVENTORY.md`). **The only named peer-reviewed dataset citation in the codebase.**

### H.5 Query patterns

From `puzzleRepository.ts` (audited summary) + `conceptRetrieval.ts` (audited):
- **Theme-and-rating query** (`puzzleRepository.queryPuzzles`): `MATCH (p:Puzzle)-[:HAS_THEME]->(t:Theme) WHERE t.id IN $themes AND p.rating BETWEEN ...`. Kebab-case theme normalization at `:41-48`.
- **Concept-stage query** (`conceptRetrieval.conceptStageQuery` `:218-235`): `MATCH (p:Puzzle)-[r:EXERCISES]->(c:Concept) WHERE c.id IN $conceptIds AND p.rating BETWEEN ... WITH p, collect({id, confidence}) AS concepts, max(r.confidence) AS maxConf RETURN ... ORDER BY maxConfidence DESC LIMIT $limit`.
- **Theme fallback** (`themeFallback` `:362+`): `MATCH (p:Puzzle)-[:HAS_THEME]->(t:Theme) WHERE t.id IN $themes ... ORDER BY overlap DESC, abs(p.rating - $userElo) ASC`.

**Indexes.** Per `scripts/neo4j-loaders/README.md:83`: "Creates indexes for fast queries (rating, popularity)." Concrete DDL in `load-puzzles.mjs`.

---

## I. Retrieval pipeline (concept + FEN cosine + MMR)

**Files**
- `src/lib/concept/conceptRetrieval.ts` (439 LOC) — fully audited
- `src/lib/fenSimilarity.ts` (361 LOC) — fully audited
- `src/lib/concept/conceptDetector.ts` (522 LOC) — header audited
- `src/lib/concept/conceptClassifier.ts` (104 LOC) — header audited
- `src/lib/concept/conceptLLMTagger.ts` (115 LOC)
- `src/lib/concept/conceptTaxonomy.ts` (69 LOC) + `conceptTaxonomy.data.json`
- `src/app/api/similar-puzzles/route.ts:18`: "structural rerank, MMR diversity pass. See docs/research/concept-…"

### I.1 Three-stage pipeline overview

Verbatim from `conceptRetrieval.ts:1-21`:
> "Concept-first retrieval — the two-stage pipeline that serves reinforcement puzzles after a student misses a position.
> Stage 1 (hard filter): classify the anchor position via the deterministic detector, pull candidates from Neo4j by EXERCISES->Concept overlap, filter by rating band. Cross-concept candidates are excluded, NOT down-weighted — this is the core design point.
> Stage 2 (soft rerank): score each candidate with `0.5*concept_confidence + 0.35*structural_similarity + 0.15*rating_proximity`. The structural signal is currently the handcrafted 50-dim cosine from fenSimilarity.ts; it will be swapped for a learned 128-dim embedding once B3 ships.
> Stage 3 (diversity): from the top-30, pick `limit` via max-marginal relevance so the student sees the same concept in varied surface forms (interleaving principle, see concept-similarity-rationale.md)."

### I.2 Constants

`conceptRetrieval.ts:37-48`:
- `RETRIEVAL_WEIGHTS = { concept: 0.5, structural: 0.35, ratingProximity: 0.15 }`
- `MMR_LAMBDA = 0.3`
- `DEFAULT_CANDIDATE_POOL = 60`
- `DEFAULT_LIMIT = 5`
- `RATING_BAND = 300`
- `STRUCTURAL_EMBEDDING_VERSION = "handcrafted-50d-v1"` (label is "50d"; actual vector is 49 dims — see I.3)
- Concept detector confidence threshold `≥ 0.7` for the hot path (`:194-197`).

### I.3 49-dim handcrafted FEN feature vector

**File.** `src/lib/fenSimilarity.ts` (361 LOC, fully audited).

**Vector components** (counted from `FENFeatures` interface `:14-80` and `featuresToVector` `:231-282`):
- Material per side: 5+5 = **10** (Q, R, B, N, P; king omitted)
- Pawn structure per file: 8+8 = **16** (whitePawnsPerFile[a-h], blackPawnsPerFile[a-h])
- Pawn weaknesses: **8** (isolated, doubled, backward, passed for each side)
- King safety: **4** (white king file, white king rank, black king file, black king rank)
- Centralization: **4** (avg-distance-from-center per side, pieces-in-center per side)
- Phase: **3** (totalMaterial, pieceCount, isEndgame as 0/1)
- Special: **4** (canCastle per side, hasEnPassant, turn)
- **Total: 49 dims.** Source-label drift: file header `:7` says "~50-dim feature vector"; version string says `handcrafted-50d-v1` — flagged in `STRENGTHS.md §1 Caveats` + `DATA_INVENTORY.md §Discrepancy table`.

**Cosine** at `:288-309` — standard `dot(a,b) / (|a|·|b|)`, zero-magnitude → 0.

**Quick filter** `isStructurallySimilar` (`:348-361`) — pre-cosine sanity rejects (material gap > 10, pawn-count delta > 3, different phase).

**Pawn-weakness heuristics.** Doubled = pawnsOnFile > 1; isolated = no friendly pawns on adjacent files; passed pawn computed via a simplified "no enemy pawns on file + adjacent files" proxy (`:198-205`) — comment: "Real detection requires rank-by-rank checking — this is a proxy." Backward pawn = stub zero (never incremented; the field exists but is always 0). **Documented limitations are explicit.**

### I.4 Stage 2 rerank

`rerankByStructure` (`:246-292`) — combines:
- `conceptMatchScore = scoreConceptOverlap(anchorConcepts, candidate)` (`:294-309`): max edge confidence over overlapping concepts + `coverageBonus = min(0.2, (coverage-1)*0.1)` for multi-concept coverage.
- `structuralSimilarity = cosineSimilarity(anchorVector, candidateVector)` — extracts vectors lazily; returns 0 on either invalid FEN.
- `ratingProximity = 1 - min(1, abs(c.rating - userElo) / RATING_BAND)`.
- `finalScore = 0.5·concept + 0.35·structural + 0.15·rating` — rounded to 3 decimals.

### I.5 Stage 3 MMR diversity

`mmrSelect` (`:312-360`) — takes top-30 by `finalScore`, greedily picks `limit` by `mmr = finalScore - MMR_LAMBDA * maxSimilarityToAlreadyPicked`. Vector cache keyed by FEN to avoid re-extracting.

Comment justification (`:13-14` and `:43`):
> "(interleaving principle, see concept-similarity-rationale.md)."

Interleaving is a named pedagogy technique; no formal citation in code. Reference doc `concept-similarity-rationale.md` not located in the read paths.

### I.6 Honesty path

`empty()` / `themeFallback()` (`:362+`) — when detector returns no concepts and no themes are supplied, returns explicit `notes: ["Could not classify anchor position; no themes supplied for fallback."]` and `fallbackUsed: "none"`. Per `:18-21`:
> "Fallback contract: if detector returns no concepts, we fall back to theme-based retrieval and set `fallbackUsed='theme'` so the UI can badge the response as 'unclassified' (Part C2 honesty check)."

### I.7 Concept detector / classifier

**`conceptDetector.ts:1-12`:**
> "Deterministic concept detector. Runs geometric/material checks over a puzzle's solution line and emits (conceptId, confidence, evidence) tuples. Design: each detector is a pure function that returns 0+ hits. Hits with confidence ≥ 0.8 are treated as authoritative by the reconciliation layer in conceptClassifier.ts — the LLM tagger only fills gaps. This is an extension of the Chess Intelligence Layer motif logic in src/app/api/enhanced-analysis/route.ts (tactical motif extraction), now generalized to produce concept-taxonomy IDs."

**`conceptClassifier.ts:1-12`** — reconciliation rules:
> "Detector hits with confidence >= 0.8 are authoritative; LLM cannot override. For concepts the detector did not return, the LLM's hits fill the gap. LLM hits for concepts the detector REJECTED (ran and returned no hit) are still accepted — detector may miss (e.g., knight-fork via a longer line)."

`AUTHORITATIVE_CONFIDENCE = 0.8`, `DEFAULT_LLM_SKIP_THRESHOLD = 2` (`:35-36`).

**Does this feed prepareMastermindContext / category classifier / a validator?** Per `wireValidators.ts` imports: no — `concept/` is only imported by `conceptRetrieval.ts` and the offline pipeline at `scripts/concept-pipeline/`. Concept retrieval feeds the post-mistake puzzle reinforcement surface (`/api/similar-puzzles`, `/api/mistake-puzzles`), not the coaching pipeline. **Routed to Section P** per the user's clarifying instruction.

**External deps.** None named.

**Novelty flags.** Implicit — "Chess Masti is the only product in the gap analysis combining graph traversal, structural cosine rerank, and MMR diversity in one pipeline" (`STRENGTHS.md §1`). Not a peer-reviewed claim; internal competitive-survey claim only.

---

## J. Maia-2 microservice

**Files**
- `maia-service/maia_server.py` (`:1-80` audited)
- `maia-service/Dockerfile`, `render.yaml`, `requirements.txt`, `README.md`
- `src/app/api/maia-predict/route.ts` (113 LOC, fully audited)
- `src/app/api/maia-status/route.ts` + `keep-maia-alive/route.ts`
- `src/lib/engine/maiaService.ts` (206 LOC), `maiaServerService.ts` (389 LOC) — local Lc0 parallel path

### J.1 Service

**Purpose** (`maia_server.py:1-10`):
> "Maia-2 Chess Prediction Microservice / A lightweight FastAPI server that runs Maia-2 (NeurIPS 2024) for human-like chess move predictions. Designed to be deployed on Railway/Fly.io/Render and called from the Vercel-hosted Chess Masti AI frontend. / Maia-2 is a unified model that predicts what humans at a given ELO would play. It does NOT require LC0 — it's pure PyTorch inference."

**Why separate microservice.** Vercel serverless cannot run PyTorch or native binaries (per `maia-predict/route.ts:8-12` and `STRENGTHS.md §7`). Currently hosted on Hugging Face Spaces (free tier; sleeps after 48h, 30-90s warm-up).

**Endpoints.** `POST /predict {fen, rating, opponent_rating}` → `{humanLikeMove (SAN), confidence, alternativeMoves, rating, model: "maia2"}`. `GET /health` → `{model_loaded: bool, error?: string}`.

**Loading.** Background thread on startup (`maia_server.py:74-79`) so `/health` returns immediately; `model_loaded` flips to true when `maia2_model_module.from_pretrained(type=game_type, device=device)` completes (`:64-67`). `game_type` env-toggleable between `rapid` and `blitz`.

### J.2 Vercel proxy

`maia-predict/route.ts` — auth-gated (`requireSession()` at `:16-17`), Zod-validated input (`maiaPredictSchema`), proxies upstream, returns `{fallback: true}` on 503/missing-env/upstream-error (`:25-79`).

`keep-maia-alive` cron fires every 12h with 110s `AbortController` budget (`MASTERMIND_FAILURE_MODES.md §1` quotes the keep-alive endpoint comment verbatim).

### J.3 Where Maia feeds the coaching pipeline

**Yes, beyond Twin Bot.** Per `coachChatPrompt.ts:266-275`:
> "MAIA INTEGRATION - HUMAN-LIKE MOVE PREDICTIONS: / Maia predicts what humans at the user's rating level would play / Use Maia predictions to: identify if the user played a common human move … / Compare: Stockfish (optimal) vs Maia (human-like) vs User's actual move / If user's move matches Maia's prediction, acknowledge it's a common choice and explain why it's not optimal"

And in the insight-card spec (`:293`): `[MAIA_CONTINUATION:<moveNumber>:<color>]` is rendered alongside `[CONTINUATION:...]` for every insight.

**Local Lc0 parallel path.** `maiaServerService.ts:21-93` carries a heuristic fallback for off-Vercel deploys. Per `MASTERMIND_FAILURE_MODES.md` and `MASTERMIND_CODEBASE_MAP.md`: "Local Lc0 fallback is silent … The API does not surface 'you got the heuristic, not Maia'. Agent should treat any Maia-2 prediction with `model !== 'maia2'` as low-confidence." Off-coaching-critical-path per user instruction — **not audited further per `DO NOT TOUCH` constraint on the Maia surface.**

### J.4 External research dependencies

- **Maia-2** — McIlroy-Young et al., NeurIPS 2024 (cited in `maia_server.py:8`, `maia-predict/route.ts:8,90`, `STRENGTHS.md §7`).
- Underlying `maia2` Python library (`requirements.txt`).
- **Lc0** (Leela Chess Zero) for the parallel local path.

**Novelty flags.** Per `STRENGTHS.md §7`: "Chess Masti is the only surveyed product wiring Maia-2 specifically into a coaching surface." Internal competitive survey claim.

---

## K. Twin Bot

**File.** `src/lib/twinBot.ts` (300 LOC) — fully audited.

**Purpose** (verbatim, `:1-18`):
> "Twin Bot engine / Hybrid move generator that mirrors a specific opponent's play: / 1. 'Book' phase — walk the opponent's own opening tree using the current game's move history. If the current position has children, pick one weighted by how often the opponent actually played it. This makes the bot play the opponent's exact theory for as long as the opponent's repertoire goes. / 2. 'Engine' phase — once out of book, delegate to Stockfish with UCI_LimitStrength + UCI_Elo set to the opponent's phase-specific rating (opening / middle / endgame). This is the 'Maia-proxy': not real Maia, but a pragmatic, in-browser approximation of level-appropriate play."

**Style-match logic.**
- Book picker weights moves by `Math.pow(totalGames, k)` where `k = max(0.6, 1/max(0.1, randomness))` (`pickBookMove`, `:90-112`). `randomness=0` → always most-played child; `randomness=1` → frequency-proportional. Default `0.35` is "a good mix: mostly main lines, sometimes side-lines" (`:53-56`).
- **Phase ELO mapping.** `phaseForPly`: ply ≤ 20 = opening, ≤ 70 = middle, else endgame (`:116-120`). Ply boundaries chosen as round numbers; no comment justifies the specific 20/70 splits.
- **ELO → depth.** `engineParamsForElo` (`:128-143`): elo<1500→depth=4, <1800→6, <2100→8, <2400→10, <2700→12, else 14. Stated rationale: "shallower depths for weaker opponents give the engine more 'human' blunders" (`:128-132`).
- ELO clamped to Stockfish UCI range `[1320, 3190]`.

**Source declaration.** `TwinBotMoveSource = 'book' | 'engine' | 'fallback'` (`:25`); in-book moves carry `confidence` (% of games at parent node).

**External deps.** Stockfish UCI options `UCI_LimitStrength + UCI_Elo` — engine spec, not a paper. Tree built by `scoutService.buildOpeningTree`.

**Novelty flags.** Per `STRENGTHS.md §4`: "Noctie.ai [is] the only competitor with a humanlike opponent feature; Noctie does not pair the humanlike engine with the opponent's own repertoire data. Twin Bot is therefore a category of one in the surveyed landscape: a per-opponent rehearsal partner." Internal competitive-survey claim; not a peer-reviewed novelty claim.

**Empirical data.** None surfaced.

---

## L. Opponent scouting / Stalker Score

**Files**
- `src/lib/scoutService.ts` (192 LOC) — opening-tree builder
- `src/lib/scoutAnalytics.ts` (853 LOC) — profile + stalker + checklist + rivals + psychology + recent-form + novelty
- `src/lib/scoutEco.ts` (201 LOC) — compact ECO lookup (scout UI only)
- `src/lib/server/scoutFetch.ts` — **⚠ Stage C WIP, not read**
- `src/app/api/scout/route.ts` (27 LOC)
- `src/types/scout.ts` — public type contracts

**Purpose** (`scoutAnalytics.ts:1-12`):
> "Scout Analytics / Consumes a fully-normalised game list from /api/scout and produces the full dashboard bundle the UI renders: profile (OVR + ATK/DEF/TIME/MIND), Stalker Score, targeted prep by color, pre-game checklist, frequent rivals, psychology, and recent-form buckets. / All math is deliberately bounded to 0-100 ranges so the UI can render them uniformly; formulas are heuristics tuned to feel responsive on typical 100-2000 game histories. They are NOT statistically calibrated."

**Inputs.** Public games via chess.com `pub/player/{username}/games/{year}/{month}` and Lichess equivalents (per `DATA_INVENTORY.md`). Server-side fetcher extracted into `server/scoutFetch.ts` during Stage B 1.C.B.0 (commit `c353eba`).

**Feature extraction (per `scoutAnalytics.ts:60-180` audited slice):**
- **Archetype** (`:66-80`): max of `{atk, def, time, mind}`, spread guard <6 → "All-Rounder". Otherwise: ATK-max → "Berserker", DEF-max → "Fortress", TIME-max → "Clockwork", else "Stoic".
- **Ratings** by time class + peak/low/latest tracked.
- **Scoring formula** (`:149-183`):
  - `atk = clamp(…)` based on aggression-tagged metrics
  - `def = clamp(…)` based on losing quickly hurts (line `:157`: "losing quickly hurts defense score")
  - `timeScore = clamp(100 − 120·psychology.timeoutRate − …)` — `:166-176`
  - `mind = clamp(100 − streakPenalty − tiltPenalty)`
  - `ovr = round((atk + def + time + mind) / 4)`

**Stalker Score.** `ProfileSnapshot + StalkerScore + StalkerFactor` types exported and consumed by `shareCard.ts:9-20`. Factors: `time_trouble | tilts | limited_rep | repetitive` (`validators/types.ts:148`). Per `STRENGTHS.md §5`: "Aggregate analytics over the same dataset produce the player's ATK/DEF/TIME/MIND/OVR profile and a 'stalker' score."

**Where it lives in the coaching pipeline.**
- Direct UI: `/api/scout` → scout dashboard.
- Validator: `scoutCitation.ts` consumes `ScoutAnalytics + Collisions` as ground truth (Section C.4).
- Citation rate for `opponent_prep` category (Section F.3).

**Caveat surfaced in the file header itself** (`:11`): "formulas are heuristics tuned to feel responsive on typical 100-2000 game histories. They are NOT statistically calibrated." This is an explicit author-flagged caveat.

**External deps.** chess.com public API, Lichess REST API (named in `DATA_INVENTORY.md §External APIs`).

**Novelty flags.** None. Per `STRENGTHS.md §5`: combination "opponent tree + scouting profile + ready-to-share visual — is unique in the surveyed competitive set" (competitive-survey claim, not novelty in published sense).

---

## M. Inline puzzle UX in chat

**Files** (per `MASTERMIND_CODEBASE_MAP.md`)
- `src/lib/mistakeToPuzzleMapper.ts` — mistake → drilling puzzles
- `src/app/api/mistake-puzzles/route.ts` — wraps the mapper
- `[CONCEPT:<themeKey>:<Display Name>]` insight-card tag in `coachChatPrompt.ts:336-339` — practice-puzzle hook rendered automatically

**Chess-pedagogy logic.**
- **Difficulty by eval drop** (`mistakeToPuzzleMapper.ts:44-52`): "Determine difficulty based on eval drop". No specific brackets quoted in this audit pass.
- **Theme-key gating** (`coachChatPrompt.ts:336-339`): "DO NOT emit [PRACTICE:...] tokens separately. The [CONCEPT:...] tag IS the practice hook. A free-floating [PRACTICE:...] outside an insight block is FORBIDDEN. / Pick the themeKey that matches the SPECIFIC pattern of THIS mistake. Do not default to 'fork' for every insight." (`:336-339`).

**No design rationale surfaced** beyond the operational rules.

---

## N. Synthetic-tester harness

**⚠ Source-restricted (Stage C WIP):** all `.ts` files under `scripts/synthetic-tester/` are off-limits per carve-out. Per the relaxed Option (N-i) scope: README.md + CATEGORY_GENERATOR_DESIGN.md + fixtures/*.json + personas/*.md were read. **Code-internals not audited; design intent below pulled from these readable artifacts + commit history.**

**Files (off-limits but referenced):** `run.ts`, `client.ts`, `checkpoints.ts`, `output.ts`, `costTracker.ts`, `load-real-user-history.ts`, `generators/*.ts`, `smoke-generators.ts`, plus tests under `__tests__/`.

### N.1 Purpose

From README:
> "Generates (game position, persona question, coach response, validator verdict) tuples at scale for manual grading. Not an auto-grader. Plan: SYNTHETIC_TESTER_PLAN.md at the repo root."

Output: per-row append CSV to `runs/<runId>.csv` with fsync after each line, plus `<runId>.meta.json` with run config.

### N.2 Personas (9 total, post-Step 2.3.1)

Per directory listing:
- Pre-Stage-C scaffold (5): `confused_beginner`, `curious_advanced`, `hinglish_learner`, `tilted_intermediate`, `trick_questioner`
- Stage C additions (4): `concept_curious`, `improvement_seeker`, `opponent_prep_seeker`, `reflective_learner`

Each persona file is YAML frontmatter (`name, version, date_calibrated, sample_size, source`) + body. Per README: "The tester sha256-hashes the entire file and stores the digest on every row (`persona_file_hash`)" — version observable in CSV without manual versioning. All Stage C personas carry `sample_size: 0` (uncalibrated; per design doc §13, calibration is Phase 3 / post-CMIP).

### N.3 Generator dispatch (per design doc §10)

Six per-category generators selected via `pickGenerator(category)`:
- `positionAnchored.ts` — wraps existing pipeline for `game_review + position_analysis`
- `opponentPrep.ts`, `improvementStrategy.ts`, `metaMotivational.ts`, `conceptExplanation.ts` — new Stage C generators

CLI flag `--force-category <cat>` or `--force-category=balanced` (default for Stage C; 12 per category × 5 + 8 concept_explanation = 60-72 total). `--category-mix=cat:N,cat:N,…` for custom mixes.

### N.4 Game library + checkpoint picker

From README:
> "The bundled `games/` set is 10 GM games extracted from `scripts/data-pipeline/output/GM_games.pgn`. For volume: Manual setup — download the monthly dump from https://database.lichess.org/standard/lichess_db_standard_rated_2026-04.pgn.zst"

Checkpoint policy (README CLI section): "60% swing / 20% quiet / 20% spread" with `--seed N` (Mulberry32 RNG; default `Date.now() & 0xffffffff`) for deterministic picks. Stockfish depth default `--sf-depth 14`.

### N.5 Fixtures (audited)

- `fixtures/opponents.json` — 5 real chess.com handles (`GothamChess, DanielNaroditsky, Chilllychess, JSNoverPuka, Lazer_Wizard, Chargehim40`) + stub fixtures, each with `profile_summary` and `expected_scout` status.
- `fixtures/concepts.json` — concept list scraped from Yusupov (Build Up Your Chess), Silman (How to Reassess Your Chess 4e), Watson (Modern Chess Strategy). Per-concept metadata `{concept_id, name, source, level, category, notes}`. Per design doc O4: "CC commits the deduped fixture, surfaces in chat with source attribution + concept counts per source. Aayan reads, approves or flags specific entries to remove."
- `fixtures/loss_summaries.json` — 1-line loss snippets for meta_motivational loss-anchored sub-shape.
- `fixtures/user_history_cache/{Lazer_Wizard,JSNoverPuka,Chilllychess,gothamchess}.json` — real chess.com fetches via `load-real-user-history.ts`. Committed to git so collaborators get same data. Per design doc O2: hybrid refresh, `--refresh-fixtures` flag re-fetches.

### N.6 Telemetry capture (Stage C Follow-up A)

Per commit `437e852` "Stage C Follow-up A — pipeline telemetry capture in sweep CSV": telemetry is forwarded from the route's pipeline result into the sweep CSV. Combined with categorization output and citation-rate metrics (per `citationRate.ts`).

### N.7 Position-anchored two-step (Stage C Follow-up B)

Per commit `1e5bf8c` "Stage C Follow-up B — position-anchored two-step for game_review/position_analysis live turns" + commits `7341fa1`, `be1515d`:
> "fix(synthetic-tester): truncate moveHistory + gameEval to checkpoint ply for position-anchored turns"
> "fix(synthetic-tester): prepend starting-position eval to gameEval.positions to match production shape"

Production-shape parity work to make sweep traffic indistinguishable from live traffic at the route layer.

### N.8 Budget discipline (from CATEGORY_GENERATOR_DESIGN.md §12.5)

Hard cap: $70 for Stage C through PR 1.C merge. Mock-LLM mode mandatory during dev (zero API cost). Main 60-turn sweep budget: $8-15. One tune-and-rerun allowed: $8-15. Reserve: $40-50.

### N.9 CSV schema highlights (per README)

- `validator_score` + `validator_issues_json` — re-run `validateAIResponse` client-side.
- `eval_before_cp` / `eval_after_cp` / `swing_cp` — mate-aware.
- `analysis_latency_ms` — populated only on first row per game.
- `http_status` + `error_message` — non-2xx never aborts.
- `grade` / `failure_mode` / `notes` — empty by design (manual grading columns).

### N.10 Auth

Synthetic-tester uses `synthtest-<runId>` UIDs that do **not** exist in Firestore (`getUserById` returns null; route handles that branch). Test traffic excluded from analytics via `WHERE uid NOT LIKE 'synthtest-%'`.

**Empirical data status.** Sweep CSVs land in `scripts/synthetic-tester/runs/` (gitignored per `runs/.gitignore` from commit `9436e5f`). Per `MASTERMIND_CONTEXT/CURRENT_STATE.md:91`: "Per-claim-type firing-rate aggregation required in Stage C sweep summary per Aayan's Stage A.6 follow-up. ≥3-never-fire claim types surface for review."

---

## O. Learning loop (SR + puzzles + rating)

### O.1 SM-2 spaced repetition

**File.** `src/lib/spacedRepetition.ts` (132 LOC) — header audited.

**Algorithm.** Standard SM-2:
- Quality scale 0-5 (`:7-14` documents the scale verbatim).
- `DEFAULT_EASE_FACTOR = 2.5`, `MIN_EASE_FACTOR = 1.3` (`:17-18`).
- `easeFactor += 0.1 - (5-q)*(0.08 + (5-q)*0.02)` — textbook SM-2 update (`:42`).
- Interval: q≥3 keeps schedule (1 → 6 → interval×easeFactor); q<3 resets to 1 day (`:27-39`).
- `nextReview = now + interval * 86400000`ms.

**Storage.** jotai `atomWithStorage` → localStorage (`drillProgressAtom`).

**Adapted for chess opening drilling** (`:5-6`): "Adapted for chess opening line drilling."

**External deps.** SM-2 algorithm — Wozniak / SuperMemo (well-known public-domain algorithm; not formally cited in code).

### O.2 Puzzle Elo (Glicko-lite)

**File.** `src/lib/puzzleRating.ts` (169 LOC) — header audited.

**Purpose** (`:3-6`):
> "Puzzle rating system using simplified Elo (Glicko-lite). Tracks solve stats, rating history, and per-theme performance."

Starting rating: 1200 (`:31`). Tracks `currentStreak / bestStreak`, `themeStats`, `recentSolves`, full `ratingHistory` per timestamp. All localStorage-backed (`puzzleStatsAtom`).

**Puzzle Rush.** Separate atom `puzzleRushScoresAtom` for `{threeMin, fiveMin, survivalBest}` (`:53-58`).

**No design rationale surfaced** for the specific Glicko-lite simplification choices (formula not yet audited in this pass).

### O.3 Repetit Training (per-concept drill sets)

**File.** `src/lib/repetitTraining.ts` (390 LOC) — header audited.

**Purpose** (verbatim, `:1-12`):
> "When AI suggests puzzles like 'Practice King Safety' or 'Practice Rook Activation', the puzzles are saved under 'Repetit Training: [Concept]' for the user to review, complete, and track progress over time."

**Shapes.** `RepetitTrainingSet` (concept name, theme ID from Neo4j, puzzle array, completion-tracking), `PuzzleAttempt` (per-attempt record with movesPlayed + timeSpent + hintsUsed), `UserPuzzleStats` (rolling stats + streak + XP).

**Source attribution.** Each set tagged `source: "ai-coach" | "manual-selection"`. AI-suggested sets originate from the `[CONCEPT:...]` insight-card tags (Section F.2).

---

## P. Other load-bearing modules

### P.1 Concept detection / classifier / taxonomy

Already covered in Section I.7. **Does NOT feed `prepareMastermindContext`, the category classifier, or any Mastermind validator.** Lives entirely in the puzzle-retrieval surface. Stays in Section I per user clarification.

### P.2 Opening detection

**Files.**
- `src/lib/openingDetector.ts` (154 LOC)
- `src/lib/unifiedOpeningDetector.ts` (178 LOC)
- `data/theme-taxonomy.json` (4-level hierarchical theme tree per `DATA_INVENTORY.md`)
- `src/lib/scoutEco.ts` (201 LOC) — compact hand-curated ECO lookup, scout UI only

**Purpose.** ECO detection from move list. `unifiedOpeningDetector.ts` aggregates multiple source detectors; consumer code should treat returned ECO as "most-likely match, not authoritative" per `FAILURE_MODES.md §6` (transposition collisions).

**Does it feed `prepareMastermindContext` / category classifier / validators?** Per `wireValidators.ts` imports: no. Per `scoutAnalytics.ts:34` it feeds scout `getOpeningName(eco)` lookups, which then feed scout claims, which feed `scoutCitation`. **Indirect input to Section C.4 via scout.** Standalone subsystem otherwise. Section P here.

### P.3 User-history aggregates

**File.** `src/lib/mastermind/userHistoryAggregates.ts` (308 LOC) — header audited.

**Purpose** (`:1-22`):
> "Three pure functions that aggregate the user's played-game history into data shapes Stage A.8's `userHistoryCitation` validator will cross-check coach claims against: aggregateWinRateByTimeControl → TimeControlPerformance[], aggregateScoreByOpening → OpeningRepertoirePerformance[], countGamesInDateRange → GameCountInRange. / Reads the existing Firestore `users/{uid}/games` shape … without requiring new collections or migrations. / No I/O, no async, no LLM."

**Directly feeds `validateUserHistoryCitation`** (Section C.5). Per user clarification, this places it in **Section C** thematically; physical file location is `mastermind/` (not `validators/`) per the "validators check claims; aggregators consume" rule (`citationRate.ts:13-15`). Already cross-cited in Section C.5.

### P.4 CMIP feedback portal (eval-data feeder)

**Files.** `src/lib/cmip/schema.ts`, `src/lib/cmip/types.ts`, `src/app/api/feedback/`, `src/lib/server/cmipEmail.ts`.

**Status.** Scaffolding only at the lib level. Per `MASTERMIND_CONTEXT/CURRENT_STATE.md` and the user's auto-memory entry `project_cmip_feedback_portal.md`: CMIP is the Mastermind eval-data feeder; planned at `PR_CMIP_1_PLAN.md` (not in MASTERMIND_CONTEXT/ — separate doc). Per Phase 2/3 rescope: CMIP is Phase 3 input, not a Phase 2 gate. **Not on the current coaching critical path.** Surface only.

### P.5 Coach personalities

**File.** `src/config/coachPersonalities.ts` (referenced from `coachChatPrompt.ts:14, :105`).

**Purpose.** Pre-built coach personas with allowlist IDs (per `coachChatPrompt.CoachChatPromptInput.personalityId`). Examples named in audit: "Coach Gelareh" (warm/encouraging; `:43`), "Blitz Master Mike" (tactical/energetic; `:66`). Wired into the prompt via `getPersonalityById()`.

### P.6 Phase/principle layers (legacy chess-intelligence)

**Files.** `src/lib/chessprinciples/` (10 files), `src/lib/chessPrinciples.ts`, `src/lib/phaseAccuracy.ts`.

**Status.** Per `MASTERMIND_CODEBASE_MAP.md`: "underlies design-only `detect_play_style`, partial input to `analyze_game`." Imports `chess-surprise-analysis` (`enhancedMoveAnalyzer.ts:92`, `aggressiveMoveAnalyzer.ts:51`). Pre-Mastermind generation of chess-intelligence outputs. Not directly wired into the Mastermind validator pipeline.

### P.7 Response cache + analysis-context cache

Already covered in Section B.3 / B.4. `analysisContextCache.ts` is working-tree-dirty (off-limits); per `CODEBASE_MAP`: "Server-side cache for pre-computed game analysis context (keyed by `contextId`). Used by enhanced-analysis (write), chat (read by `contextId`)." The two-route handoff pattern enables fast Haiku follow-ups against the heavyweight Sonnet analysis without re-paying the context-prep cost.

### P.8 Health endpoints

`/api/health/llm` (1-token probe, both providers). `/api/health/anthropic` carries the known hardcoded-bad-model bug (`claude-haiku-4-20250514` not a real ID; permanent 502; one-line fix per `CLAUDE.md`).

---

# Published-work references found in the codebase

Format: `[citation hint]: file:line OR commit SHA`. Every named external paper, library, dataset, or named algorithm pulled from comments / commit messages during the read pass. Library references (Anthropic SDK, OpenAI SDK, chess.js, etc.) are not listed — only research / named-technique / published-dataset references.

## Peer-reviewed / academic

- **Maia-2 (NeurIPS 2024)** — McIlroy-Young et al. → `maia-service/maia_server.py:1-10`, `src/app/api/maia-predict/route.ts:6-12`, `src/app/api/maia-predict/route.ts:88-90`, `MASTERMIND_STRENGTHS.md §7`, `MASTERMIND_DATA_INVENTORY.md §Maia`.
- **Jhamtani et al. ACL 2018 ChessCommentaryGeneration** — dataset citation → `data/chess-commentary/` (preloaded corpus per `DATA_INVENTORY.md §Preloaded data`), loader `scripts/neo4j-loaders/load-commentary.mjs`, route `src/app/api/commentary-by-fen/route.ts:47` ("from the Jhamtani dataset (298k+ move-commentary pairs)"). Email outreach: `email_to_jhamtani_authors.txt`, draft dataset comparison `generate_jhamtani_style_dataset.js` (repo root). Validator slot reserved at `src/lib/mastermind/validators/index.ts:51-66`.

## Named open-source / repository attributions

- **CYHSM/chess-surprise-analysis** — `src/lib/engine/surpriseAnalyzer.ts:29` ("Chess Surprise Analysis based on CYHSM/chess-surprise-analysis repository"), `src/lib/chessprinciples/enhancedMoveAnalyzer.ts:92` ("SURPRISE ANALYSIS (from chess-surprise-analysis)"), `src/lib/chessprinciples/aggressiveMoveAnalyzer.ts:51` ("Get surprise analysis (from chess-surprise-analysis repository)"). **Only open-source GitHub repo cited as a direct methodology source in the chess-intelligence layer.**
- **Stockfish** (engine) — pervasive; `src/lib/engine/stockfish17.ts`, `src/constants.ts:22-23`. Public binaries served from `public/engines/`.
- **Lc0 / Leela Chess Zero** — `src/lib/engine/maiaServerService.ts` (local Lc0 path, off-Vercel parallel implementation), `src/app/api/install-lc0/route.ts:6, :14`.
- **Lichess Syzygy tablebase** — `src/lib/mastermind/lichessTablebase.ts:3` (`https://tablebase.lichess.ovh/standard`). Named in `MASTERMIND_DATA_INVENTORY.md §External APIs`.

## Named algorithms / techniques (used; no formal citation)

- **SM-2 spaced repetition** (SuperMemo, Wozniak) — `src/lib/spacedRepetition.ts:5-15` ("SM-2 Spaced Repetition Algorithm"), `src/types/openings.ts:80` ("Spaced repetition: ease factor (SM-2)"). Public-domain algorithm; no formal citation in code.
- **Glicko (-lite)** — `src/lib/puzzleRating.ts:3-6` ("Puzzle rating system using simplified Elo (Glicko-lite)"). Glickman 1999/2012 — not formally cited.
- **MMR (Maximum Marginal Relevance)** — `src/lib/concept/conceptRetrieval.ts:14-15, :43, :349` (`MMR_LAMBDA = 0.3`, "interleaving principle"). Carbonell & Goldstein 1998 — not formally cited; design doc `concept-similarity-rationale.md` referenced but not located.
- **UCI / UCI_LimitStrength + UCI_Elo** — `src/lib/twinBot.ts:128-143`, `src/lib/engine/uciEngine.ts:99-117`. Stockfish UCI option spec.
- **DecodeChess five-category breakdown** (Threats / Best Moves / Plans / Piece Roles / Concepts) — `MASTERMIND_STRENGTHS.md §6` ("The Quality Improvement Plan names DecodeChess's five-category breakdown"), `src/lib/prompts/coachChatPrompt.ts:170` ("the 5 explanation categories"). Not a paper.
- **Interleaving principle (spaced-practice pedagogy)** — `src/lib/concept/conceptRetrieval.ts:13-14` ("interleaving principle, see concept-similarity-rationale.md").
- **Yusupov / Silman / Watson concept curricula** — `scripts/synthetic-tester/fixtures/concepts.json` source taxonomy (per `CATEGORY_GENERATOR_DESIGN.md §8 O4`). Published books, not papers.

## Internal design / planning documents (load-bearing, not external research)

Surfaced for traceability; not "external research" but cited from code:

- `MASTERMIND_CONTEXT/PR_1B_PLAN.md` — `validators/qualitativeBands.ts:76-77`, `validators/regenerate.ts:53-57, :81-86`, `validators/fallback.ts:156-159`, `validators/featureDeltaCitation.ts:233-237`.
- `MASTERMIND_CONTEXT/PR_1C_PLAN.md` — `validators/index.ts:46-49`, `mastermind/citationRate.ts:13, :96-99`.
- `MASTERMIND_CONTEXT/PR_1C_SCOUT_CITATION_PLAN.md` — `validators/scoutCitation.ts:31-34`.
- `MASTERMIND_CONTEXT/PR_1C_USER_HISTORY_CITATION_PLAN.md` — `validators/userHistoryCitation.ts:37-52, :85-88`.
- `MASTERMIND_CONTEXT/PR_1C_PIPELINE_DATA_SOURCES_PLAN.md` — `validators/index.ts:44-46, :96-99`, `mastermind/citationRate.ts:12`.
- `MASTERMIND_CONTEXT/PR_1C_STAGE_B_PLAN.md` — `mastermind/wireValidators.ts:18`, `mastermind/pipelineTimeout.ts:15-20`, `mastermind/routeHelpers.ts:10-13`.
- `MASTERMIND_CONTEXT/MASTERMIND_BUILD_PLAN.md` — `mastermind/citationRate.ts:23-25`.
- `MASTERMIND_CONTEXT/MASTERMIND_FAILURE_MODES.md §10f` — `validators/featureDeltaCitation.ts:233-237` (cross-reference for absolute-state validator deferral).
- `FUTURE_IDEAS.md §1 Stage 3` — `MASTERMIND_FAILURE_MODES.md §10` (deferred design-only tools).
- `Chess_Masti_AI_Quality_Improvement_Plan.docx` (Feb 2026 source doc) — `MASTERMIND_STRENGTHS.md §2, §3, §6`.
- `CATEGORY_GENERATOR_DESIGN.md` — `scripts/mastermind/stageCcacheFallback.ts:24-25` (referenced for sweep cache rationale).

## Git-log full-history grep (per restricted terms)

Per the carve-out: full-history grep limited to `paper|cite|et al.|novel|different from|prior art|inspired by|based on`. Results from `git log --all --grep="…"` after 2025:

- Commit `aac7372` (2026-02-23): "Add citation section, CITATION.cff, and promo drafts for academic recognition" — adds `CITATION.cff` at repo root for citing the project itself (project as a published artifact; not citing external work).
- No commits with `paper`, `et al.`, `arxiv`, `novel`, `prior art`, `inspired by` in the message body since 2025. The phrase "based on" appears only in cleanup-summary commits unrelated to citations.

**Net finding from the git log grep:** the codebase carries deep validator-pipeline design rationale in PR plan documents, but **the commit history does not surface a separate research-citation thread.** Research citations live entirely in source comments and `STRENGTHS.md` / `DATA_INVENTORY.md`.
