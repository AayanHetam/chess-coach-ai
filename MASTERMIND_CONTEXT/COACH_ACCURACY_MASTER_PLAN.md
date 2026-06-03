# Coach Accuracy — Master Plan

_Last updated: 2026-06-02. Branch: `feat/tactical-grounding-stage9-validators` (off `origin/main`). Worktree: `/tmp/feat-tg-stage9-validators/`._

The strategic moat for chessmasti.com is **trust** in the AI coach (1M MAU target by June 2027, Aug 31 2026 pivot trigger). Every hallucinated citation or wrongly-confident "you missed a fork!" is one user who silently stops trusting it. This doc consolidates everything the receiving session needs: what's on `main`, what this session did, what's actually open, and the build plan for Stage 9 — the enforcement layer that makes the voter's suppression rules real instead of advisory.

---

## 1. State on main (PR #121, commit `1820640`)

Already shipped — the Tactical Grounding Program scaffolding lives at `origin/main`. Do not re-investigate; do not re-migrate; do `git fetch origin main` if your branch can't see them.

**Five bug fixes shipped together** (in severity order):

1. **Prompt hallucination fuel removed** — `src/lib/prompts/coachChatPrompt.ts:211-253`. The prompt declared GameKnot 298k-comment + Lichess puzzle datasets (fabricated IDs like `#12345`, counts like "over 50,000 puzzles", rating bands "1500-1800") as PRIMARY sources. Zero of that was ever injected. Both blocks deleted. PROMPT_VERSION `3.0 → 3.1`.
2. **Streaming validator fires in prod** — `stream:true` is hardcoded in `AICoachChat:2492`, but `validateMotifGrounding` only ran on the non-streaming branch. Added `detectMotifs` + `validateMotifGrounding` to all three streaming branches (flag-off, flag-on-Mastermind, flag-on-game_review-fallback). Branch-tagged in telemetry: `stream-flagoff` / `stream-flagon-pipeline` / `stream-flagon-fallback`. Log-only in v1. New test: `streamingGroundingValidation.test.ts`.
3. **ChessDB queried on pre-mistake FEN** — `route.ts:556` and `route.ts:~694`. Was `queryChessdb(m.fenAfter)`, now `m.fenBefore`. The voter combines chessdb with motifs from `m.fenBefore` and Stockfish eval from `evalBefore` — querying chessdb on `m.fenAfter` had it comparing different positions.
4. **TOP MISTAKES color filter** — `route.ts:548-557` and `route.ts:~860`. The prompt says "ONLY analyze the PLAYER's critical mistakes" but the mistakes array contained both colors. Filter via `playerColor` ("w"/"b" → "White"/"Black") before slicing top-10/top-12.
5. **Voter `material_win` perspective fix** — `voter.ts:104-121`. `parseResults.ts:49-55` normalizes Stockfish cp/mate to White's perspective when Black to move. Voter's `material_win` was reading `(sfCp ?? 0) >= 150` as if cp were side-to-move-positive — silently missed every Black-mover position where Black had ≥1.5 pawn edge. Applied `Math.abs` to all three thresholds (150 / 100 / 200). `positional_plan` already used `Math.abs`. `lc0AgreesWithSf` is symmetric.

**Scaffolding now on main**:
- `src/lib/grounding/` — `chessdb.ts`, `lc0.ts`, `maia.ts`, `voter.ts` + tests
- `src/lib/tactics/` — 8 motif detectors + `escapability.ts`, `index.ts`, `types.ts`, `utils.ts` + tests
- `src/lib/mastermind/validators/motifGrounding.ts` (+ types.ts +2 enums: `motif_grounding_ungrounded`, `tactical_claim_without_grounding`)
- `MASTERMIND_CONTEXT/PR_GROUNDING_FIXES_PLAN.md`, `TACTICAL_GROUNDING_HANDOFF.md`, `TACTICAL_GROUNDING_SOURCES.md`

**Verification**: `tsc --noEmit` clean; `npm test` → 59 files / 908 tests passing.

---

## 2. What runs in prod right now

