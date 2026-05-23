# Mastermind cleanup follow-ups

Non-blocking cleanups that are surfaced during Mastermind PR work but kept out of the PR's scope to maintain plan-first discipline. Each entry is independent — can be picked up as its own small PR whenever Aayan signals.

**Format:** one entry per cleanup, dated to when it was first flagged. Drop entries from the file once they ship.

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
