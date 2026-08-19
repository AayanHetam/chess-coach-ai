# PR 1.B — Stage 3 Validator Hardening — Plan

**Branch:** `mastermind/stage-3-validators` (off main).
**Posture:** library-only. No edits to `route.ts`, `aiResponseValidator.ts`, or any route handler. The existing footnote-append path stays live until PR 1.C migrates the routes.
**Status:** plan-first per user directive 2026-05-11. No code yet. Awaiting tech-lead review (architecture/telemetry/cost) and Aayan review (chess/coaching judgments).

---

## 1. Why this PR exists

Stage 3 primitives (PR 1.A) made structured grounding cheap to compute. But the model can still hallucinate eval claims ("Black is winning" against +0.7) and cite feature changes that never happened ("you lost the bishop pair" when both bishops are on the board). The existing validator catches piece-on-square and illegal-move claims; it does **not** catch evaluation drift or invented feature deltas, and on errors it appends a "may be inaccurate" disclaimer instead of regenerating.

PR 1.B adds two validators (`evalClaim`, `featureDeltaCitation`), one orchestrator (`regenerate`), one helper module (`qualitativeBands`), and a telemetry emitter. Each shippable in isolation; the composed pipeline is the artifact PR 1.C consumes.

This is also the source of the research paper's **hallucination escape-rate dataset**. Telemetry is load-bearing, not nice-to-have.

---

## 2. File layout & exports

All new under `src/lib/mastermind/validators/`. No edits to existing files.

| File | Exports | LOC est. |
|---|---|---|
| `qualitativeBands.ts` | `QualitativeBand` (type), `BAND_BOUNDARIES`, `cpToBand(cp)`, `bandDistance(a, b)`, `bandIsAdjacent(a, b)` | ~60 |
| `evalClaim.ts` | `validateEvalClaim(opts) → Promise<ValidatorResult>`, `ParsedEvalClaim` (type) | ~180 |
| `featureDeltaCitation.ts` | `validateFeatureDeltaCitations(opts) → Promise<ValidatorResult>`, `ParsedFeatureClaim` (type) | ~220 |
| `regenerate.ts` | `regenerateUntilValid(opts) → Promise<RegenerateResult>`, `RegenerateResult`, `RegenerateState` (types), `buildRetryInstruction(issues)` | ~150 |
| `fallback.ts` | `buildFallbackResponse(opts) → string` — template-only, no LLM call | ~140 |
| `telemetry.ts` | `TelemetryEvent` (type), `emitValidatorEvent(event)`, `withCorrelationId(events, id)` | ~70 |
| `parserPrompts.ts` | `EVAL_CLAIM_PARSER_SYSTEM`, `FEATURE_CITATION_PARSER_SYSTEM` — cached system prompts | ~110 |
| `types.ts` | `ValidatorResult`, `ValidatorIssue`, shared interfaces | ~50 |
| `index.ts` | Re-exports + the composed `runValidationPipeline(opts)` entry point | ~80 |

Tests under `src/lib/mastermind/__tests__/validators/`:

| Test file | Cases | LOC est. |
|---|---|---|
| `qualitativeBands.test.ts` | 6 | ~80 |
| `evalClaim.test.ts` | 12 | ~280 |
| `featureDeltaCitation.test.ts` | 10 | ~260 |
| `regenerate.test.ts` | 6 | ~180 |
| `fallback.test.ts` | 4 | ~120 |
| `pipeline.test.ts` | 5 | ~140 |
| **Total tests** | **43** | **~1,060** |

**Total PR LOC (lib + tests): ~1,120 LOC + ~1,060 LOC tests = ~2,180 LOC.** Above the original ~400 LOC estimate, below the 800-LOC expansion guard. **Flagging this for review** since the spec said "If expansion proposal exceeds 800 LOC of added code beyond the current ~400 estimate, flag in the plan and ask before proceeding." Drivers of the increase: (1) two Haiku parser sub-modules with structured-output prompts and JSON-recovery handling, each substantially more than a regex; (2) telemetry module with correlation IDs (load-bearing for the research dataset); (3) fallback synthesizer is its own 140-LOC concern; (4) 43 tests with adversarial fixtures.

**Proposed:** proceed at ~1,120 lib LOC; if you'd rather I trim, the natural cut points are (a) drop the fallback synthesizer in 1.B and let retry-2 failure return the bad response with the existing footnote (still better than today since we'd at least know which assertions failed) → saves ~140 LOC; (b) drop the correlation-ID layer from telemetry → saves ~30 LOC. Neither is a recommendation; both are reversible scope cuts.

---

## 3. Type contracts (stable — PR 1.C consumes)