```
Stockfish (browser WASM, deterministic eval)
   ↓
parseResults.ts (normalizes cp/mate to White's perspective)
   ↓
buildGameContext (server) — per-mistake loop:
   for each user mistake:
     detectMotifs(fenBefore, moveSan)
     queryChessdb(fenBefore)
     shouldCallLc0(sfCp, lines) → queryLc0(fenBefore)
     shouldCallMaia(userRating, bestUci) → queryMaiaAtRating(fenBefore, rating, bestUci)
     compileVoterResult({ motifs, chessdb, lc0, maia, sfEvalCp, sfMate })
        → { groundingContext, confidences: { user_visibility, positional_plan,
                                              mate_in_n, material_win, tactical_motif,
                                              endgame_wdl } }
   ↓
voter emits suppression rules into the prompt:
   "Do NOT use 'obvious'/'clearly'/'simply'/'just' when user_visibility = NONE"
   "Do NOT claim mate without Syzygy DTM or SF mate score"
   "Do NOT claim 'winning material' without material_win = HIGH"
   "Do NOT make strong positional claims without SF+Lc0 consensus"
   ↓
Sonnet 4 (flagship) — generates the game review prose
   ↓
SSE stream to client
   ↓
post-stream: validateMotifGrounding (log-only)
   ↓
chess.js validator — checks legal moves, draw/mate state
```

