# PR_STAGE9_ASYNC_GROUNDING_PLAN.md

**Status:** Draft, awaiting review
**Drafted:** 2026-06-06
**Supersedes:** the "Sync-snapshot tradeoff (intentional)" deferral in PR #136
**Estimated scope:** ~600 LOC src + ~400 LOC tests, 4-7 days

## Goal

Promote the four Stage 9 claim-class validators (`userVisibility`, `mateInN`, `materialWin`, `positionalClaim`) from **degraded sync-snapshot mode** to **fully-armed async-snapshot mode** by plumbing chessdb / Lc0 / Maia / Syzygy fetches into the per-move pipeline call sites in `src/app/api/enhanced-analysis/route.ts`.

## Why now — the accuracy lever

PR #136 shipped the four validators against `buildSyncVoterSnapshot`, where `maiaProb = null`, `lc0Cp = null`, `syzygyDtm = null`. Effect today:

- `userVisibility` — **fully no-ops** (no Maia probability → can't enforce "don't say obvious")
- `positionalClaim` — runs but **never escalates `warn → error`** (no Lc0 veto detectable)
- `mateInN` — runs against `sfMate` only; **distance-off-DTM check never fires** (no Syzygy)
- `materialWin` — runs normally (uses `sfCp`, which the sync snapshot has)

So 3 of 4 validators are catching ~30% of what they're designed to catch. Plumbing async grounding flips them from "label-only" to "actually enforcing."

## Current state — what already exists

Async grounding is **already wired** in route.ts for the **game-review-per-mistake path** (lines 562-606 + 714-725):

```ts
const cdbResults = await Promise.all(topMistakes.map((m) => queryChessdb(m.fenBefore).catch(() => null)));
const lc0Results = await Promise.all(/* shouldCallLc0 + queryLc0 */);
const maiaResults = await Promise.all(/* shouldCallMaia + queryMaiaAtRating */);
// → compileVoterResult({ chessdbResult, lc0Result, maiaResult, ... })
```

`buildAsyncVoterSnapshot` already ships in `voterSnapshot.ts`. It takes pre-fetched results and produces a fully-populated `VoterSnapshot`. The puzzle piece is **calling it at the 6 per-move Stage 9 sites** instead of `buildSyncVoterSnapshot`.

## Proposed work

### 1. New helper: `buildAsyncSnapshotForMove(ctx)` in `voterSnapshot.ts`

```ts
async function buildAsyncSnapshotForMove(ctx: {
  fenBefore: string;
  moveSan: string;
  stockfishEvalCp: number | null;
  stockfishBestMoveMate: number | null;
  stockfishLines: PreparedLine[];  // for shouldCallLc0 gating
  userRating: number | null;
  signal?: AbortSignal;
}): Promise<VoterSnapshot>
```

Runs the three fetches in parallel via `Promise.allSettled`, gates Lc0/Maia via existing `shouldCallLc0` / `shouldCallMaia`, returns whichever subset succeeded. Each fetch wrapped in `.catch(() => null)` so one slow service can't kill the snapshot.

### 2. Replace `buildSyncVoterSnapshot` at 6 call sites in route.ts

Lines: 1590, 1695, 1832, 2058, 2180, 2253.

Replacement pattern at each site:

```ts
const stage9Snap = prep.moveCtx.moveSan && prep.moveCtx.fenBefore
  ? await buildAsyncSnapshotForMove({  // ← was: buildSyncVoterSnapshot
      fenBefore: prep.moveCtx.fenBefore,
      moveSan: prep.moveCtx.moveSan,
      stockfishEvalCp: prep.moveCtx.stockfishEval.cp ?? null,
      stockfishBestMoveMate: prep.moveCtx.stockfishEval.mate ?? null,
      stockfishLines: prep.moveCtx.stockfishEval.lines ?? [],
      userRating: userRating ?? null,
      signal: ctx.signal,
    })
  : undefined;
```

Critical: the `await` runs **before** `withPipelineTimeout(...)` — the network fetches must not eat the pipeline's regenerate budget. Each call site already has the surrounding scope to support this.

### 3. Keep `buildSyncVoterSnapshot` as a fallback escape hatch

Don't delete it. Routes that hit timeout pressure (Vercel 60s wall) can fall back to sync. Mark it deprecated-for-new-callsites in the JSDoc.

### 4. Request-scoped result cache

`queryChessdb`, `queryLc0`, `queryMaiaAtRating` each have module-scoped TTL caches today. The game-review path and the Stage 9 per-move path may hit the **same FEN twice within one request**. Wrap the three queries in a per-request `Map<fen, Promise<T | null>>` so concurrent callers within a single request share one fetch. ~30 LOC.

### 5. Telemetry

Emit one `stage9_async_grounding_fetched` event per Stage 9 snapshot build:

```ts
{
  fen, move_san, correlation_id,
  chessdb_status: "ok" | "fail" | "skipped",
  lc0_status: "ok" | "fail" | "skipped",  // skipped = shouldCallLc0 false
  maia_status: "ok" | "fail" | "skipped",
  total_fetch_ms: number,
}
```

Drives the dashboard for "how often is each source actually arming the validators in prod."

## Risks + mitigations

| Risk | Mitigation |
|------|-----------|
| Pre-pipeline fetch budget can hit ~8s (Lc0 worst case) — eats into Vercel 60s wall | Parallel fetches, `Promise.allSettled` with per-source AbortSignal + 6s/8s timeouts already in client modules; total pre-pipeline ceiling = max(timeouts), not sum |
| Lc0 service (HuggingFace Spaces) flakes / 503s frequently | Fail-open: `.catch(() => null)` → `lc0Cp = null` → validators degrade to sync-snapshot behavior for that position. No user-visible failure. |
| Maia service down → userVisibility doesn't fire on positions where it should | Same fail-open. Telemetry surfaces the dropout rate. Acceptable for v2. |
| chessdb response is slow (3-6s p95) | Already-acceptable in game-review path; reuse same envelope. No new risk. |
| Per-move ad-hoc analysis (user asks about a single position) now eats fetch latency that previously was zero | This is the cost of accuracy. ~4-8s extra TTFB for the validation pass. **Open Q3 below.** |
| `shouldCallLc0` / `shouldCallMaia` gating may be too conservative for ad-hoc per-move queries | **Open Q4 below.** Plan: ship with current gating, measure dropout, relax in follow-up if userVisibility never fires. |

## Open questions for review

**Aayan (chess/coaching):** Q3, Q4, Q5
**Tech-lead (architecture/scope/cost):** Q1, Q2, Q6, Q7

### Q1 — Total pre-pipeline latency ceiling

Current per-source timeouts: chessdb 6s, Lc0 8s, Maia 6s. Parallel `Promise.allSettled` → pre-pipeline ceiling ~8s. Is this OK on top of the existing pipeline budget (10-50s depending on category)?

**Recommendation:** Yes, accept the 8s ceiling for v2. Pre-pipeline ≤ 8s + game-review category timeout 50s = 58s, still under Vercel 60s wall. For the per-move category (timeout 15s) the headroom is tighter (8 + 15 = 23s) — also fine.

### Q2 — Request-scoped cache layer

Wrap `queryChessdb`/`queryLc0`/`queryMaiaAtRating` in a per-request `Map<fen, Promise>` to coalesce repeat fetches between Stage 9 and game-review paths. ~30 LOC. Worth it?

**Recommendation:** Ship it. Hot path is "user analyzes a 40-move game, asks a follow-up about move 22" — Stage 9 at move 22 hits the same fen the game-review summary already fetched. Without coalescing we double-pay.

### Q3 — Per-move ad-hoc latency tradeoff

Ad-hoc per-move queries (single position the user clicks on) currently TTFB ≈ 200ms before LLM. Async grounding adds up to 8s before any token streams.

**Options:**
- **A.** Run grounding parallel to LLM call — stream tokens immediately, run validators against the snapshot when it's ready, retry on fire. Adds streaming-rewrite complexity.
- **B.** Block on grounding before first token. +8s TTFB on first ad-hoc query, cached for follow-ups.
- **C.** Hybrid: fast tier (Haiku follow-ups in puzzle coach, snap chat) uses sync; flagship tier (game review, first puzzle explanation) uses async.

**Recommendation:** C. Async grounding only matters when the LLM has tokens to overclaim with — flagship 600-token responses, not Haiku 150-token follow-ups. Cleanly maps to the existing tier split.

### Q4 — `shouldCallLc0` gating for ad-hoc queries

Today `shouldCallLc0` requires `|sfEval| ≤ 100`. For per-move ad-hoc queries (user explicitly asked about this position), should we call Lc0 unconditionally, even if SF says +500cp?

**Recommendation:** Keep current gating. Lc0 adds little signal when SF is already confident; the budget is better spent elsewhere. Revisit if dashboard shows positionalClaim escalation never firing in prod.

### Q5 — `shouldCallMaia` and missing `userRating`

`userVisibility` requires both Maia + userRating. If the user has no rating set, the validator no-ops entirely.

**Options:**
- **A.** No-op as today.
- **B.** Pull rating from `user_history` aggregates (already pre-fetched per route.ts) — most users have rated games even without setting an explicit rating.
- **C.** Default to 1500 (avg Lichess) when missing.

**Recommendation:** B. We already have the data; the inferred rating is more accurate than C. ~10 LOC.

### Q6 — Stage 7 Lc0 design tension (carry-over)

Per memory `project_stage7_lc0_design_tension`: `shouldCallLc0(|SF|≤100)` triggers Lc0; the upgrade path requires `both ≥150`. These ranges don't overlap → upgrade-to-error in `positionalClaim` is unreachable even with async snapshot.

**Recommendation:** Resolve in a separate decision before this PR ships. Either widen `shouldCallLc0` to `|SF|≤200` (still avoids needless calls on lopsided positions) or narrow the upgrade threshold to `≥100`. Otherwise the async snapshot doesn't unlock the escalation path it's supposed to.

### Q7 — Fail-policy escalation on full grounding outage

What if **all three** sources fail simultaneously (HuggingFace down + chessdb DDoS + Maia unreachable)? Snapshot equivalent to sync. Validators degrade gracefully but the user is shown an unenforced response.

**Options:**
- **A.** Continue silently (current fail-open).
- **B.** Surface a one-line disclaimer in the response: "Grounding sources unavailable — coach is in best-effort mode."
- **C.** Refuse to ship the response.

**Recommendation:** A. Silent degradation. B leaks infra problems to users; C makes a flaky vendor (Lc0) into a hard user-facing outage. Telemetry catches it; ops handles it.

## Test plan

- [ ] `tsc --noEmit` clean
- [ ] `vitest run` for `voterSnapshot.test.ts` (extended for buildAsyncSnapshotForMove)
- [ ] New test: all 3 sources succeed → snapshot has populated maiaProb/lc0Cp/syzygyDtm
- [ ] New test: chessdb fails → snapshot ships with chessdbResult=null, other fields populated
- [ ] New test: Lc0 unconfigured → snapshot ships with lc0Cp=null, no fetch attempt
- [ ] New test: Maia times out → snapshot ships, maiaProb=null
- [ ] New test: request-scoped cache coalesces 2 concurrent calls with same FEN
- [ ] New test: telemetry event emitted with correct per-source status
- [ ] Pipeline preservation: PR #121 + PR #136 tests still pass (`pipelineStage9.test.ts`, `streamingGroundingValidation.test.ts`)
- [ ] Local: analyze a balanced position where SF says +0.4; confirm Lc0 fetched, snapshot populated, `positionalClaim` upgraded `warn → error` if model overclaims
- [ ] Local: confirm sub-1200 user analysis triggers Maia fetch + `userVisibility` fires on dismissive language
- [ ] Vercel preview: confirm full-game-review request stays under 50s timeout with async grounding active

## Followups (out of scope for this PR)

- **Q2 game-review enforcement (per-claim position anchoring)** — once async snapshot is the default per-move, game-review prose enforcement via `voterSnapshotsByMove: Map<halfMoveIdx, VoterSnapshot>` becomes feasible. Tracked in PR #136 PR body.
- **Severity-aware retry policy (Q1 Option C from PR #136 review)** — once the upgrade-to-error paths actually fire (positionalClaim, mateInN), revisit the retry-vs-fallback policy. Currently `passed: issues.length === 0` treats warn and error identically; should become `passed: errors.length === 0` with warn → retry, error → fallback.
- **Lc0 service deployment hardening** — HuggingFace Spaces flake rate is a measured concern. Separate workstream.
- **Maia `/predict_at_rating` endpoint redeploy** — separate workstream.
- **GCC-Eval + ChessQA quarterly re-baseline** — measure async-grounding's impact on the benchmarks vs sync baseline.

## Out of scope

- Game-review per-claim anchoring (separate plan; see PR #136 PR body Q2)
- Severity-aware retry gating (separate; see Followups)
- Claim-class validator coverage expansion (e.g., new categories) — separate plan
- Lc0 / Maia service uptime work — separate workstreams
