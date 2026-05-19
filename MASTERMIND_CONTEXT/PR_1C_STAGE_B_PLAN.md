# PR 1.C Stage B — route wiring plan

**⚠️ PAUSED 2026-05-18 — pending Stage A completion.**

Aayan reopened Stage A on 2026-05-18. The tighter Stage B scope defaulted in §12 Q1 was rejected. The four outstanding Stage A items — `scoutCitation`, `userHistoryAggregates`, `userHistoryCitation`, and the `runValidationPipeline.dataSources` extension — must ship before Stage B begins. Rationale: wiring routes with only feature-delta + role-diff coverage means the Stage C sweep measures opponent_prep and improvement_strategy categories against validators that don't exist; the metrics return meaningless numbers; Stage B would be paid for twice. Also, Scout citation and user-history citation are the higher-differentiation validators — the part of the architecture nobody else has. Shipping Stage B without them ships the commodity half of the validation layer first.

**Decisions captured for Stage B resumption** (do NOT relitigate when Stage B resumes):

- **Aayan Q2–Q7** all defaults accepted: per-retry SSE on every boundary; chat skips pipeline on no-contextId; telemetry field set ships as specced; categoryClassifier wiring waits until scout/user-history validators land; partial-data UX silently degrades; local-only sweeps in Stage B, CI sweep after 30 days of stability.
- **Tech-lead T1–T10** all defaults accepted: Option (b) `Promise.race` wrapper for 30s pipeline timeout (no PR 1.B touch); ship and tune synthetic-stream pacing; chat `maxRetries: 1`; existing Sentry sink with `module=mastermind-validator` tag filter; function-based env reader matching `getAuthEnv`; JSON fixtures matching the dry-run harness style; no per-route opt-out until the first request lands; no per-request opt-out; route allowlist confirmed `/api/enhanced-analysis` + `/api/chat`; auth posture unchanged.

These captured decisions ride forward unchanged into the resumed Stage B plan once Stage A seals.

**Stage A resumption tracked in** [PR_1C_SCOUT_CITATION_PLAN.md](PR_1C_SCOUT_CITATION_PLAN.md) (scoutCitation first; subsequent plan addenda for `userHistoryAggregates`, `userHistoryCitation`, and the pipeline extension follow as those workstreams advance). Stage A scope-correction documented in [PR_1C_PLAN.md §7 addendum](PR_1C_PLAN.md).

---

**Branch:** `mastermind/stage-3-validators` (continues the existing PR 1.C branch — Stage A.1, Stage A.2, Stage A.2.5 already on it).

**Status:** plan-first. Drafted 2026-05-18 per the Stage A.2.5 brief. **No code yet** — review-then-iterate-then-build, per [feedback_mastermind_plan_first.md](../../memory/feedback_mastermind_plan_first.md). **Plan is paused per banner above; revise to reflect post-Stage-A reality when Stage B resumes.**

**Scope:** route wiring per [PR_1C_PLAN.md §2](PR_1C_PLAN.md). Wires `runValidationPipeline` into `/api/enhanced-analysis` and `/api/chat` behind `MASTERMIND_VALIDATORS_ENABLED`, plumbs telemetry forwarding through the existing Sentry path, preserves footnote-append (Option A coexistence per [PR_1C_PLAN.md §2.4](PR_1C_PLAN.md)).

**Stage A is sealed** as of 2026-05-18 with commits `cc8bd81` (categoryClassifier) + `120653b`/`587043a`/`84a5118` (dry-run harness + override demo + extended fixtures). Stage C (full synthetic-tester sweep against preview deploy) gates merge to main.

---

## 0. Scope reconciliation against the original PR_1C_PLAN §7 commit sequence

[PR_1C_PLAN.md §7](PR_1C_PLAN.md) listed Stage A as a nine-commit sequence: classifier (1.C.A.1), `scoutCitation` (1.C.A.2), `userHistoryAggregates` helpers (1.C.A.3), `userHistoryCitation` (1.C.A.4), `citationRate` helper + `runValidationPipeline.dataSources` extension (1.C.A.5), persona-data scraper (1.C.A.6), persona-script rewrite (1.C.A.7), dry-run harness (1.C.A.8), gate sensitivity demo (1.C.A.9). **What actually shipped under "Stage A sealed":**

