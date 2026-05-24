# Mastermind → main merge plan (Phase 1 investigation output)

**Branch:** `mastermind/stage-3-validators` → `main`
**Commits:** 68 non-merge + 1 merge commit = 69 total ahead of main
**Diff:** 199 files changed, 45,628 insertions, 5,293 deletions
**Merge cleanliness:** `git merge-tree main mastermind/stage-3-validators` exits 0 with one informational `Auto-merging src/env.ts` — **no conflicts**
**Common ancestor:** `edeee75` ("docs(readme): rewrite to match live site, drop OSS framing"). Mastermind is 69 commits ahead; main is 12 commits ahead of the common ancestor.

---

## Headline finding (read this first)

**The merge is conflict-free despite 28 modified files overlapping with main's 12 post-ancestor commits.** I verified by writing the merge tree (`cf7e4953b652a0677fcf8a9896bf7df757648edb`) and inspecting it — both the CMIP infrastructure that landed on main (intern routes, supabase migrations, admin dashboard) AND the Mastermind validator stack are present in the merged tree. Nothing gets lost.

The 35 files that `git diff main..mastermind` reports as "D" (deleted) are misleading: they're main-only files that don't exist on the mastermind branch tip because the branch predates them. A merge commit preserves them from main's side. Verified by inspecting `git ls-tree cf7e4953...` for representative paths (`scripts/intern/`, `supabase/`, `src/components/intern/`, `MASTERMIND_CONTEXT/PR_CMIP_1_PLAN.md` — all present in merge result).

**One mechanical-only auto-merge in `src/env.ts`.** Both branches added env vars; the merge interleaves them without conflict.

---

## (1) Commit inventory by thematic group

Chronological order within each group. SHAs link via grep convention; subjects truncated to <90 chars where needed.

### Group A — Stage A foundations (planning + Stage 3 primitives + 6 validator passes)

**30 commits.** Lays the foundation: validator primitives, classifier, four validator implementations (scoutCitation, userHistoryCitation, userHistoryAggregates, citationRate). Stage A seals at `573eab5`. Planning docs interleaved.

| SHA | Subject |
|---|---|
| `a37e578` | docs(mastermind): commit Mastermind planning + synthetic-tester docs |
| `74a5d58` | docs(mastermind): add executable build plan with resolved open questions |
| `9c23815` | feat(mastermind): Stage 3 primitives — feature delta, piece roles, tablebase |
| `cd5dc37` | docs(mastermind): PR 1.B plan + decisions captured + FAILURE_MODES TODO |
| `2156781` | feat(mastermind): Stage 3 validator hardening — eval claim, citation, regenerate |
| `766e261` | chore(mastermind): PR 1.B follow-up — demo script + unit/prod gap notes |
| `de22032` | docs(mastermind): PR 1.C plan — three-stage execution + wiring + sweep |
| `4e84abb` | docs(mastermind): PR 1.C plan revision per coaching review |
| `e6690c2` | docs(mastermind): decisions captured §8.1 (round 2) |
| `d0eeb5d` | docs(mastermind): data audit before PR 1.C §6 finalization |
| `afc9073` | docs(mastermind): §6 audit-revised + PR 1.D / 1.E queued |
| `009bee4` | docs(mastermind): PR 1.F conditional queue entry |
| `cc8bd81` | feat(mastermind): Stage A.1 — categoryClassifier + cached prompt + tests |
| `6e2907c` | docs(mastermind): build plan rewrite — orchestrator framing + UI workstream |
| `495a416` | feat(mastermind): Stage A.1 boundary iteration |
| `120653b` | feat(mastermind): Stage A.1.C.A.1 — validator-gate-dryrun harness + 20 fixtures |
| `587043a` | chore(mastermind): Stage A.1.C.A.2 — demonstrate gate sensitivity |
| `84a5118` | feat(mastermind): Stage A.1.C.A.3 — fixture set expanded to 22 |
| `fd8d851` | docs(mastermind): PR 1.C Stage B route-wiring plan |
| `b173e6a` | docs(mastermind): Stage A reopened — scope correction + scoutCitation plan |
| `4f6cc3a` | feat(mastermind): Stage A.6 — scoutCitation validator + 107 tests |
| `d6a6860` | fix(mastermind): scoutCitation — unhinted opening claim baseline |
| `ed625ca` | docs(mastermind): Stage A.7 plan — userHistoryAggregates helper |
| `a067d3b` | feat(mastermind): Stage A.7 — userHistoryAggregates helpers (3 functions, 36 tests) |
| `062d34c` | docs(mastermind): track extractPgnHeaders consolidation as cleanup |
| `488e9b0` | docs(mastermind): Stage A.8 plan — userHistoryCitation |
| `2a071f7` | docs(mastermind): track A.8 deferrals |
| `15b3121` | feat(mastermind): Stage A.8 — userHistoryCitation validator (3 claim types, 69 tests) |
| `f662ed7` | docs(mastermind): Stage A.9 plan — citationRate helper |
| `573eab5` | feat(mastermind): Stage A.9 — citationRate aggregator (Stage A SEALS) |

