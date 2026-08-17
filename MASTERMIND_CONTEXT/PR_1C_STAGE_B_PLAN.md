# PR 1.C Stage B — route wiring plan

**Revised 2026-05-18 — post-Stage-A seal.** Stage A reopened and ratified per [PR_1C_PLAN.md §7.1](PR_1C_PLAN.md); all four outstanding items shipped (commits `4f6cc3a` scoutCitation, `a067d3b` userHistoryAggregates, `15b3121` userHistoryCitation, `573eab5` citationRate + pipeline.dataSources extension). Stage B planning resumes against the now-real four-validator surface.

**Branch:** `mastermind/stage-3-validators` (continues the existing PR 1.C branch with all of Stage A on it).

**Status:** plan-first. **No code yet** — pause for tech-lead review of the revised §3 `wireValidators.ts` spec specifically (the main architectural surface that changed post-Stage A). Other sections carry the decisions from the pre-Stage-A planning round.

**Scope:** route wiring per [PR_1C_PLAN.md §2](PR_1C_PLAN.md). Wires `runValidationPipeline` into `/api/enhanced-analysis` and `/api/chat` behind `MASTERMIND_VALIDATORS_ENABLED`, threads four data sources (feature delta + piece-role diff + Scout output + user-history aggregates) through `runValidationPipeline.dataSources`, runs `categoryClassifier` to populate per-turn category, computes citation-rate metric post-pipeline, plumbs telemetry forwarding through the existing Sentry path, preserves footnote-append (Option A coexistence per [PR_1C_PLAN.md §2.4](PR_1C_PLAN.md)).

**Stage C** (full synthetic-tester sweep against preview deploy) gates merge to main. Per-claim-type firing-rate aggregation lands in the sweep summary per Aayan's Stage A.6 follow-up requirement — flags ≥3-never-fire claim types as merge candidates to surface for review.

**Decisions ratified during pre-Stage-A planning** (carried forward unchanged):