| Original plan commit | Shipped? | Reality |
|---|---|---|
| 1.C.A.1 categoryClassifier | ✅ | `cc8bd81` |
| 1.C.A.1 boundary iteration (Aayan spot-check) | ✅ | `495a416` |
| 1.C.A.2 `scoutCitation` (20 patterns) | ❌ | not in tree |
| 1.C.A.3 `userHistoryAggregates` helpers | ❌ | not in tree |
| 1.C.A.4 `userHistoryCitation` (3 derivable types) | ❌ | not in tree |
| 1.C.A.5 `citationRate` helper + `runValidationPipeline.dataSources` extension | ❌ | not in tree |
| 1.C.A.6 persona-data scraper + COMPLIANCE.md | ❌ | not in tree |
| 1.C.A.7 persona-script rewrite (Aayan spot-check) | ❌ | not in tree |
| 1.C.A.8 dry-run gate harness | ✅ | `120653b` (renumbered 1.C.A.1 in Stage A.2 work) |
| 1.C.A.9 gate sensitivity demo | ✅ | `587043a` |
| Stage A.2.5 fixture expansion | ✅ | `84a5118` |

**Consequence for Stage B planning.** The original PR_1C_PLAN.md §2.5.2 spec assumed Stage B's `wireValidators.ts` would thread four data sources (feature delta + scout + user history + jhamtani slot reserved) into `runValidationPipeline`. **Three of those data sources require validators that have not yet been built** (`scoutCitation`, `userHistoryCitation`, `userHistoryAggregates`) **and an extension of `runValidationPipeline` to accept the `dataSources` arg** — and that extension touches PR 1.B's sealed `src/lib/mastermind/validators/index.ts`.

**This plan defaults to a tighter Stage B scope** consistent with what's actually in tree:

- Stage B wires `runValidationPipeline` with **feature delta + piece-role diff only** — the two data sources PR 1.B already consumes via `validateEvalClaim` + `validateFeatureDeltaCitations`. No extension to `runValidationPipeline`'s signature.
- `wireValidators.ts` is designed with a **forward-compatible shape** — its return type carries optional `scout`, `userHistory`, and `jhamtani` slots that are set to `null` today and populated when the corresponding validators ship in a follow-up commit (Stage A continuation or a separate PR).
- The "four data sources" language from the Stage B brief is read as the **eventual** helper shape, not Stage B's first-merge scope.

**Open for Aayan (§12, Q1) before code starts:** approve the tighter Stage B scope (feature delta + role diff today; scout/user-history wiring lands later, with a separate decision about whether extending `runValidationPipeline` violates the "PR 1.B sealed" rule); OR reopen Stage A first and ship 1.C.A.2–A.5 before Stage B starts. **Don't start Stage B code until this is resolved** — the helper signature and the route diff both depend on the answer.

The rest of this plan is written assuming the tighter scope. If the broader scope wins on review, §3, §6, §9, and §11 are revised in the second draft.

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

## 3. `wireValidators.ts` helper module spec

The route doesn't call `validateEvalClaim` or `validateFeatureDeltaCitations` directly. Both are owned by `runValidationPipeline`. The route's responsibility is **fetching the data sources** the pipeline consumes, then handing them to the pipeline. That's what `wireValidators.ts` does.

### 3.1 File: `src/lib/mastermind/wireValidators.ts`

```typescript
import type {
  PositionFeatureDelta,
} from "@/lib/mastermind/featureDelta";
import type { RoleChange } from "@/lib/mastermind/pieceRoles";
import type { ThreatNode } from "@/lib/mastermind/threatTree";

export interface ValidatorDataSources {
  featureDelta: PositionFeatureDelta;
  pieceRoleDiff: RoleChange[];
  threatTree?: ThreatNode[];
  // Forward-compatible slots — null today; populated when the corresponding
  // Stage A continuation commits ship (scoutCitation + userHistoryCitation
  // + userHistoryAggregates + citationRate + runValidationPipeline.dataSources
  // extension). See §0 scope reconciliation.
  scout: null;
  userHistory: null;
  jhamtani: null;
}

export interface FetchOpts {
  /** Position before the move (or the current position for chat). */
  fenBefore: string;
  /** Position after the move (or same as fenBefore for chat). */
  fenAfter: string;
  /** Optional resolution-point FEN — caller supplies if known. */
  fenAtResolution?: string;
  /** PV from Stockfish, used by find_resolution_point if no resolution FEN given. */
  pv?: string[];
  /** Optional move history (for chat path / chat context). */
  moveHistory?: string[];
  /** For telemetry context. */
  playerPerspective: "white" | "black";
  /** For telemetry context. */
  correlationId: string;
}

export async function fetchDataSources(
  opts: FetchOpts
): Promise<ValidatorDataSources>;
```