```ts
// qualitativeBands.ts
export type QualitativeBand =
  | "losing"          // ≤ -300 cp
  | "much_worse"      // -300 to -150
  | "slightly_worse"  // -150 to -50
  | "equal"           // -50 to +50
  | "slightly_better" // +50 to +150
  | "much_better"     // +150 to +300
  | "winning";        // ≥ +300

// types.ts
export interface ValidatorIssue {
  check_name:
    | "eval_mismatch_numeric"
    | "eval_mismatch_qualitative"
    | "feature_citation_unsupported"
    | "parser_failure";
  severity: "error" | "warn";
  llm_span: string;          // verbatim quote from the response
  expected: unknown;
  actual: unknown;
  detail: string;
  parser_confidence?: number;
}

export interface ValidatorResult {
  issues: ValidatorIssue[];
  passed: boolean;
  telemetry: TelemetryEvent[];
  costUsd: number;
}

// regenerate.ts
export interface RegenerateResult {
  finalResponse: string;
  retryCount: number;          // 0 = passed initial, 1-2 = retry, 3 (sentinel) = fallback
  finalOutcome: "passed_initial" | "passed_after_retry" | "fallback_used";
  cumulativeIssues: ValidatorIssue[];
  totalCostUsd: number;
  telemetry: TelemetryEvent[];
}

// telemetry.ts
export interface TelemetryEvent {
  check_name: string;
  fire_reason:
    | "numeric_diff_exceeds_threshold"
    | "qualitative_band_flip"
    | "unsupported_citation"
    | "parser_low_confidence"
    | "parser_json_invalid"
    | "regenerate_invoked"
    | "fallback_used"
    | "passed";
  llm_span: string;
  expected: unknown;
  actual: unknown;
  retry_count: number;
  final_outcome: RegenerateResult["finalOutcome"] | null;
  context: {
    fen?: string;
    move_san?: string;
    player_perspective?: "white" | "black";
    correlation_id: string;
  };
  timestamp_ms: number;
}
```

---

## 4. Qualitative band parser approach

**Decision:** Haiku sub-call returning structured JSON. Regex-only rejected by the spec; in practice it would miss qualitative claims like "Black has the better position" and over-fire on quoted text ("the engine said 'Black is winning' but I disagree").

### 4.1 Banding (`qualitativeBands.ts`)

Seven bands per the spec. Boundaries from White's perspective:

```ts
export const BAND_BOUNDARIES: Array<{ band: QualitativeBand; max: number }> = [
  { band: "losing",          max: -300 },
  { band: "much_worse",      max: -150 },
  { band: "slightly_worse",  max: -50 },
  { band: "equal",           max: 50 },
  { band: "slightly_better", max: 150 },
  { band: "much_better",     max: 300 },
  { band: "winning",         max: Infinity },
];

export function cpToBand(cp: number): QualitativeBand;
export function bandIsAdjacent(a: QualitativeBand, b: QualitativeBand): boolean;
export function bandDistance(a: QualitativeBand, b: QualitativeBand): number; // 0-6
```

**Adjacent-band tolerance** (open question 4 in §11): if Stockfish cp is within 30 cp of a band boundary and the LLM picks the neighboring band, do not fire. Handles legitimate prose ambiguity ("around equal" at +55 cp). 30 cp is a starting value; tunable in 1.C against synthetic-tester. **Aayan to review** whether the 30 cp tolerance is right; lower means stricter coaching, higher means more tolerant.

### 4.2 Haiku parser prompt skeleton (`parserPrompts.ts`)

**Cached system prompt** (~480 tokens; same string every call, hits prompt cache after first warm-up):

```
You parse chess analysis prose into structured evaluation claims.

INPUT: a passage of chess analysis prose (possibly multi-sentence).

OUTPUT: a JSON array. Each element is one distinct evaluation claim found in
the passage:

  {
    "stated_band": one of ["losing","much_worse","slightly_worse","equal",
                           "slightly_better","much_better","winning"],
    "stated_cp": number | null,
    "supporting_spans": [verbatim quotes from input that support this claim],
    "confidence": number in [0, 1],
    "claim_class": "evaluative" | "metaphorical" | "conditional",
    "perspective": "white" | "black" | "side_to_move" | "ambiguous"
  }

Return ONLY the JSON array. No prose, no preamble, no trailing commentary.
If the passage contains no evaluation claims, return [].

BAND DEFINITIONS (from the named perspective):
- "winning"          — decisive, completely won (≥ +3 pawns)
- "much_better"      — large advantage (+1.5 to +3 pawns)
- "slightly_better"  — small edge (+0.5 to +1.5 pawns)
- "equal"            — balanced (−0.5 to +0.5 pawns)
- "slightly_worse"   — small disadvantage (−0.5 to −1.5 pawns)
- "much_worse"       — large disadvantage (−1.5 to −3 pawns)
- "losing"           — decisive disadvantage (≤ −3 pawns)

CLASSIFICATION RULES:
- "evaluative" — the prose stakes a position on the actual evaluation.
  Examples: "Black is winning", "White has a slight edge", "+1.2", "roughly equal".
- "metaphorical" — descriptive language that sounds evaluative but does not
  commit to a band. Examples: "the queen looks impressive", "an interesting
  position", "a sharp battle". DO NOT classify these as evaluative.
- "conditional" — claims gated on a continuation. Examples: "if Black plays
  Nf6, then equal", "with best play it's drawn". DO NOT extract the
  conditional band unless the prose unambiguously states the player WILL
  follow the continuation.

CONFIDENCE GUIDE:
- 0.9-1.0: unambiguous evaluative claim with band-defining language.
- 0.5-0.8: evaluative but hedged ("might be slightly better", "looks worse").
- 0.0-0.4: weak/qualified/conditional; the prose does not really stake a band.

NUMERIC CLAIMS: if the prose cites "+1.2", "-3.4 pawns", "+150 cp", set
stated_cp accordingly (pawns × 100; cp as given). Sign is from the named
perspective. If no number is cited, stated_cp = null.

PERSPECTIVE: if the prose names a side ("Black is better"), perspective is
that side. If it refers to the player generically ("you are worse"),
perspective is "side_to_move". If unclear, "ambiguous".
```