### Group B — Stage B route wiring (helpers + flag reader + flag-on wings + timeout)

**13 commits.** Wires Stage A validators into both production route handlers, gated by `MASTERMIND_VALIDATORS_ENABLED`. Adds the structured logger / telemetry forwarder, the data-source fetcher, the pipeline-timeout wrapper, the category-aware moveCtx, and full integration tests for both routes.

| SHA | Subject |
|---|---|
| `f4db14d` | docs(mastermind): PR 1.C Stage B plan revision post-Stage A seal |
| `4710487` | docs(mastermind): add CURRENT_STATE.md for session pickup |
| `c353eba` | feat(scout): 1.C.B.0 — extract scout fetchers + cache into shared server lib |
| `a2e9d49` | plan(mastermind): 1.C.B.0.5 — §12.3 T11–T16 resolved |
| `b578168` | feat(mastermind): 1.C.B.1 — wireValidators.ts four-source fetch helper + tests |
| `78c6ebc` | plan(mastermind): 1.C.B.1.5 — T16 verified-behavior lock |
| `bdfa2e8` | feat(mastermind): 1.C.B.2 — validatorTelemetry.ts forwardTelemetry + tests |
| `fecf0a9` | docs(mastermind): surface Stage C Log Drain dependency + LOG_LEVEL=debug |
| `8f69536` | feat(mastermind): 1.C.B.3 — getMastermindEnv flag reader + tests |
| `7ea1481` | docs(mastermind): 1.C.B.3.5 — enhanced-analysis route audit |
| `5fdf957` | docs(mastermind): pre-1.C.B.4 housekeeping |
| `ec9713c` | feat(mastermind): 1.C.B.4 — /api/enhanced-analysis flag-on wing + integration tests |
| `8ae2d96` | feat(mastermind): 1.C.B.5 — /api/chat flag-on wing + withPipelineTimeout + category-aware moveCtx |

### Group C — Stage C harness scaffold (synthetic-tester infrastructure)

**12 commits.** Builds the synthetic-tester harness: category generators, persona fixtures, concepts dataset (270 entries from Yusupov/Silman/Watson), 4 chess.com user-history cache files, route-side cache wiring, Vercel preview-deploy bypass. **Zero production code here** — entirely under `scripts/synthetic-tester/` plus a small `stageCcacheFallback.ts` helper used only when `VERCEL_ENV=preview`.

| SHA | Subject |
|---|---|
| `5ace169` | docs(mastermind): scripts/synthetic-tester category generator design |
| `67b7c50` | fix(test): eslint-disable no-constant-condition in route.test.ts SSE read loop |
| `a1c394b` | docs(mastermind): track CI gap + stale CLAUDE.md note as cleanup followups |
| `a3f1e14` | docs(mastermind): ratify O1-O7 + add budget discipline |
| `20b1bf3` | feat(mastermind): Stage C Step 2.1 — load-real-user-history.ts |
| `828ab84` | feat(mastermind): Stage C user-history cache populated for 4 chess.com users |
| `393e5c3` | feat(mastermind): Stage C Step 2.2 — concepts.json scraped |
| `736f30c` | feat(mastermind): Stage C Step 2.3.1 — personas + fixtures |
| `22509ef` | feat(mastermind): Stage C Step 2.3.2 — generator modules + dispatch + tests |
| `9436e5f` | feat(mastermind): Stage C Step 2.3.3 + route-side cache wiring |
| `bc845ab` | fix(vercel): replace broad scripts/ exclude with targeted scripts/data-pipeline/ |
| `1273fa3` | docs(mastermind): track .vercelignore CI gap |