**Behavior:**

1. **`featureDelta` (required, never null).** Calls `compute_feature_delta(fenBefore, fenAfter, { fenAtResolution, pv })` from PR 1.A. Pure CPU, deterministic. Should never fail under valid FEN input. If the chat path supplies `fenBefore === fenAfter` (no move), produces an empty delta — the validator gracefully no-ops on empty deltas.
2. **`pieceRoleDiff` (required, never null — but may be empty array).** Calls `classifyPieceRoles(fenBefore)` and `classifyPieceRoles(fenAfter)`, computes the diff. Wrapped in try/catch; on failure returns `[]` (empty — validator just won't fire role-gained/role-lost). Logs the failure to Sentry as a warning.
3. **`threatTree` (optional, omitted if not yet computed).** Not currently computed in the route; PR 1.A primitive exists but no per-move loop calls it. Stage B leaves this `undefined` and lets `runValidationPipeline` handle the optional input.
4. **`scout`, `userHistory`, `jhamtani` (all null today).** Reserved slots. When the corresponding Stage A continuation commits ship, these are populated by per-source fetchers that follow the same try/catch + null-on-failure pattern. **Hard requirement from the brief:** one source's failure must not block the others. Today this is trivial since three of four are always null; the contract becomes load-bearing when Scout + user-history fetches go live (each could fail independently — Firestore subcollection read could 5xx, scoutService could timeout against chess.com).

### 3.2 Partial-data handling contract

Today (FD + role diff only):
- FD fails → fatal. The route should not proceed (the entire pipeline is FD-grounded). The helper rethrows; route handles by skipping the pipeline path entirely for this turn (fall back to flag-off behavior for the turn, logged as a warning).
- Role diff fails → graceful. Helper returns `[]`. Validator just doesn't fire role-gained/role-lost checks for this turn.

Future (when Scout/user-history wire in):
- Scout fails → graceful. `scout: null` is the same as `scout: <empty analytics>` from the pipeline's perspective; `scoutCitation` validator skips the source entirely and contributes zero opportunities + zero issues.
- User history fails → same shape. `userHistory: null` → no `userHistoryCitation` fires.
- Jhamtani — remains null until PR 1.D ships per [PR_1C_PLAN.md §6.4](PR_1C_PLAN.md). Not in Stage B's scope.

### 3.3 Bounded concurrency

When all four sources go live, `fetchDataSources` will run them in parallel with `Promise.allSettled` and a per-source timeout (default 2s, configurable). Today (FD + role diff only) it's sequential — both are pure CPU and complete in <100ms.

### 3.4 Chat-path degraded mode

The chat route has no per-move context. To still pipe runValidationPipeline through, the helper supplies a **degraded feature delta**: `featureDelta = compute_feature_delta(context.fen, context.fen)` (fenBefore === fenAfter), which produces an empty delta (`isEmptyDelta: true`). The pipeline runs normally; validators see no deltas and just don't fire feature-citation checks. Eval-mismatch checks still apply against the chat response — that's the main value of running the pipeline on chat.

**Open question §12 Q3:** is chat's value-add from running the pipeline (i.e., catching eval-mismatch claims in follow-up responses) worth the latency cost (~3–6s vs today's ~1.5s)? Default: yes; revisit after first Stage C sweep.

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
  userTier: "free";      // populated as "free" today; "paid" hook for Phase 5.E
  category?: string;     // populated when categoryClassifier is wired in
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
  "user_tier": "free",                    // route adds
  "category": null,                       // null until categoryClassifier wires in
  "expected": { "band": "slightly_better", "cp": 70 },
  "actual": { "band": "winning", "cp": null },
  "llm_span": "Black is winning",         // ≤200 chars per parser-prompt cap
  "parser_confidence": 0.95,
  "ts_ms": 1715491234567
}
```

### 6.3 Sentry tags + levels

- **Tags applied to every event:** `module=mastermind-validator`, `fire_reason=<value>`, `route=<value>`. Plus `final_outcome=<value>` when the event is terminal (regenerate's passed / regenerate's fallback_used).
- **Level mapping:**
  - `fire_reason: "passed"` → Sentry `info`.
  - `fire_reason: "parser_json_invalid"` / `"parser_low_confidence"` → Sentry `info` (parser-level skips are expected, not alerts).
  - `fire_reason: "qualitative_band_flip"` / `"numeric_diff_exceeds_threshold"` / `"unsupported_citation"` / `"regenerate_invoked"` → Sentry `warning`.
  - `fire_reason: "fallback_used"` → Sentry **`error`** (2 retries failed → production-grade signal we want to know about).

### 6.4 Alert posture

- Sentry alert on `final_outcome=fallback_used` rate exceeding **1% of preview turns over a rolling 24h window**. This is the "the LLM kept failing to correct itself" signal — actionable for prompt iteration.
- No alert on `pipeline_timed_out` in Stage B; surface as a metric instead (see §11). Low p99 hits are expected; aggregate behavior matters more than per-incident.

### 6.5 PII discipline

- `llm_span` is truncated to 200 chars upstream (in `validateEvalClaim` / `validateFeatureDeltaCitations`). Route does not re-process.
- Route does **not** log the user's input messages. Only the LLM's response excerpt (via `llm_span`).
- `correlation_id` is opaque; safe to log.
- `user_id` is logged in cleartext (UID, not email). This is consistent with the existing Sentry posture across other routes.

### 6.6 ISEF dataset extraction

Same query shape as [PR_1C_PLAN.md §3.3](PR_1C_PLAN.md). Route's additions to the schema (`response_id`, `category`, `user_tier`) are forward-compatible — the ISEF query pattern already accommodates missing tags as nulls.

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

## 9. File scope + LOC estimates

Stage B file changes. **Route files explicitly called out** since they touch live traffic.

### 9.1 New library files (Stage B introduces)

| File | LOC est | Notes |
|---|---|---|
| `src/lib/mastermind/wireValidators.ts` | ~180 | The helper (§3). Forward-compat shape — feature delta + role diff today; null slots for scout/userHistory/jhamtani. |
| `src/lib/mastermind/validatorTelemetry.ts` | ~120 | The forwarder (§6). Reads `result.telemetry`, adds route context, calls existing structured logger. |
| `src/lib/mastermind/__tests__/wireValidators.test.ts` | ~220 | Unit tests for the helper, mocked dependencies. Tests partial-data graceful handling. |
| `src/lib/mastermind/__tests__/validatorTelemetry.test.ts` | ~160 | Unit tests for the forwarder, mocked logger sink. Covers level mapping + PII discipline + tag schema. |
| `src/lib/mastermind/__tests__/route-integration/enhanced-analysis.test.ts` | ~250 | Integration tests for `/api/enhanced-analysis` flag-on (§10). Mock LLM + mock parser + assertion on SSE event sequence + assertion on telemetry shape. |
| `src/lib/mastermind/__tests__/route-integration/chat.test.ts` | ~180 | Integration tests for `/api/chat` flag-on. Same shape, smaller. |

**Library total:** ~1,110 LOC (lib + tests).

### 9.2 Modified files (route — live traffic surface)

| File | Approximate diff | Notes |
|---|---|---|
| `src/app/api/enhanced-analysis/route.ts` | ~+180 / −0 LOC (additions only — flag-off path stays unchanged) | The flag branch + pipeline wiring (§1.2). Streaming + non-streaming branches both gain a flag-on wing. Imports of `runValidationPipeline`, `wireValidators.fetchDataSources`, `forwardTelemetry` added. |
| `src/app/api/chat/route.ts` | ~+90 / −0 LOC | The fast-path flag branch (§2.2). Fallback path unchanged. |
| `src/env.ts` | ~+6 LOC | New `getMastermindEnv()` reader function. |

**Route total:** ~+276 LOC. All additive; existing lines unchanged (the flag-off path must not regress).

### 9.3 No other files modified

- PR 1.A primitives (sealed): no edits.
- PR 1.B validators (sealed): no edits — including no extension of `runValidationPipeline.dataSources` (§0).
- Stage A.1 categoryClassifier (sealed): no edits — and Stage B does NOT yet wire the classifier in (open question §12 Q5; defaults to "wire in a future commit").
- Stage A.2/A.2.5 dry-run harness (sealed): no edits.
- `aiResponseValidator.ts` (out of scope per don't-touch list): no edits.

### 9.4 LOC totals (Stage B)

- New library: ~1,110 LOC (300 lib + ~810 test)
- Route modifications: ~+276 LOC
- **Stage B total:** ~1,386 LOC additions, 0 deletions

Smaller than the ~2,800/~1,630 PR_1C_PLAN.md §2.5.4 estimate because three Stage A validators (`scoutCitation`, `userHistoryCitation`, `userHistoryAggregates`, `citationRate`) aren't in scope per §0.

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
| Route context fields are present on every emitted event | route, user_id, session_id, response_id, user_tier |
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

### 11.3 Merge gate (Stage B → main = PR 1.C merge)

All of:

1. PR 1.C commits A.1, A.2, A.2.5, B.1-Bn all on branch.
2. TSC clean, tests green.
3. Dry-run harness exits 0 on default config, exits 1 on `--override-tolerance=2000`.
4. **Stage C synthetic-tester sweep run on preview deploy, all five gate metrics passing per [PR_1C_PLAN.md §5.3.4](PR_1C_PLAN.md):**
   - Hallucination rate ≥95% per active category (note: only `featureDeltaCitation` + `evalClaim` active in Stage B; the per-category hallucination metric for scout/user-history categories is N/A until the corresponding validators ship — see §0)
   - Citation rate ≥ floor per active category (also limited to feature-delta-source categories)
   - Chess correctness 0 violations
   - Persona fidelity ≥7/10 per persona, mean ≥7.5
   - Cost per turn ≤$0.035 flagship, ≤$0.005 fast
5. PR description includes: by-category breakdown of metrics, total cost, sweep duration, comparison against baseline (main with flag off).
6. No Sentry tier-1 alerts in the 24h preview window after Stage B lands.

**Promotion to prod (separate ops PR, not part of Stage B merge):** the five §7.4 promotion criteria fire later.

---

## 12. Open design questions, by reviewer

### 12.1 Aayan reviews (chess + coaching + UX judgment)

| # | Question | Default if no input |
|---|---|---|
| **Q1** | **Stage A scope decision (§0).** Approve tighter Stage B scope (feature delta + role diff today; scout/user-history wiring lands in a later commit alongside the unbuilt Stage A validators and a `runValidationPipeline.dataSources` extension)? Or reopen Stage A first and ship 1.C.A.2–A.5 before Stage B code starts? | Proceed with tighter scope — Stage B ships with the validators already in tree; Scout/user-history wire in a separate follow-up commit. |
| **Q2** | **Per-retry `validating` SSE events (§4).** Emit one `validating` event per retry boundary (phase="retry-1", "retry-2", "fallback") so UI can narrate "checking again…"? Or emit only the initial `validating` event and stay silent on retries? Tradeoff: more events = more transparency, but pipeline that retries 0 times shouldn't suddenly look noisy. | Emit on every boundary. Phase 2 UI can decide whether to render or suppress later events per persona; the wire format ships forward-compatible either way. |
| **Q3** | **`/api/chat` no-context fallback path (§2.2).** Skip the pipeline on chat requests that don't have a `contextId` (no FEN, no delta)? Or attempt a degraded pipeline run anyway, just for eval-mismatch coverage? | Skip the pipeline on no-context chat. Eval-mismatch coverage on plain chat isn't worth the latency cost without a FEN to validate against. |
| **Q4** | **Telemetry field choices that affect ISEF analyzability.** Per §6.2 the per-event schema includes `response_id`, `user_tier`, and a `category` slot that's null until classifier wires in. Is the schema complete enough to support the ISEF correlation analyses, or are there fields you want now to avoid backfilling later? Specifically: do we want `prompt_version`, `model_id`, `route_request_id` in the schema today? | Ship as specified. `prompt_version` is already in the existing `coach.tokens` log line; can be joined out-of-band. `model_id` is implicit in tier+date; skip. `route_request_id` overlaps with `correlation_id`; skip. |
| **Q5** | **CategoryClassifier wiring posture in Stage B.** Stage A.1 ships the classifier but Stage B doesn't yet call it. Wire it in Stage B (one extra Haiku call per turn before the pipeline, attaches `category` to telemetry)? Or wait until the per-category citation validators ship, which is when the category actually matters for the gate? | Wait. Calling the classifier without using its output for routing or gating adds Haiku cost ($0.001/turn) for no behavior change. Wire it in the same commit that ships `scoutCitation` + `userHistoryCitation` (the validators that read category). |
| **Q6** | **Partial-data degraded-response UX.** When Scout/user-history sources fail (future-state, post-Q1 resolution), the validators just don't fire for those sources. Does the user need any UI indication ("Limited opponent data — based on engine + position only") or is the response self-contained enough that we silently degrade? | Silently degrade. The response is built from whatever sources resolved; the user has no expectation about which sources were live. UI surface for degraded mode is a Phase 2 concern (when the orchestrator presents structured citations per source). |
| **Q7** | **CI sweep workflow.** Add a "ci-sweep" GitHub Action with a manual trigger button that runs the synthetic-tester against the preview URL for any PR touching the validator surface? Or keep sweep as a local-only Aayan-runs-before-merge step? | Local-only for Stage B. Add CI sweep after Stage B has been in prod stably for 30+ days and the sweep is a routine pre-merge check, not a one-off. |

### 12.2 Tech-lead reviews (architecture + scope)

| # | Question | Default if no input |
|---|---|---|
| **T1** | **Pipeline-timeout option (§5.1).** Wrap `runValidationPipeline` in a 30s race inside `wireValidators.ts` (option b) rather than extending the pipeline's return type to carry a `pipeline_timed_out` outcome (option a — touches PR 1.B sealed surface). Acceptable? | Option (b) ships. PR 1.B stays sealed. Wrapper synthesizes the `pipeline_timed_out` shape from `Promise.race`. |
| **T2** | **Streaming branch buffer-then-restream.** Synthetic re-stream pacing (§4.3): chunk size 64 chars, inter-chunk 30 ms. Tune values? Or ship and tune post-deploy? | Ship the values; tune post-deploy. Both are tunable constants in `wireValidators.ts`. |
| **T3** | **`maxRetries: 1` for chat vs 2 for enhanced-analysis (§2.2).** Chat is fast-tier (Haiku 4.5) with tight budget. Acceptable to cap chat retries at 1? Or align both at 2? | Cap chat at 1. Chat's quality-vs-latency tradeoff weights latency more — users expect fast follow-up. Two Haiku retries on a chat turn is 6-9s of LLM time. |
| **T4** | **Telemetry routing through existing Sentry pipeline vs. dedicated sink.** §6 uses the existing structured logger that already forwards to Sentry. Acceptable, or do we want a dedicated `mastermind-validator` Sentry project / breadcrumb category? | Existing pipeline. One sink, one query path. The `module=mastermind-validator` tag is the filter. |
| **T5** | **Flag reader pattern (§7.2 Option A vs B).** Function-based reader (Option A, matches `getAuthEnv`) vs Zod schema extension (Option B). | Option A. Easier to test, no required-env coupling. |
| **T6** | **Route integration tests — fixture format.** §10.5 uses JSON fixtures mirroring the dry-run harness style. Acceptable, or do we want inline-TS fixtures for stricter typing? | JSON. Consistency with the dry-run harness wins over slightly looser typing. Zod-validate fixtures at load time. |
| **T7** | **Per-route opt-out.** A future route might want to bypass validators (e.g. a hypothetical `/api/quick-tip` route where Haiku is fine without grounding). Default: no opt-out mechanism in Stage B. Acceptable? Or design the opt-out shape now? | No opt-out in Stage B. Add when first opt-out request lands. |
| **T8** | **Per-request opt-out.** Add a `validate=false` request param so clients can skip validation per-call (e.g. for performance-sensitive callsites)? Default: no per-request opt-out — flag is the only knob. Acceptable? | No per-request opt-out. Surfacing it now invites premature use; revisit only if a specific case warrants. |
| **T9** | **Running validation on puzzle / Maia / other routes.** Out of scope for PR 1.C per the brief. Confirm the route allowlist for Stage B is only `/api/enhanced-analysis` and `/api/chat`? | Confirmed. Other routes (puzzles, Maia, scout, etc.) untouched in Stage B. Future PR if/when desired. |
| **T10** | **Auth-required for the flag-on path.** Both routes already `requireSession()`. Confirm the flag-on path inherits the same auth requirement (no anonymous access bypasses validation)? | Confirmed. The flag changes the post-auth lifecycle; the auth boundary is unchanged. |

---

## 13. Out of scope for Stage B

Surfaced so the boundaries are explicit:

- **Removing footnote-append.** Coexistence is intentional (§8). Removal is a separate decision after 30+ days of prod stability post-PR-1.C promotion.
- **Wiring `categoryClassifier`.** Stage A ships the classifier, but Stage B doesn't call it (§12 Q5). Wired in the commit that introduces `scoutCitation` + `userHistoryCitation`.
- **Adding scout / user-history data sources to `wireValidators.ts` actually returning data.** Slots are reserved (§3.1) but null. They wire in when the corresponding validators ship.
- **Extending `runValidationPipeline`'s signature** to accept `dataSources: { scout?, userHistory?, jhamtani? }`. Touches PR 1.B sealed surface. Separate scope decision (§12 Q1).
- **Per-user feature-flag overrides** (beta cohort gets it on prod ahead of promotion). Skip in Stage B; revisit if a paid-tier launch lands before promotion criteria fire.
- **Footnote-append removal / replacement.** See above.
- **`/api/puzzle-stats`** (PR 1.E precursor). Aayan-triggered, separate workstream.
- **Jhamtani wire-up.** PR 1.D, Aayan-triggered, separate workstream.
- **Cross-source claim coordinator** (PR 1.F). Conditional on Stage C sweep showing ≥5% composite-claim rate; Aayan-triggered.
- **Validation on puzzle / Maia / scout / other routes** (§12 T9).
- **Per-route opt-out, per-request opt-out** (§12 T7/T8).

---

## 14. Pause for review

This plan is the brief for Stage B code. **Don't start Stage B code until both reviewer threads sign off — Aayan on §12.1 (chess/coaching/UX), tech-lead on §12.2 (architecture/scope).** The §0 scope reconciliation (Q1) is the load-bearing gate — every downstream section depends on its resolution.

Specifically pending:

- **Aayan (Q1):** approve tighter Stage B scope (feature delta + role diff today) OR reopen Stage A to ship 1.C.A.2–A.5 first.
- **Aayan (Q2):** per-retry `validating` SSE events on every boundary or only the initial?
- **Aayan (Q3):** `/api/chat` no-contextId fallback — skip pipeline or attempt degraded run?
- **Aayan (Q4–Q7):** telemetry field set, classifier wiring posture, partial-data UX, CI sweep workflow.
- **Tech-lead (T1–T10):** architecture decisions across pipeline-timeout wrapper, streaming pacing, retry caps, telemetry routing, flag reader pattern, fixture format, opt-out scope, route allowlist, auth posture.

Once both sign off, Stage B code begins. Commits land in the order specified by [PR_1C_PLAN.md §7](PR_1C_PLAN.md) renumbered to start from where Stage A left off (next commit: `1.C.B.1` — `wireValidators.ts` + tests).

Stage A is sealed; this Stage B plan does not modify Stage A code. Stage C (synthetic-tester sweep against preview) is the merge gate; this plan documents the sweep's role in §11.2 + §11.3 but does not yet author the sweep changes — those land alongside Stage B.B.N code if there's a final-PR-readiness commit needed, or stay in the existing `scripts/synthetic-tester/` infrastructure unchanged.