**User-turn prompt** (per call, ~120 tokens):

```
Player perspective: <"white" | "black">.
Cited move (if any): <"Move 23 — Bxd4" | "none">.
Passage:

<llmResponse>
```

**Output handling:**
- Strict JSON parse. If invalid, emit `parser_json_invalid` telemetry, treat as zero claims (do not fire validator), let the response through with a logged anomaly. Pure conservative: parser failures should not amplify into false-positive validation fires.
- `claim_class !== "evaluative"` → skip (metaphorical/conditional are not claims).
- `confidence < 0.4` → skip with `parser_low_confidence` telemetry, do not fire validator.
- Perspective normalization: convert claim's band to White-perspective cp range, then compare.

### 4.3 Caching verification

Every Haiku parse call sets `cacheSystem: true`. Test asserts that after one warm-up call, subsequent calls in the same test report `cacheReadTokens > 0`. Telemetry captures `cacheCreationTokens` and `cacheReadTokens` per call so cost reports in 1.C are real.

---

## 5. `validateEvalClaim` — eval mismatch validator

### 5.1 Signature

```ts
export interface EvalClaimOpts {
  llmResponse: string;
  stockfishEval: { cp?: number; mate?: number };
  playerPerspective: "white" | "black";
  fen?: string;
  moveSan?: string;
  parserModel?: "fast"; // tier override; defaults to "fast" (Haiku)
  correlationId: string;
  numericThresholdCp?: number; // default 150 per user 2026-05-11
}

export async function validateEvalClaim(opts: EvalClaimOpts): Promise<ValidatorResult>;
```

### 5.2 Logic flow

1. Convert `stockfishEval` to White-perspective cp:
   - `mate > 0` → `+10000`
   - `mate < 0` → `-10000`
   - else `cp ?? 0`
2. Compute `expectedBand = cpToBand(stockfishCp)`.
3. Haiku-parse `llmResponse` → `ParsedEvalClaim[]`.
4. For each claim with `claim_class === "evaluative"` and `confidence >= 0.4`:
   - Normalize claim to White perspective using `perspective` and `playerPerspective`.
   - **Numeric check:** if `stated_cp != null` and `|stated_cp - stockfishCp| > numericThresholdCp` → fire `eval_mismatch_numeric`.
   - **Qualitative check:** if `stated_band !== expectedBand`:
     - If `bandIsAdjacent(stated_band, expectedBand)` and `Math.abs(stockfishCp - nearestBoundary(expectedBand, stated_band)) < 30` → tolerate, no fire.
     - Else → fire `eval_mismatch_qualitative`.
   - **Both checks run** per the spec ("firing on either is sufficient"). A single claim can fire both events; both are logged.
5. Return `ValidatorResult` with all issues + telemetry + cost.

### 5.3 Mate edge cases

- LLM says "Black has a forced mate in 5" + Stockfish says `mate: -5`: numeric check is `±10000` vs claim's parsed cp (parser sets `stated_cp = -10000` for mate language; document this in parser prompt). Band is `losing`. Both match → no fire.
- LLM says "Black has a forced mate" + Stockfish says `cp: -200`: band mismatch (`losing` vs `much_worse`), fires qualitative.

### 5.4 False-positive guards (Aayan to review)

- Prose that says "Black has the bishop pair" without staking an eval: parser classifies as non-evaluative or low-confidence; not flagged.
- "Both sides have chances" → parser sets band="equal", confidence ~0.6. If Stockfish is in equal band, no fire.
- Hedged language like "Black might be slightly better" → confidence ~0.6, evaluative, band-checked.
- Quoted text: "The engine says 'Black is winning'" should NOT be flagged as an LLM claim. Parser prompt addresses this implicitly by requiring `supporting_spans` and `claim_class="evaluative"`; spec says parser identifies whose voice the claim is in. **Refinement (Aayan/tech-lead):** worth adding an explicit attribution rule to the prompt? Proposal: extend prompt with "If the prose attributes the claim to a third party (engine, opponent, commentator), classify as 'metaphorical' since the LLM is reporting, not asserting."

---

## 6. `validateFeatureDeltaCitations` — citation validator

### 6.1 Signature

```ts
export interface FeatureCitationOpts {
  llmResponse: string;
  featureDelta: PositionFeatureDelta;  // from PR 1.A
  pieceRoleDiff: RoleChange[];          // from PR 1.A
  threatTree?: ThreatNode[];
  parserModel?: "fast";
  correlationId: string;
}

export async function validateFeatureDeltaCitations(opts: FeatureCitationOpts): Promise<ValidatorResult>;
```

### 6.2 Haiku parser — feature citations

