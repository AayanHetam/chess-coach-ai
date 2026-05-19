# PR 1.C Stage A.7 — `userHistoryAggregates.ts` plan

**Branch:** `mastermind/stage-3-validators` (continues PR 1.C).

**Status:** plan-first per [feedback_mastermind_plan_first.md](../../memory/feedback_mastermind_plan_first.md). **No code yet.** Pause after this plan section for Aayan review.

**Why this exists:** Stage A.7 of the reopened Stage A sequence. `userHistoryAggregates` is a pure-function helper module that produces the data shapes Stage A.8's `userHistoryCitation` validator cross-checks against. Helper-only — no validator logic, no LLM, no parser. Patterns from PR 1.B + Stage A.6 are well-established; this plan section is shorter than the scoutCitation plan because the surface is much narrower.

---

## 0. Goal

Three pure functions over `Game[]` that produce the data structures `userHistoryCitation` (Stage A.8) consumes:

| Function | Produces | Consumed by claim type (A.8) |
|---|---|---|
| `aggregateWinRateByTimeControl(games, userName)` | `TimeControlPerformance[]` | `time_control_performance` |
| `aggregateScoreByOpening(games, userName, color?)` | `OpeningRepertoirePerformance[]` | `opening_repertoire_performance` |
| `countGamesInDateRange(games, fromMs, toMs)` | `GameCountInRange` | `hours_played_claim` |

**Hard requirement (per Aayan 2026-05-18):** read from the existing Firestore `users/{uid}/games` shape without requiring new collections or schema migrations. The `Game` type at [src/types/game.ts](../src/types/game.ts) is the authoritative input; the route handler that calls the aggregators reads from the existing `/api/games` endpoint via Firebase Admin (per the auth model in [CLAUDE.md](../CLAUDE.md)).

**Out of scope (deferred to PR 1.E):** `rating_trajectory`, `puzzle_stats_claim`, `puzzle_rating_trajectory`. These three claim types depend on `puzzleStatsAtom` (localStorage), which the server can't read until PR 1.E ships the `POST /api/puzzle-stats` sync precursor per [PR_1C_PLAN.md §11.6](PR_1C_PLAN.md). **Do not include them in A.7.**

---

## 1. Data source — `Game` type (verified during audit)

The Firestore `users/{uid}/games` subcollection stores objects matching [`Game`](../src/types/game.ts) (with the optional `createdAt`/`updatedAt` Firestore timestamp fields added by the server-side write path):

```typescript
interface Game {
  id: number;
  pgn: string;
  event?: string;
  site?: string;
  date?: string;        // PGN "Date" header — string format YYYY.MM.DD typically
  round?: string;
  white: Player;        // { name, rating?, avatarUrl? }
  black: Player;
  result?: string;      // "1-0" | "0-1" | "1/2-1/2" | "*" — same as ScoutGame
  eval?: GameEval;
  termination?: string;
  timeControl?: string; // PGN "TimeControl" header — e.g. "300+5", "600", "rapid", etc.
}
```

`Player.name` is what the aggregators match against `userName` to determine which side the user played in each game. **No PGN parsing required for time-control + date aggregation** — both come straight from the Game's own fields. **PGN parsing IS required for opening aggregation** — we need the `ECO` and `Opening` headers from the PGN body.

**A note on `userName` matching.** The user's "name" in a game is whatever was in the PGN headers when the game was imported (Lichess username, Chess.com username, or a manually-set name). Aggregators do case-insensitive substring match between `userName` and `white.name` / `black.name`. Single-identifier MVP — the user supplies their primary identifier; cross-platform identity reconciliation (Lichess + Chess.com aliases) is out of scope here.

**Date handling.** `createdAt` (Firestore-server-set timestamp) is the most reliable date field — it's an absolute server timestamp, not the PGN `date` string which may be missing or malformed. The aggregator prefers `createdAt` when present; falls back to parsing `date` only when `createdAt` is missing. Both produce milliseconds-since-epoch for the date-range comparison.

---

## 2. Function specifications

### 2.1 `aggregateWinRateByTimeControl(games, userName)`