- **Aayan Q2–Q7** all defaults ratified: per-retry SSE on every boundary; chat skips pipeline on no-contextId; telemetry field set ships as specced; **Q5 categoryClassifier wiring fires now** (scout + user-history validators have shipped — Q5's default rationale applies); partial-data UX silently degrades; local-only sweeps in Stage B, CI sweep after 30 days of stability.
- **Tech-lead T1–T10** all defaults ratified: Option (b) `Promise.race` wrapper for 30s pipeline timeout (kept even though the §7.1 scope correction also approves touching PR 1.B sealed surface — the wrapper is simpler than extending the pipeline's return type); ship and tune synthetic-stream pacing; chat `maxRetries: 1`; existing Sentry sink with `module=mastermind-validator` tag filter; function-based env reader matching `getAuthEnv`; JSON fixtures matching the dry-run harness style; no per-route opt-out until the first request lands; no per-request opt-out; route allowlist confirmed `/api/enhanced-analysis` + `/api/chat`; auth posture unchanged.

The §12 ratification table captures these. New questions added in §12.3 surface architectural choices that emerge from the now-real four-validator wiring surface (Scout-fetch identity, per-source caching, citationRate lifecycle position).

---

## 0. Stage A surface available to Stage B (post-seal 2026-05-18)

Stage A sealed with commits A.1 through A.9 — see the [PR_1C_PLAN.md §7.1 renumbered sequence](PR_1C_PLAN.md). Stage B has the full validator surface available; the tighter-scope framing from the pre-Stage-A draft (carry-forward null slots, defer Scout/user-history wiring) is replaced.

### 0.1 Shipped Stage A surface that Stage B consumes

**Four validators** — all library code, all consumed by `runValidationPipeline`:

| Validator | File | Source | Tests |
|---|---|---|---|
| `validateEvalClaim` | [`src/lib/mastermind/validators/evalClaim.ts`](../src/lib/mastermind/validators/evalClaim.ts) | PR 1.B | shipped |
| `validateFeatureDeltaCitations` | [`src/lib/mastermind/validators/featureDeltaCitation.ts`](../src/lib/mastermind/validators/featureDeltaCitation.ts) | PR 1.B | shipped |
| `validateScoutCitation` (26 claim types) | [`src/lib/mastermind/validators/scoutCitation.ts`](../src/lib/mastermind/validators/scoutCitation.ts) | Stage A.6 | 110 |
| `validateUserHistoryCitation` (3 claim types — server-derivable; 3 deferred to PR 1.E) | [`src/lib/mastermind/validators/userHistoryCitation.ts`](../src/lib/mastermind/validators/userHistoryCitation.ts) | Stage A.8 | 69 |

**Pipeline extension:** `runValidationPipeline.dataSources` in [`src/lib/mastermind/validators/index.ts`](../src/lib/mastermind/validators/index.ts) (Stage A.9). Optional field; when present with `scout` or `userHistory`, the pipeline dispatches the corresponding validators inside its `validate` closure. **Binary-equality preservation contract enforced** — `dataSources: undefined` produces byte-identical output to PR 1.B.

**Citation-rate aggregator:** [`src/lib/mastermind/citationRate.ts`](../src/lib/mastermind/citationRate.ts) (Stage A.9). Pure function `computeCitationRate(opts) → CitationRateResult`. Six-category-aware via `CATEGORY_PRIMARY_SOURCE`. Floor enforcement lives in the sweep harness, not here. **`feature_delta` source has no opportunity counter** (deferred per [PR_1C_PLAN.md §11.7](PR_1C_PLAN.md) — `game_review` and `position_analysis` produce hallucination-check data only).

**User-history aggregator:** [`src/lib/mastermind/userHistoryAggregates.ts`](../src/lib/mastermind/userHistoryAggregates.ts) (Stage A.7). Three pure functions over `UserHistoryGame[]`: `aggregateWinRateByTimeControl`, `aggregateScoreByOpening`, `countGamesInDateRange`.

**Shared utilities** (carried as Stage A side outputs):

| Utility | File | Used by |
|---|---|---|
| `extractPgnHeaders` | [`src/lib/utils/pgnHeaders.ts`](../src/lib/utils/pgnHeaders.ts) | `userHistoryAggregates` |
| `substringMatch` + `lower` | [`src/lib/utils/fuzzyMatch.ts`](../src/lib/utils/fuzzyMatch.ts) | `scoutCitation`, `userHistoryCitation` |
| `classifyTimeControl` | [`src/lib/utils/timeControlClass.ts`](../src/lib/utils/timeControlClass.ts) | `userHistoryCitation` |

**Dry-run harness** (Stage A.2/A.2.5): [`scripts/mastermind/validator-gate-dryrun.ts`](../scripts/mastermind/validator-gate-dryrun.ts) + 22-fixture corpus. Verifies validator behavior offline; pre-merge gate.

**categoryClassifier** ready to wire: [`src/lib/mastermind/categorization/categoryClassifier.ts`](../src/lib/mastermind/categorization/categoryClassifier.ts) + seed fixtures. Per Q5 default (now ratified — see §12.1) Stage B wires the classifier so per-turn `category` populates telemetry and citation-rate metric input.

### 0.2 What Stage B builds against the Stage A surface

Stage B's job is now narrow and well-defined:

1. **`wireValidators.ts`** — helper that fetches the four data sources (PR 1.A primitives + Scout + user-history aggregates) and threads them into `runValidationPipeline.dataSources`. Independent failure tolerance per source.
2. **Route handlers** — `/api/enhanced-analysis` + `/api/chat` gain a flag-on lifecycle wing that calls `wireValidators.fetchDataSources(...)`, runs `categoryClassifier`, calls `runValidationPipeline`, calls `computeCitationRate`, forwards telemetry, and synthetic-streams the result.
3. **`validatorTelemetry.ts`** — forwards `result.telemetry` events to Sentry via the existing logger with the new tag schema.
4. **`MASTERMIND_VALIDATORS_ENABLED`** flag + `getMastermindEnv()` reader in `src/env.ts`.

Stage A's preservation contract means `wireValidators.ts` failing to fetch any of the four sources (returning `dataSources: undefined`) produces unchanged PR 1.B behavior — safe degradation.

### 0.3 What's still out of scope for Stage B

- **`feature_delta` opportunity counter** — deferred per [PR_1C_PLAN.md §11.7](PR_1C_PLAN.md) + [`cleanup_followups.md`](cleanup_followups.md). game_review + position_analysis citation rates report null perSource bucket; treated as "not measured" by the sweep. Hallucination ceiling still applies via PR 1.B validators.
- **Jhamtani validator wiring** — `dataSources.jhamtani` slot reserved as `unknown` in PR 1.B-extended signature; PR 1.D wires the validator behind it.
- **Cross-source claim coordinator** — PR 1.F, conditional on Stage C sweep showing ≥5% composite-claim rate.
- **Removing footnote-append** — Option A coexistence stays per [PR_1C_PLAN.md §2.4](PR_1C_PLAN.md).

---

## 1. `/api/enhanced-analysis` lifecycle (with and without flag)

Current route file: [`src/app/api/enhanced-analysis/route.ts`](../src/app/api/enhanced-analysis/route.ts) — 1,440 lines. Two existing branches: **streaming** (L1193–L1322) and **non-streaming** (L1323–L1440). Validator integration site differs between the two.

### 1.1 Flag-off path (unchanged from today)

```
┌────────────────────────────────────────────────────────────────────────┐
│ POST /api/enhanced-analysis                                            │
│                                                                        │
│ ┌─── 1. requireSession()  →  guard auth + return 401 if no cookie      │
│ ┌─── 2. validateRequest(enhancedAnalysisSchema, body)                  │
│ ┌─── 3. Build prompt context (PR 1.A primitives are already callable;  │
│ │     they're not yet plumbed into per-move loop — that's Phase 1      │
│ │     wiring scoped elsewhere. Today: position annotation, eval, etc.) │
│ ┌─── 4. Branch on `streamRequested`                                    │
│ │                                                                      │
│ │       ┌─ streaming (L1193+):                                         │
│ │       │   ▸ open SSE stream                                          │
│ │       │   ▸ for-await callLLMStream(flagship) → emit `text` events   │
│ │       │   ▸ on stream complete: rawAnalysis = fullText                │
│ │       │   ▸ validateAIResponse(rawAnalysis, validationFen, …)        │
│ │       │     [chess.js board-state validator; footnote-append path]   │
│ │       │   ▸ analysisContent = corrected? validation.correctedResp    │
│ │       │     : rawAnalysis                                            │
│ │       │   ▸ setCachedResponse, storeAnalysisContext,                  │
│ │       │     generatePuzzleRecommendations                             │
│ │       │   ▸ emit `done` event with metadata.analysis = analysisContent│
│ │       │   ▸ controller.close()                                       │
│ │       │                                                              │
│ │       └─ non-streaming (L1323+):                                     │
│ │           ▸ callLLM(flagship)  →  llmResult.content                  │
│ │           ▸ validateAIResponse(rawAnalysis, validationFen, …)        │
│ │           ▸ NextResponse.json with corrected analysis + metadata     │
│ │                                                                      │
└────────────────────────────────────────────────────────────────────────┘
```

**This is identical to today's path.** Flag-off is a no-change branch — important because Stage B's preview-only flag posture means production traffic stays on this path until promotion criteria fire (§7.4).

### 1.2 Flag-on path (new — what Stage B adds)

```
┌────────────────────────────────────────────────────────────────────────┐
│ POST /api/enhanced-analysis  (MASTERMIND_VALIDATORS_ENABLED=true)      │
│                                                                        │
│ ┌─── 1. requireSession()  →  unchanged                                  │
│ ┌─── 2. validateRequest()  →  unchanged                                 │
│ ┌─── 3. Build prompt context  →  unchanged                              │
│ ┌─── 4. wireValidators.fetchDataSources(opts)  ← NEW (§3)              │
│ │       Returns { featureDelta, pieceRoleDiff, scout: null,            │
│ │                 userHistory: null, jhamtani: null }                  │
│ │       Each source's fetch is bounded + try/wrapped → null on failure │
│ │                                                                      │
│ ┌─── 5. Branch on `streamRequested`                                    │
│ │                                                                      │
│ │       ┌─ streaming (L1193+) — buffer-then-restream (§4):              │
│ │       │   ▸ open SSE stream                                          │
│ │       │   ▸ emit `validating` event (phase="initial")  ← NEW         │
│ │       │   ▸ await runValidationPipeline({                            │
│ │       │       initialRequest: {tier:"flagship", system, messages},    │
│ │       │       stockfishEval, featureDelta, pieceRoleDiff,             │
│ │       │       playerPerspective, fen, moveSan, correlationId,         │
│ │       │       maxRetries: 2,                                          │
│ │       │       // callLLM, parseCall use production defaults           │
│ │       │     })                                                        │
│ │       │   ▸ if pipeline emits internal retry telemetry, optionally    │
│ │       │     forward as `validating` events with phase="retry-N"      │
│ │       │     (open question §12 Q2 — Aayan UI judgment)               │
│ │       │   ▸ on pipeline done (passed/fallback): rawAnalysis =         │
│ │       │     result.finalResponse                                      │
│ │       │   ▸ synthetic re-stream: emit `text` events chunked          │
│ │       │     (~64 char/event @ 30 ms/event so ~3s total feels         │
│ │       │     stream-like) ← see §4 for the pacing rationale            │
│ │       │   ▸ validateAIResponse(rawAnalysis, validationFen, …)        │
│ │       │     [chess.js board-state validator coexists per §8]          │
│ │       │   ▸ analysisContent = corrected? validation.correctedResp    │
│ │       │     : rawAnalysis                                             │
│ │       │   ▸ forwardTelemetry(result.telemetry, routeContext)  ← NEW  │
│ │       │   ▸ setCachedResponse, storeAnalysisContext,                  │
│ │       │     generatePuzzleRecommendations  (unchanged)                │
│ │       │   ▸ emit `done` with metadata (includes                       │
│ │       │     pipeline.finalOutcome, pipeline.retryCount,               │
│ │       │     pipeline.totalCostUsd)                                    │
│ │       │   ▸ controller.close()                                        │
│ │       │                                                              │
│ │       └─ non-streaming (L1323+):                                     │
│ │           ▸ await runValidationPipeline(...)  same shape             │
│ │           ▸ rawAnalysis = result.finalResponse                       │
│ │           ▸ validateAIResponse(rawAnalysis, ...)  coexists           │
│ │           ▸ forwardTelemetry(...)                                     │
│ │           ▸ NextResponse.json({...metadata, pipeline: {...}})         │
│ │                                                                      │
└────────────────────────────────────────────────────────────────────────┘
```

**Key change.** `callLLM`/`callLLMStream` is no longer called directly — `runValidationPipeline` owns the LLM call. The pipeline's `callLLM` param defaults to the production `@/lib/llmProvider.callLLM`; the route doesn't pass one. The pipeline drives Sonnet flagship → validate → up to 2 retries → fallback if needed. The user always gets something (`buildFallbackResponse` is the safety net).

**One streaming detail.** Today's path uses `callLLMStream` for real-time SSE text events. The pipeline buffers — there's no `runValidationPipelineStream`. So the flag-on streaming branch is **buffer-then-restream**: pipeline finalizes, then route synthetic-streams the final response. The `validating` SSE event narrates the buffer wait (§4). Latency cost: ~3–6s before first text token (vs ~1.5s on flag-off streaming today). UI affordances to make 3–6s feel like depth, not lag, are Phase 2 work — but the SSE event shape ships now.

### 1.3 Decision points + integration line numbers (post-Stage-B)

| Decision | Today's line | Flag-on line (approx; subject to refactor) |
|---|---|---|
| Where the LLM is called | L1216 (`callLLMStream` in streaming) / L1327 (`callLLM` in non-streaming) | replaced by `runValidationPipeline` call inside the same branches |
| Where `validateAIResponse` runs | L1252 / L1368 | unchanged location — runs **after** pipeline returns its `finalResponse` |
| Where SSE `done` emits | L1295 | unchanged shape, metadata gains `pipeline` fields |
| Where telemetry forwards | n/a today | new — between pipeline-return and validateAIResponse |
| Where flag is read | n/a | top of POST handler, before the branch decision |

---

## 2. `/api/chat` lifecycle (with and without flag)

Current route: [`src/app/api/chat/route.ts`](../src/app/api/chat/route.ts) — 182 lines. Single path (no streaming branch on chat — chat is `tier: "fast"` Haiku 4.5 with sub-5s p50). Same principles, smaller surface.

### 2.1 Flag-off (unchanged)

```
POST /api/chat
  ┌─ 1. requireSession()
  ┌─ 2. validateRequest(chatSchema)
  ┌─ 3. Branch on contextId presence:
  │
  │      ┌─ fast path (contextId present, L34–L126):
  │      │   ▸ getAnalysisContext(contextId)
  │      │   ▸ build chatMessages, system, nonSystemMessages
  │      │   ▸ callLLM({tier: "fast", ...})  →  rawContent
  │      │   ▸ validateAIResponse(rawContent, context.fen)
  │      │   ▸ NextResponse.json({...analysis: corrected? : rawContent})
  │      │
  │      └─ fallback path (no contextId, L128–L174):
  │          ▸ build fallbackSystem, fallbackMessages
  │          ▸ callLLM({tier: "fast", ...})
  │          ▸ NextResponse.json with OpenAI-compatible shape
  │
  └─ catch → 500
```

### 2.2 Flag-on (new)

```
POST /api/chat  (MASTERMIND_VALIDATORS_ENABLED=true, only fast-path branch wires pipeline)
  ┌─ 1. requireSession()  →  unchanged
  ┌─ 2. validateRequest()  →  unchanged
  ┌─ 3. Branch on contextId presence:
  │
  │      ┌─ fast path (with pipeline):
  │      │   ▸ getAnalysisContext(contextId)
  │      │   ▸ build chatMessages, system, nonSystemMessages
  │      │   ▸ wireValidators.fetchDataSources({           ← NEW
  │      │       fen: context.fen,                          │
  │      │       fenBefore: context.fen,                    │ Source set is intentionally
  │      │       moveHistory: context.playedMoves,          │ thinner for chat — no Stage 3
  │      │       playerColor: context.playerColor,          │ delta computation today; we
  │      │     })   →   { featureDelta: degraded,           │ pass a degraded-but-valid
  │      │              pieceRoleDiff: [], ...nulls }       │ FeatureDelta shape (see §3.4)
  │      │   ▸ await runValidationPipeline({               ← NEW
  │      │       initialRequest: {tier: "fast", ...},        │ Same pipeline, fast tier
  │      │       featureDelta, pieceRoleDiff, …             │
  │      │       maxRetries: 1,    ← see §5; one retry max │ Chat budget is tight
  │      │     })                                            │
  │      │   ▸ rawContent = result.finalResponse             │
  │      │   ▸ validateAIResponse(rawContent, context.fen)  ← coexists
  │      │   ▸ forwardTelemetry(result.telemetry, routeContext)  ← NEW
  │      │   ▸ NextResponse.json({...with pipeline metadata})
  │      │
  │      └─ fallback path (NO pipeline wiring — see §12 Q3):
  │          ▸ unchanged from today's flow. No context = no FEN =
  │            no feature-delta source = pipeline can't add value.
  │
  └─ catch → 500
```

**Two chat-specific differences from `/api/enhanced-analysis`:**
- `maxRetries: 1` instead of 2. Chat is fast-tier (Haiku 4.5); the budget is ~5s p50 today. Two retries on Haiku is ~6–9s of LLM time alone, busting the budget. One retry caps overhead at ~3s.
- The fallback path (no contextId) is unchanged — no fen, no delta, no pipeline. Open question §12 Q3 — Aayan to confirm; default is "skip pipeline on no-context chat."

---

## 3. `wireValidators.ts` helper module spec (revised post-Stage-A seal)

The route doesn't call any validator directly. All four are owned by `runValidationPipeline`. The route's responsibility is **fetching the four data sources**, then handing them to the pipeline via the (now-shipped) `dataSources` field. That's what `wireValidators.ts` does. Plus a small post-pipeline step: compute the citation-rate metric using the shipped `citationRate.ts` aggregator.

### 3.1 File: `src/lib/mastermind/wireValidators.ts`

```typescript
import type { PositionFeatureDelta } from "@/lib/mastermind/featureDelta";
import type { RoleChange } from "@/lib/mastermind/pieceRoles";
import type { ThreatNode } from "@/lib/mastermind/threatTree";
import type {
  ScoutAnalytics,
  Collisions,
  ScoutGame,
} from "@/types/scout";
import type {
  UserHistoryGame,
} from "@/lib/mastermind/userHistoryAggregates";
import type { ScoutTimeClass } from "@/lib/mastermind/validators";

/**
 * The four data sources the pipeline consumes plus PR 1.A primitives the
 * pipeline already requires top-level (featureDelta + pieceRoleDiff).
 * Same shape as ValidatorDataSources in validators/index.ts plus the two
 * always-present PR 1.A inputs.
 */
export interface FetchedDataSources {
  // PR 1.A — always present (pipeline requires them at top-level).
  featureDelta: PositionFeatureDelta;
  pieceRoleDiff: RoleChange[];
  threatTree?: ThreatNode[];
  // Stage A.6 + A.8 — optional, fetched independently with failure tolerance.
  scout?: {
    scout: ScoutAnalytics;
    collisions?: Collisions;
    opponentUsername: string;
    primaryTimeClass?: ScoutTimeClass;
  };
  userHistory?: {
    games: UserHistoryGame[];
    userName: string;
    nowMs?: number;
  };
}

export interface FetchOpts {
  /** Position before the move (or the current position for chat). */
  fenBefore: string;
  /** Position after the move (or same as fenBefore for chat). */
  fenAfter: string;
  /** Optional resolution-point FEN — caller supplies if known. */
  fenAtResolution?: string;
  /** PV from Stockfish for find_resolution_point fallback. */
  pv?: string[];
  /** Optional move history for chat context. */
  moveHistory?: string[];

  /** Player perspective for telemetry. */
  playerPerspective: "white" | "black";

  /** Per-turn telemetry context. */
  correlationId: string;

  /** Authenticated user's UID — for Firestore games subcollection read. */
  uid: string;

  /** User's primary identifier — for detectUserColor matching across games. */
  userName: string;

  /** Opponent's username — fetch Scout when supplied; skip when undefined. */
  opponentUsername?: string;

  /** Opponent's platform if known — guides scoutService.ts path. */
  opponentPlatform?: "lichess" | "chess.com";

  /** Time-class hint for Scout rating disambiguation; optional. */
  primaryTimeClass?: ScoutTimeClass;
}

export async function fetchDataSources(opts: FetchOpts): Promise<FetchedDataSources>;
```

**Behavior:**

1. **`featureDelta` (required, never null).** Calls `compute_feature_delta(fenBefore, fenAfter, { fenAtResolution, pv })` from PR 1.A. Pure CPU, deterministic. Throws only on invalid FEN — route handles by skipping the pipeline for this turn (fall back to flag-off behavior, logged).
2. **`pieceRoleDiff` (required, never null — but may be empty array).** Wraps `classifyPieceRoles(fenBefore)` + `classifyPieceRoles(fenAfter)` + diff in try/catch; on failure returns `[]` and logs the warning.
3. **`threatTree` (optional, omitted when not computed).** Stage B leaves undefined; the pipeline handles the optional input.
4. **`scout` (NEW post-Stage-A, optional with graceful failure).** Opponent identity resolution per T11 Option (c):
   - **First**, try to parse the opponent's name from PGN headers — match `White` / `Black` against `opts.userName` and take the other side. Anonymous-PGN flows yield no opponent here.
   - **Else**, fall back to the explicit `opts.opponentUsername` field. `/api/enhanced-analysis` request schema gains an optional `opponentUsername?: string` (non-breaking) so the route can pass it through. `/api/chat` skips this fallback since chat fast-path has no opponent context.
   - **Else**, skip Scout fetch entirely — no opponent to fetch against.

   When an opponent is resolved:
   - Call `fetchOpponentGames(username, platform, months)` from `@/lib/server/scoutFetch` — the shared server lib extracted in commit `1.C.B.0`. Returns `ScoutGame[]` plus payload metadata; the 10-min cache (32-entry LRU) applies automatically.
   - Compute `ScoutAnalytics` + `Collisions` via `computeAnalytics(games, opponentUsername)` from `@/lib/scoutAnalytics`.
   - Return `{ scout, collisions, opponentUsername, primaryTimeClass }`.
   - On any failure (timeout, 5xx, opponent-not-found, private profile): catch the error, log to Sentry as a warning with `module=mastermind-validator, source=scout`, and **omit the `scout` field entirely** (not null — undefined). The pipeline sees no `dataSources.scout` and skips the validator.
   - **Trusts the shared 10-min cache** in `scoutFetch.ts` — no per-route or per-call cache layer. Same cache serves `/api/scout/route.ts` HTTP callers and `wireValidators.ts` internal callers.
5. **`userHistory` (NEW post-Stage-A, optional with graceful failure).** Always attempted when `opts.uid` is supplied:
   - Read `users/{uid}/games` subcollection via Firebase Admin (cap at 200 most-recent for cost — open question §12.3 T11 for tuning).
   - Return `{ games, userName, nowMs: Date.now() }`.
   - On any failure (Firestore 5xx, AdminConfigError, query timeout): catch, log warning, omit the `userHistory` field. Pipeline skips the validator.

### 3.2 Partial-data handling contract (load-bearing now)

Failure independence — **each of the four sources fails independently without blocking the others.** Sequence-of-failures matrix:

| Failed source | Pipeline behavior | Telemetry consequence |
|---|---|---|
| FD throws (invalid FEN) | Route skips pipeline entirely for the turn → flag-off path | Single warning log; no `validator_event` Sentry events for this turn |
| Role diff throws | `pieceRoleDiff: []` → `validateFeatureDeltaCitations` runs without role-gained/role-lost checks | Single warning log + normal pipeline telemetry |
| Scout fetch fails | `scout` undefined → `validateScoutCitation` skipped | Warning log + opponent_prep citation-rate reports `perSource.scout: null` (zero opportunities, zero citations) |
| User-history fetch fails | `userHistory` undefined → `validateUserHistoryCitation` skipped | Warning log + improvement_strategy/meta_motivational categories' citation rates report `perSource.user_history: null` |

The `runValidationPipeline.dataSources` extension's contract (Stage A.9) means omitting a source = identical behavior to PR 1.B for that validator slot. Pipeline output stays well-formed regardless of which sources resolved.

### 3.3 Bounded concurrency

Four sources fetched concurrently via `Promise.allSettled`:

```typescript
const [fdResult, roleDiffResult, scoutResult, userHistoryResult] = await Promise.allSettled([
  computeFeatureDelta(opts),         // pure CPU — <50ms
  computeRoleDiff(opts),             // pure CPU — <50ms
  fetchScoutWithFailureTolerance(opts), // ~2s p95 (Lichess/chess.com round-trip + scoutAnalytics compute)
  fetchUserHistoryWithFailureTolerance(opts), // ~200ms (Firestore Admin read)
]);
```

Per-source timeout: **3s default** (matches the per-Haiku-parser budget; the slowest source — Scout — can hit this on a cold opponent fetch). On timeout: log warning, treat as failed source per §3.2.

Parallel concurrency is safe — sources are independent. Aggregate latency ≈ max(individual source latencies) ≈ 2-3s p95 vs sequential's 5-7s. Material win.

### 3.4 Chat-path degraded mode

The chat route has no per-move context (just a position FEN). The helper supplies a **degraded feature delta**: `featureDelta = compute_feature_delta(context.fen, context.fen)` → empty delta (`isEmptyDelta: true`). `validateFeatureDeltaCitations` runs without firing feature-citation checks.

Chat-specific source posture:
- **Scout** — skip in chat (no opponent context in chat fast-path; the `opponentUsername` field isn't typically set on chat requests). Set `opts.opponentUsername = undefined` from the route's chat handler.
- **User history** — keep enabled in chat. The user's history is relevant for improvement_strategy / meta_motivational chat follow-ups ("am I improving in blitz?"). Same Firestore Admin read.
- **Eval-mismatch checks** still apply against the chat response — the main value of running the pipeline on chat.

Per Q3 ratified: the no-`contextId` chat fallback path skips the pipeline entirely. The chat changes here apply only to the contextId-present fast path.

### 3.5 Post-pipeline: citation-rate computation

After `runValidationPipeline` returns and BEFORE the route emits the `done` SSE event, the route calls:

```typescript
const citationRateResult = computeCitationRate({
  category: classifiedCategory,         // from categoryClassifier, see §3.6
  validatorResults: [pipelineResult],   // the RegenerateResult's wrapped Validator output is read for telemetry
  opportunities: {
    scout: dataSources.scout ? countScoutOpportunities(dataSources.scout.scout, dataSources.scout.collisions) : undefined,
    userHistory: dataSources.userHistory ? countUserHistoryOpportunities(dataSources.userHistory.games, dataSources.userHistory.userName) : undefined,
  },
});
```

The `citationRateResult` rides in the `done` SSE event's metadata (under `pipeline.citationRate`) and gets logged into Sentry telemetry as a single `citation_rate_summary` event (one per turn, distinct from per-validator events).

The `citation_rate_summary` event includes a `userHistoryGameCount` field carrying the actual count of games returned from the Firestore read (`dataSources.userHistory?.games.length ?? null`). Per T12 resolution: the 200-most-recent default is the starting bound, but emitting the count lets us detect whether users routinely hit the ceiling (revisit upward) or never approach it (we're undersized).

**Per-turn event level:** routine `citation_rate_summary` events emit at `logger.debug(...)` always (visible in Vercel Log Drain when `LOG_LEVEL=debug`) plus a 1-in-100 sampled `logger.info(...)` for Sentry trend visibility. Noteworthy turns (below-floor citation rate per §11.3 floors with ≥3 opportunities; `final_outcome=fallback_used`; `retry_count > 0`; any validator's `check_name` fired >1×) emit at `logger.info(...)` always. **See §6.3.1 for the verified-behavior lock-in** — the original "trust Sentry retains debug queryable" assumption from 2026-05-18 was verified against this codebase's logger + Sentry SDK config on 2026-05-22 and does not hold; the fallback posture is the locked posture.

**No floor enforcement here** — that lives in the Stage C sweep. The route just computes + logs the metric.

### 3.6 categoryClassifier wiring (NEW post-Stage-A, Q5 default fires)

Before `fetchDataSources` is called, the route runs the classifier:

```typescript
const categorized = await classifyQuestion({
  question: opts.userQuestion,          // depends on route: enhanced-analysis has the user's prompt; chat has the userMessage
  parseCall: opts.parseCall,            // production parser; mocked in tests
});
const category = categorized.category;  // QuestionCategory enum value
```

The classifier is one extra Haiku call (~$0.001/turn, ~$0.0002 with cache-warm). `category` is attached to telemetry's RouteContext and consumed by `computeCitationRate(...)`'s category-to-source mapping.

**Confidence < 0.5 → default to `meta_motivational`** per [`categoryClassifier.ts`](../src/lib/mastermind/categorization/categoryClassifier.ts) `DEFAULT_LOW_CONFIDENCE_CATEGORY`. Stage A.1's boundary iteration validated this default; the classifier is shipped as-is.

### 3.7 Route audit: `/api/enhanced-analysis` (pre-1.C.B.4)

End-to-end read of [`src/app/api/enhanced-analysis/route.ts`](../src/app/api/enhanced-analysis/route.ts) — **1440 lines** (grew from the 1082 CLAUDE.md cites; CLAUDE.md is stale on the line count, semantics unchanged). Captures every entry/exit point, telemetry emission, error path, streaming detail, auth boundary, and where the flag-on wing inserts. The flag-on path has to coexist with all of this without touching flag-off behavior.

#### 3.7.1 Route shape — top-level structure

- **Single `export async function POST(request)`** at line 994.
- Wrapped in `withRequestContext(requestId, async () => { ... })` — the request-context provider for the structured logger (sets the `requestId` field on every `logger.child({...})` emission). `extractRequestId(request.headers)` reads the incoming `x-request-id` header or generates a UUID.
- **No other exported methods** (no GET / PUT / DELETE).

#### 3.7.2 Entry, validation, auth (lines 994–1023)

1. **L994:** `POST(request)` entry.
2. **L995–997:** `extractRequestId` + `withRequestContext` wrap.
3. **L998–999:** `requireSession()` guard — returns `guard.response` (401/403) on failure. **Exit point #1.**
4. **L1001–1023:** body parse + Zod schema validation via `validateRequest(enhancedAnalysisSchema, body)`. On schema failure → `parsed.response` (400). **Exit point #2.**
5. The destructured request fields used downstream: `userMessage, message, moveHistory, fen, position, gameEval, playerColor, username, userRating, boardOrientation, conversationHistory, personalityId, playerColorName, chesscomUsername, lichessUsername, stream: streamRequested`.

**Flag-on schema additions needed (per T11 Option (c)):** extend `enhancedAnalysisSchema` in [`src/lib/validation/schemas.ts`](../src/lib/validation/schemas.ts) at line 128 with `opponentUsername: z.string().max(50).regex(/^[a-zA-Z0-9_-]+$/).optional()`. Non-breaking; PGN-parsing path doesn't apply here since enhanced-analysis doesn't carry a PGN body.

#### 3.7.3 Pre-LLM setup (lines 1024–1122)

- **L1026:** `log.info("Enhanced analysis started", {...})` — the per-request audit entry.
- **L1038–1054:** game-context build via `buildGameContext` / `buildCompactGameContext` (these are the prompt-injection helpers that produce the gameContext string for the user message).
- **L1059–1075:** coaching prefs fetch via `getUserById(session.uid)`. Wrapped in try/catch; failure emits `log.warn("could not load coaching prefs", ...)` — **telemetry emission #1.**
- **L1081–1089:** `claudeSystemPrompt = getCoachChatSystemPrompt({...})`.
- **L1092–1122:** `claudeMessages` array build — assistant/user turn alternation plus the final user-content composition (with `selectExamples` + `formatExamplesForPrompt` few-shot injection).

#### 3.7.4 Response cache (lines 1124–1186)

Cache key: `generateCacheKey(currentFen, skillLevel, messageText || "analyze")` — same key for both streaming and non-streaming. On cache hit:

- **Streaming branch (L1155–1183):** synthesizes a one-shot SSE response with the cached text + `done` event. **Exit point #3.**
- **Non-streaming branch (L1185):** returns `NextResponse.json(cachedPayload)`. **Exit point #4.**

Cache-hit metadata lacks `corrected`, `contextId`, `puzzleRecommendations` (cache short-circuits the post-LLM pipeline that produces them).

**Flag-on policy on cache hits:** per §8 (no cutover), flag-on cache hits return the cached response unchanged. **Decision item below (§3.7.10 open question A):** do we still emit a `citation_rate_summary` event tagged `cached: true` for analytics consistency, or skip telemetry entirely on cache hits?

#### 3.7.5 Streaming branch (lines 1193–1322)

When `streamRequested === true` and cache misses:

- **L1194–1204:** compute `validationFen` and the `game` object up front (the `done` event needs them).
- **L1206–1207:** SSE plumbing — `TextEncoder` + `new ReadableStream({ async start(controller) {...} })`. Helper: `send = (obj) => controller.enqueue(encoder.encode(\`data: ${JSON.stringify(obj)}\\n\\n\`))`.
- **L1215–1237:** `for await (const evt of callLLMStream({...}))` loop. Three event types from the LLM stream:
  - `evt.type === "text"` → accumulate into `fullText` AND forward via `send({ type: "text", delta: evt.delta })`.
  - `evt.type === "done" /* implicit */` → captures `llmDone: LLMResult` (final usage tokens).
  - **On exception:** catches `LLMError` (or wraps unknown errors), emits `send({ type: "error", error: e.message })`, closes the stream. **Exit point #5 (early-out).** This is `log.error("LLM streaming failed for enhanced-analysis", ...)` — **telemetry emission #2.**
- **L1239–1248:** `console.log("coach.tokens", {...})` — **telemetry emission #3** (NB: bypasses the structured logger; raw `console.log`).
- **L1250–1262:** post-stream validation via `validateAIResponse(rawAnalysis, validationFen, moveHistory)`. On `validation.issues.length > 0` → `log.warn("AI response validation issues", ...)` — **telemetry emission #4.** `analysisContent = validation.isValid ? rawAnalysis : validation.correctedResponse` — this is the **existing footnote-append path** per §8.
- **L1262–1282:** post-validation effects: `setCachedResponse` writes cache; `generateContextId` + `storeAnalysisContext` write the analysis-context cache (consumed by `/api/chat`).
- **L1284–1293:** puzzle recommendations via `generatePuzzleRecommendations`. Wrapped in try/catch; failure → `log.warn("puzzle recs failed in stream", ...)` — **telemetry emission #5.**
- **L1295–1310:** `send({ type: "done", metadata: {...} })` carries: analysis text, position, turn, moveCount, availableMoves, validationScore, validationIssues, contextId, puzzleRecommendations, corrected (`!validation.isValid`).
- **L1314–1321:** `return new Response(sseStream, {headers: ...})`. **Exit point #6.** Headers: `text/event-stream`, `no-cache`, `keep-alive`, `X-Accel-Buffering: no`.

**Streaming pre-flag-on observation:** the route **does not currently buffer-then-restream**. Deltas are forwarded live as Claude emits them. The post-stream validation runs AFTER the stream completes — but only emits `done` metadata at that point, never retracts already-streamed text. That's the discontinuity with §4: when the flag is on, the pipeline buffers because retries may replace the response, so the route cannot stream deltas live anymore. §4's "synthetic re-stream" replaces the L1224 forwarding path entirely on the flag-on wing.

#### 3.7.6 Non-streaming branch (lines 1324–1425)

When `streamRequested === false` (or absent) and cache misses:

- **L1326–1334:** single `callLLM({...})` call.
- **L1335–1347:** on `LLMError`/`Error` → `log.error("LLM provider failed for enhanced-analysis", ...)` (**telemetry emission #6**), returns `NextResponse.json({error: ..., details: ...}, { status: 502 })`. **Exit point #7.**
- **L1348–1352:** `console.log("coach.tokens", {...})` — **telemetry emission #7** (mirror of #3).
- **L1354–1364:** build `game` for response metadata.
- **L1366–1376:** `validateAIResponse` (footnote-append path) + `log.warn("AI response validation issues", ...)` — **telemetry emission #8** (mirror of #4).
- **L1378–1404:** `setCachedResponse`, `generateContextId`, `storeAnalysisContext` — same as streaming branch.
- **L1407–1411:** `generatePuzzleRecommendations(...)` — note: NOT wrapped in try/catch here; failures propagate to the outer catch (the streaming branch wraps because closing the stream cleanly matters; the non-streaming branch can let the outer 500 handle it).
- **L1413–1425:** `return NextResponse.json({ gameAnalysis: {...} })`. **Exit point #8.**

#### 3.7.7 Outer error handler (lines 1426–1438)

`try` block wraps everything from L1001 to L1425. Catch at L1426:
- `log.error("Enhanced analysis failed", { error, stack })` — **telemetry emission #9.**
- Returns `NextResponse.json({error: "Analysis failed", details: ...}, { status: 500 })`. **Exit point #9.**

Streaming branch's `controller.close()` after the in-stream error already bypassed the outer catch (the SSE response was already returned at L1314 — exceptions inside the stream's `start` are scoped to the stream, not the route handler).

#### 3.7.8 Other helpers + telemetry surfaces

- `buildReinforcements` at L863 — `log.warn("Reinforcement retrieval failed", ...)` — **telemetry emission #10** (called from inside `buildGameContext` → `buildConceptLayer`'s reinforcement path; only fires when reinforcement lookup throws).
- `generatePuzzleRecommendations` at L899 — emits `console.error("Failed to fetch puzzles for mistake at move N", ...)` per failed mistake (NOT through the structured logger). **Telemetry emission #11.**
- **No rate-limit middleware** — the route has no per-IP / per-UID throttling. CLAUDE.md notes rate limiting was deferred to Phase 5 audit work; this is out of Stage B scope.

#### 3.7.9 Identified flag-on insertion points (lines + rationale)

The flag-on wing branches at six places. Each is gated by `if (validatorsEnabled)` from `getMastermindEnv()`. Flag-off path is byte-identical to today.

| # | Line | Insertion | Rationale |
|---|---|---|---|
| **A** | After L1024 (post-`messageText`) | `const { validatorsEnabled } = getMastermindEnv();` | Single env read, no branching cost. Threads through both stream + non-stream paths via a captured const. |
| **B** | After L1122 (final `claudeMessages.push`) | If `validatorsEnabled` and not a cache-hit candidate, run `classifyQuestion({question: messageText, parseCall})` → produces `category`. Threads into RouteContext + downstream citationRate call. | Pre-LLM placement matches §3.6 — classifier output is needed before we know whether to fetch sources, since some sources are category-conditional. (Stage B fetches all four regardless, but the classifier still has to run before pipeline call so RouteContext.category is populated for telemetry.) |
| **C** | After L1186 (cache-hit non-stream return) | No new code on the flag-on cache-hit path per §8 (no cutover). **Open question §3.7.10 (A):** decide whether to still emit a "cached" citation_rate_summary marker. | §8 says cache hits stay unchanged. If we skip telemetry here, Stage C analytics will undercount turns (cache-hit turns disappear from the denominator). Surface for tech-lead decision. |
| **D** | L1193 (streaming branch start, `if (streamRequested) {`) | Wrap entire branch: `if (validatorsEnabled) { /* new buffer-then-restream + pipeline */ } else { /* existing live-stream code */ }`. New branch implements §4 — emits `validating` SSE events during buffer, runs `runValidationPipeline({...dataSources, ...callLLMOpts})`, synthetic re-streams the final pipeline text via `send({type:"text",...})` in paced chunks, emits `done` with `pipeline.{finalOutcome, citationRate, telemetry, retryCount, totalCostUsd}` metadata appended to the existing fields. | §4 streaming gotcha is fully here. Pipeline buffers because retries can replace the response — live-streaming and then retracting is bad UX. |
| **E** | L1324 (non-streaming branch start, `// Call the unified LLM provider`) | Wrap callLLM: `if (validatorsEnabled) { llmResult = await runValidationPipeline({initialRequest: {tier,system,messages,...}, dataSources, ...}); /* extract content from RegenerateResult */ } else { /* existing callLLM */ }`. Tail of the branch (L1354 onward) consumes `analysisContent` the same way. | Non-stream is the easier path — no buffering needed since there's no stream to disrupt. The pipeline handles retries and fallback internally; the route just sees a final RegenerateResult. |
| **F** | Between L1404 and L1407 (after `storeAnalysisContext`, before puzzle recs) | If `validatorsEnabled`: build `RouteContext`, call `computeCitationRate({...})`, then `forwardTelemetry(pipelineResult.telemetry, ctx, {citationRate, userHistoryGameCount})`. Same logic in both streaming (synth-restream done) and non-streaming branches — extract into a small `forwardPipelineTelemetry(pipelineResult, dataSources, classifierResult, ctx)` helper that both branches call. | §13 / T13 ratified: citationRate fires post-pipeline, pre-forwardTelemetry. The route assembles the RouteContext (route, userId from session, sessionId=contextId, responseId, category, finalOutcome, retryCount, totalCostUsd) and hands events + summary to the forwarder. |

**Source fetch placement (the `fetchDataSources(...)` call from 1.C.B.1):** fits between B (classifier) and D/E (LLM/pipeline call). Both stream and non-stream paths need it. Extract a small `prepareMastermindContext(opts, session)` helper that calls classifier + fetchDataSources concurrently (the classifier is one Haiku call, fetchDataSources is the four-source fetch — both are independent of the LLM); reduces total pre-LLM latency. Helper returns `{category, dataSources, classifierMs, fetchMs}` for telemetry.

#### 3.7.10 Open questions surfaced by the audit (tech-lead review)

These weren't in the pre-implementation plan and need resolution before 1.C.B.4 starts:

| # | Question | Default proposal |
|---|---|---|
| **A** | **Cache-hit telemetry on flag-on path (§3.7.4 / §3.7.9 insertion C).** Emit a `citation_rate_summary` event tagged `cached: true` for cache-hit turns? Or skip telemetry entirely? Tradeoff: emitting keeps Stage C analytics turn-count consistent; skipping reduces noise. | **Skip on cache hits.** Cache hits already short-circuit `validateAIResponse`, contextId generation, and puzzle recs — they're already not a "turn" in any other telemetry surface. Stage C sweep should run with cache disabled anyway (the sweep is per-position deterministic; cache would hide real LLM behavior). |
| **B** | **`responseId` source.** §6.1 RouteContext requires `responseId: string`. The route already has `requestId` from `extractRequestId(...)` (header or generated UUID). Use `requestId` directly as `responseId`, or generate a separate per-response UUID? | **Use `requestId` as `responseId`.** One ID per request matches the existing request-correlation pattern; generating two IDs adds confusion. The `sessionId` field can be the `contextId` (which is post-LLM, so threaded back into the RouteContext we build right before forwardTelemetry). |
| **C** | **`opponentUsername` schema field reach.** §3.1 #4 adds it to `enhancedAnalysisSchema`. Should the client UI be updated to populate it from the existing `lichessUsername` / `chesscomUsername` request fields, or stay a pure server-side opt-in field that clients add later? | **Stay opt-in for Stage B.** Adding client-side wiring expands the PR's surface and pulls in UI work. Stage B ships the schema field; whichever client codepath needs opponent_prep validation can populate it incrementally. Anonymous-opponent flows continue to skip scout (graceful degradation per §3.2). |
| **D** | **`userHistoryGameCount` plumbing back to citation_rate_summary.** §3.5 wires the count from `dataSources.userHistory?.games.length`. But `fetchDataSources` returns `userHistory: undefined` when the fetch fails — count is `null` then. Confirm the null case is handled in the route's RouteContext build. | **`userHistoryGameCount: dataSources.userHistory?.games.length ?? null`** — exactly what §3.5 spec'd; surface here just to confirm the route handles the undefined case correctly. |
| **E** | **PGN body availability.** §3.1 #4's PGN-parsing branch needs a full PGN with White/Black headers. Enhanced-analysis carries `moveHistory: string[]` and `username` (the user, not the opponent); not a PGN body. `wireValidators` will fall through to `opts.opponentUsername` (T11 (c) second branch). Confirm: enhanced-analysis flag-on path **never** synthesizes a PGN — opponent identity comes from the new schema field. | **Confirmed.** PGN parsing is useful for `/api/chat` (which may carry a PGN body) but enhanced-analysis route just passes `opponentUsername` to `wireValidators.fetchDataSources`. |
| **F** | **`buildReinforcements` / concept-layer LLM call cost-accounting.** Existing concept-layer fires extra LLM-ish work (concept retrieval). Should `totalCostUsd` in RouteContext include this, or only the pipeline + classifier cost? | **Pipeline + classifier only.** Reinforcement and concept-detection cost lives in their own logging surface; mixing them into RouteContext.totalCostUsd would double-count and muddy the validator-pipeline cost signal. |

All six default-resolve in implementation; tech-lead override surface kept narrow.

---

## 4. The streaming gotcha — buffer-then-restream

[PR_1C_PLAN.md §2.1](PR_1C_PLAN.md) named this as the "streaming gotcha." `runValidationPipeline` buffers because retries replace the response, and streaming attempt 1 then retracting it is bad UX. Stage B implements buffer-then-restream with a `validating` SSE phase event for UI narration during the buffer.

### 4.1 New SSE event types

```typescript
// Existing events (unchanged):
// { type: "text", delta: string }                         — incremental text
// { type: "done", metadata: {...} }                       — terminal
// { type: "error", error: string }                        — terminal-error

// New events for flag-on streaming branch:
type ValidatingPhase = "initial" | "retry-1" | "retry-2" | "fallback";

interface ValidatingEvent {
  type: "validating";
  phase: ValidatingPhase;
  /** Approximate elapsed ms since the request started. */
  elapsedMs: number;
}
```

**Why a typed phase field instead of a free-text message.** Phase 2 UI will render persona-specific or theme-specific copy ("Grounding the analysis…", "Re-checking against the board…", "Composing a safe fallback…") based on the phase enum. Stage B ships the wire format; Phase 2 ships the copy. Decoupling means UI copy iteration doesn't require server changes.

### 4.2 Timing diagram

```
t=0      client POSTs to /api/enhanced-analysis (stream=true)
t=~50ms  route opens SSE, emits `validating` event (phase="initial")
t=~50ms  route awaits runValidationPipeline(…)
         ┌──────────────────────────────────────────────────────────┐
         │ inside pipeline:                                          │
         │   ▸ Sonnet flagship call (1.5–6s typical)                 │
         │   ▸ validate (Haiku parse, ~0.5s)                         │
         │   ▸ if passed → return immediately                        │
         │   ▸ if failed → emit retry signal → repeat (Sonnet again) │
         │   ▸ if maxRetries exhausted → return fallback             │
         └──────────────────────────────────────────────────────────┘
         (during this window, route may emit additional `validating`
          events with phase="retry-1" / "retry-2" / "fallback" — see
          §12 Q2; default behavior is to emit at retry boundaries)
t=~2–8s  pipeline returns; route holds finalResponse buffer
t=~2–8s  route begins synthetic-streaming the finalResponse as `text` events
         (chunked ~64 chars / 30ms = ~3s for an ~800-token response)
t=~5–11s `done` event with metadata
```

**Why the synthetic re-stream.** Without it, flag-on returns the whole response in one chunk and the chat bubble pops in — visually different from flag-off's incremental text. Synthetic re-stream preserves the visual streaming feel; cost is server-side timer/scheduler load (negligible).

### 4.3 Synthetic re-stream pacing

- Chunk size: 64 characters per event (one event ≈ 8–20 words; matches the size of Anthropic's actual streamed chunks).
- Inter-chunk delay: 30ms (33 events/sec — natural reading pace).
- ~800-token response (≈4,000 chars) → ~63 chunks → ~1.9s total stream time.

This is a tradeoff: faster pacing reduces total latency but trips through the "feels too fast / not really streaming" valley. 30ms is a starting point; tune after first preview deploy. Documented in `wireValidators.ts` as a constant `SYNTHETIC_STREAM_CHUNK_MS`.

### 4.4 Cancellation

If the client disconnects mid-stream:
- During pipeline (buffer phase): the request runs to completion server-side (Anthropic call can't be cancelled mid-flight). Telemetry forwards normally.
- During synthetic re-stream: the route detects `controller.desiredSize === null` after each chunk and exits the loop. Pipeline result is still cached (`setCachedResponse`) so a refetch hits the cache.

---

## 5. Timeout budgets + cascade behavior

Per the ratified §12.2 T3 decisions from [MASTERMIND_BUILD_PLAN.md §12.2](MASTERMIND_BUILD_PLAN.md) and [PR_1C_PLAN.md §2.3](PR_1C_PLAN.md): **3s per Haiku parser call, 12s per Sonnet flagship attempt, 30s total pipeline ceiling.**

### 5.1 Per-call timeouts

| Where | Budget | On timeout |
|---|---|---|
| Each Haiku parser call (eval-claim + feature-citation parsers) | 3s | Abort the parser call. Treat as `parser_json_invalid` per `validateEvalClaim` / `validateFeatureDeltaCitations` existing behavior — emit a telemetry event with `fire_reason: "parser_json_invalid"`, return zero claims, validator passes. No retry on parser timeout (the parser's job is best-effort; a missing claim list just means we couldn't audit that response). |
| Each Sonnet flagship attempt (initial + each retry) | 12s | Abort the LLM call. The pipeline treats this as a failed attempt → counts toward `retryCount` → advances to next retry slot or falls back. Cost is recorded as input-only (output truncated). |
| Total pipeline | 30s wall-clock | Return `{ finalResponse: <buffered partial>, finalOutcome: "pipeline_timed_out", … }` — a NEW outcome enum value the pipeline doesn't have today. **See §12 Q4 — this requires either (a) extending `runValidationPipeline`'s return type, which touches PR 1.B sealed code, or (b) a wrapper in `wireValidators.ts` that races the pipeline against a 30s timer and synthesizes a `pipeline_timed_out` shape itself.** Default: option (b), zero PR 1.B changes. |

### 5.2 Cascade behavior

```
Sonnet call (initial)
  ┌─ succeeds (≤12s)
  │   └─ validate (Haiku parse, ≤3s per parser, 2 parsers total)
  │      ├─ all parsers pass → check issues
  │      │  ├─ no issues → return passed_initial
  │      │  └─ issues → retry attempt 1
  │      └─ a parser timed out → treat as parser_json_invalid → skip
  │         that validator's claims → check issues from the other → ...
  └─ timeout (>12s) or 5xx → retry attempt 1

  Retry attempt 1 (≤12s)
    ┌─ succeeds → re-validate
    │   ├─ no issues → return passed_after_retry
    │   └─ issues → retry attempt 2
    └─ timeout → retry attempt 2

  Retry attempt 2 (≤12s)
    ┌─ succeeds → re-validate
    │   ├─ no issues → return passed_after_retry
    │   └─ issues → buildFallback → return fallback_used
    └─ timeout → buildFallback → return fallback_used

  At any point, if total pipeline elapsed > 30s:
    → wireValidators-level race kicks in
    → returns { finalResponse: bestSoFar, finalOutcome: "pipeline_timed_out",
                telemetry: cumulative-so-far, totalCostUsd: cumulative,
                retryCount: <current attempt>, cumulativeIssues: cumulative }
    → emits `pipeline_timed_out` telemetry event with fire_reason
    → route still emits `done` SSE with the partial response
```

**Fail-soft is mandatory.** The user always gets something. Even on pipeline timeout: the buffered partial response (either the initial Sonnet output that was about to be retried, or the most recent retry's output) is returned to the user, with the `done` event's `metadata.pipeline.timedOut = true` flag. Route does not 502 on pipeline timeout.

### 5.3 What 30s p99 implies for production

Current `/api/enhanced-analysis` p99 (flag-off) is ~10s. Adding the pipeline can push p99 over 30s in pathological cases (full retry path with cold caches). The 30s ceiling is the safety net: better to return a slightly-degraded buffered response than to leave the user hanging. The cost is that pathological p99 turns will appear in metrics as `pipeline_timed_out` — useful signal for tuning, not a failure mode in itself.

---

## 6. Telemetry forwarding spec

Pipeline accumulates `result.telemetry` (`TelemetryEvent[]`) and the route emits each event to Sentry via the existing structured-log path.

### 6.1 New module: `src/lib/mastermind/validatorTelemetry.ts`

```typescript
import type { TelemetryEvent, FinalOutcome } from "@/lib/mastermind/validators";

export interface RouteContext {
  route: "/api/enhanced-analysis" | "/api/chat";
  userId?: string;       // from session cookie; undefined on anon
  sessionId?: string;    // analysisContext.contextId or new per-turn ID
  responseId: string;    // generated per-turn (uuid)
  category: QuestionCategory;  // populated by Stage B's classifier wiring (§3.6) — always set
  finalOutcome: FinalOutcome | "pipeline_timed_out" | null;
  retryCount: number;
  totalCostUsd: number;
}

export function forwardTelemetry(
  events: TelemetryEvent[],
  routeContext: RouteContext
): void;
```

### 6.2 Per-event log shape

Per [PR_1B_PLAN.md §3.1](PR_1B_PLAN.md) plus route-level additions:

```jsonc
{
  "module": "mastermind-validator",       // Sentry tag
  "event": "validator_event",             // log channel
  "check_name": "eval_mismatch_qualitative",
  "fire_reason": "qualitative_band_flip",
  "retry_count": 0,
  "final_outcome": null,                  // populated only on terminal events
  "correlation_id": "cm-9k3j2-abc...",    // threads through one turn
  "user_id": "uid-...",                   // route adds from session
  "session_id": "sess-...",               // route adds from context
  "response_id": "resp-...",              // route generates per turn
  "route": "/api/enhanced-analysis",      // route adds
  "category": "opponent_prep",            // always populated post-Stage-B per §3.6 classifier wiring
  "expected": { "band": "slightly_better", "cp": 70 },
  "actual": { "band": "winning", "cp": null },
  "llm_span": "Black is winning",         // ≤200 chars per parser-prompt cap
  "parser_confidence": 0.95,
  "ts_ms": 1715491234567
}
```

### 6.3 Sentry tags + levels

- **Tags applied to every event:** `module=mastermind-validator`, `fire_reason=<value>`, `route=<value>`. Plus `final_outcome=<value>` when the event is terminal (regenerate's passed / regenerate's fallback_used).
- **Level mapping (per-validator `validator_event`):**
  - `fire_reason: "passed"` → Sentry `info`.
  - `fire_reason: "parser_json_invalid"` / `"parser_low_confidence"` → Sentry `info` (parser-level skips are expected, not alerts).
  - `fire_reason: "qualitative_band_flip"` / `"numeric_diff_exceeds_threshold"` / `"unsupported_citation"` / `"regenerate_invoked"` → Sentry `warning`.
  - `fire_reason: "fallback_used"` → Sentry **`error`** (2 retries failed → production-grade signal we want to know about).
- **`citation_rate_summary` event level (per T16 resolution + 2026-05-22 verified-behavior lock):** see §6.3.1 below — fallback discipline applies because the original "trust Sentry retains debug queryable" assumption does not hold in this codebase as configured.

### 6.3.1 Verified logging behavior (2026-05-22) — T16 fallback locked

Pre-1.C.B.2 verification of how this codebase's logger + Sentry actually behave. Findings drive the locked level discipline for `citation_rate_summary` and any other Mastermind-emitted events.

**Three findings:**

1. **Debug filtering happens at the logger gate, before any output.** [`src/lib/logging/logger.ts:66`](../src/lib/logging/logger.ts#L66) returns early when `LEVEL_ORDER[level] < LEVEL_ORDER[LOG_LEVEL]`. Production default is `LOG_LEVEL = (process.env.LOG_LEVEL || (NODE_ENV === "production" ? "info" : "debug"))` — so `log.debug(...)` calls in prod emit **nothing**: not to console, not to Vercel Log Drain, not to Sentry. Setting `LOG_LEVEL=debug` in Vercel env brings debug events to console JSON lines (and thus to Log Drain).
2. **Sentry breadcrumbs are not standalone-queryable.** [`src/lib/logging/sentryIntegration.ts`](../src/lib/logging/sentryIntegration.ts) exposes `addLogBreadcrumb()` (for info/warn/debug breadcrumbs) and `logErrorToSentry()` (for captured exceptions), but the logger's `log()` method does not currently call `addLogBreadcrumb` on its emit path. Even if it did, Sentry breadcrumbs attach to the next captured exception/event — they are not first-class queryable telemetry. The persistent Sentry-side surface is **captured events (errors + messages)** + their breadcrumb trail, not the breadcrumbs themselves.
3. **Console JSON lines flow to Vercel Log Drain in production.** Info/warn/error JSON-line output (`console.log` / `console.warn` / `console.error`) is captured by Vercel's logging pipeline and forwarded to any configured drain (Datadog / Axiom / etc.). This is the durable per-event channel. Sentry is reserved for errors + alert signals; routine telemetry lives in Log Drain.

**Implication for T16:** the original 2026-05-18 phrasing ("Sentry retains debug queryable, just not surfaced in default views") does not hold. T16's fallback posture is now the locked posture, not a contingency.

**Locked `citation_rate_summary` level discipline:**

| Trigger | Channels |
|---|---|
| **Routine** (no noteworthy flags hit) | `logger.debug(...)` always (visible in Vercel Log Drain when `LOG_LEVEL=debug` is set in the env — recommended for Vercel Preview, optional for Prod). **PLUS** `logger.info(...)` sampled 1-in-100 (`Math.random() < 0.01`) for Sentry/info trend visibility regardless of `LOG_LEVEL`. |
| **Noteworthy** — any of: category produced a below-floor citation rate (see floor table below); `final_outcome=fallback_used`; `retry_count > 0`; any validator's `check_name` fired more than once in the turn's telemetry array | `logger.info(...)` always — no sampling. |

**Below-floor thresholds (per §11.3 floors):**

| Category | Primary source | Floor | In-Stage-B check? |
|---|---|---|---|
| opponent_prep | scout | 85% | Yes |
| improvement_strategy | user_history | 50% | Yes |
| meta_motivational | user_history | 20% | Yes |
| game_review | feature_delta | 90% | Skipped (perSource bucket null — feature_delta opportunity counter not shipped per `cleanup_followups.md`) |
| position_analysis | feature_delta | 70% | Skipped (same reason) |
| concept_explanation | none (PR 1.D) | n/a | Skipped (primary source null) |

**Minimum-opportunities gate:** to avoid noisy per-turn floor fires (a single-opportunity turn with 0 citations always reads 0% — meaningless signal), the floor check requires `bucket.opportunities >= 3`. Below that, the floor criterion does not fire even if the rate is technically below. Hand-tuned threshold; Stage C sweep can refine if false-noteworthy rate is too high or genuine misses are missed.

**Event-volume implications at 50k MAU, ~250k turns/month:**
- Routine events: 100% emit at `debug` (visible in Log Drain when `LOG_LEVEL=debug`); 1% (~2.5k/month) emit at `info` (Sentry-visible).
- Noteworthy events: estimated 5-15% of turns based on retry + fallback rates — Stage C sweep will refine the actual rate. All visible at `info` in Sentry.
- Total Sentry/info volume: ~12-40k/month — within budget.

**Stage C sweep harness implication:** the sweep reads `citation_rate_summary` events from **Vercel Log Drain JSON lines** (where `LOG_LEVEL=debug` exposes all routine events plus noteworthy), not from Sentry. If Stage C currently assumes Sentry as the source, the harness needs a Log Drain reader. Surface to 1.C.B.4 / 1.C.B.5 route-handler discussion and to PR_1C_PLAN.md §5 (Stage C scope).

**Production env requirement:** the §7 feature-flag setup gains a recommended `LOG_LEVEL=debug` in Vercel Preview env (where Stage B traffic lives until promotion). Vercel Production keeps default `LOG_LEVEL=info`; revisit during the §7.4 promotion to prod if the routine debug stream is needed there.

### 6.4 Alert posture

- Sentry alert on `final_outcome=fallback_used` rate exceeding **1% of preview turns over a rolling 24h window**. This is the "the LLM kept failing to correct itself" signal — actionable for prompt iteration.
- No alert on `pipeline_timed_out` in Stage B; surface as a metric instead (see §11). Low p99 hits are expected; aggregate behavior matters more than per-incident.

### 6.5 PII discipline

- `llm_span` is truncated to 200 chars upstream (in `validateEvalClaim` / `validateFeatureDeltaCitations`). Route does not re-process.
- Route does **not** log the user's input messages. Only the LLM's response excerpt (via `llm_span`).
- `correlation_id` is opaque; safe to log.
- `user_id` is logged in cleartext (UID, not email). This is consistent with the existing Sentry posture across other routes.

### 6.6 ISEF dataset extraction

Same query shape as [PR_1C_PLAN.md §3.3](PR_1C_PLAN.md). Route's additions to the schema (`response_id`, `category`) are forward-compatible — the ISEF query pattern already accommodates missing tags as nulls.

---

## 7. Feature flag spec

### 7.1 Name

`MASTERMIND_VALIDATORS_ENABLED` — boolean env var. **Distinct from any future `MASTERMIND_ORCHESTRATOR_ENABLED`** (Phase 2). Two flags, two rollout knobs, per [MASTERMIND_BUILD_PLAN.md §12.2 T9](MASTERMIND_BUILD_PLAN.md).

### 7.2 Schema (extension to `src/env.ts`)

Two options for how the flag is read:

**Option A (preferred — matches `AUTH_ENFORCED` pattern):** function-based reader, no top-level const, easy to test.

```typescript
// src/env.ts (new addition; existing schema unchanged)
export function getMastermindEnv() {
  return {
    validatorsEnabled: process.env.MASTERMIND_VALIDATORS_ENABLED === "true",
  };
}
```

**Option B (Zod schema extension):** adds `MASTERMIND_VALIDATORS_ENABLED` to `envSchema` as `z.coerce.boolean().default(false)`. Tighter type but breaks the function-reader pattern.

Default: Option A. Matches the existing `getAuthEnv` style; doesn't bloat the required-env schema for a flag.

### 7.3 Posture at PR 1.C merge

Per [PR_1C_PLAN.md §4.2](PR_1C_PLAN.md) (Aayan 2026-05-11):

| Environment | Setting at PR 1.C merge |
|---|---|
| Vercel Production (chessmasti.com) | `MASTERMIND_VALIDATORS_ENABLED` unset (default false) — production traffic gets unchanged flag-off behavior |
| Vercel Preview (*.vercel.app) | `MASTERMIND_VALIDATORS_ENABLED=true` — preview traffic exercises the new path |

### 7.4 Promotion criteria (preview → prod)

Document these in the PR 1.C description; the actual flip is a follow-up ops PR after PR 1.C merges. All five must hold:

1. PR 1.C merged to main.
2. Synthetic-tester sweep on the preview branch shows all five gate metrics passing (per [PR_1C_PLAN.md §5.3.4](PR_1C_PLAN.md)).
3. The gate has caught at least one **real** regression in a subsequent PR's CI run (honor-system "real" — a regression introduced unintentionally and caught before merge).
4. No `final_outcome=fallback_used` events exceeding 1% of preview turns over a rolling 7-day window.
5. p95 turn latency in preview ≤ 1.5× p95 turn latency in prod.

### 7.5 Cutover from footnote-append (no cutover — Option A coexistence)

Per [PR_1C_PLAN.md §2.4](PR_1C_PLAN.md) decision (ratified 2026-05-17): **Option A**. Footnote-append stays live alongside the pipeline when the flag is on. Pipeline catches feature-delta + eval-mismatch errors; `validateAIResponse` catches piece-on-square + illegal-move + nonexistent-square errors. Defense-in-depth. The flag flip never removes `validateAIResponse`; the future "remove footnote-append" decision is a separate follow-up after PR 1.C has been in prod stably for 30+ days (out of Stage B scope; see §13 Out of scope).

### 7.6 Fail-mode if env unset

- Default: `validatorsEnabled = false` (treated as flag-off).
- No `503 service unavailable` on missing var. The pipeline is **never required**.
- This is intentional: the flag-off path is the production path until promotion. A missing env var should not break production.

---

## 8. Footnote-append coexistence

Per [PR_1C_PLAN.md §2.4](PR_1C_PLAN.md) Option A. This section spec's the lifecycle position + telemetry distinction.

### 8.1 Lifecycle position when flag is on

```
runValidationPipeline returns finalResponse, finalOutcome, retryCount, …
  ↓
forwardTelemetry(result.telemetry, routeContext)   ← pipeline-class events
  ↓
validateAIResponse(finalResponse, validationFen, moveHistory)
  ↓
if (validation.issues.length > 0) {
  log.warn("AI response validation issues", { ...issueCount, score, issues })
       ← footnote-class events (existing log call, unchanged)
}
analysisContent = validation.isValid ? finalResponse : validation.correctedResponse
```

`validateAIResponse` runs on the pipeline's `finalResponse` — i.e., the response that has already been audited and (possibly) regenerated against pipeline validators. The chess.js-level check is the last line of defense for piece-on-square / illegal-move / nonexistent-square errors that PR 1.B's validators don't cover.

### 8.2 Telemetry distinction

**Pipeline-class events** route through `forwardTelemetry` with `module=mastermind-validator`. Sentry tag `module=mastermind-validator` distinguishes them.

**Footnote-class events** route through the existing `log.warn("AI response validation issues", …)` call at [route.ts:1253-1258](../src/app/api/enhanced-analysis/route.ts#L1253-L1258). These do NOT pass through `forwardTelemetry`. The Sentry tag remains the existing log's tag (`module` is not set; it appears as the route's default tag).

ISEF / Sentry query distinguishing them:
- Pipeline events: filter `module = "mastermind-validator"`.
- Footnote events: filter `message LIKE "AI response validation issues"` (or by Sentry breadcrumb).

Two distinct populations; analyses don't conflate them. If Stage C sweep shows both classes firing on the same response, that's expected (defense-in-depth). If one class dominates with the other rarely firing, that's signal — write up in the post-Stage-C report.

### 8.3 When `validation.correctedResponse` is the rendered text

The route's existing logic (L1260 / L1379) returns `validation.correctedResponse` when `!validation.isValid`. Under flag-on, this means: pipeline produces `finalResponse` → `validateAIResponse` flags piece-on-square issues → footnote-append rewrites → rewritten text is what the user sees.

Important: the pipeline's telemetry was emitted **against the un-footnoted finalResponse**. The footnote layer's annotations are a final post-process. Telemetry never references the rewritten text — it references the pipeline's `finalResponse` which was the input to footnote-append.

---

## 9. File scope + LOC estimates (revised post-Stage-A seal)

Stage B file changes. **Route files explicitly called out** since they touch live traffic.

### 9.1 New library files

| File | LOC est | Notes |
|---|---|---|
| `src/lib/mastermind/wireValidators.ts` | ~320 | The helper (§3). Now wires four real sources (FD + role diff + Scout + user history) with independent failure tolerance + Promise.allSettled parallel fetch. Plus the categoryClassifier wiring + post-pipeline citationRate computation. |
| `src/lib/mastermind/validatorTelemetry.ts` | ~140 | The forwarder (§6). Includes `category` in every event (not "null until classifier wires in" — classifier is wired). New `citation_rate_summary` event type for per-turn citationRate result. |
| `src/lib/mastermind/__tests__/wireValidators.test.ts` | ~420 | Unit tests for the four-source fetch + partial-data graceful handling matrix (§3.2 — six failure permutations) + categoryClassifier wiring. |
| `src/lib/mastermind/__tests__/validatorTelemetry.test.ts` | ~180 | Sentry tag schema + PII discipline + `citation_rate_summary` event shape. |
| `src/lib/mastermind/__tests__/route-integration/enhanced-analysis.test.ts` | ~320 | Integration tests for `/api/enhanced-analysis` flag-on. Mock all four data-source paths (FD primitives + scout fetch + Firestore Admin) + LLM + parser; assertion on SSE event sequence, telemetry shape, citation-rate metadata in `done`. |
| `src/lib/mastermind/__tests__/route-integration/chat.test.ts` | ~220 | Same shape for `/api/chat`. Chat-specific: no Scout, user-history kept. |

**Library total:** ~1,600 LOC (~460 lib + ~1,140 test). The ~20-25% Stage A overage pattern likely applies — realistic landing 1,900-2,000 LOC.

### 9.2 Modified files (route — live traffic surface)

| File | Approximate diff | Notes |
|---|---|---|
| `src/app/api/enhanced-analysis/route.ts` | ~+230 / −0 LOC (additions only — flag-off path stays unchanged) | Flag branch + classifier call + wireValidators fetch + pipeline call + citationRate + telemetry + synthetic-stream. Streaming + non-streaming branches both gain a flag-on wing. New imports of `runValidationPipeline`, `wireValidators.fetchDataSources`, `forwardTelemetry`, `classifyQuestion`, `computeCitationRate`. |
| `src/app/api/chat/route.ts` | ~+110 / −0 LOC | Fast-path flag branch only. Same shape but smaller (no scout, smaller pipeline). |
| `src/env.ts` | ~+6 LOC | `getMastermindEnv()` reader function. |

**Route total:** ~+346 LOC. All additive; existing lines unchanged (the flag-off path must not regress).

### 9.3 No other files modified

- PR 1.A primitives (sealed): no edits.
- PR 1.B validators + Stage A.6–A.9 validators (sealed): no edits.
- Stage A.1 categoryClassifier (sealed): no edits — Stage B IMPORTS the shipped classifier; doesn't modify it.
- Stage A.2/A.2.5 dry-run harness (sealed): no edits.
- `aiResponseValidator.ts` (out of scope per don't-touch list): no edits.

### 9.4 LOC totals (Stage B revised)

- New library: ~1,600 LOC (~460 lib + ~1,140 test)
- Route modifications: ~+346 LOC
- **Stage B total: ~1,946 LOC additions**, 0 deletions

Up from the pre-Stage-A-seal estimate of ~1,386 because:
- `wireValidators.ts` grows from forward-compat null slots (~180) to four real source fetches (~320) — +140 LOC.
- `validatorTelemetry.ts` grows for `citation_rate_summary` events + populated `category` field — +20 LOC.
- Test files grow because the partial-data matrix is now real (six failure permutations vs the original "future scout fails" placeholder) — +200 LOC.
- Route files grow for the classifier call + citationRate post-step — +70 LOC.

Realistic landing accounting for the consistent Stage A overage pattern: ~2,300-2,500 LOC. Variance acceptable; documented in commits per the Stage A discipline.

---

## 10. Tests

Stage B introduces route-level integration testing — first time the existing PR 1.A/1.B test infrastructure leaves library scope.

### 10.1 Unit tests — `wireValidators.test.ts`

| Case | What it asserts |
|---|---|
| FD computed cleanly | featureDelta is the expected shape; isEmptyDelta correct |
| FD throws on invalid FEN | helper rethrows; route handles by skipping pipeline |
| Role diff computed cleanly | pieceRoleDiff matches expected shape |
| Role diff throws on invalid FEN | helper returns `[]` and logs warning |
| Chat degraded mode | fenBefore === fenAfter → empty delta returned |
| Forward-compat null slots | scout/userHistory/jhamtani all null (today) |
| (future) Scout fails, others ok | placeholder test; documents the contract for when Scout wires in |

### 10.2 Unit tests — `validatorTelemetry.test.ts`

| Case | What it asserts |
|---|---|
| Each fire_reason maps to correct Sentry level | passed=info, parser_*=info, fire_*=warn, fallback_used=error |
| Route context fields are present on every emitted event | route, user_id, session_id, response_id |
| llm_span truncated to ≤200 chars | inbound 1000-char span → outbound 200-char |
| User input messages never logged | mock event with user message → assert message not in log payload |
| Sentry tags applied | module=mastermind-validator, fire_reason=<value>, route=<value> |
| final_outcome tag present only on terminal events | non-terminal events have no final_outcome tag |

### 10.3 Integration tests — `enhanced-analysis.test.ts`

Tests run against a mocked Next.js request/response, mocked LLM (`callLLM` and `callLLMStream`), mocked Haiku parser (returns pre-configured JSON per fixture). **No live API hits.**

| Case | What it asserts |
|---|---|
| Flag off, streaming branch | Identical to today's path; no `validating` events; `done` event has no `pipeline` metadata |
| Flag off, non-streaming branch | Identical to today's path |
| Flag on, streaming, response passes pipeline initial | `validating` event with phase="initial" emitted; synthetic-streamed text events; `done` event has `pipeline.finalOutcome=passed_initial` |
| Flag on, streaming, response fails then retry passes | `validating` event with phase="initial", phase="retry-1" emitted (per §12 Q2 default); telemetry includes both attempts; `pipeline.finalOutcome=passed_after_retry` |
| Flag on, streaming, all retries fail → fallback | `validating` events fire through to phase="fallback"; `pipeline.finalOutcome=fallback_used`; Sentry error-level event emitted |
| Flag on, pipeline times out at 30s | route still emits `done` with metadata.pipeline.timedOut=true; user gets a response, not a 502 |
| Flag on, response passes pipeline but fails footnote-append | analysisContent === validation.correctedResponse; both telemetry classes fire (pipeline=passed, footnote=warn) |
| Flag on, request lacks auth | 401 from `requireSession`; no pipeline runs |
| Flag on, FD fails on invalid FEN | falls back to flag-off path for the turn (logged) |

#### 10.3.1 Pre-implementation test design (added 2026-05-22 alongside §3.7 audit)

**Path:** `src/app/api/enhanced-analysis/__tests__/route.test.ts`. Convention matches the existing `src/lib/*/__tests__/` pattern. Route handler is invoked directly via `import { POST } from "../route"` — not via supertest / Next.js test client; mocking `NextRequest` is simpler and faster.

**Mock surface (full enumeration so 1.C.B.4 can build the harness as commit-1 prep):**

| Module | What it provides | Mock strategy |
|---|---|---|
| `@/lib/llmProvider` (`callLLM`, `callLLMStream`) | Flagship + Haiku LLM call | `vi.mock` with `callLLM` returning canned `{content, inputTokens, outputTokens, ...}`; `callLLMStream` returning an async iterator over canned `{type:"text", delta}` chunks + a final `{type:"done", result}`. Per-test override sets which content/tokens/error to emit. |
| `@/lib/mastermind/validators` (`runValidationPipeline`) | The pipeline orchestrator (parser → cross-check → retry → fallback) | **Two strategies depending on case:** flag-off tests don't mock (pipeline never invoked). Flag-on happy-path / retry / fallback tests mock with canned `RegenerateResult` matching the expected `finalOutcome`. Per-source-failure tests mock `fetchDataSources` (see below) and let the real pipeline run against the resulting partial dataSources — exercises §3.2 contract end-to-end. |
| `@/lib/mastermind/wireValidators` (`fetchDataSources`) | Four-source fetch helper (1.C.B.1) | `vi.mock` with canned `FetchedDataSources`. Per-test sets which sources are present / absent / throwing. Used in source-failure-matrix tests. |
| `@/lib/server/scoutFetch` (`fetchOpponentGames`) | Server-side scout fetcher (1.C.B.0) | Mocked transitively via `wireValidators` mock; direct mock not needed unless a test wants to assert specific cache-key behavior at the route level. |
| `@/lib/server/firebaseAdmin` (`getAdminFirestore`) | Firestore admin client (userHistory source + coachingPrefs fetch) | `vi.mock` returning chained `.collection().doc().collection().orderBy().limit().get()` mock (same pattern as `wireValidators.test.ts`). |
| `@/lib/server/users` (`getUserById`) | Coaching-prefs lookup at L1061 | `vi.mock` returning a canned `StoredUser` or `null`. |
| `@/lib/auth/session` (`requireSession`) | Auth boundary at L998 | `vi.mock` with `{session: {uid: 'test-uid'}}` happy-path; `{response: NextResponse.json(..., {status:401})}` for the unauth case. |
| `@/lib/mastermind/categorization/categoryClassifier` (`classifyQuestion`) | Pre-LLM Haiku classifier (§3.6) | `vi.mock` returning canned `{category: "opponent_prep", confidence: 0.9}`. Confidence-below-threshold case uses `{category: "meta_motivational", confidence: 0.3}` (the low-confidence default). |
| `@/lib/mastermind/validatorTelemetry` (`forwardTelemetry`) | Logger emit path (1.C.B.2) | **NOT mocked.** Real implementation runs; tests instead `vi.mock("@/lib/logging")` (the underlying logger). Lets tests assert per-event level routing end-to-end. |
| `@/lib/responseCache` (`getCachedResponse`, `setCachedResponse`) | Response cache (L1124-1186) | `vi.mock` returning `null` (cache miss) by default; per-test override to return canned string for cache-hit test. |
| `@/lib/analysisContextCache` (`generateContextId`, `storeAnalysisContext`) | Post-LLM context store (consumed by /api/chat) | `vi.mock` with passthrough `generateContextId` returning a stable test ID; `storeAnalysisContext` as `vi.fn()` for call-tracking. |
| `@/lib/aiResponseValidator` (`validateAIResponse`) | Footnote-append path (L1252, L1368) | `vi.mock` returning canned `{isValid, score, issues, correctedResponse}`. Tests can flip `isValid` to exercise the footnote-correction interaction with the new pipeline. |

**Fixture shapes:**

- **Request bodies** live at `src/app/api/enhanced-analysis/__tests__/fixtures/requests/*.json`. Three shapes:
  - `game-review.json` — full `moveHistory` + `gameEval` + `playerColor` + skill-level fields → drives `game_review` category.
  - `opponent-prep.json` — adds `opponentUsername: "TestOpp"` and `userMessage: "tell me about my opponent's tendencies"` → drives `opponent_prep` category.
  - `improvement-strategy.json` — `userMessage: "how do I improve my blitz?"` + `userRating: 1450` → drives `improvement_strategy` category.
- **Canned LLM responses** at `src/app/api/enhanced-analysis/__tests__/fixtures/llm-responses/*.txt` — plain text files with realistic coach analyses, sized to ~1-2k chars. Includes one "good" response per category and one "bad" response per category (the bad ones trigger an `unsupported_citation` fire on retry; the second-call canned response is the corrected version).
- **Canned pipeline outcomes** as inline TS const objects in the test file (not separate files — they're 5-10 lines each and easier to grep alongside the assertion).
- **Canned Firestore games** for userHistory tests — array of 3-5 `UserHistoryGame` objects with varied time controls and openings.
- **Canned ScoutAnalytics** for scout tests — minimal `ScoutAnalytics` matching the validator's expected shape.

**Test cases (extends the §10.3 table above with the implementation-detail layer):**

| Case | Mock setup | Assertion |
|---|---|---|
| Flag off, non-stream | `getMastermindEnv` returns `{validatorsEnabled: false}`; `callLLM` canned | Response is byte-identical to today; no `validating` events; no `pipeline` metadata; `forwardTelemetry` NOT called |
| Flag off, stream | Same as above with `streamRequested: true` | SSE stream emits `text` + `done`; no `validating` or `pipeline.*` |
| Flag on, non-stream, happy path | Flag on; classifier→opponent_prep; fetchDataSources returns all four; pipeline returns `passed_initial` | `pipeline.finalOutcome === "passed_initial"`; `pipeline.citationRate` present; logger.info called for validator events + 1-in-100 sampled citation_rate_summary (depending on `vi.spyOn(Math, "random")`) |
| Flag on, stream, happy path | Same flag-on stack + `streamRequested: true` | SSE sequence: `validating` (phase=initial) → `text` deltas (synthetic re-stream) → `done` with `pipeline.*` metadata |
| Flag on, stream, response passes initial | Mock `runValidationPipeline` returning `{passed: true, finalOutcome: "passed_initial", text, telemetry: [...]}` | Pipeline telemetry events flow through forwardTelemetry; citation_rate_summary present; debug-level for routine, info for noteworthy (per §6.3.1) |
| Flag on, stream, retry path | Mock pipeline returning `{finalOutcome: "passed_after_retry", retryCount: 1, ...}` | Noteworthy citation_rate_summary fires at info (retryCount > 0); `validating` event with `phase: "retry-1"` |
| Flag on, stream, fallback | Mock pipeline returning `{finalOutcome: "fallback_used", retryCount: 2, ...}` | Sentry error-level event for `fallback_used`; noteworthy citation_rate_summary at info; fallback text in `done.metadata.analysis` |
| Flag on, pipeline timeout (30s default) | Mock `runValidationPipeline` rejecting with timeout error | Route catches; `done` SSE emitted with `metadata.pipeline.timedOut: true`; user gets a response, not a 502 |
| Flag on, FD throws (invalid FEN) | `fetchDataSources` rejects | Route falls back to flag-off path for this turn (per §3.2); `log.warn` emitted; no pipeline runs |
| Flag on, scout fetch fails | `fetchDataSources` returns `{...others, scout: undefined}`; pipeline runs | scout validator skipped (per §3.2); citation_rate_summary's perSource.scout is null; pipeline still passes |
| Flag on, userHistory fetch fails | `fetchDataSources` returns `{...others, userHistory: undefined}` | user_history validator skipped; perSource.user_history is null |
| Flag on, opponent_prep + scout 80% (below 85% floor, ≥3 opps) | Canned citationRate with `perSource.scout: {citations: 4, opportunities: 5, ratePct: 80}` + `category: opponent_prep` | Noteworthy citation_rate_summary at info (below-floor trigger) |
| Flag on, footnote-append fails post-pipeline | Pipeline passes; `validateAIResponse` returns `{isValid: false, correctedResponse: "..."}` | `analysisContent === validation.correctedResponse`; both telemetry surfaces fire (pipeline at info, validator-issues at warn) |
| Flag on, cache hit | `getCachedResponse` returns canned string | Per §3.7.10 (A) default: NO citation_rate_summary emitted; cache-hit path unchanged from today |
| Flag on, request lacks auth | `requireSession` returns `{response: 401}` | 401 returned; no pipeline runs; no telemetry emitted |
| Flag on, request schema rejects `opponentUsername` regex | Mock body with `opponentUsername: "bad chars!"` | 400 from validateRequest; no pipeline runs |

**Integration with the Stage A.2 dry-run harness:** **Independent.** Stage A.2's [`scripts/mastermind/validator-gate-dryrun.ts`](../scripts/mastermind/validator-gate-dryrun.ts) is a fixture-driven tsx script that runs PR 1.B validators directly against curated fixture tuples — no route, no Next.js, no LLM mock. The route integration tests live under `vitest` and exercise the route's wire-up. **No shared fixtures.** The dry-run harness's `gate-dryrun.json` is in the validator's input shape (parsed claims + fake LLM responses); the route tests use the request-body shape. Future cross-pollination is possible (e.g., feeding the dry-run harness's "known-bad" LLM responses into the route test's canned-LLM responses) but adds coupling we don't need yet. **Recommend keeping them independent unless Stage C surfaces a coverage gap.**

### 10.4 Integration tests — `chat.test.ts`

Same shape, smaller. Key cases:

| Case | What it asserts |
|---|---|
| Flag off, with contextId | Identical to today's fast path |
| Flag off, no contextId | Identical to today's fallback path |
| Flag on, with contextId, response passes | pipeline runs, `pipeline.finalOutcome=passed_initial` in response metadata |
| Flag on, with contextId, response fails then retry passes | maxRetries=1 (chat-specific); pipeline tries once, succeeds on retry |
| Flag on, no contextId | Pipeline does NOT run; fallback path unchanged (§12 Q3 default) |

### 10.5 Mock fixture setup

Test fixtures live at `src/lib/mastermind/__tests__/route-integration/fixtures/`. Per-test fixtures specify:
- `requestBody`: JSON shape matching the route's expected schema
- `mockLLMResponses`: array of responses (initial + each retry)
- `mockParserOutputs`: per-call evalParserOutput / citationParserOutput
- `expectedSSEEvents`: ordered list of expected events (type + selected fields)
- `expectedTelemetryEventCount`: total emitted to Sentry
- `expectedFinalAnalysis`: assertion target

This pattern mirrors `scripts/mastermind/fixtures/gate-dryrun.json` so fixture authors have one consistent mental model.

### 10.6 No live API hits

- No `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` required to run the test suite.
- No Firestore reads — `firestore-admin` mocked at the test boundary.
- No SSE consumption — tests use Next.js's `NextRequest`/`NextResponse` mocks and read SSE bodies as strings.
- No browser dependencies — pure node.

---

## 11. Verification and merge gate

### 11.1 Pre-commit (per file, per commit)

- `npx tsc --noEmit` clean on branch-tracked content (the existing untracked landing-v2.tsx orphan stays as-is — pre-existing, surfaced multiple times, Aayan's call when to clean up).
- `npm run test` 100% green on the full suite (180 existing + ~95 new).
- Stage A.2/A.2.5 dry-run harness still passes:
  - `npx tsx scripts/mastermind/validator-gate-dryrun.ts` → exit 0
  - `npx tsx scripts/mastermind/validator-gate-dryrun.ts --override-tolerance=2000` → exit 1
- Diff to route files reviewed by tech-lead before push (any change touching live-traffic surface).

### 11.2 Stage C — full synthetic-tester sweep

Runs against a Vercel preview deploy with `MASTERMIND_VALIDATORS_ENABLED=true`. Per [PR_1C_PLAN.md §5](PR_1C_PLAN.md): 50-turn sweep (10 master-game PGNs × 5 personas).

**Locally:** `tsx scripts/synthetic-tester/run.ts --target=<preview-url> --concurrency=2`. Outputs:
- Per-turn telemetry, latency, cost in `audit/findings/agent-c-eval/sweep-<date>.json`
- Aggregate summary in `audit/findings/agent-c-eval/sweep-<date>-summary.md`

**In CI:** the sweep is too slow + too costly for every PR (~50 turns × ~$0.03 = ~$1.50/sweep, plus 30+ minutes wall-clock). Not in default CI. Run **on demand** before merging Stage B → main and before any future PR that touches the pipeline or validator surface. Aayan's call on whether to add a "ci-sweep" workflow with a manual trigger button (open question §12 Q6).

**Telemetry-read dependency (added 2026-05-22 per §6.3.1 verified-behavior lock):** the sweep reads `citation_rate_summary` events from **Vercel Log Drain JSON lines**, not from Sentry — debug-level events are dropped at the logger gate before reaching Sentry per §6.3.1 finding 1, and Sentry breadcrumbs are not standalone-queryable per finding 2. **Ops prerequisite:** Vercel Preview env must have `LOG_LEVEL=debug` set before the sweep runs, or routine citation_rate_summary events are dropped and the sweep sees only the noteworthy + 1-in-100 sampled subset. This env setting lands as part of the preview-env setup that turns on `MASTERMIND_VALIDATORS_ENABLED=true`, not as a separate ops step.

**Fixture-design requirement (added 2026-05-22 per §3.7.10 Question C resolution):** Stage C sweep fixtures **must include `opponentUsername` explicitly** for any opponent_prep test case. The flag-on `/api/enhanced-analysis` route doesn't auto-populate `opponentUsername` from existing `chesscomUsername`/`lichessUsername` fields (Stage B keeps it opt-in to bound the PR); if sweep fixtures omit it, scout fetch is skipped and Scout citation perSource is null, underrepresenting what scout validation can actually catch on opponent_prep. Sweep authors: when designing opponent_prep fixtures, set `opponentUsername` to a real public chess.com / lichess handle (or a deterministic stub the harness mocks).

### 11.3 Merge gate (Stage B → main = PR 1.C merge)

All of:

1. PR 1.C commits A.1 through A.9 (Stage A sealed) + B.1 through B.N (Stage B) all on branch.
2. TSC clean, tests green.
3. Dry-run harness exits 0 on default config, exits 1 on `--override-tolerance=2000`.
4. **Stage C synthetic-tester sweep run on preview deploy, all five gate metrics passing per [PR_1C_PLAN.md §5.3.4](PR_1C_PLAN.md):**
   - **Hallucination rate ≥95% per category** across all six categories. All four validators active (PR 1.B's two + scout + user-history).
   - **Citation rate ≥ floor per category** per [PR_1C_PLAN.md §5.3.2](PR_1C_PLAN.md): opponent_prep 85% (scout source), improvement_strategy 50% (user_history), meta_motivational 20% (user_history). game_review (90%) and position_analysis (70%) report `null` perSource bucket per [PR_1C_PLAN.md §11.7](PR_1C_PLAN.md) feature_delta opportunity counter gap — Stage C treats null as "not measured" + pass-by-default. concept_explanation marked "deferred to PR 1.D" per [PR_1C_PLAN.md §6.4](PR_1C_PLAN.md).
   - Chess correctness 0 violations.
   - Persona fidelity ≥7/10 per persona, mean ≥7.5.
   - Cost per turn ≤$0.035 flagship, ≤$0.005 fast.
5. **Per-claim-type firing-rate aggregation in the sweep summary** (Aayan's Stage A.6 follow-up). Surface ≥3-never-fire claim types as merge-candidates for review. **Surface to Aayan, don't auto-merge.**
6. PR description includes: by-category breakdown of metrics, total cost, sweep duration, per-claim-type firing-rate breakdown, comparison against baseline (main with flag off).
7. No Sentry tier-1 alerts in the 24h preview window after Stage B lands.

**Promotion to prod (separate ops PR, not part of Stage B merge):** the five §7.4 promotion criteria fire later — preview-only stays until the gate catches a real regression, 7-day clean window, p95 latency ≤ 1.5× prod baseline.

---

## 12. Open design questions

### 12.1 Aayan reviews — Q1-Q7 RATIFIED (carried forward from pre-Stage-A round)

| # | Question | Resolution |
|---|---|---|
| **Q1** | Stage A scope decision (§0). | **RESOLVED 2026-05-18 — Stage A reopened and shipped.** All four outstanding Stage A items (`scoutCitation`, `userHistoryAggregates`, `userHistoryCitation`, `runValidationPipeline.dataSources` extension) shipped in commits A.6 through A.9. Stage B as planned wires all four validators. The pre-Stage-A "tighter scope" default no longer applies. |
| **Q2** | Per-retry `validating` SSE events (§4) — every boundary or initial only? | **Ratified: emit on every boundary.** Phase 2 UI can decide whether to render or suppress later events per persona; the wire format ships forward-compatible either way. |
| **Q3** | `/api/chat` no-`contextId` fallback — skip the pipeline or attempt a degraded run? | **Ratified: skip on no-context chat.** Eval-mismatch coverage on plain chat isn't worth the latency cost without a FEN. |
| **Q4** | Telemetry field set for ISEF analyzability — ship as specced or add `prompt_version` / `model_id` / `route_request_id`? | **Ratified: ship as specified.** `prompt_version` already in `coach.tokens` log; `model_id` implicit in tier+date; `route_request_id` overlaps with `correlation_id`. |
| **Q5** | CategoryClassifier wiring posture in Stage B. | **Ratified: wire in Stage B (revised — the wait condition has now fired).** Q5's original "wait until scout + user-history validators land" rationale is now satisfied — both shipped in Stage A.6/A.8. Stage B wires the classifier; `category` populates telemetry + citation-rate input. ~$0.001/turn extra cost acceptable. |
| **Q6** | Partial-data degraded UX — surface to user or silently degrade? | **Ratified: silently degrade.** UI surface for degraded mode is a Phase 2 orchestrator concern. |
| **Q7** | CI sweep workflow — manual-trigger GitHub Action or local-only? | **Ratified: local-only for Stage B.** Add CI sweep after Stage B has been in prod stably for 30+ days. |

### 12.2 Tech-lead reviews — T1-T10 RATIFIED (carried forward)

| # | Question | Resolution |
|---|---|---|
| **T1** | Pipeline-timeout option — Promise.race wrapper (b) vs return-type extension (a). | **Ratified: option (b) — Promise.race wrapper in `wireValidators.ts`.** Even though Stage A.9 confirmed touching PR 1.B's sealed surface is acceptable (per [§7.1 scope correction](PR_1C_PLAN.md)), the wrapper is simpler than extending `RegenerateResult` with a new outcome enum. PR 1.B + Stage A.9 surface stays untouched by the timeout concern. |
| **T2** | Streaming pacing constants (64 chars / 30ms) — ship-and-tune. | **Ratified: ship the values; tune post-deploy.** |
| **T3** | `maxRetries: 1` for chat vs 2 for enhanced-analysis. | **Ratified: cap chat at 1.** |
| **T4** | Telemetry routing — existing Sentry pipeline vs dedicated sink. | **Ratified: existing pipeline; `module=mastermind-validator` tag filter.** |
| **T5** | Flag reader pattern — function-based (a) vs Zod (b). | **Ratified: option (a) — `getMastermindEnv()` function-based.** |
| **T6** | Route integration tests — JSON fixtures vs inline-TS. | **Ratified: JSON fixtures.** Zod-validate at load time. |
| **T7** | Per-route opt-out shape — design now or add later. | **Ratified: no opt-out in Stage B.** Add when the first opt-out request lands. |
| **T8** | Per-request opt-out (`validate=false` param). | **Ratified: skip.** Flag is the only knob. |
| **T9** | Route allowlist — `/api/enhanced-analysis` + `/api/chat` only. | **Ratified.** Other routes untouched. |
| **T10** | Auth boundary unchanged on flag-on path. | **Ratified.** Flag changes post-auth lifecycle; boundary unchanged. |

### 12.3 Tech-lead reviews — T11–T16 RESOLVED (post-Stage-A planning round, 2026-05-22)

These weren't in the pre-Stage-A draft because the four-validator wiring surface didn't exist. Resolved 2026-05-22 — four ratifications, two overrides, one extension. All decisions captured in commit `1.C.B.0.5` (the decision-capture commit) ahead of `1.C.B.1` code starting.

| # | Question | Resolution |
|---|---|---|
| **T11** | **Opponent identity for Scout fetch (§3.1).** `/api/enhanced-analysis` doesn't currently carry an `opponentUsername` field. Options: (a) PGN parsing only; (b) explicit request field only; (c) both. | **OVERRIDE to Option (c).** Try PGN parse first; fall back to optional `opponentUsername?: string` field on `/api/enhanced-analysis` request body; skip Scout if neither resolves. Reason: PGN-only would silently kill Scout citation on "tell me about player X" queries that lack a PGN, and opponent_prep is the highest-differentiation category — failing it silently is the wrong default. Schema addition is non-breaking. `/api/chat` doesn't take the fallback (no chat opponent context). Behavior captured in §3.1 #4. |
| **T12** | **Firestore games query bound (§3.1 #5).** 200 most-recent? More? Less? | **RATIFIED at 200 most-recent + telemetry extension.** Covers ~1 year of typical play for active users; sufficient for `aggregateWinRateByTimeControl` (≥10 games/class) and `aggregateScoreByOpening` (≥5 games/opening) thresholds. **Plus:** emit `userHistoryGameCount` field in `citation_rate_summary` capturing the actual count returned from Firestore. If users routinely hit the 200 ceiling we'll know to revisit upward; if they never approach it we're undersized. Captured in §3.5. |
| **T13** | **Where citationRate fires in the route lifecycle (§3.5).** Post-pipeline pre-`validateAIResponse`? Post-telemetry? | **RATIFIED — post-pipeline, pre-forwardTelemetry.** Citation rate rides the telemetry sink as a final `citation_rate_summary` event; sequence preserves per-validator events that precede it. |
| **T14** | **Scout cache strategy.** Trust existing 10-min cache? Add wireValidators-side caching? | **RATIFIED via Option β cache extraction (commit `1.C.B.0`, 2026-05-22).** Cache + Lichess/Chess.com fetchers moved out of `/api/scout/route.ts` into `src/lib/server/scoutFetch.ts` (`fetchOpponentGames` is the shared entry point). Both `/api/scout` HTTP callers and `wireValidators.ts` internal callers consume the same module-scoped cache by reference — no double-buffering. Verified by unit test (`scoutFetch.test.ts` covers cache-hit, tuple-isolation, casing-normalization, payload-shape, error-path). Captured in §3.1 #4. |
| **T15** | **`UserHistoryGame` import path coupling.** Type lives at `userHistoryAggregates.ts`; couples `wireValidators.ts` to that file. Acceptable? | **RATIFIED — type stays at `userHistoryAggregates.ts`.** Centralizing into a separate types module is premature cleanup; the `cleanup_followups.md` `TimeControlClass` entry is the prototype for "consolidate when a real need surfaces." |
| **T16** | **`citation_rate_summary` Sentry event level.** `info` every turn or `debug` for volume? | **OVERRIDE — debug routine + 1-in-100 sampled info + always-info on noteworthy.** Initial 2026-05-18 framing assumed Sentry retains debug events queryable. 2026-05-22 verification of `src/lib/logging/logger.ts` + `sentryIntegration.ts` showed debug events are filtered at the logger gate (production default `LOG_LEVEL=info` drops them) and Sentry breadcrumbs are not standalone-queryable. **Fallback posture is now the locked posture.** Routine `citation_rate_summary` emits at `logger.debug` (visible in Vercel Log Drain when `LOG_LEVEL=debug` is set) plus 1-in-100 sampled at `logger.info` for Sentry trend visibility. Noteworthy turns (below-floor per §11.3, `fallback_used`, `retry_count > 0`, any check_name fired >1×, with `opportunities >= 3` gate on the floor check) emit at `logger.info` always. Full discipline captured in §6.3.1. |

All six are now decision-frozen for Stage B implementation. Any further override surfaces as a deviation in the relevant commit message.

---

## 13. Out of scope for Stage B (revised post-Stage-A seal)

Surfaced so the boundaries are explicit:

- **`feature_delta` opportunity counter.** Deferred per [PR_1C_PLAN.md §11.7](PR_1C_PLAN.md) + [`cleanup_followups.md`](cleanup_followups.md). game_review and position_analysis categories' citation rates report null perSource bucket; Stage C treats null as "not measured" + pass-by-default. Hallucination ceiling still applies.
- **Removing footnote-append.** Coexistence is intentional (§8). Removal is a separate decision after 30+ days of prod stability post-PR-1.C promotion.
- **Per-user feature-flag overrides** (beta cohort gets it on prod ahead of promotion). Skip in Stage B; use environment-level rollout criteria.
- **`/api/puzzle-stats`** (PR 1.E precursor). Aayan-triggered, separate workstream. Restoring the three deferred user-history claim types (rating_trajectory, puzzle_stats_claim, puzzle_rating_trajectory) lives in PR 1.E.
- **Jhamtani wire-up.** PR 1.D, Aayan-triggered, separate workstream. `dataSources.jhamtani` slot reserved in PR 1.B-extended signature but consumed by no validator yet.
- **Cross-source claim coordinator** (PR 1.F). Conditional on Stage C sweep showing ≥5% composite-claim rate; Aayan-triggered.
- **Validation on puzzle / Maia / scout / other routes** (§12 T9).
- **Per-route opt-out, per-request opt-out** (§12 T7/T8).
- **Cross-platform user identity reconciliation** (Lichess vs Chess.com aliases). Deferred to post-PR-1.E per `cleanup_followups.md` C4 entry. Stage B uses single-name substring match per Stage A.7's `detectUserColor`.
- **Move-prefix opening-claim validation.** Deferred per `cleanup_followups.md` C2/T3. Coach claims like "1.e4 e5 lines" route to qualitative_commentary; the validator doesn't try to resolve move-prefix to ECO.

**Items now IN scope** (moved from out-of-scope vs pre-Stage-A draft):

- Wiring `categoryClassifier` — Q5 resolved (wait condition fired); classifier wires in Stage B.
- Scout + user-history data sources in `wireValidators.ts` — Stage A.6/A.8 validators shipped; sources now real (not null).
- `runValidationPipeline.dataSources` extension — already shipped in Stage A.9. Stage B consumes; doesn't extend.

---

## 14. Pause for review (revised post-Stage-A seal, post-T11–T16 resolution)

**Tech-lead review of §3 + §12.3 completed 2026-05-22.** §12.1 (Q1–Q7) and §12.2 (T1–T10) were ratified in the pre-Stage-A round; §12.3 (T11–T16) ratifications + overrides captured above.

Stage B code is unblocked. Revised commit order (one prep commit + one decision-capture commit prepended to the original five):

| # | Commit | Surface |
|---|---|---|
| `1.C.B.0` | Extract scout fetchers + cache into `src/lib/server/scoutFetch.ts`; thin `/api/scout/route.ts` to a wrapper | **Prep (server lib)** — required by Option β cache-path resolution for T14. Landed 2026-05-22 at commit `c353eba`. |
| `1.C.B.0.5` | Plan: §12.3 T11–T16 resolutions + §3.1 #4 / §3.5 / §6.3 implementation surface updates | **Plan (decision capture)** — no code change, ratifies the resolved questions and aligns the spec. |
| `1.C.B.1` | `wireValidators.ts` + tests | Library — the four-source fetch helper + categoryClassifier wiring + citationRate post-step + partial-data failure matrix |
| `1.C.B.2` | `validatorTelemetry.ts` + tests | Library — forwardTelemetry, RouteContext, citation_rate_summary event |
| `1.C.B.3` | `getMastermindEnv()` in `src/env.ts` + flag plumbing | Single small env addition |
| `1.C.B.4` | `/api/enhanced-analysis/route.ts` flag-on wing + integration test | **Route file (live traffic surface)** — Aayan review required |
| `1.C.B.5` | `/api/chat/route.ts` flag-on wing + integration test | **Route file (live traffic surface)** — Aayan review required |

After Stage B's final commit (1.C.B.5), the next step is the **Stage C synthetic-tester sweep against preview deploy with `MASTERMIND_VALIDATORS_ENABLED=true`**. Sweep output includes per-claim-type firing-rate aggregation per Aayan's Stage A.6 follow-up — flags ≥3-never-fire claim types as merge candidates for review.

After Stage C passes all five gate metrics per §11.3, PR 1.C merges to main.

**Reminder:** PR 1.C merge to main **does not flip `MASTERMIND_VALIDATORS_ENABLED` in production.** The flag stays preview-only until the §7.4 promotion criteria fire (gate caught real regression in CI, 7-day clean preview window, p95 latency ≤ 1.5× prod baseline). Promotion happens later as a separate ops PR.