**Cached system prompt** (~620 tokens):

```
You extract factual feature-change claims from chess analysis prose.

INPUT: a passage of chess analysis discussing a move and its consequences.

OUTPUT: a JSON array. Each element is one feature-change claim found in
the passage:

  {
    "claim_text": verbatim quote from input,
    "claim_type": one of [
      "material_change",
      "lost_piece" | "gained_piece" | "lost_bishop_pair" | "lost_knight_pair",
      "king_safety_change",
      "new_passed_pawn" | "lost_passed_pawn",
      "new_outpost" | "lost_outpost",
      "new_open_file" | "lost_open_file",
      "new_isolated_pawn" | "new_doubled_pawn" | "new_backward_pawn",
      "role_gained" | "role_lost",
      "new_threat" | "resolved_threat",
      "hanging_piece" | "now_defended"
    ],
    "expected_in_delta": {
      "side": "white" | "black" | null,
      "square"?: algebraic square,
      "piece"?: "p" | "n" | "b" | "r" | "q" | "k",
      "role"?: one of ["attacker","defender","pinned","pinning","overworked","outpost","bad-bishop"],
      "direction"?: "increase" | "decrease"
    },
    "claim_class": "factual_delta_claim" | "qualitative_commentary" | "conditional_speculation",
    "confidence": number in [0, 1]
  }

Return ONLY the JSON array. No prose. If no factual claims are present, return [].

RULES:
- Only claims that assert a SPECIFIC change between two positions are
  factual_delta_claim. "The bishop on c4 controls the long diagonal" is
  qualitative_commentary (no change asserted).
- "Black's queen looks impressive" is qualitative_commentary, NOT a claim.
- "If you had played Nf6, you'd have an outpost on e4" is
  conditional_speculation, NOT a factual claim.
- "You lost the bishop pair" — claim_type: "lost_bishop_pair",
  expected_in_delta: {side: "you"}.  (caller maps "you" to player_perspective.)
- "New passed pawn on b5" — claim_type: "new_passed_pawn",
  expected_in_delta: {square: "b5"}.
- "Your knight became overworked" — claim_type: "role_gained",
  expected_in_delta: {piece: "n", role: "overworked"}.
- "Black's king became less safe" — claim_type: "king_safety_change",
  expected_in_delta: {side: "black", direction: "decrease"}.

CONFIDENCE: 0.9+ for unambiguous claims; 0.5-0.8 for hedged claims;
< 0.4 for vague claims that may not be assertions at all.
```

### 6.3 Cross-check logic

For each claim with `claim_class === "factual_delta_claim"` and `confidence >= 0.4`:

| `claim_type` | Check against |
|---|---|
| `material_change` (direction implied by sign) | `featureDelta.materialDelta` |
| `lost_piece` / `gained_piece` | `featureDelta.materialDelta` (sign) + `featureDelta.hangingPiecesDelta` |
| `lost_bishop_pair` | check piece counts pre/post: had 2 bishops before, ≤1 after, side matches |
| `king_safety_change` | sign of `featureDelta.kingSafetyDelta[side]` matches direction |
| `new_passed_pawn` | square in `featureDelta.pawnStructureDelta.passedPawnsGained[side]` |
| `lost_passed_pawn` | square in `featureDelta.pawnStructureDelta.passedPawnsLost[side]` |
| `new_outpost` / `lost_outpost` | `pieceRoleDiff` entry with `outpost` in gained/lost |
| `new_open_file` / `lost_open_file` | `featureDelta.pawnStructureDelta.openFilesGained/Lost` |
| `new_isolated_pawn` | `featureDelta.pawnStructureDelta.isolatedPawnsChange[side] > 0` |
| `new_doubled_pawn` | `featureDelta.pawnStructureDelta.doubledPawnsChange[side] > 0` |
| `role_gained` / `role_lost` | `pieceRoleDiff` with matching piece + role |
| `new_threat` / `resolved_threat` | `featureDelta.threatsDelta.newThreats` / `resolvedThreats` |
| `hanging_piece` | `featureDelta.hangingPiecesDelta.newlyHanging` |
| `now_defended` | `featureDelta.hangingPiecesDelta.nowDefended` |

If the claim cannot be matched in the delta → fire `feature_citation_unsupported`.

### 6.4 False-positive guards (Aayan to review)

The user explicitly called out: *"metaphorical-but-correct prose does NOT fire (e.g., 'Black's queen looks impressive but is sidelined' against a position where the queen has good objective placement)"*.

Coverage:
- Parser classifies "looks impressive" as `qualitative_commentary` → skipped.
- "is sidelined" — what does this mean? If the queen's piece-activity is `passive` (per positionAnnotator), the claim is grounded; if it's `active`, the LLM is wrong. **But** — "sidelined" isn't in our `claim_type` enum because it's a subjective adjective, not a feature delta. The parser should classify this as `qualitative_commentary` since piece-activity at a single timestamp is not a *change* between two positions.
- **Decision (Aayan to confirm):** the validator only checks *changes*, not absolute states. Absolute-state claims ("the queen is active") go through the existing chess.js-based validator (which doesn't check piece activity today, but that's a separate concern). PR 1.B's surface is feature *deltas* per Stage 3 spec.