```typescript
export interface TimeControlPerformance {
  /** Verbatim timeControl string from the game record. Bucketed by exact match. */
  timeControl: string;
  totalGames: number;
  wins: number;
  draws: number;
  losses: number;
  /** 0–100. (wins + 0.5 * draws) / totalGames × 100. */
  scorePct: number;
}

export function aggregateWinRateByTimeControl(
  games: Game[],
  userName: string
): TimeControlPerformance[];
```

**Behavior:**
1. For each game in `games`, determine the user's color:
   - If `white.name` matches `userName` (case-insensitive substring) → user is white.
   - Else if `black.name` matches → user is black.
   - Else → skip the game (user wasn't a player).
2. Determine outcome from user's perspective: result `1-0` + user-is-white → win; `0-1` + user-is-white → loss; `1/2-1/2` → draw; result `*` (unfinished) → skip.
3. Bucket by `timeControl` string (verbatim — no normalization across "300+5" vs "rapid"; Stage A.8's validator handles the bucket-name match through its parser).
4. Skip games with `timeControl === undefined` (un-buckable).
5. Compute `scorePct = (wins + 0.5 × draws) / totalGames × 100`.
6. Return one `TimeControlPerformance` per bucket, sorted by `totalGames` descending.

**Edge cases:**
- `userName === ""` → return `[]` (no perspective, no aggregation possible).
- Empty games → return `[]`.
- All games skipped (user matches no `Player.name`) → return `[]`.

### 2.2 `aggregateScoreByOpening(games, userName, color?)`

```typescript
export interface OpeningRepertoirePerformance {
  /** From the PGN "ECO" header, uppercased. Empty string when ECO absent. */
  eco: string;
  /** From the PGN "Opening" header. */
  opening: string;
  /** From the PGN "Variation" header, optional. */
  variation?: string;
  /** Which color the user played in these games. */
  color: "white" | "black";
  totalGames: number;
  wins: number;
  draws: number;
  losses: number;
  scorePct: number;
}

export function aggregateScoreByOpening(
  games: Game[],
  userName: string,
  color?: "white" | "black"
): OpeningRepertoirePerformance[];
```

**Behavior:**
1. Per-game user-color detection same as §2.1.
2. If `color` is supplied, filter to games where the user played that color.
3. For each game: parse PGN headers to extract `ECO`, `Opening`, `Variation`. Skip the game if neither ECO nor Opening is present (un-buckable).
4. Bucket key = `${eco}:${opening}:${variation ?? ''}:${color}` (color in the key so the same opening played as both colors yields two separate entries — coaching-relevant: "your repertoire as White vs as Black").
5. Compute outcome + scorePct same as §2.1.
6. Return one entry per bucket, sorted by `totalGames` descending.

**PGN parsing:** use a simple regex over the PGN string's header block — `/^\[(\w+)\s+"([^"]*)"\]/gm`. Three headers extracted: `ECO`, `Opening`, `Variation`. No need to evaluate moves — the headers are sufficient. If the existing repo has a PGN-headers utility, reuse it; otherwise implement inline (~30 LOC). **Plan note:** a quick `grep -r "PGN" src/lib/ | grep -i header` during implementation will surface any existing helper; if found, reuse. If not, inline. Document the choice in the commit message.

**Edge cases:**
- Game has PGN body but no ECO/Opening headers (rare but possible) → skip the game silently.
- Game has ECO but no Opening name → bucket key uses ECO + empty opening string.
- Empty games → return `[]`.

### 2.3 `countGamesInDateRange(games, fromMs, toMs)`

```typescript
export interface GameCountInRange {
  count: number;
  fromMs: number;
  toMs: number;
  /** Games that lacked a usable date and were excluded from the count. */
  skippedNoDate: number;
}

export function countGamesInDateRange(
  games: Game[],
  fromMs: number,
  toMs: number
): GameCountInRange;
```

**Behavior:**
1. For each game, derive `gameDateMs`:
   - Prefer `game.createdAt` (Firestore timestamp) if present. Handle both shapes: `{ _seconds, _nanoseconds }` (Firestore Admin response) and raw `number` (already converted). Convert to ms.
   - Else parse `game.date` (PGN "Date" string, "YYYY.MM.DD" format). If parse fails or date is "????.??.??", treat as missing.
2. If `gameDateMs` is missing → increment `skippedNoDate`, do not include in `count`.
3. If `fromMs ≤ gameDateMs ≤ toMs` → increment `count`.
4. Return `{ count, fromMs, toMs, skippedNoDate }`.

**No userName parameter** — the aggregator counts any game in the input list, regardless of who played. The caller is responsible for passing the user's games (which is what `/api/games` returns under session auth). Date-range claims are typically "you played X games this month" — perspective doesn't matter, only that the game is the user's.

**Edge cases:**
- `fromMs > toMs` → return `{ count: 0, fromMs, toMs, skippedNoDate: 0 }`. Don't throw; the validator will surface the inversion if needed.
- All games skipped (no dates) → `count: 0, skippedNoDate: games.length`.

---

## 3. Test fixture outline

Vitest at `src/lib/mastermind/__tests__/validators/userHistoryAggregates.test.ts`. Pure-function tests; no mocks, no async, no I/O. Faster than the scoutCitation suite.

### 3.1 `aggregateWinRateByTimeControl`

| Case | What it asserts |
|---|---|
| Empty games → empty result | `[]` |
| Empty userName → empty result | `[]` |
| User played white + won 1-0 | One bucket with 1 win |
| User played black + opponent won 1-0 | One bucket with 1 loss |
| User played black + black won 0-1 | One bucket with 1 win |
| Draw 1/2-1/2 | counted as draw |
| Result `*` (unfinished) → skipped | bucket not created |
| `timeControl` missing → skipped | bucket not created |
| User matches neither side → game skipped | not counted |
| Case-insensitive name match | "Aayan" matches "aayan" |
| Substring name match | "Aayan" matches "Aayan_K" |
| Multiple time controls → multiple buckets | sorted by totalGames desc |
| scorePct math: 5W 2D 3L → 60% | `(5 + 1) / 10 × 100 = 60` |

### 3.2 `aggregateScoreByOpening`

| Case | What it asserts |
|---|---|
| Empty games → empty result | `[]` |
| PGN with ECO + Opening + Variation parsed | bucket key has all three |
| PGN with ECO only → bucket with empty opening | key uses ECO + "" |
| PGN with no ECO and no Opening → game skipped | not in any bucket |
| User plays same opening as both colors → two buckets | one per color |
| `color` filter restricts to user-played-color games | other-color games excluded |
| Sorted by totalGames descending | top opening first |
| scorePct math same shape as time-control | verified |
| Case-insensitive userName match | works |

### 3.3 `countGamesInDateRange`

| Case | What it asserts |
|---|---|
| `createdAt` as Firestore-shape `{_seconds, _nanoseconds}` parsed | counts correctly |
| `createdAt` as raw number (already-ms) parsed | counts correctly |
| Falls back to `date` PGN string when `createdAt` missing | counts |
| `date` = "????.??.??" → skipped | skippedNoDate increments |
| `date` parse failure → skipped | skippedNoDate increments |
| Game outside range → not counted | excluded |
| Game at exactly `fromMs` boundary → counted | inclusive lower bound |
| Game at exactly `toMs` boundary → counted | inclusive upper bound |
| `fromMs > toMs` → returns zero count, no throw | no error |
| All games missing dates → count: 0, skippedNoDate: N | returns correct skip count |

### 3.4 Test count estimate

- `aggregateWinRateByTimeControl`: ~13 tests
- `aggregateScoreByOpening`: ~9 tests
- `countGamesInDateRange`: ~10 tests
- **Total ~32 tests.** Plan §6.3 said ~140 test LOC; with 32 tests at ~7-10 LOC each, this is ~250-300 test LOC — slightly above the original ~140 estimate but matches the realistic test-density pattern from scoutCitation.

---

## 4. File scope + LOC estimate

| File | New / Modified | LOC est |
|---|---|---|
| `src/lib/mastermind/userHistoryAggregates.ts` | New (lives outside `validators/` — it's a helper, not a validator) | ~250 |
| `src/lib/mastermind/__tests__/validators/userHistoryAggregates.test.ts` | New | ~300 |
| **Total** | | **~250 lib + ~300 test = ~550 LOC** |

Roughly aligned with PR_1C_PLAN.md §2.5.1's original `userHistoryAggregates.ts` ~140 lib + ~140 test estimate. The slight overshoot reflects realistic test density + the PGN-header parsing inline if no existing utility is found. Per Aayan's "LOC is a budget, not a target" — variance acceptable.

**Placement decision:** `src/lib/mastermind/userHistoryAggregates.ts`, NOT `src/lib/mastermind/validators/userHistoryAggregates.ts`. Rationale: this is a pure data-aggregation helper that the `userHistoryCitation` validator imports. It doesn't fit the validator schema (no parser, no LLM, no `ValidatorResult` return). Keeping it outside `validators/` makes the directory boundaries cleaner. The validator will import via:

```typescript
import {
  aggregateWinRateByTimeControl,
  aggregateScoreByOpening,
  countGamesInDateRange,
} from "@/lib/mastermind/userHistoryAggregates";
```

Open question for tech-lead review (§6 below).

---

## 5. Acceptance gate

- `npx tsc --noEmit` clean on branch-tracked content.
- `npm run test` 100% green (290 existing + ~32 new = 322).
- Stage A.2 dry-run harness still passes (default exits 0; `--override-tolerance=2000` exits 1). The aggregator helper isn't yet wired into the harness; it has no validator interaction in A.7.
- Commit message includes: LOC totals, test pass count, any deviation from this plan, any PGN-header utility reused (or inline implementation rationale if none found).

---

## 6. Open questions for tech-lead review

| # | Question | Default |
|---|---|---|
| T1 | **Placement.** `src/lib/mastermind/userHistoryAggregates.ts` (outside `validators/`) vs `src/lib/mastermind/validators/userHistoryAggregates.ts` (inside). | Outside `validators/` — it's a helper not a validator. |
| T2 | **PGN header parsing.** Inline regex vs reuse-existing-utility (if any). | Reuse if found via `grep -r "ECO\\|Opening" src/lib/ | grep -i header`; inline otherwise. Document choice in commit. |
| T3 | **userName matching strictness.** Case-insensitive *substring* match vs exact-match-after-lowercasing. | Substring — handles "Aayan" matching "Aayan_K" (Lichess username with suffix). |
| T4 | **createdAt vs PGN date preference.** Prefer `createdAt` (Firestore timestamp) over `date` (PGN string)? | Yes — createdAt is server-truth. Fall back to PGN date only when createdAt missing. |
| T5 | **Opening bucket key includes color.** Same opening played as both colors → two buckets (`Sicilian as White` vs `Sicilian as Black`)? | Yes — coaching-relevant; user's repertoire as each color is a distinct citation surface. |
| T6 | **Game.timeControl bucketing.** Verbatim string match (no normalization across "300+5" vs "rapid") — the validator handles bucket-name fuzzy match through its parser? | Yes — keep the aggregator dumb; bucketing precision belongs in the parser. |

---

## 7. Pause for review

This plan section is the brief for Stage A.7 code. **Don't start code until tech-lead signs off on §6 questions** (or accepts defaults silently — defaults are the implementation if no input arrives).

After sign-off, code begins as commit `1.C.A.7`. No new plan section needed for Stage A.7's implementation itself — patterns are mechanical against this spec. Documented deviations (if any surface during implementation) get surfaced in the commit message per the Stage A.6 discipline pattern.

Subsequent Stage A plan addenda follow:
- **A.8 — `userHistoryCitation.ts`** — three claim types consuming A.7's aggregators. Plan section length similar to this one (~250 lines) since claim types are small.
- **A.9 — `citationRate.ts` + `runValidationPipeline.dataSources` extension** — wires scout + userHistory into the pipeline. Plan section is short because most of the work is mechanical extension of the existing pipeline. **A.9 is the commit that touches PR 1.B's sealed surface** (extending the pipeline signature with optional `dataSources` field); Aayan ratified the touch as part of the §7.1 scope correction.

Stage B resumes only after A.9 seals.