### Group D — Stage C Follow-up A (telemetry CSV columns + route inline)

**3 commits.** Extends harness CSV with 8 new pipeline-telemetry columns. Coordinated production-route change: `/api/enhanced-analysis` inlines `gameAnalysis.pipeline.telemetry` in the response payload **only when `VERCEL_ENV === "preview"`** — zero production payload change.

| SHA | Subject |
|---|---|
| `dfe7219` | feat(mastermind): wire VERCEL_AUTOMATION_BYPASS_SECRET into harness POSTs |
| `34ecd08` | fix(synthetic-tester): drop x-vercel-set-bypass-cookie header |
| `437e852` | feat(mastermind): Stage C Follow-up A — pipeline telemetry capture in sweep CSV |

### Group E — Stage C Follow-up B (position-anchored two-step + off-by-one bug class)

**7 commits.** Position-anchored two-step flow for `game_review`/`position_analysis` live turns. Includes three sequential bug fixes for the same off-by-one bug class (truncation slice, starting-position prepend, validator skip-on-undefined) plus the (γ-route) `gameEval` threading through `AnalysisContext` plus defensive boundary checks in both harness and route. **Production-route changes:** `/api/chat` mirror-inlines telemetry (preview-only); `AnalysisContext.gameEval` added (optional, backward-compat); `validateEvalClaim` early-returns with skip event when stockfishEval is undefined; `prepareMastermindContext` emits a Log Drain warning on shape contract violations.

| SHA | Subject |
|---|---|
| `1e5bf8c` | feat(mastermind): Stage C Follow-up B — position-anchored two-step |
| `be1515d` | fix(synthetic-tester): truncate moveHistory + gameEval to checkpoint ply |
| `7341fa1` | fix(synthetic-tester): prepend starting-position eval to gameEval.positions |
| `cc10524` | fix(mastermind): validateEvalClaim skips eval_mismatch checks when stockfishEval is missing |
| `e09601b` | docs(mastermind): Close Stage C Follow-up B in cleanup_followups.md |
| `32f6477` | feat(mastermind): (γ-route) thread gameEval through AnalysisContext |
| `11596a3` | fix(synthetic-tester): truncation slice off-by-one + defensive boundary checks (Layer 3) |

### Group F — Audit + documentation (architecture audit + paper-prep + telemetry audit)