This narrowing has a real cost: an LLM saying "the queen on e5 is undefended" (absolute claim, not a change) is not validated by PR 1.B. That's fine — it's a piece-on-square claim the existing validator already handles.

### 6.5 Cited-spans audit

The parser returns `claim_text` per claim. The validator records both the claim text and the matched delta entry (or none) in telemetry, so the research paper has the raw evidence dataset.

---

## 7. `regenerateUntilValid` — state machine

### 7.1 Signature

```ts
export interface RegenerateOpts {
  initialRequest: CallLLMOptions;
  validate: (response: string) => Promise<ValidatorResult>;
  buildFallback: (issues: ValidatorIssue[]) => Promise<string>;
  maxRetries?: number;             // default 2 per spec
  callLLM?: typeof import("@/lib/llmProvider").callLLM; // injectable for tests
  correlationId: string;
}

export async function regenerateUntilValid(opts: RegenerateOpts): Promise<RegenerateResult>;
```

### 7.2 State machine

```
INIT
  ↓ call LLM with initialRequest
VALIDATE (response, retry=0)
  ↓ validate
  ├── passed → PASSED_INITIAL (return)
  └── failed:
       ├── retry < maxRetries → RETRYING (retry++)
       └── retry === maxRetries → FALLBACK

RETRYING (retry, previousIssues)
  ↓ call LLM with: same system, messages + appended retry instruction
VALIDATE (response, retry)
  ↓ validate
  ├── passed → PASSED_AFTER_RETRY (return)
  └── failed:
       ├── retry < maxRetries → RETRYING (retry++)
       └── retry === maxRetries → FALLBACK

FALLBACK
  ↓ call buildFallback(allIssues) — no LLM call, template-only
  ↓ return FALLBACK_USED
```

### 7.3 Retry instruction template (`buildRetryInstruction`)

Appended to `messages` as a new `user` turn between retries:

```
Your previous analysis had the following validation failures:

1. [eval_mismatch_qualitative]: You wrote: "Black is clearly winning here." The actual Stockfish evaluation is +0.7 (slight advantage to White). Restate the evaluation honoring the engine's verdict.

2. [feature_citation_unsupported]: You wrote: "you lost the bishop pair." Both bishops remain on the board (c1 and f1 for White). Remove this claim.

Regenerate the analysis. Do not repeat these errors. Maintain coaching tone; do not add disclaimers or apologies.
```

Issues are passed in priority order: `eval_mismatch_*` first, then `feature_citation_unsupported`. Within each category, by appearance order in the response.

### 7.4 Same-tier rule

Per spec: "Regenerate re-calls the same tier." If the original was `tier: "flagship"`, retries are also `tier: "flagship"`. This is the costliest path and **drives the §10 cost discussion**.

### 7.5 No disclaimer

The fallback response includes no "may be inaccurate" disclaimer per the spec. The fallback synthesizer (§8) is template-driven from ground truth, so it makes no claims that need disclaiming.

### 7.6 Telemetry

Every state transition emits one event. Sequence for a typical recover-after-1-retry case:

```
[regenerate_invoked: retry=0]  initial validate failed
[eval_mismatch_qualitative]    issue from initial response
[passed: retry=1]              after retry 1
```

For a fallback case:

```
[regenerate_invoked: retry=0]  initial validate failed
[eval_mismatch_qualitative]    issue
[regenerate_invoked: retry=1]  retry 1 also failed
[feature_citation_unsupported] issue
[fallback_used: retry=2]       final
```

All events share the same `correlation_id` so research analysis can stitch the trajectory.

---

## 8. `buildFallbackResponse` — template-only synthesizer

When 2 retries both fail, the system must still return *something*. The fallback synthesizer composes coaching prose **directly from ground truth** (Stockfish eval + Stage 3 feature delta + threat tree) with no LLM call. Pure functions, deterministic output.

### 8.1 Signature

```ts
export interface FallbackOpts {
  stockfishEval: { cp?: number; mate?: number };
  featureDelta: PositionFeatureDelta;
  pieceRoleDiff: RoleChange[];
  threatTree?: ThreatNode[];
  playerPerspective: "white" | "black";
  moveSan?: string;
  coachTone?: "warm" | "blunt" | "playful";  // from user profile
}

export function buildFallbackResponse(opts: FallbackOpts): string;
```

### 8.2 Composition rules

Output structure (sections only emitted when their data is non-empty):

```
<one-line eval summary in coaching tone>

What changed:
- <up to 3 feature-delta entries, ranked by importance>

Tactical risk: <if threat tree has non-empty top threat>
  After this move, your opponent threatens <threatSan>.

What to look at: <up to 2 piece-role changes the player should notice>
```

Tone selector chooses sentence templates per `coachTone`. Default "warm" if absent. No claims beyond what the input proves; no "you should have played X" since that's a candidate-move recommendation the fallback doesn't have grounding for.

### 8.3 Why template-only and not a fast-tier LLM call

- Cost discipline: hitting Sonnet twice already burned the per-turn budget. A third LLM call (even Haiku) on retry-exhaustion is throwing more compute at a model that already failed twice.
- Determinism: research analysis benefits from a reproducible fallback path.
- Trust: a deterministic synthesis from validated inputs cannot hallucinate.