**Surfaces**:
- `/analysis` first message → `/api/enhanced-analysis` → all grounding fires
- `/analysis` follow-ups → `/api/chat` (Haiku, cached context) → only `buildCompactGameContext` color filter; voter grounding does NOT fire here (open gap)
- `/preview/analysis` (legacy, cutover via PR #61) → same `/api/enhanced-analysis`

**Live services**: Maia (deployed); Lc0 (not deployed; queryLc0 returns null gracefully); Maia `/predict_at_rating` endpoint (not yet deployed). The voter's confidence math accepts null inputs cleanly so PR #121 is safe in prod — the missing services degrade gracefully but Stage 8 visibility logic doesn't fire yet.

---

## 3. This session's work — progress log (a bit heywire, on purpose)

The receiving session inherits a tangle. Here's what actually happened, in order, so future sessions don't re-trace it.

### Session arc summary

**Stage 4 — eval runners (DONE on disk, NOT on main)**
- ✅ Built `scripts/eval/gcc-eval-runner.ts` and `scripts/eval/chessqa-runner.ts`
- ✅ Bundled sample fixtures at `scripts/eval/benchmarks/gcc-eval-sample.json` and `chessqa-sample.json` (10 + 12 fixtures)
- ✅ `--no-motifs` baseline flag for pre-vs-post comparison; `--output=FILE` JSON report
- ⚠️ Sample fixtures reuse FENs from the detector test suite — 100% grounding on samples doesn't extrapolate; download real GCC-Eval and ChessQA benchmarks before claiming numbers
- Location: `/Users/aayanhetamsaria/Downloads/Inspirit_project/chess-coach-ai/scripts/eval/` (untracked on `feat/puzzle-coach`)

**Stage 7 — Lc0 microservice + voter wiring (PARTIAL on main, PARTIAL on disk)**
- ✅ Voter logic on main (PR #121): `lc0Result` input, `positional_plan` class with HIGH/MED/LOW/NONE + veto, `material_win` MED→HIGH upgrade
- ⚠️ Microservice NOT on main: `lc0-service/` (FastAPI wrapping lc0 v0.31.2 CPU binary + maia-1900 net) lives at `/Users/aayanhetamsaria/Downloads/Inspirit_project/chess-coach-ai/lc0-service/` as untracked files
- ⚠️ `src/app/api/lc0-status/` + `src/app/api/keep-lc0-alive/` also untracked there
- ⚠️ `LC0_API_URL` env var not set in prod
- **🐛 Design tension surfaced**: `shouldCallLc0` only fires when `|SF| ≤ 100`; `material_win` MED→HIGH upgrade requires both SF ≥ 150 AND Lc0 ≥ 150. These mutually exclude — upgrade is unreachable via the route's actual trigger. The veto path (positional_plan: NONE when Lc0 contradicts SF) is what actually fires. Tracked in `memory/project_stage7_lc0_design_tension.md`.

**Stage 8 — Maia `predict_at_rating` (PARTIAL on main, PARTIAL on disk)**
- ✅ Voter logic on main (PR #121): `maiaResult` input, `user_visibility` class (HIGH ≥ 0.50, MED ≥ 0.25, LOW ≥ 0.15, NONE < 0.15), Maia grounding context block emits suppression rule for "obvious"/"clearly"/"simply"/"just"/"obviously"
- ⚠️ Maia microservice endpoint NOT on main: `POST /predict_at_rating` exists in the modified `maia-service/maia_server.py` on `feat/puzzle-coach`. The deployed Maia instance doesn't have it yet — `queryMaiaAtRating` returns null gracefully and `user_visibility` resolves to NONE
- ⚠️ Until the endpoint redeploys, no user_visibility data flows; the suppression rule never fires; Stage 9's `userVisibilityValidator` has nothing to validate against

**The "option 3 migration" episode (MOOT — DO NOT REPEAT)**
- I (this session) saw that `src/lib/tactics/` and `src/lib/grounding/` weren't on disk in `feat/puzzle-coach` and assumed they'd been lost
- I started cutting a `feat/tactical-grounding` branch and cherry-picking files from a sister worktree
- Aayan caught it — PR #121 had already merged the scaffolding to main. The reason `feat/puzzle-coach` couldn't see them was just that it hadn't fetched main since the merge
- Cleaned up the abandoned worktree at `/tmp/feat-tactical-grounding/` (removed)
- Saved memory: `memory/project_pr121_grounding_scaffolding_shipped.md` so future sessions don't repeat this

**Stage 9 plan doc + memories (DONE on disk this session)**
- ✅ Plan doc `MASTERMIND_CONTEXT/PR_STAGE9_VALIDATORS_PLAN.md` written then replaced by THIS doc
- ✅ Memory: `project_pr121_grounding_scaffolding_shipped.md` (where the scaffolding lives, what's NOT on main)
- ✅ Memory: `project_stage9_validators_open.md` (the 4 validators are the actual open work)
- ✅ Memory: removed stale `project_tactical_grounding_program_complete.md` (was misleading — claimed all 8 stages shipped when they hadn't)
- ✅ MEMORY.md index updated

**Where this work physically lives**:
- This worktree: `/tmp/feat-tg-stage9-validators/` (branch `feat/tactical-grounding-stage9-validators`, off `origin/main`, node_modules symlinked from the puzzle-coach worktree)
- Stages 4/7/8 microservice + script work: still on `feat/puzzle-coach` worktree as untracked / modified files. Not blocking on Stage 9 validators since the validators only need the voter shape, which is on main.

---

## 4. The open work (priority-ranked)

### P0 — Stage 9 enforcement validators (THIS PR)
Voter emits suppression rules. Nothing enforces them except `motifGrounding.ts` for Stage 5 motifs. Four claim classes — `user_visibility`, `positional_plan`, `mate_in_n`, `material_win` — have zero post-LLM checks. The LLM can ignore every rule and we have no detection. Detailed spec in §5; implementation plan in §6.

### P1 — Stage 7 design tension resolution
`shouldCallLc0` trigger range (`|SF| ≤ 100`) and `material_win` MED→HIGH upgrade threshold (both ≥ 150) mutually exclude. Pick one resolution:
- (a) Widen `shouldCallLc0` to fire whenever Lc0 is configured (more Lc0 calls = more cost, more latency)
- (b) Lower the upgrade threshold so "Lc0 ≥ 150 alone is enough to upgrade" (better matches the "Lc0 catches what SF misses" intent)
Recommendation: (b). Needs Aayan + tech-lead confirmation. Memory: `project_stage7_lc0_design_tension.md`.

### P1 — Lc0 service deploy
Push `lc0-service/` to HuggingFace Spaces. Set `LC0_API_URL`. Verify via `/api/lc0-status`. Until deployed, `positional_plan` always lands at MED-or-below (no Lc0 confirmation possible), and Stage 9's `positionalClaimValidator` will mostly fire on MED (positional_plan never reaches HIGH without Lc0 anyway).

### P1 — Maia service redeploy (+ /predict_at_rating endpoint)
Modified `maia-service/maia_server.py` has the new endpoint on disk. The deployed Maia instance needs the redeploy. Verify via `/api/maia-status`. Until then, `user_visibility` always resolves to NONE (because maiaResult is null, not because the move is hard), and `userVisibilityValidator` must distinguish "NONE because absent" from "NONE because hard" via a `maiaConsulted` flag.

### P2 — Stage 4 real benchmarks
Bundled fixtures share FENs with detector test suite (100% recall is suspect). Download actual GCC-Eval and ChessQA. Required before claiming hallucination-rate improvement. Re-run synthetic-tester at `scripts/synthetic-tester/` against PROMPT_VERSION 3.1.

### P3 — Wire voter into `/api/chat` (Haiku follow-ups)
Currently only `/api/enhanced-analysis` (Sonnet flagship) gets voter grounding. Follow-up turns (Haiku via `buildCompactGameContext`) serve most user traffic post-message-1 with no per-move grounding. Significant scope. Track for v2.

### P3 — Regeneration loop (Stage 6 spec)
All validators are log-only. The next level: fire → re-prompt with violation called out → use regen if it passes. Cost concern: doubles LLM spend on violation. Mitigation: only regenerate on high-severity fires (mate, material) — log-only for low-severity (positional language). Separate workstream.

### P4 — Cosmetic doc fixes
- `threatTree.test.ts:39` 5s timeout flake (bump to 10s or reduce depth to 2)
- `responseCache.ts:62` doc-comment still references "3.0"
- `coachChatPrompt.ts:18-20` version-history doc-comment slightly stale

---

## 5. Stage 9 — full validator spec

### Common shape

All four validators follow `validateMotifGrounding`'s pattern:
- Pure string scan via regex — no parser-LLM call, `costUsd = 0`
- Synchronous
- Returns `ValidatorResult { issues, passed, telemetry, costUsd }`
- Emits exactly one telemetry event per run (`fire_reason: "passed"` on clean, specific reason on fire)
- Each issue carries `llm_span` (the matched substring), `expected`, `actual`, `detail`
- `severity: "warn"` by default — preserves current `runValidationPipeline` regenerate behavior

### Validator 1: `userVisibilityValidator`

**File**: `src/lib/mastermind/validators/userVisibility.ts`

**Input**:
```ts
interface UserVisibilityOpts {
  llmResponse: string;
  maiaProb: number | null;       // maiaResult.prob_plays_best when consulted, else null
  userRating: number | null;
  fen?: string;
  moveSan?: string;
  correlationId: string;
}
```

**Regex** (case-insensitive, word-boundary):
```ts
/\b(obvious|obviously|clearly|simply|just|easy|easily|trivially?|of course)\b/gi
```

**Fire condition**:
```ts
const threshold = (userRating !== null && userRating < 1200) ? 0.20 : 0.15;
// fire iff maiaProb !== null && regexMatch && maiaProb < threshold
```

The `maiaProb !== null` check matters — `user_visibility` is also NONE when Maia was absent. We only enforce when we actually have data.

**Emit on fire**:
```ts
issues.push({
  check_name: "user_visibility_overclaim",
  severity: "warn",
  llm_span: match,        // the matched word in context
  expected: { user_visibility_min_prob: threshold },
  actual: { maia_prob: maiaProb, user_rating: userRating, matched_token: token },
  detail: `LLM used "${token}" on a move ${userRating}-rated players find only ${(maiaProb * 100).toFixed(1)}% of the time`,
});
```

**CheckName**: `"user_visibility_overclaim"`
**FireReason**: `"obviousness_claim_below_visibility_threshold"`

**Edge cases / known false-positive risks**:
- "just before move 14, …" (temporal "just"). v1 accepts; v2 can add context window.
- "the obvious candidate Nf3 actually loses to…" — adversarial framing where the model self-corrects. v1 accepts; matched token in span allows pattern analysis later.

### Validator 2: `positionalClaimValidator`

**File**: `src/lib/mastermind/validators/positionalClaim.ts`

**Input**:
```ts
interface PositionalClaimOpts {
  llmResponse: string;
  positional_plan: ConfidenceLevel;
  sfCp: number | null;
  lc0Cp: number | null;
  fen?: string;
  moveSan?: string;
  correlationId: string;
}
```

**Regex**:
```ts
/\b(strategically (winning|crushing)|dominating|completely (winning|won|lost)|overwhelming advantage|decisive (advantage|edge))\b/gi
```

**Fire condition**: `regexMatch && positional_plan !== "HIGH"`

**Severity upgrade**: if Lc0 actively vetoed SF (opposite direction with `|lc0Cp| ≥ 50`), severity escalates from `"warn"` to `"error"` — the model is contradicting a deterministic veto.

```ts
const lc0Vetoes = lc0Cp !== null && sfCp !== null
  && Math.abs(lc0Cp) >= 50
  && Math.sign(lc0Cp) !== Math.sign(sfCp);
const severity = lc0Vetoes ? "error" : "warn";
```

**CheckName**: `"positional_claim_unsupported"`
**FireReason**: `"positional_overclaim_without_voter_high"` (or `"positional_overclaim_against_lc0_veto"` on the upgraded case)

**Tuning note** (from handoff): "small advantage" / "slight edge" should NOT fire. Tested by the regex's literal token list.

### Validator 3: `mateInNValidator`

**File**: `src/lib/mastermind/validators/mateInN.ts`

**Input**:
```ts
interface MateInNOpts {
  llmResponse: string;
  syzygyDtm: number | null;       // from tablbaseResult when Syzygy fires
  sfMate: number | null;          // from stockfishBestMoveMate
  mate_in_n: ConfidenceLevel;
  fen?: string;
  moveSan?: string;
  correlationId: string;
}
```

**Regex**:
```ts
/\b(mate in (\d+)|mating attack|forced mate|inevitable mate|unstoppable mate|checkmate is forced)\b/gi
```

**Fire condition (two-tier)**:

1. **Ungrounded claim** — `regexMatch && mate_in_n === "NONE"` → fire `mate_claim_unsupported`
2. **Distance off by >1** — if "mate in N" matched AND syzygyDtm !== null AND `Math.abs(N - syzygyDtm) > 1`, fire `mate_distance_incorrect` (separate issue, can fire alongside the ungrounded one).

**CheckName**: `"mate_claim_unsupported"` (also `"mate_distance_incorrect"` for the second fire condition)
**FireReason**: `"mate_claim_without_syzygy_or_sf_mate"` and `"mate_distance_off_by_more_than_one"`

**Why so strict**: mate claims are the single highest-trust claim in chess prose. Wrong mate calls destroy credibility instantly.

### Validator 4: `materialWinValidator`

**File**: `src/lib/mastermind/validators/materialWin.ts`

**Input**:
```ts
interface MaterialWinOpts {
  llmResponse: string;
  material_win: ConfidenceLevel;
  sfCp: number | null;
  fen?: string;
  moveSan?: string;
  correlationId: string;
}
```

**Regex**:
```ts
/\b(winning material|up (a |an )?(piece|exchange|rook|queen|knight|bishop)|material advantage|wins material|wins (a |an )?(piece|rook|queen|knight|bishop))\b/gi
```

**Fire condition**:
- Base: `regexMatch && (material_win === "NONE" || material_win === "LOW")` → fire `material_win_unsupported`
- Sanity-check upgrade: if claim is "winning material" / "wins material" / "material advantage" AND `|sfCp| < 100`, severity escalates from `"warn"` to `"error"` — the engine literally says the material is balanced.

**CheckName**: `"material_win_unsupported"`
**FireReason**: `"material_claim_without_voter_med_or_high"` (or `"material_claim_contradicts_stockfish"` on the upgraded case)

### Types additions

`src/lib/mastermind/validators/types.ts`:
```ts
// Add to CheckName union:
| "user_visibility_overclaim"
| "positional_claim_unsupported"
| "mate_claim_unsupported"
| "mate_distance_incorrect"
| "material_win_unsupported"

// Add to FireReason union:
| "obviousness_claim_below_visibility_threshold"
| "positional_overclaim_without_voter_high"
| "positional_overclaim_against_lc0_veto"
| "mate_claim_without_syzygy_or_sf_mate"
| "mate_distance_off_by_more_than_one"
| "material_claim_without_voter_med_or_high"
| "material_claim_contradicts_stockfish"
```

### Pipeline integration

In `src/lib/mastermind/validators/index.ts` (`runValidationPipeline:159`), add a new optional field to `PipelineOpts`:

```ts
interface PipelineOpts {
  // ... existing ...
  /**
   * Stage 9: per-position voter snapshot. When undefined, the four claim-class
   * validators (user_visibility, positional_plan, mate_in_n, material_win)
   * no-op and emit no telemetry — preserves byte-identical behavior for all
   * existing callers/tests pre-dating this field.
   */
  voterSnapshot?: {
    confidence: VoterConfidence;
    maiaProb: number | null;
    userRating: number | null;
    sfCp: number | null;
    sfMate: number | null;
    lc0Cp: number | null;
    syzygyDtm: number | null;
  };
}
```

The voter snapshot is per-position. The route already computes a `voterResult` per top mistake; the route call-site picks the relevant snapshot for the current `position_analysis` request and threads it into `runValidationPipeline`. Game-review prose discusses multiple positions — see §5 "Category gating" below.

Inside the `validate` closure, add four parallel promises alongside the existing chain:

```ts
const userVisPromise = opts.voterSnapshot
  ? validateUserVisibility({ llmResponse: response, maiaProb: opts.voterSnapshot.maiaProb,
      userRating: opts.voterSnapshot.userRating, fen: opts.fen, moveSan: opts.moveSan,
      correlationId: opts.correlationId })
  : Promise.resolve(null);
// ... positional, mateInN, materialWin similarly
const [/* existing four */, userVisResult, positionalResult, mateResult, materialResult]
  = await Promise.all([/* existing */, userVisPromise, positionalPromise, matePromise, materialPromise]);
```

Aggregate `issues`, `telemetry`, `costUsd` (always 0 for these four) in source order.

### Category gating

The existing `POSITION_ANCHORED_VALIDATOR_CATEGORIES` set (`validators/index.ts:102`) gates eval-claim and feature-citation to `position_analysis` only — because they can't handle multi-position `game_review` prose.

The Stage 9 validators have the same issue, but worse: the voter is **per-move**. A single `voterSnapshot` can't apply to a multi-move game-review response.

**v1 scope**: gate Stage 9 validators to the same categories — `position_analysis` only. Add `STAGE9_VALIDATOR_CATEGORIES` constant (initially identical to POSITION_ANCHORED_VALIDATOR_CATEGORIES, separate for future divergence). The route call-site only threads `voterSnapshot` through on `position_analysis` requests; `game_review` passes `voterSnapshot: undefined` and the validators no-op.

**v2 follow-up** (defer): per-claim position anchoring — parser extracts a `move_ref` from each match; validator looks up `voterSnapshotsByMove: Map<halfMoveIdx, VoterSnapshot>`. Adds parser cost. Out of scope for this PR.

### Streaming-branch wiring

PR #121 added `validateMotifGrounding` to all three streaming branches in `route.ts`. Stage 9 should mirror the pattern in the same PR — same call sites, same per-branch telemetry tag:

- flag-off streaming
- flag-on Mastermind pipeline streaming
- flag-on game_review fallback streaming

Existing `streamingGroundingValidation.test.ts` provides the structural template; extend it to assert each of the four new validators fires on each branch.

### Tests

Mirror `motifGrounding.test.ts` (9 cases) and `voter.test.ts` (50+ cases). For each validator:

1. **Positive cases** — voter says block, regex matches → expect issue
2. **Negative cases** — voter says HIGH (or maiaProb null, or mate_in_n HIGH) + matching tokens → expect no issue
3. **Boundary** — case-insensitivity, word boundary (`obviousness` matches but `unobviously` is fine because `obviously` is a substring), empty `llmResponse` → pass
4. **Severity escalation** — Lc0 veto + positional claim → severity escalates from warn to error
5. **Pipeline integration** — `voterSnapshot: undefined` → byte-identical to pre-Stage-9 output; `category: "game_review"` → all four validators no-op

Plus the streaming test extension covering all four validators on all three branches.

---

## 6. Implementation plan — sequencing

Per `feedback_verify_before_shipping_stack`: each commit ships independently green (`tsc` + `vitest`). The stack tip runs `npx tsc --noEmit && npm test -- src/lib/mastermind/validators src/lib/grounding` before declaring shipped.

**Commit sequence**:

1. **types.ts additions** — add the new `CheckName` + `FireReason` enum values
2. **userVisibilityValidator** — smallest surface, clearest trigger; gets the precedent right for the other three
3. **mateInNValidator** — high-severity, two-tier fire (ungrounded + distance off)
4. **materialWinValidator** — mirrors mateInN structure with the sfCp sanity check
5. **positionalClaimValidator** — most subtle (NONE/LOW/MED matrix, Lc0-veto severity escalation); benefits from precedent of 2–4
6. **pipeline wiring** — `PipelineOpts.voterSnapshot` + `validate` closure additions in `runValidationPipeline`
7. **route call-site** — pick the relevant voter snapshot per `position_analysis` request, thread through
8. **streaming-branch wiring** — extend the three streaming branches to call all four validators; extend `streamingGroundingValidation.test.ts`

**This session builds commits 1–5** end-to-end with tests, then stops. The pipeline wiring (commit 6) and route (commit 7) call-site change need a careful review of which voter result represents "the current position" for `position_analysis` requests; commit 8 is mechanical but depends on 6+7. The plan is:

- Build 1–5 here in `/tmp/feat-tg-stage9-validators/`
- Validate `npx tsc --noEmit && npm test -- src/lib/mastermind/validators` clean
- Pause for review on commits 6–8

---

## 7. Memory state

Active memories the next session should know exist:

- `project_pr121_grounding_scaffolding_shipped.md` — where the scaffolding lives, what's NOT on main, how to not repeat the migration mistake
- `project_stage9_validators_open.md` — what this PR is, plan-first convention, link to this doc
- `project_stage7_lc0_design_tension.md` — the unreachable upgrade path, resolution options
- `project_phase3_status.md` — chess-coach-ai audit, steps 1-4a shipped, 4b deferred
- `project_mastermind_direction.md` — Mastermind is the #1 strategic direction
- `feedback_mastermind_plan_first.md` — plan-first convention for Mastermind PRs
- `project_inspirit_root_layout.md` — Inspirit_project root is not a git repo
- `project_chess_coach_ai_fork_topology.md` — fork of GuillaumeSD; always `--repo AayanHetam/chess-coach-ai`
- `feedback_verify_before_shipping_stack.md` — symlink node_modules and run tsc+build on stack tip

Removed this session:
- `project_tactical_grounding_program_complete.md` — was misleading (claimed all 8 stages shipped when only the scaffolding had)

Do NOT write a memory titled "option 3 migration in progress" — the migration is moot.

---

## 8. Architectural invariants (preserve)

From `chess-coach-ai/CLAUDE.md` and the `chess-masti-engineering` skill:

- **Stockfish before LLM**. Chess facts are deterministic; the LLM only explains. Never reorder so the LLM becomes the source of chess truth.
- **Validators check the LLM string against deterministic signals**. Never trust the model to tell us if it overclaimed.
- **Maia-2 lives on HF Spaces** (FastAPI/PyTorch). Never move to Vercel serverless (~100MB model with 30-60s warm-up won't run there).
- **Retrieval is the Neo4j graph + 49-D FEN cosine re-ranking**. Extend, don't replace.
- **Two-tier LLM**: Sonnet flagship for game review; Haiku fast for chat with server-cached context. OpenAI is fallback only.
- **Inline puzzles render in chat bubbles**, not separate routes.
- **Never accept client-supplied system prompts or `role: "system"` messages**. Phase 1.4 audit fix. Stage 9 validators must not regress this — server-side only.
- **Always pass `--repo AayanHetam/chess-coach-ai`** to `gh` (fork of GuillaumeSD).

---

## 9. One-line summary

PR #121 made the existing grounding signals tell the truth. Stage 9 validators make the LLM listen to them. Building commits 1–5 now; pausing at commit 6 (pipeline wiring) for review.