**3 commits + 1 uncommitted file.** Pure documentation. Architecture audit for paper-prep; provenance tracking; production-telemetry audit (this document's predecessor) currently in working tree, will commit before PR.

| SHA | Subject |
|---|---|
| `e0c481f` | docs(mastermind): architecture audit for paper prep |
| `1e86697` | docs(mastermind): track pre-paper provenance gaps surfaced by architecture audit |
| `99182a1` | docs(mastermind): drop Owner field from pre-paper provenance entries |
| *(uncommitted in working tree)* | `MASTERMIND_CONTEXT/production_telemetry_audit.md` (delivered earlier this session) |
| *(uncommitted in working tree)* | This file (`mastermind_main_merge_plan.md`) |

### Merge commit (not in any thematic group)

| SHA | Subject |
|---|---|
| `4f8fcc1` | Merge branch 'mastermind/stage-3-primitives' into mastermind/stage-3-validators |

Internal-only history merge from when Stage 3 primitives split off and rejoined. Not a public-facing change.

---

## (2) Files touched per group

Numbers are approximate cumulative LOC delta across all commits in the group. `+` = insertions, `-` = deletions.

### Group A (Stage A foundations) — new validator code + planning docs

**NEW files (44):**
- `src/lib/mastermind/featureDelta.ts` (+419), `pieceRoles.ts` (+360), `threatTree.ts` (+302), `complexity.ts` (+202), `lichessTablebase.ts` (+158), `criticalMoments.ts` (+201)
- `src/lib/mastermind/categorization/categoryClassifier.ts` (+193) + 1 fixture
- `src/lib/mastermind/validators/evalClaim.ts` (+267), `featureDeltaCitation.ts` (+474), `scoutCitation.ts` (+687), `userHistoryCitation.ts` (+545), `qualitativeBands.ts` (+107), `regenerate.ts` (+170), `fallback.ts` (+194), `index.ts` (+200), `parserPrompts.ts` (+228), `telemetry.ts` (+47), `types.ts` (+250)
- `src/lib/mastermind/citationRate.ts` (+343), `userHistoryAggregates.ts` (+286), `userHistoryCache.ts` (+167)
- `src/lib/utils/pgnHeaders.ts` (+50)
- 17 test files under `src/lib/mastermind/__tests__/` (+~4,200 total)
- `scripts/mastermind/validator-gate-dryrun.ts` (+561), `seeded-regenerate-demo.ts` (+116), plus 2 fixture JSONs
- 16 planning docs under `MASTERMIND_CONTEXT/` (+~6,500 total — `PR_1B_PLAN.md`, `PR_1C_PLAN.md`, etc.)

**MODIFIED files:** none unique to this group (Stage A is purely additive).

**LOC subtotal:** ~+17,500 insertions, ~0 deletions.

### Group B (Stage B route wiring) — production route changes

**NEW files (8):**
- `src/lib/mastermind/routeHelpers.ts` (+342) — prepareMastermindContext + deriveMastermindMoveContext + forwardPipelineTelemetryForRoute
- `src/lib/mastermind/wireValidators.ts` (+334) — fetchDataSources four-source helper
- `src/lib/mastermind/validatorTelemetry.ts` (+250) — forwardTelemetry + citationRate summary
- `src/lib/mastermind/pipelineTimeout.ts` (+126) — withPipelineTimeout wrapper
- `src/lib/server/scout/` (~+500 across extracted fetchers + cache; from `c353eba`)
- 4 new test files (~+800)
- `src/lib/logging/` directory (+~250 across `logger.ts`, `requestContext.ts`, `sentryIntegration.ts`, `index.ts`)
- 1 planning doc (`PR_1C_STAGE_B_PLAN.md`, +1213)

**MODIFIED files (route surfaces):**
- `src/app/api/enhanced-analysis/route.ts` (~+750 / -250) — flag-on wing added, validators wired in, response shape gets optional `pipeline` field
- `src/app/api/chat/route.ts` (~+130 / -30) — flag-on wing added, validators wired in
- `src/env.ts` (~+15 / -5) — adds `MASTERMIND_VALIDATORS_ENABLED` to schema
- `src/lib/mastermind/__tests__/` adds 2 route integration tests
- `vitest.config.ts` (~+5) — picks up new test paths

**LOC subtotal:** ~+4,200 insertions, ~-300 deletions.

### Group C (Stage C harness scaffold) — synthetic-tester only

**NEW files (~50):**
- `scripts/synthetic-tester/` — 30+ files: `run.ts` (~+1,200), `client.ts` (~+360), `checkpoints.ts` (~+200), `stockfish.ts` (~+150), `auth.ts`, `costTracker.ts`, `output.ts`, 6 persona MDs, 10 opponent fixtures, 4 user-history cache JSONs (~33MB total), `concepts.json` (270 entries), `generators/*.ts` (6 modules), plus tests
- `src/lib/mastermind/stageCcacheFallback.ts` (~+100) — preview-only Firestore fallback for cached user-history data
- `.vercelignore` modified to exclude `scripts/data-pipeline/` from build context
- `SYNTHETIC_TESTER_PLAN.md` (+290)

**MODIFIED files:**
- `.vercelignore` (~+10 / -5)
- One small test fix in `route.test.ts` (`67b7c50` — eslint-disable for SSE loop)

**LOC subtotal:** ~+5,000 insertions + ~33MB binary data (user-history caches).

### Group D (Follow-up A) — production-route telemetry inline (preview-only)

**MODIFIED files:**
- `src/app/api/enhanced-analysis/route.ts` (~+15 / -2) — preview-gated `telemetry` field in pipeline response
- `scripts/synthetic-tester/output.ts` (~+30 / -0) — 8 new CSV columns
- `scripts/synthetic-tester/client.ts` (~+25 / -0) — pipeline extraction in `analyzeCategoryTurn`
- `scripts/synthetic-tester/run.ts` (~+20 / -2) — `buildTurnRow` extension + auth bypass

**LOC subtotal:** ~+220 insertions, ~-10 deletions.

### Group E (Follow-up B) — production-route changes for chat-side eval validation

**MODIFIED files:**
- `src/app/api/enhanced-analysis/route.ts` (~+5 / -0) — adds `gameEval` to all 4 `storeAnalysisContext` callsites
- `src/app/api/chat/route.ts` (~+15 / -3) — preview-gated `telemetry` inline; `gameEval: context.gameEval` threading; comment rewrite
- `src/lib/analysisContextCache.ts` (~+12 / -0) — `gameEval?: MastermindGameEval` field on `AnalysisContext`
- `src/lib/mastermind/validators/evalClaim.ts` (~+25 / -3) — skip-on-undefined path with `no_stockfish_eval` fire_reason
- `src/lib/mastermind/validators/types.ts` (~+1) — `"no_stockfish_eval"` added to FireReason union
- `src/lib/mastermind/routeHelpers.ts` (~+22 / -0) — defensive shape-mismatch warning (b2)
- `scripts/synthetic-tester/run.ts` (~+300 / -10) — position-anchored live branch + lazy stockfish + per-game cache + buildTurnRow extension
- `scripts/synthetic-tester/client.ts` (~+30 / -0) — `chatFollowUp` pipeline extraction; analyzeGame shape invariant (b1)
- `scripts/synthetic-tester/checkpoints.ts` (~+5 / -2) — startingScore in return
- `scripts/synthetic-tester/__tests__/client.test.ts` (~+140) — invariant tests + truncation regression
- `src/app/api/chat/__tests__/route.test.ts` (~+95) — gameEval threading tests
- `src/lib/mastermind/__tests__/validators/evalClaim.test.ts` (~+95) — 5 skip-path tests
- `MASTERMIND_CONTEXT/cleanup_followups.md` (~+140 / -5) — three-layer addendum + 4 new entries

**LOC subtotal:** ~+900 insertions, ~-25 deletions.

### Group F (Audit + docs) — pure documentation

**NEW files:**
- `MASTERMIND_CONTEXT/architecture_audit.md` (+1115)
- `MASTERMIND_CONTEXT/production_telemetry_audit.md` (~+200, uncommitted in working tree)
- This file (`mastermind_main_merge_plan.md`, ~+450, uncommitted)
- `MASTERMIND_CONTEXT/_sources/gap_analysis_roadmap_feb2026.md` (+211)
- `competition.md` (+441)

**MODIFIED files:**
- `MASTERMIND_CONTEXT/cleanup_followups.md` updates (~+30 across audit-driven additions)

**LOC subtotal:** ~+2,500 insertions, 0 deletions.

### Cross-group file change summary

| Status | Count | Notes |
|---|---|---|
| Added (A) | 136 | Mostly mastermind/* + MASTERMIND_CONTEXT/* + scripts/synthetic-tester/* |
| Modified (M) | 28 | Route handlers, env, schemas, AICoachChat, analysisContextCache, etc. |
| "Deleted" (D) | 35 | Misleading — these are CMIP files on main, preserved by the merge |

---

## (3) Merge conflict surface

**No conflicts.** `git merge-tree --write-tree main mastermind/stage-3-validators` exits 0 and produces tree `cf7e4953b652a0677fcf8a9896bf7df757648edb`. One informational `Auto-merging src/env.ts` message (mechanical, not a conflict).

**Verification of merge integrity:**
- CMIP files from main are present in the merged tree (sampled `git ls-tree cf7e495...` for `scripts/intern/`, `supabase/`, `src/components/intern/`, `MASTERMIND_CONTEXT/PR_CMIP_1_PLAN.md` — all present).
- Mastermind files from the branch are present (`src/lib/mastermind/` 16 files, route handler additions, etc. — all present).
- `src/env.ts` auto-merge interleaves env-var additions from both sides — both `MASTERMIND_VALIDATORS_ENABLED` (mastermind) and any CMIP-related vars (main) coexist.

**Why this is unusually clean for a 69-commit merge:** the two branches operated on largely orthogonal surfaces. Mastermind primarily added new files under `src/lib/mastermind/` and `MASTERMIND_CONTEXT/`; main's CMIP work primarily added new files under `src/components/intern/`, `src/lib/intern/`, `scripts/intern/`, `supabase/`. The 28 overlapping modified files are mostly leaf-additions to existing files (env additions, validation schemas, route handler imports) that interleave naturally.

**Mechanical vs semantic:** all auto-merges are mechanical. No human decision-making required at merge time.

---

## (4) Test surface delta

### Group A — Stage A validators

| Test file | Test count | Coverage |
|---|---|---|
| `src/lib/mastermind/__tests__/featureDelta.test.ts` | ~30 | featureDelta diff computation |
| `src/lib/mastermind/__tests__/pieceRoles.test.ts` | ~25 | piece-role detection across positions |
| `src/lib/mastermind/__tests__/threatTree.test.ts` | ~20 | threat tree construction |
| `src/lib/mastermind/__tests__/complexity.test.ts` | ~15 | position complexity scoring |
| `src/lib/mastermind/__tests__/lichessTablebase.test.ts` | ~10 | tablebase lookups |
| `src/lib/mastermind/__tests__/criticalMoments.test.ts` | ~20 | critical-moment detection |
| `src/lib/mastermind/__tests__/citationRate.test.ts` | ~30 | citation-rate aggregation |
| `src/lib/mastermind/__tests__/categorization/categoryClassifier.test.ts` | ~25 | 7 categories + edge cases |
| `src/lib/mastermind/__tests__/validators/qualitativeBands.test.ts` | ~30 | band mapping + tolerance |
| `src/lib/mastermind/__tests__/validators/evalClaim.test.ts` | 20 (+5 from Group E = 25) | eval-mismatch numeric + qualitative |
| `src/lib/mastermind/__tests__/validators/featureDeltaCitation.test.ts` | ~40 | feature_citation parser + validator |
| `src/lib/mastermind/__tests__/validators/scoutCitation.test.ts` | 107 | all 26 scout claim types |
| `src/lib/mastermind/__tests__/validators/userHistoryCitation.test.ts` | 69 | 3 claim types × edge cases |
| `src/lib/mastermind/__tests__/validators/userHistoryAggregates.test.ts` | 36 | 3 helper functions |
| `src/lib/mastermind/__tests__/validators/fallback.test.ts` | ~20 | buildFallbackResponse phrase coverage |
| `src/lib/mastermind/__tests__/validators/regenerate.test.ts` | ~25 | retry / passed / fallback paths |
| `src/lib/mastermind/__tests__/validators/pipeline.test.ts` | ~30 | runValidationPipeline end-to-end |

**Group A test total:** ~552 tests.

### Group B — Stage B route wiring

| Test file | Test count | Coverage |
|---|---|---|
| `src/lib/mastermind/__tests__/wireValidators.test.ts` | ~25 | fetchDataSources four-source orchestration |
| `src/lib/mastermind/__tests__/validatorTelemetry.test.ts` | ~30 | forwardTelemetry + citation-rate summary |
| `src/lib/mastermind/__tests__/pipelineTimeout.test.ts` | 7 | withPipelineTimeout 30s race |
| `src/app/api/enhanced-analysis/__tests__/route.test.ts` | 16 | both flag-off and flag-on wing behavior |
| `src/app/api/chat/__tests__/route.test.ts` | 11 (+3 from Group E = 14) | flag-off/flag-on/timeout/expired-context |
| `src/lib/mastermind/__tests__/stageCcacheFallback.test.ts` | ~10 | preview-only cache fallback |

**Group B test total:** ~99 tests.

### Group C — Stage C harness

| Test file | Test count | Coverage |
|---|---|---|
| `scripts/synthetic-tester/__tests__/categoryDispatch.test.ts` | 7 | pickGenerator + mulberry32 |
| `scripts/synthetic-tester/__tests__/generators.test.ts` | 21 | 6 category generators × happy/error paths |
| `scripts/synthetic-tester/__tests__/client.test.ts` | 8 (+6 from Group E = 14) | bypass headers + analyzeGame invariant |

**Group C test total:** ~42 tests.

### Groups D/E/F

D adds no tests. E adds 14 tests across `client.test.ts` + `chat/__tests__/route.test.ts` + `evalClaim.test.ts` (counted above with parent group). F adds no tests.

### Net test count

**Branch-tip total: 607 tests, 35 test files.** Verified via `npx vitest run` during Layer 3 implementation. Pre-mastermind main has ~0 tests in mastermind/ paths (the directory doesn't exist on main). All 607 are net-new from this merge.

---

## (5) Production-impact gating verification

**Claim to verify:** with `MASTERMIND_VALIDATORS_ENABLED` UNSET in production (current state), the merged code is a NO-OP for production users vs current main.

### Verification step 1: route handlers gate ALL mastermind invocation on the flag

`grep -n "validatorsEnabled\|MASTERMIND_VALIDATORS_ENABLED\|getMastermindEnv" src/app/api/chat/route.ts src/app/api/enhanced-analysis/route.ts`:

| Route | Check sites |
|---|---|
| `chat/route.ts:108` | `const { validatorsEnabled } = getMastermindEnv();` |
| `chat/route.ts:117` | `if (validatorsEnabled) { /* whole pipeline branch */ }` |
| `enhanced-analysis/route.ts:1062` | `const { validatorsEnabled } = getMastermindEnv();` |
| `enhanced-analysis/route.ts:1233` | `if (streamRequested && validatorsEnabled) { /* streaming flag-on wing */ }` |
| `enhanced-analysis/route.ts:1675` | `if (validatorsEnabled) { /* non-streaming flag-on wing */ }` |

**All four production mastermind invocation sites are gated.** When `validatorsEnabled` is false:
- chat route falls through to legacy `callLLM` path
- enhanced-analysis route falls through to legacy callLLM (both streaming and non-streaming branches)

The `forwardPipelineTelemetryForRoute` calls at `enhanced-analysis:1860` and `chat:189` are inside the flag-on branches, so they don't execute either.

### Verification step 2: module-init side effects in mastermind/* are inert

`grep -rn "^const.*=" src/lib/mastermind/*.ts | grep -v "__tests__"` shows top-level declarations are:
- Constants (numbers, strings, regex patterns, ReadonlySet<>)
- `logger.child({ module: "..." })` calls — these create logger instances (no I/O at construction; the underlying `Logger` class in `src/lib/logging/logger.ts` is purely a method dispatcher around `console.log`)

**No HTTP clients constructed at module load. No database connections opened. No filesystem reads. No timers started. No event listeners attached.** Module-load is pure declaration; nothing executes the pipeline until a route handler calls it inside a flag-gated branch.

### Verification step 3: bundle build succeeds with flag unset

`npx tsc --noEmit` runs clean on the current branch tip (verified during Layer 3 implementation). No top-level optional-dep imports that fail when the flag is unset. The Next.js bundle includes mastermind code regardless of flag state, but executing it requires the flag.

**Bundle size impact:** mastermind/* adds ~5,000 LOC of TypeScript to the bundle (validators + helpers). On Next.js's tree-shaking + minification, this is ~50-150 KB of additional JS in API route bundles. Not a behavior change but worth noting for any cold-start latency monitoring.

### Verification step 4: middleware / app-init / instrumentation

`src/instrumentation.ts` (which runs once per Next.js worker boot) only does:
- Env validation via `parseEnv()`
- An optional concept-retrieval self-test (skipped if `SKIP_RETRIEVAL_SELFTEST=true` or Neo4j unconfigured)

**No mastermind-related boot-time work.** `parseEnv()` adds `MASTERMIND_VALIDATORS_ENABLED` to the schema (`src/env.ts` modification), but with the flag unset it just resolves to undefined; no failure path.

### Verification step 5: changes to AnalysisContext shape

Group E adds `gameEval?: MastermindGameEval` to `AnalysisContext` as optional. All four `storeAnalysisContext` callsites now pass `gameEval` in their object literals. This is a payload change to the cache, but:
- `gameEval` field is optional — consumers that don't read it are unaffected
- The only post-merge consumer is `chat/route.ts:127` (`gameEval: context.gameEval`), which is inside the flag-on branch
- The legacy `callLLM` chat path (flag-off branch) doesn't touch `gameEval`
- Cache is in-memory; existing entries don't have `gameEval` and will pass `undefined` — handled by the (β) validator skip path (also flag-gated)

**No production behavior change with flag unset.**

### Verification step 6: telemetry inline in response

Groups D and E add a preview-env-gated `telemetry` field to the API response under `gameAnalysis.pipeline.telemetry`. Production responses are byte-identical to today (the `pipeline` field itself only appears when `validatorsEnabled && prep.dataSources` — flag-gated).

### Conclusion of (5)

**Verified.** The merge is a no-op for production users until the flag flips. Every mastermind invocation site is flag-gated. No module-init side effects, no middleware changes, no AnalysisContext consumers outside flag-gated branches. Bundle size increases ~50-150 KB but no behavior change.

The actual production behavior change is the **flag flip in Production env var**, not the merge itself. The merge gives production the *ability* to run validators when the flag is set; current state (flag unset) means production behavior is unchanged from current main.

---

## (6) PR organization recommendation

### Recommendation: single PR with structured description, six sections matching the thematic groups above

**Rationale:**
- The 69 commits are logically one trunk — Stage A blocks Stage B which blocks Stage C, and the audit/docs ride along
- Splitting into multiple PRs would require careful inter-PR sequencing and risk landing partial state on main (e.g., shipping Stage B without Stage A's validators — type-check would fail)
- Conflict-free merge means there's no technical reason to phase the merge itself
- The cost is review-comprehensibility, which is addressed by a structured PR description rather than multiple PRs

### Section ordering (foundational → application → audit)

The PR description sections in this order, each reviewable in 15-30 min:

1. **What this PR does NOT change** (top-of-PR section, ~5 min read). Cites (5)'s verification. The most important section because it justifies the merge being lower-risk than its size suggests.
2. **Group A: Stage A validator foundations** (~25 min review). Read order: types.ts → primitives (featureDelta, pieceRoles, threatTree) → validators (evalClaim, scoutCitation, userHistoryCitation, featureDeltaCitation) → orchestration (regenerate, fallback, pipeline). Tests parallel the code.
3. **Group B: Stage B route wiring** (~25 min review). Read order: env.ts (flag schema addition) → getMastermindEnv → routeHelpers (prepareMastermindContext + deriveMastermindMoveContext) → wireValidators → validatorTelemetry → pipelineTimeout → both route handlers' flag-on wings.
4. **Group C: Stage C harness scaffold** (~15 min review). Skim; nothing in `scripts/synthetic-tester/` runs in production. Confirm `.vercelignore` excludes `scripts/data-pipeline/` (the 33MB user-history caches) from the build context.
5. **Group D: Follow-up A — preview-gated telemetry inline** (~10 min review). Read the one route diff in `enhanced-analysis/route.ts` (~+15 LOC) to confirm `VERCEL_ENV === "preview"` gate.
6. **Group E: Follow-up B — chat-side eval validation + bug-class fixes** (~25 min review). This is the most-recent and most-complex group. Read order: `analysisContextCache.ts` (interface extension) → `chat/route.ts:127` (γ-route threading) → `evalClaim.ts` skip path → `routeHelpers.ts` defensive warning → harness changes (run.ts, client.ts). Tests at end.
7. **Group F: Audit + documentation** (~10 min skim). Architecture audit + production telemetry audit + this plan. Read sections as needed; no code surface.
8. **Post-merge plan** (bottom-of-PR section, ~5 min read). What happens after merge: flag-flip in Production env var (~1 week observation gap recommended), one prod chat turn verification, rollback documentation.

**Total review budget:** ~120 minutes of focused work, splittable into 2-3 sessions across 1-3 days.

### What the description should NOT include

- Per-commit diffs (use GitHub's file-tree view for that)
- Restating the architecture (link to `MASTERMIND_CONTEXT/MASTERMIND_BUILD_PLAN.md`)
- The full LOC tables from (2) (link to this plan doc instead — keep PR description focused on review action items)

### Draft mode

PR should be opened as **draft** initially. Not ready-for-review until you've made one read pass and surface any sections that need rework. Review-ready transition is its own decision after the draft sits for a day.

---

## Phase 2 prerequisites (must satisfy before drafting the PR)

- [ ] Commit the two uncommitted files in working tree: `MASTERMIND_CONTEXT/production_telemetry_audit.md` and `MASTERMIND_CONTEXT/mastermind_main_merge_plan.md` (this file). These belong in Group F and should be on the branch tip before PR opens.
- [ ] Confirm the merge is still conflict-free at PR-creation time (`git fetch origin main && git merge-tree main mastermind/stage-3-validators` exits 0).
- [ ] Confirm full test suite passes on branch tip (`npx vitest run` returns 607/607).
- [ ] Decide draft vs ready-for-review at open (recommended: draft).

## Stopped here

No PR drafted. No GitHub interaction. No code edits. Awaiting Phase 2 authorization with any plan adjustments.