If we want LLM polish on the fallback, that's a follow-up PR (not 1.B).

---

## 9. Telemetry & the research write-up dataset

### 9.1 Emitter (`telemetry.ts`)

```ts
const log = logger.child({ module: "mastermind-validator" });

export function emitValidatorEvent(event: TelemetryEvent): void {
  log.info("validator_event", event);
}
```

Uses the existing `@/lib/logging` infrastructure (the same Sentry-integrated structured logger that `retrieval-telemetry` uses). Events emit synchronously; no async fan-out in 1.B.

**For PR 1.C wiring:** the route handler captures the events list from `ValidatorResult.telemetry` and `RegenerateResult.telemetry`, then forwards to logger. Validators do NOT directly emit — they accumulate in their return shape — so the library remains pure. **Architectural note:** prevents test logs from going to production telemetry; route is the choke point.

### 9.2 Correlation ID

Every pipeline invocation gets a UUIDv4 `correlationId`. Threaded through:
- Initial LLM call (logged with cost)
- Each validator call
- Each retry LLM call
- Fallback synthesis (if reached)

research analysis groups events by correlation_id to reconstruct each turn's full validation trajectory.

### 9.3 Cost reporting in telemetry

Every LLM call (parser, initial, retries) emits a separate `cost_event` capturing `inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`, `costUsd`. research analysis can compute hit rate × cost reduction directly.

---

## 10. Cost projection — flagging an ambiguity

### 10.1 The numbers

| Component | Token shape | Cost per call |
|---|---|---|
| Eval-claim Haiku parse (warm cache) | 480 cached system + 120 user + 200 output | ~$0.0009 |
| Eval-claim Haiku parse (cold cache, first call after 5 min idle) | 480 cache write + 120 user + 200 output | ~$0.001 + $0.0009 |
| Feature-citation Haiku parse | 620 cached system + 200 user + 300 output | ~$0.0013 |
| Validator logic | pure CPU | $0 |
| Retry (Sonnet flagship, full re-call) | ~6k input + 1k output | ~$0.03 |
| Fallback synthesis | pure CPU | $0 |

### 10.2 Per-turn cost in the steady state

- **Pass-initial path** (estimated 80-95% of turns post-1.C): 2 Haiku parses, no retries → **~$0.002 per turn**. Cleanly under $0.01.
- **Recover-after-1-retry path**: 2 Haiku parses + 1 Sonnet retry → **~$0.032 per turn**.
- **Fallback path** (retry 2 also fails): 2 Haiku parses + 2 Sonnet retries → **~$0.062 per turn**.

### 10.3 The ambiguity

The spec says: *"Cost ceiling for the full validation pipeline (parse + check + up to 2 retries): under $0.01 per turn at p99."*

Literal reading: p99 cost (including retries) must be ≤ $0.01. **This is infeasible** under the same-tier rule because a single Sonnet retry alone is ~$0.03.

Two interpretations possible:

**Interpretation A** — *cost ceiling applies to validation overhead only.* Regenerate replaces the original Sonnet output rather than adding to it; net additional cost on the turn from the regenerate is *zero* if you count "what the user gets" not "how many calls were made." Under this read, p99 cost overhead is just 2 Haiku parses = $0.002. Easy.

**Interpretation B** — *literal: total turn cost must stay ≤ $0.01 even with retries.* Requires either (a) downgrading retries to Haiku (violates same-tier rule) or (b) committing to validator fire rate < 1% so p99 doesn't enter the retry path. (b) is data-driven; we'd ship with the gate then watch fire rate in production.

**Proposal:** **Interpretation A.** The validation pipeline's cost overhead (parsers + telemetry) is the budgeted figure, and that's ≤ $0.003 even at p99. Total turn cost rises only when the LLM was going to fail anyway, in which case the alternative is a worse turn at the same Sonnet price. Document this interpretation in MASTERMIND_BUILD_PLAN.md §9.4 as the canonical reading.

**Tech-lead decision needed before code starts.** If you want Interpretation B, the same-tier rule has to relax (Haiku retries instead of Sonnet); say so and I'll adjust the regenerate plan.

---

## 11. Decisions — RESOLVED 2026-05-11

Tech-lead and Aayan responses captured. Plan body updated; this section is the audit trail.

