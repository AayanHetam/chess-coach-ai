# PR 1.C Stage A.9 — `citationRate.ts` + `runValidationPipeline.dataSources` extension

**Branch:** `mastermind/stage-3-validators` (final Stage A commit before Stage A seals).

**Status:** plan-first per [feedback_mastermind_plan_first.md](../../memory/feedback_mastermind_plan_first.md). **No code yet.** Pause after this plan section for Aayan + tech-lead review.

**Why this exists:** Stage A.9 closes the loop. Stage A.6 + A.7 + A.8 shipped the validators (`scoutCitation`, `userHistoryCitation`) and the data-aggregation helpers (`userHistoryAggregates`). A.9 wires them into `runValidationPipeline` so the route handler in Stage B can drive all four validators (PR 1.B's two + scout + user-history) through a single entry point, AND ships the citation-rate aggregator that Stage C's sweep harness needs to compute the gate metric.

**A.9 is the commit that touches PR 1.B's sealed surface** ([`src/lib/mastermind/validators/index.ts`](../src/lib/mastermind/validators/index.ts) — extending `PipelineOpts` with an optional `dataSources` field). Aayan ratified this touch as part of the [§7.1 scope correction](PR_1C_PLAN.md) — adding optional parameters to a pipeline signature is non-breaking and was always implicit in the audit-revised §2.5 scope.

**Pattern parity.** Same scope discipline as A.6/A.7/A.8 — pure-function helpers + minimal pipeline change. No new LLM prompts. No new parser. The validators it composes already exist.

---

## 0. Two changes — overview

| # | Change | File | Library/Routing-touch |
|---|---|---|---|
| 1 | **`citationRate.ts` helper** — pure function aggregating validator results into per-source + overall citation-rate metrics, category-aware | `src/lib/mastermind/validators/citationRate.ts` (NEW) | Library — pure |
| 2 | **`runValidationPipeline.dataSources` extension** — optional `dataSources: { scout?, userHistory? }` field on `PipelineOpts`; pipeline dispatches `validateScoutCitation` / `validateUserHistoryCitation` conditionally on each source's presence | `src/lib/mastermind/validators/index.ts` (MOD) | Library — touches PR 1.B sealed (ratified) |

Stage B then consumes the extended pipeline via `wireValidators.ts` (still paused; resumes after A.9 seals).

---

## 1. `citationRate.ts` — pure helper for the citation-rate metric

### 1.1 Which metric A.9 computes

Per Aayan 2026-05-18: **per-claim citation rate**, not coverage rate.

- **Per-claim citation rate** (this A.9 ships): *of opportunities to cite personalized data in the source(s) relevant to this category, the fraction the coach actually used.* Single number per source, plus an aggregate across sources.
- **Coverage rate** (orchestrator concern, NOT A.9): *across distinct data sources the category should touch, the fraction the coach actually mentioned at least once.* This is the composite-validator concern from [MASTERMIND_BUILD_PLAN.md §5](MASTERMIND_BUILD_PLAN.md) Phase 2. Stage B / Stage C may surface a need to compute it; if so, follow-up after A.9.

The per-claim citation rate is what Stage A.6 + A.8's `count*Opportunities` helpers were designed to feed. Per [PR_1C_PLAN.md §5.3.2](PR_1C_PLAN.md), this is the metric the Stage C sweep compares against per-category floors:

| Category | Citation-rate floor (PR 1.C scope) | Primary source |
|---|---|---|
| game_review | 90% | feature_delta (PR 1.A) — opportunity counter NOT shipped in A.9 |
| opponent_prep | 85% | scout (A.6) |
| position_analysis | 70% | feature_delta — opportunity counter NOT shipped in A.9 |
| concept_explanation | n/a — deferred to PR 1.D | jhamtani |
| improvement_strategy | 50% | user_history (A.7+A.8) — restricted scope, 3 of 6 claim types |
| meta_motivational | 20% | user_history — same restriction |

**Feature-delta opportunity counter is NOT in A.9 scope.** PR 1.A primitives can be cited (`featureDeltaCitation` validator already runs) but the opportunity-counting side wasn't part of any prior Stage A commit and isn't on this plan either. The citation-rate helper computes per-source rates for whichever sources have opportunity arrays passed in; missing arrays cleanly return `null` rather than a synthesized rate. If Stage C reveals that game_review / position_analysis citation rates need a feature-delta opportunity counter, build it in a follow-up — same shape as scout/userHistory counters.

### 1.2 Function signature

```typescript
import type { QuestionCategory } from "@/lib/mastermind/categorization/categoryClassifier";
import type {
  ValidatorResult,
  ScoutOpportunity,
  UserHistoryOpportunity,
} from "./types";

export type CitationSource = "feature_delta" | "scout" | "user_history" | "jhamtani";

export interface CitationRateOpts {
  category: QuestionCategory;
  /**
   * Validator results from the turn — pipeline output. The helper reads
   * each result's telemetry array for fire_reason="passed" events and
   * counts them per source (via the check_name prefix that identifies
   * the validator). Issues are NOT counted as citations — they're the
   * not-cited fires.
   */
  validatorResults: ValidatorResult[];
  /**
   * Opportunity counts per source. Each is optional; missing → that
   * source's perSource entry is null in the result.
   */
  opportunities: {
    scout?: ScoutOpportunity[];
    userHistory?: UserHistoryOpportunity[];
    // featureDelta + jhamtani slots reserved for future commits.
  };
}

export interface CitationRateBucket {
  /** Number of citations the coach made in this source (matched claims). */
  citations: number;
  /** Number of citation opportunities in this source for this turn. */
  opportunities: number;
  /** citations / opportunities × 100. NaN-guarded: 0 opportunities → 0 rate. */
  ratePct: number;
}

export interface CitationRateResult {
  category: QuestionCategory;
  /** The primary source for the category, or null when the category has no source mapping yet (e.g., concept_explanation in PR 1.C). */
  primarySource: CitationSource | null;
  /** Per-source breakdown. Missing source = null (no opportunity counter provided). */
  perSource: Record<CitationSource, CitationRateBucket | null>;
  /** Aggregate across all sources that have opportunity arrays. Sum-of-citations / sum-of-opportunities. */
  overall: CitationRateBucket;
}

export function computeCitationRate(opts: CitationRateOpts): CitationRateResult;
```

### 1.3 Category-to-source mapping

Codified as a `CATEGORY_PRIMARY_SOURCE` constant in the file:

```typescript
const CATEGORY_PRIMARY_SOURCE: Record<QuestionCategory, CitationSource | null> = {
  game_review: "feature_delta",
  opponent_prep: "scout",
  position_analysis: "feature_delta",
  concept_explanation: null,  // deferred (jhamtani, PR 1.D)
  improvement_strategy: "user_history",
  meta_motivational: "user_history",
};
```

The helper returns the mapped source as `primarySource`. **Floor enforcement lives in the sweep harness, not the helper** — A.9 computes the data, doesn't apply pass/fail logic. Stage A.2's dry-run + Stage C's live sweep are responsible for applying the per-category floor from [PR_1C_PLAN.md §5.3.2](PR_1C_PLAN.md).

### 1.4 Citation counting (from telemetry)

The validators already emit `fire_reason: "passed"` telemetry events for matched claims (verified — `scoutCitation` emits `check_name: "scout_citation"`, `fire_reason: "passed"`; `userHistoryCitation` emits `check_name: "user_history_citation"`, same fire_reason). The helper reads telemetry across all validator results:

```typescript
function countCitations(results: ValidatorResult[], checkName: string): number {
  let n = 0;
  for (const r of results) {
    for (const e of r.telemetry) {
      if (e.check_name === checkName && e.fire_reason === "passed") n++;
    }
  }
  return n;
}
```

Per-source mapping:
- `scout` source: `countCitations(results, "scout_citation")`
- `user_history` source: `countCitations(results, "user_history_citation")`
- `feature_delta` source: `countCitations(results, "feature_citation")` (matches PR 1.B's existing telemetry tag)
- `jhamtani` source: `countCitations(results, "jhamtani_citation")` — N/A in A.9 since the validator doesn't exist; counts zero until PR 1.D

### 1.5 NaN-guarded rate

`ratePct = opportunities === 0 ? 0 : (citations / opportunities) × 100`. Zero-opportunity sources are excluded from the overall denominator (matching [PR_1C_PLAN.md §5.3.2](PR_1C_PLAN.md): "Zero-opportunity turns are excluded from the denominator entirely — you can't fail at citing what doesn't exist"). Same convention for sources where the opportunity array is null vs empty: null skips entirely; empty array contributes 0/0 → 0 rate.

### 1.6 Helper LOC + test outline

**Helper LOC est: ~120 lib + ~280 test = ~400 LOC.**

Tests cover:
- Empty inputs → zero everywhere, primarySource matches category mapping.
- Scout source only: citations match telemetry events; rate computed; perSource.userHistory = null.
- User-history source only: same shape.
- Both sources: per-source + overall correctly aggregated.
- `concept_explanation` category → primarySource null.
- Zero-opportunity edge: returns 0 rate, doesn't NaN.
- All six categories tested for correct primarySource mapping.
- Telemetry filtering: only `fire_reason: "passed"` counts; `unsupported_citation` events are issues, not citations; `parser_low_confidence` doesn't count.

---

## 2. `runValidationPipeline.dataSources` extension

### 2.1 Current pipeline shape (PR 1.B)

From [`src/lib/mastermind/validators/index.ts`](../src/lib/mastermind/validators/index.ts):

```typescript
export interface PipelineOpts {
  initialRequest: CallLLMOptions;
  llmResponse?: string;
  stockfishEval: { cp?: number; mate?: number };
  featureDelta: PositionFeatureDelta;
  pieceRoleDiff: RoleChange[];
  threatTree?: ThreatNode[];
  playerPerspective: "white" | "black";
  fen?: string;
  moveSan?: string;
  correlationId: string;
  coachTone?: CoachTone;
  maxRetries?: number;
  parseCall?: ParserCall;
  callLLM?: (opts: CallLLMOptions) => Promise<LLMResult>;
}

export async function runValidationPipeline(opts: PipelineOpts): Promise<RegenerateResult>;
```

The `validate` closure runs `validateEvalClaim` + `validateFeatureDeltaCitations` in sequence, merges results, returns to `regenerateUntilValid`.

### 2.2 Proposed extension

**Single new optional field on `PipelineOpts`:**

```typescript
export interface ValidatorDataSources {
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
  // FUTURE slots — reserved in the type but not consumed today:
  // jhamtani?: { ... }   (PR 1.D)
  // featureDelta opportunity counter is independent — feature delta is
  // already in PipelineOpts as a top-level field, just not opportunity-
  // counted today.
}

export interface PipelineOpts {
  // ... existing fields unchanged ...
  /**
   * Optional secondary data sources for additional citation validators.
   * Each present source triggers the corresponding validator inside the
   * pipeline's `validate` closure. Absent sources skip the validator
   * entirely — current PR 1.B behavior preserved exactly when this
   * field is undefined.
   */
  dataSources?: ValidatorDataSources;
}
```

### 2.3 Default-behavior preservation contract (load-bearing)

**`runValidationPipeline(opts)` with `opts.dataSources` undefined must produce byte-identical output to the pre-A.9 pipeline.** This contract is what makes the change "non-breaking" per the §7.1 scope-correction ratification.

Concretely:
- The validate closure's existing 2 calls (`validateEvalClaim` + `validateFeatureDeltaCitations`) run unchanged in order.
- New validator calls (`validateScoutCitation`, `validateUserHistoryCitation`) only run when `dataSources.scout` / `dataSources.userHistory` is present.
- The `issues`, `passed`, `telemetry`, `costUsd` aggregation logic concatenates the new validators' outputs after the existing two — same merge shape.
- `regenerateUntilValid`'s flow unchanged.
- `buildFallbackResponse` unchanged (no new data-source dependencies).

**PR 1.B's existing test suite** (`evalClaim.test.ts`, `featureDeltaCitation.test.ts`, `pipeline.test.ts`, `regenerate.test.ts`, `qualitativeBands.test.ts`, `fallback.test.ts`) **must pass unchanged** after the extension. This is the merge gate (§6 below).

### 2.4 Dispatch logic inside `validate`

```typescript
const validate = async (response: string): Promise<ValidatorResult> => {
  const evalResult = await validateEvalClaim({ /* unchanged */ });
  const citationResult = await validateFeatureDeltaCitations({ /* unchanged */ });

  // NEW — conditional dispatch on dataSources.
  let scoutResult: ValidatorResult | null = null;
  if (opts.dataSources?.scout) {
    scoutResult = await validateScoutCitation({
      llmResponse: response,
      scout: opts.dataSources.scout.scout,
      collisions: opts.dataSources.scout.collisions,
      opponentUsername: opts.dataSources.scout.opponentUsername,
      primaryTimeClass: opts.dataSources.scout.primaryTimeClass,
      correlationId: opts.correlationId,
      parseCall: opts.parseCall,
    });
  }

  let userHistoryResult: ValidatorResult | null = null;
  if (opts.dataSources?.userHistory) {
    userHistoryResult = await validateUserHistoryCitation({
      llmResponse: response,
      games: opts.dataSources.userHistory.games,
      userName: opts.dataSources.userHistory.userName,
      nowMs: opts.dataSources.userHistory.nowMs,
      correlationId: opts.correlationId,
      parseCall: opts.parseCall,
    });
  }

  const allResults = [evalResult, citationResult, scoutResult, userHistoryResult].filter(
    (r): r is ValidatorResult => r !== null
  );
  const issues = allResults.flatMap((r) => r.issues);
  const telemetry: TelemetryEvent[] = allResults.flatMap((r) => r.telemetry);
  const costUsd = allResults.reduce((s, r) => s + r.costUsd, 0);

  return { issues, passed: issues.length === 0, telemetry, costUsd };
};
```

### 2.5 Telemetry threading

New validators' telemetry events flow through the same `result.telemetry` array `regenerateUntilValid` produces. No new telemetry routing needed — the route's `forwardTelemetry` (Stage B work) reads `result.telemetry` and threads each event to Sentry per [PR_1C_PLAN.md §3.1](PR_1C_PLAN.md). Each event's `check_name` distinguishes scope:
- `eval_mismatch_numeric` / `eval_mismatch_qualitative` → PR 1.B eval-claim validator
- `feature_citation_unsupported` / `feature_citation` (passed) → PR 1.B feature-citation validator
- `scout_citation_unsupported` / `scout_citation` (passed) → Stage A.6 scout validator
- `user_history_citation_unsupported` / `user_history_citation` (passed) → Stage A.8 user-history validator

Stage C sweep filters by `check_name` to produce per-validator + per-claim-type firing rates (per Aayan's Stage C follow-up requirement, already honored in the validator implementations).

### 2.6 Parallel vs sequential validator dispatch

Default: **sequential** (each `await` runs the validators one after another). The validators are independent (no shared state, no cross-validator dependencies), so parallel dispatch (`Promise.all([...])`) is theoretically safe — but the parser sub-calls share the `parseCall` callback, which routes through the Anthropic Haiku endpoint. Running them in parallel would multiply concurrent Haiku calls per turn (today 2 parsers per turn; with 4 validators each making one parser call, parallel = 4 concurrent vs sequential = 4 serial).

Anthropic's per-organization rate limit is generous enough that 4 concurrent is fine for preview-only traffic. But sequential is simpler and matches PR 1.B's existing model. **A.9 ships sequential**; parallelization is a tech-lead-controllable follow-up if Stage C latency surfaces it.

Open question §5.1 T1 — keep sequential default.

---

## 3. File scope + LOC estimate

| File | Change | LOC est |
|---|---|---|
| `src/lib/mastermind/validators/citationRate.ts` | New | ~120 lib |
| `src/lib/mastermind/__tests__/validators/citationRate.test.ts` | New | ~280 test |
| `src/lib/mastermind/validators/index.ts` | MOD — extend PipelineOpts + dispatch logic + new exports | ~+80 lib |
| `src/lib/mastermind/validators/types.ts` | MOD — re-export ScoutAnalytics/Collisions/UserHistoryGame types if needed for `ValidatorDataSources` (or import in index.ts directly) | ~+20 |
| `src/lib/mastermind/__tests__/validators/pipeline.test.ts` | MOD — add tests for `dataSources` dispatch + preservation contract | ~+150 test |
| **Total** | | **~450 LOC** |

Smaller than A.6/A.7/A.8 — narrowest surface of the four. **The ~20-25% Stage A LOC-overage pattern likely applies here too** (Aayan 2026-05-18 acknowledged). Realistic landing: ~540-560 LOC. Acceptable variance.

---

## 4. Tests

### 4.1 `citationRate.test.ts`

| Case | Asserts |
|---|---|
| Empty validator results + empty opportunities → all zeros | overall.ratePct = 0, perSource all null |
| Scout opportunities + scout passing events → scout rate computed | perSource.scout.citations = N, opportunities = M, ratePct = N/M×100 |
| User-history opportunities + user-history passing events → user_history rate | same shape |
| Both sources → overall = (scout.cit + uh.cit) / (scout.opp + uh.opp) | aggregate math |
| Zero opportunities → 0 rate, not NaN | NaN-guard verified |
| All six categories → correct primarySource | parameterized over QuestionCategory |
| Telemetry filtering: `unsupported_citation` ignored | only fire_reason="passed" counts |
| Telemetry filtering: `parser_low_confidence` ignored | not a citation |
| Mixed validator results (some passing, some unsupported) | citations match passed-event count only |
| concept_explanation → primarySource null | maps correctly |

### 4.2 `pipeline.test.ts` additions

| Case | Asserts |
|---|---|
| `opts.dataSources === undefined` produces byte-identical output to PR 1.B path | telemetry, issues, costUsd, finalResponse all equal to pre-A.9 behavior (golden fixture) |
| `dataSources.scout` present → scoutCitation runs, adds its telemetry | merged telemetry contains scout events |
| `dataSources.userHistory` present → userHistoryCitation runs | merged telemetry contains user-history events |
| Both sources present → all four validators run | telemetry has all four check_name prefixes |
| Scout source's data is bad → unsupported_citation fires + triggers regenerate | regenerate triggered by ANY validator's issues, not just PR 1.B's |
| New validators' costUsd contributes to result.totalCostUsd | aggregate cost correct |
| Mock parser dispatch via system-prompt prefix (all four validators) | parser called 4 times per attempt (2 PR 1.B + scout + user-history) |

### 4.3 Preservation contract test (load-bearing)

One golden-fixture test that captures a pre-A.9 pipeline run's exact output (telemetry sequence + issues + costUsd + finalResponse), then re-runs the same fixture against the extended pipeline with `dataSources: undefined`. Bit-exact match is the assertion. **Failing this test blocks merge** — confirms the §2.3 contract.

---

## 5. Open questions split by reviewer

### 5.1 Tech-lead review

| # | Question | Default |
|---|---|---|
| **T1** | **Validator dispatch order: sequential vs parallel.** Today PR 1.B runs eval + citation sequentially. A.9 adds two more validators. Stay sequential, or parallelize via `Promise.all`? | **Sequential.** Matches PR 1.B's existing model + minimizes concurrent Haiku calls. Parallelize as a Stage C follow-up if latency surfaces. |
| **T2** | **`ValidatorDataSources` shape: flat (top-level scout + userHistory) vs nested under one field.** Default is nested under `dataSources` for forward-compat (jhamtani slot reserved). | Nested. |
| **T3** | **Preservation contract test: golden-fixture binary equality, or shape-only equality.** Binary equality catches accidental telemetry-ordering changes; shape-only equality is more resilient. | Binary equality — the order-of-telemetry is part of the PR 1.B contract; if it shifts, surface explicitly. |
| **T4** | **`feature_delta` opportunity counter.** Not in A.9 scope; means `game_review` and `position_analysis` per-category citation rates report `null` (or zero, depending on null-handling) for the feature_delta source. Stage C sweep will need to handle this. Acceptable? | Yes — out of A.9 scope. Build the counter as a follow-up if Stage C surfaces the need. The validator's `feature_citation` passed events still flow through telemetry, so the citation-count side is recordable; only the denominator is missing. |
| **T5** | **`citationRate.ts` placement: under `validators/` (current plan) or under a new `metrics/` subdirectory.** | `validators/`. Consistent with the rest of A.6-A.8; metrics-vs-validators distinction is artificial when the helper is one file. |
| **T6** | **`ValidatorDataSources` field naming.** `scout` / `userHistory` vs `scoutData` / `userHistoryData` vs `opponentScout` / `userHistory`. | `scout` / `userHistory` — short, unambiguous, mirrors the source-name strings used in `CitationSource`. |

### 5.2 Aayan review (chess + coaching)

| # | Question | Default |
|---|---|---|
| **C1** | **Per-claim citation rate (this PR) vs coverage rate (deferred to Stage B / orchestrator follow-up).** Confirming the metric A.9 ships is the per-claim rate, NOT the orchestrator-style cross-source coverage rate. The two are complementary; coverage rate makes sense after the orchestrator ships and the synthesis step has multiple sources to span. | Confirmed per-claim only. |
| **C2** | **`feature_delta` opportunity counter deferred.** game_review and position_analysis floors per [PR_1C_PLAN.md §5.3.2](PR_1C_PLAN.md) are 90% and 70%. Without a feature-delta opportunity counter, the citation rate for these categories reports as null. Stage C sweep needs to either: (a) treat null as "not measured" and pass the floor by default, (b) skip the category from the gate until the counter ships, or (c) gate the merge of A.9 on shipping the counter first. | Treat null as "not measured" in Stage C; gate decision deferred. The hallucination ceiling still applies to these categories (PR 1.B validators catch eval/feature-delta hallucinations). Citation rate is one of multiple metrics; one being unmeasured doesn't invalidate the rest. |
| **C3** | **Concept_explanation primarySource null.** The mapping returns null for concept_explanation since jhamtani is deferred to PR 1.D. Stage C should report this as "n/a" rather than as a gate failure. | Confirmed — Stage C sweep summary marks concept_explanation as "deferred to PR 1.D" rather than measuring against a floor. |

---

## 6. Acceptance gate

- `npx tsc --noEmit` clean on branch-tracked content.
- `npm run test` 100% green (395 existing + ~30 new for citationRate + pipeline contract = ~425).
- **PR 1.B's existing tests (`pipeline.test.ts` original cases, evalClaim, featureDeltaCitation, regenerate, fallback, qualitativeBands) all pass unchanged** — the preservation contract is the load-bearing merge gate.
- Stage A.2 dry-run harness still passes (default exits 0; `--override-tolerance=2000` exits 1).
- Commit message includes: LOC totals, any deviations from this plan, preservation contract verification result (golden-fixture diff).

After A.9 lands and tests pass, **Stage A actually seals**. Stage B plan ([PR_1C_STAGE_B_PLAN.md](PR_1C_STAGE_B_PLAN.md)) gets revised to reflect the now-shipped Stage A surface (per its paused-pending-Stage-A banner), and Stage B code begins.

---

## 7. Pause for review

This plan section is the brief for the final Stage A commit. **Don't start code until Aayan + tech-lead sign off** — or accept the defaults silently (defaults are the implementation if no input arrives).

A.9 is the last Stage A workstream. After A.9 seals:

1. Stage B plan revision — re-write the §0 scope reconciliation section in [PR_1C_STAGE_B_PLAN.md](PR_1C_STAGE_B_PLAN.md) to reflect that the four outstanding items are now shipped. wireValidators.ts's "forward-compat null slots" become "populated arrays threaded into runValidationPipeline.dataSources." File scope + LOC estimate refresh.
2. Stage B code begins per the revised plan: commits `1.C.B.1` through `1.C.B.N`.
3. Stage C synthetic-tester sweep against preview deploy. Per-claim-type firing-rate aggregation surfaced in the sweep summary; merge candidates (≥3-never-fire claim types) reported to Aayan per the Stage A.6 follow-up requirement.
4. PR 1.C merges to main.

Stage B unblocks only after A.9 seals. The discipline that's served us through five Stage A commits (A.6 + A.7 + A.8 + the A.6 unhinted-opening patch + this A.9 plan) carries forward.