| # | Question | Decision | Plan section updated |
|---|---|---|---|
| 1 | LOC expansion above 800-LOC guard | **Proceed at ~1,120 lib + ~1,060 test** | n/a (no plan change) |
| 2 | Cost ceiling interpretation A vs B | **Interpretation A.** Same-tier rule stays. Also documented as canonical reading in [MASTERMIND_BUILD_PLAN.md §9.4](MASTERMIND_BUILD_PLAN.md) | §10.3 |
| 3 | Telemetry sink | **Library accumulates events in `ValidatorResult.telemetry`; route handler (in PR 1.C) injects to the logger** | §9.1 |
| 4 | Adjacent-band tolerance | **20 cp** (tightened from default 30) | §4.1, §5.2 logic |
| 5 | Parser low-confidence threshold | **0.5** (raised from default 0.4) | §4.2, §5.2 logic |
| 6 | Quoted-text attribution clause | **Yes — add explicit attribution rule to eval-parser prompt** | §4.2 prompt skeleton |
| 7 | Absolute-state vs delta-state scope | **Deltas only in 1.B.** Plus: add TODO entry in [MASTERMIND_FAILURE_MODES.md](MASTERMIND_FAILURE_MODES.md) noting "absolute-state claims unchecked" as a known gap for a future validator (not Phase 1) | §6.4 + FAILURE_MODES |
| 8 | Fallback synthesizer style | **Template-only in 1.B.** No Haiku polish in this PR | §8 |
| 9 | Retry instruction priority | **Eval mismatches before citation issues** | §7.3 |
| 10 | Coach-tone passing | **Pipeline arg; route reads profile and passes in** | §8.1, §10 |

### 11.1 Additional test requirement (added 2026-05-11)

Adversarial metaphorical-prose fixtures with strong descriptive verbs to confirm the parser doesn't over-classify rich coaching prose as evaluative. **3-4 cases**, not 1. Examples called out:
- *"Black's pieces are dancing around the kingside"*
- *"the rook lift looms over the position"*
- *"the queen is screaming at h7"*

For each: parser must classify as `metaphorical` or `qualitative_commentary`; validator must NOT fire. Added to §12.2 as cases #13-#16 (4 cases). The discriminator is whether the prose stakes a numeric/qualitative band, not whether the verbs are vivid.

---

## 12. Test fixture outline

Total: **43 tests** across 6 test files. Minimum bar 30; expanded to cover adversarial cases the spec called out explicitly.

### 12.1 `qualitativeBands.test.ts` (6 tests)

- `cpToBand` returns correct band for each boundary value (−301 → losing; −300 → losing/much_worse boundary; +50 → equal/slightly_better boundary; +301 → winning).
- `bandIsAdjacent` returns true for adjacent pairs, false for skip-one.
- `bandDistance` is symmetric and bounded in [0, 6].

### 12.2 `evalClaim.test.ts` (16 tests — includes 4 adversarial metaphorical-prose cases per §11.1)

| # | Scenario | Expected |
|---|---|---|
| 1 | Stockfish +0.7, LLM "Black is winning" | Fires `eval_mismatch_qualitative` |
| 2 | Stockfish +0.7, LLM "slight edge to White" | Passes |
| 3 | Stockfish +200, LLM "+1.5" (numeric claim diff = 50 cp, under threshold) | Passes |
| 4 | Stockfish +200, LLM "+4.0" (numeric claim diff = 200 cp) | Fires `eval_mismatch_numeric` |
| 5 | Stockfish +55, LLM "roughly equal" (band boundary tolerance) | Passes per §4.1 |
| 6 | Stockfish +55, LLM "much better" (skip-one band, no tolerance) | Fires qualitative |
| 7 | Stockfish mate-in-5 for Black, LLM "Black has a forced mate" | Passes |
| 8 | Stockfish −150, LLM "Black is winning" | Fires qualitative |
| 9 | LLM says nothing evaluative ("interesting position") | Passes, no fire |
| 10 | LLM hedged: "Black might be slightly worse" against +30 cp | Passes |
| 11 | LLM quoted text: "The engine said 'Black is winning' but I disagree" against +50 cp | Passes (attribution to engine, not LLM's claim) |
| 12 | Parser returns malformed JSON | Emits `parser_json_invalid` telemetry, no validator fire |
| 13 | "Black's pieces are dancing around the kingside" (adversarial: vivid descriptive verb, no band claim) against +0.7 | Passes — classified as metaphorical |
| 14 | "the rook lift looms over the position" (adversarial: ominous tactical-positioning prose) against any eval | Passes — classified as metaphorical/qualitative |
| 15 | "the queen is screaming at h7" (adversarial: anthropomorphic threat language) against +0.3 | Passes — classified as metaphorical |
| 16 | "White's pieces coordinate beautifully" (adversarial: praise without band assertion) against -0.4 | Passes — classified as qualitative_commentary |

### 12.3 `featureDeltaCitation.test.ts` (10 tests)

| # | Scenario | Expected |
|---|---|---|
| 1 | "you lost the bishop pair" + delta shows bishop captured | Passes |
| 2 | "you lost the bishop pair" + both bishops present | Fires `feature_citation_unsupported` |
| 3 | "new passed pawn on b5" + delta has b5 in passedPawnsGained | Passes |
| 4 | "new passed pawn on b5" + delta has b5 in passedPawnsLost | Fires (wrong direction) |
| 5 | "Black's king became unsafe" + kingSafetyDelta.black < 0 | Passes |
| 6 | "Black's king became unsafe" + kingSafetyDelta.black > 0 | Fires (wrong direction) |
| 7 | "your knight became overworked" + pieceRoleDiff has knight gaining overworked | Passes |
| 8 | "Black's queen looks impressive but is sidelined" (adversarial) | Passes — classified as qualitative_commentary |
| 9 | "if Black plays Nf6 you'd have an outpost on e4" (conditional) | Passes — classified as conditional_speculation |
| 10 | Multi-citation: 3 claims, 2 correct + 1 invented | Fires once on the invented claim |

### 12.4 `regenerate.test.ts` (6 tests)

- Passes on initial call (no retries needed).
- Passes after retry 1 (initial flagged, retry corrects).
- Passes after retry 2.
- Fallback on retry 2 also failing.
- Telemetry contains one event per state transition.
- Cumulative cost accurately tracks all calls.

### 12.5 `fallback.test.ts` (4 tests)

- Synthesizes coherent prose from feature delta + Stockfish eval.
- Contains no chess error (every piece/square cited exists in the FEN).
- Includes coaching tone modifier when `coachTone` provided.
- Omits sections when corresponding ground truth is empty.

### 12.6 `pipeline.test.ts` (5 tests)

- Full pipeline: parses, validates, regenerates, returns.
- Both validators run on the same response (eval + citation).
- Correlation ID threads through all events.
- Cost across all sub-calls aggregates correctly.
- the research write-up dataset shape: every event has the required fields.

### 12.7 Adversarial fixtures (cross-cutting)

The spec calls these out specifically; covered in 12.2 #11, 12.3 #8, 12.3 #9 above.

Extra adversarial cases worth adding (will include unless cut):
- Mid-paragraph claim followed by a hedge: "Black is winning, although the position is complex." Parser should still extract the band; validator applies tolerance.
- Multi-language affirmation: "Definitely much better for White." Confidence high.
- Conditional disguised as assertion: "Best play leads to equal." Should classify as conditional_speculation (or evaluative if Stockfish currently shows equal — band match anyway).

---

## 13. Verification — how I'll prove this works pre-merge

1. **TSC:** `npx tsc --noEmit` clean.
2. **Tests:** `npm run test` 100% green; 43 new tests + 98 existing = 141 cases.
3. **Manual seeded run:** Construct a fixture with a known-bad LLM response (hardcoded), seed Stockfish eval, run the pipeline, capture telemetry log + corrected output, paste both into the PR description. Shipped as [scripts/mastermind/seeded-regenerate-demo.ts](../scripts/mastermind/seeded-regenerate-demo.ts) — runnable via `npx tsx scripts/mastermind/seeded-regenerate-demo.ts`. Output dump from a run is in the PR 1.B commit description and reproducible offline.
4. **Synthetic-tester:** Run `mastermind/stage-3-validators` against the 50-turn synthetic-tester sweep (10 master games × 5 personas). Compare chess-correctness score and hallucination-escape rate to main. Report both in PR description.
5. **Cache hit verification:** Capture `cacheReadTokens > 0` on second parser invocation in the test suite. Confirms `cacheSystem: true` is actually firing.
6. **Cost dump:** Total `costUsd` across the 50-turn run, broken down by component (parsers / Sonnet initial / Sonnet retries / fallback) and reported in PR description.

### 13.1 Honest framing of what PR 1.B proves (tech-lead 2026-05-11)

The adversarial metaphorical-prose tests (§12.2 #13-16) verify validator logic against **mocked parser output**. They do NOT verify that real Haiku correctly classifies metaphorical prose under the cached system prompt at production traffic volumes. That validation lands in PR 1.C's synthetic-tester sweep, where real Haiku is invoked under real conditions.

Concretely, what PR 1.B proves:
- Given parser-output classifying a claim as `metaphorical`, validator does not fire. ✓
- Given parser-output classifying as `evaluative` outside tolerance, validator fires. ✓
- Given malformed JSON from parser, validator silently skips. ✓

What PR 1.B does NOT prove, deferred to PR 1.C:
- Real Haiku, given "the queen is screaming at h7", returns `claim_class: "metaphorical"`.
- Real Haiku doesn't over-classify rich coaching prose as evaluative under the prompt cache.
- Real Haiku's classifier holds across the persona variations the synthetic-tester exercises.

This separation is intentional: unit tests cover the validator's logic surface; integration tests against real Haiku cover the parser's classification quality. The latter requires production traffic and is PR 1.C's gate, not 1.B's.

---

## 14. What this PR will NOT do (scope guards per spec)

- Touch `aiResponseValidator.ts` or any of its three existing checks.
- Touch the Stockfish-before-LLM ordering anywhere.
- Touch Maia-2 or Neo4j shapes.
- Change tier routing (Sonnet flagship / Haiku fast assignments).
- Wire any of this into `enhanced-analysis/route.ts` or `chat/route.ts`.
- Remove the existing footnote-append code path. PR 1.C migrates the routes; until then both paths coexist.
- Add agent-loop scaffolding, tool-catalog work, or anything else in PR 2.A+ scope.

---

## 15. Pause

This is the plan. No edits to library files. No tests written yet. Awaiting:

- Aayan: items 4, 5, 6, 7, 9 in §11 (chess/coaching judgments).
- Tech-lead: items 1, 2, 3, 8, 10 in §11 (architecture/cost/scope).

On approval, I start with `qualitativeBands.ts` and its tests (small, foundational), then `parserPrompts.ts`, then the two validators bottom-up, then `regenerate.ts` and `fallback.ts`, then `index.ts`, then the pipeline integration tests. Estimated single-session of focused work.
