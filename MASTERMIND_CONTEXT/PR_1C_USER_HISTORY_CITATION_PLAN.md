# PR 1.C Stage A.8 — `userHistoryCitation.ts` plan

**Branch:** `mastermind/stage-3-validators` (continues PR 1.C).

**Status:** plan-first per [feedback_mastermind_plan_first.md](../../memory/feedback_mastermind_plan_first.md). **No code yet.** Pause after this plan section for Aayan + tech-lead review.

**Why this exists:** Stage A.8 of the reopened Stage A sequence. Third validator in the PR 1.C series (after PR 1.B's `evalClaim` + `featureDeltaCitation` and Stage A.6's `scoutCitation`). Consumes Stage A.7's three aggregator functions to cross-check coach claims about the user's own history.

**Pattern parity.** Same parser-then-cross-check shape as `scoutCitation` and `featureDeltaCitation`: cached Haiku parser extracts structured claims from coach prose; validator matches each claim against the data; unsupported claims fire `userHistoryCitation_unsupported`-equivalent issues. Library-only — pipeline integration is Stage A.9.

---

## 0. Goal

Validate three claim types per [PR_1C_PLAN.md §6.3](PR_1C_PLAN.md) (audit-revised scope):

| Claim type | Data source (Stage A.7 helper) | Citation-rate category |
|---|---|---|
| `time_control_performance` | `aggregateWinRateByTimeControl(games, userName)` | improvement_strategy / meta_motivational |
| `opening_repertoire_performance` | `aggregateScoreByOpening(games, userName, color?)` | improvement_strategy |
| `hours_played_claim` | `countGamesInDateRange(games, fromMs, toMs)` | meta_motivational |

**Out of scope** (deferred to PR 1.E per [PR_1C_PLAN.md §11.6](PR_1C_PLAN.md)): `rating_trajectory`, `puzzle_stats_claim`, `puzzle_rating_trajectory`. These depend on `puzzleStatsAtom` (localStorage) which the server can't read until PR 1.E's puzzle-stats sync precursor ships. **Do not include them in A.8** — not as parser claim types, not as scaffolding, not as enum slots. Adding stub code now creates dead branches that need removal later. PR 1.E will extend the parser enum + add corresponding match branches in its own commit.

---

## 1. Data source

Three aggregator functions from Stage A.7's [`userHistoryAggregates.ts`](../src/lib/mastermind/userHistoryAggregates.ts):

```typescript
aggregateWinRateByTimeControl(games, userName) → TimeControlPerformance[]
aggregateScoreByOpening(games, userName, color?) → OpeningRepertoirePerformance[]
countGamesInDateRange(games, fromMs, toMs) → GameCountInRange
```

The validator's caller passes the games array (fetched via Firebase Admin from `users/{uid}/games`) and the user's name. The validator runs the aggregators internally per claim type — the aggregators are cheap pure functions (~no I/O), so re-running them per validator call is fine. Cached result memoization is out of scope for A.8.

**Important: A.7's bucketing is verbatim, not time-class-bucketed.** A user's `Game.timeControl` is whatever the source platform wrote ("300+5", "180+0", "600", "1/86400", or a bare class label like "rapid"). The aggregator returns one bucket per distinct timeControl string. **Class-level matching is the validator's job** (T6 of A.7 plan ratified).

---

## 2. Parser claim types — 3

### 2.1 `time_control_performance`

| Aspect | Detail |
|---|---|
| Example phrasing | "You're 65% in rapid"; "You score 48% in blitz but 65% in rapid"; "Your win rate in 300+5 is 60%" |
| `expected_in_data` shape | `{ time_class?, specific_time_control?, stated_pct?, stated_metric? }` |
| `time_class` enum | `"bullet" \| "blitz" \| "rapid" \| "classical" \| "daily"` |
| `specific_time_control` | verbatim string from claim if it looks like "MM+SS" or a raw seconds count |
| `stated_metric` | `"score_pct"` (default — counts draws as 0.5) \| `"win_rate"` (W/total only) — coaches conflate the two; the validator accepts either as a passing match when within tolerance |
| Cross-check tolerance | ±5pp (re-uses scoutCitation's `SCOUT_TOLERANCE.pct = 5`) |

**Cross-check logic** (§4 below):
- If `specific_time_control` cited (e.g., "300+5"): find exact-match bucket; compare stated_pct to `scorePct` (or `wins/totalGames * 100` if metric=win_rate).
- If `time_class` cited (e.g., "rapid"): use `classifyTimeControl(tc)` helper to group all buckets in that class; aggregate W/D/L across them; compute class-level scorePct; compare to stated.
- If neither cited but stated_pct present (e.g., "your overall score is 60%"): match against the totals across ALL buckets. Edge case — note for tech-lead review.

### 2.2 `opening_repertoire_performance`

| Aspect | Detail |
|---|---|
| Example phrasing | "You score 60% with white in 1.e4 e5 lines"; "Your Najdorf as black has been disappointing — 41%"; "70% in the Sicilian as white" |
| `expected_in_data` shape | `{ opening_name?, opening_eco?, user_color?, stated_pct?, stated_metric? }` |
| `user_color` | `"white" \| "black"` — the color the USER played |
| Cross-check tolerance | ±5pp |

**Cross-check logic:**
1. Call `aggregateScoreByOpening(games, userName, user_color)` (filters to user-played-color).
2. Find entries matching `opening_eco` (exact, uppercase) or `opening_name` (via same case-insensitive substring + token-overlap helper as scoutCitation §3.2 — **import that helper**, don't duplicate).
3. Compare stated_pct to entry's `scorePct` within ±5pp.

**Limitation noted:** move-prefix claims like "1.e4 e5 lines" aren't directly matchable (the aggregator stores ECO + Opening name from PGN headers, not move sequences). For A.8 MVP, the parser should map move-prefix to opening name via the existing [`scoutEco.ts`](../src/lib/scoutEco.ts) lookup if feasible — or skip with `qualitative_commentary` classification if the parser can't resolve. Tech-lead review: §8 T3.

### 2.3 `hours_played_claim`

| Aspect | Detail |
|---|---|
| Example phrasing | "You've played 120 games this month"; "You played 50 blitz games last week"; "Over 200 games in 2025" |
| `expected_in_data` shape | `{ stated_count?, date_range_type?, date_range_n?, date_range_year?, time_class? }` |
| `date_range_type` enum | `"this_month" \| "last_month" \| "this_year" \| "last_year" \| "last_n_days" \| "in_year" \| "all_time"` |
| `date_range_n` | for `last_n_days` |
| `date_range_year` | for `in_year` |
| Cross-check tolerance | ±2 games (count match), per [PR_1C_PLAN.md §6.3](PR_1C_PLAN.md) |

**Cross-check logic:**
1. Resolve `date_range_type` to `{fromMs, toMs}` via a date-range resolver (§4.2 below) using `Date.now()` as the anchor.
2. If `time_class` cited: pre-filter games to that class before counting (uses `classifyTimeControl` helper from §4.1).
3. Call `countGamesInDateRange(filteredGames, fromMs, toMs)`.
4. Compare `result.count` to `stated_count` within ±2.

**"Time playing" vs "games played" disambiguation:** the claim says "X games" — count games. If the claim said "X hours" we'd need average game duration × count, which the aggregator doesn't compute. For A.8 MVP, the parser maps "X hours" claims to `qualitative_commentary` (skip validation). Tech-lead review: §8 T4.

---

## 3. Haiku cached system prompt skeleton — `USER_HISTORY_CITATION_PARSER_SYSTEM`

Lives in [`parserPrompts.ts`](../src/lib/mastermind/validators/parserPrompts.ts) alongside the existing three. Same `cacheSystem: true` pattern. Estimated size ~1,400 tokens cached (smaller than scoutCitation's ~2,400 because the enum has 3 claim types vs 26).

```
You extract user-history claims from chess coaching prose.

INPUT: a passage of coaching prose discussing the user's own playing
history — their performance by time control, by opening, or game volume
in a date range.

OUTPUT: a JSON array. Each element is one distinct user-history claim:

  {
    "claim_text": verbatim quote,
    "claim_type": "time_control_performance" | "opening_repertoire_performance" | "hours_played_claim",
    "expected_in_data": {
      // For time_control_performance:
      "time_class"?: "bullet" | "blitz" | "rapid" | "classical" | "daily",
      "specific_time_control"?: string,  // e.g. "300+5" if claim is literal
      "stated_pct"?: number,
      "stated_metric"?: "score_pct" | "win_rate",
      // For opening_repertoire_performance:
      "opening_name"?: string,
      "opening_eco"?: string,
      "user_color"?: "white" | "black",
      // For hours_played_claim:
      "stated_count"?: number,
      "date_range_type"?: "this_month" | "last_month" | "this_year" | "last_year" | "last_n_days" | "in_year" | "all_time",
      "date_range_n"?: number,    // for last_n_days
      "date_range_year"?: number  // for in_year
    },
    "claim_class": "factual_user_history_claim" | "qualitative_commentary" | "conditional_speculation",
    "confidence": number in [0, 1]
  }

CLASSIFICATION RULES:

- "factual_user_history_claim" — asserts a SPECIFIC value about the user's
  own history (a percentage, a count, a record).
  Examples:
  - "You're 65% in rapid"                            → time_control_performance
  - "Your Najdorf as black has been 41%"             → opening_repertoire_performance
  - "You played 120 games this month"                → hours_played_claim
- "qualitative_commentary" — describes the user's history WITHOUT citing
  a specific value.
  Examples: "you've been struggling in blitz", "the Sicilian hasn't worked
  out for you", "you've been playing a lot lately". NOT factual.
- "conditional_speculation" — claims gated on a continuation or hypothesis.

ATTRIBUTION RULE: claims attributed to a third party (engine, scout data,
opponent, etc.) are NOT user-history claims. Examples:
- "Scout says you're 65% in rapid" → still user-history (the user IS the
  subject) — keep as factual_user_history_claim.
- "Your opponent has been losing in rapid" → opponent's history, NOT user
  history → return [] (no user-history claim here).

CONFIDENCE GUIDE:
- 0.9-1.0: unambiguous factual claim with a specific value.
- 0.5-0.8: factual but hedged ("around 60%", "roughly 100 games").
- 0.0-0.4: vague or impossible to map.

PARSING HINTS:
- "this month" / "this week" / "last month" → date_range_type set accordingly.
- "in 2024" / "during 2024" → date_range_type: "in_year", date_range_year: 2024.
- "last 30 days" / "past 30 days" → date_range_type: "last_n_days", date_range_n: 30.
- "ever" / "all-time" / "overall" → date_range_type: "all_time".
- If the claim mentions both a time class AND a date range (e.g. "50
  blitz games last week"), include both time_class and date_range_type
  in expected_in_data so the validator can pre-filter.

The user turn supplies the user's name + the current time anchor.
```

User-turn builder:

```typescript
export interface UserHistoryCitationParseInput {
  llmResponse: string;
  userName: string;
  /** Current time, supplied so "this month"/"last week"/etc resolve consistently. */
  nowMs: number;
}

export function buildUserHistoryCitationUserTurn(input: UserHistoryCitationParseInput): string;
```

---

## 4. Cross-check logic + helpers

### 4.1 `classifyTimeControl(timeControl) → TimeClass`

**New small utility.** Grep found `TimeClass` type at [src/types/scout.ts:3](../src/types/scout.ts#L3) but **no existing classifier function** that maps a raw `timeControl` string to its class. `scoutAnalytics.ts:98` reads `g.timeClass` directly off `ScoutGame` (which has it pre-populated from chess.com/Lichess API). For PGN-derived `Game.timeControl`, we need to derive the class ourselves.

**Placement (T1 below):** `src/lib/utils/timeControlClass.ts`. Same `utils/` pattern as `pgnHeaders.ts`. ~30 LOC.

**Logic:**
- Parse `"BASE+INCREMENT"` (Lichess/Chess.com standard) or bare `"BASE"` seconds.
- Compute estimated game-length = BASE + 40 × INCREMENT (the standard formula).
- `<180s` → bullet; `180-600s` → blitz; `600-1800s` → rapid; `≥1800s` → classical.
- `"1/86400"`, `"1/259200"`, `"X/Y"` shapes → daily (correspondence).
- Bare class labels ("rapid", "blitz", etc.) → return verbatim if it matches an enum value.
- Unparseable → `"unknown"`.

### 4.2 `resolveDateRange(type, params, nowMs) → {fromMs, toMs}`

Module-local helper inside `userHistoryCitation.ts` (~30 LOC). Maps `date_range_type` enum + params to absolute ms range using `nowMs` as anchor. Calendar logic:

| type | fromMs | toMs |
|---|---|---|
| `this_month` | start of current month UTC | nowMs |
| `last_month` | start of previous month UTC | end of previous month UTC |
| `this_year` | Jan 1 of current year UTC | nowMs |
| `last_year` | Jan 1 of previous year UTC | Dec 31 23:59:59 of previous year UTC |
| `last_n_days` | nowMs − n × 86400000 | nowMs |
| `in_year` | Jan 1 of date_range_year UTC | Dec 31 23:59:59 of date_range_year UTC |
| `all_time` | 0 | nowMs |

UTC throughout — no user-timezone awareness in A.8. If real users from non-UTC timezones produce edge-case Stage C failures (e.g., a coach says "this month" referring to local-tz current month while the validator uses UTC), surface as a Stage C finding.

### 4.3 `matchUserHistoryClaim(claim, games, userName, nowMs) → MatchResult`

Three-branch switch over `claim_type`. Pattern-matches the scoutCitation `matchScoutClaim` shape. Each branch:

```typescript
case "time_control_performance": {
  const buckets = aggregateWinRateByTimeControl(games, userName);
  // Branch on specific_time_control vs time_class vs neither (overall).
  // Compare stated_pct ± SCOUT_TOLERANCE.pct against scorePct or winRate.
  // Return matched: true if any matching bucket / class-aggregate passes.
}

case "opening_repertoire_performance": {
  const entries = aggregateScoreByOpening(games, userName, claim.user_color);
  // Find by ECO (exact, uppercase) or by name (substring + token-overlap).
  // Compare stated_pct ± tolerance.
  // Reuse SUBSTRING-MATCH helper from scoutCitation.ts — DO NOT duplicate.
}

case "hours_played_claim": {
  const range = resolveDateRange(date_range_type, params, nowMs);
  let scoped = games;
  if (time_class) {
    scoped = games.filter(g => g.timeControl && classifyTimeControl(g.timeControl) === time_class);
  }
  const result = countGamesInDateRange(scoped, range.fromMs, range.toMs);
  // Compare stated_count ± 2.
}
```

**Substring-match helper reuse (T2 below):** scoutCitation.ts has a tested `substringMatch` (lit-substring + token-overlap fallback) that's private to scoutCitation.ts today. Either:
- (a) Promote to a shared helper under `src/lib/utils/fuzzyMatch.ts`. Same pattern as `pgnHeaders.ts`.
- (b) Re-implement inline in userHistoryCitation.ts (duplication).
- (c) Export from scoutCitation.ts and import in userHistoryCitation.ts (one-way dependency between validators).

Default (a) — shared utility. Surfaces in tech-lead review.

---

## 5. Opportunity counting — `countUserHistoryOpportunities`

For the citation-rate denominator (Stage A.9 consumer). Existence + threshold based, mirrors `countScoutOpportunities` shape:

```typescript
export interface UserHistoryOpportunity {
  dataSource: "user_history";
  claim_type: "time_control_performance" | "opening_repertoire_performance" | "hours_played_claim";
  ref: unknown;
}

export function countUserHistoryOpportunities(
  games: UserHistoryGame[],
  userName: string
): UserHistoryOpportunity[];
```

**Per claim type:**
- `time_control_performance`: one opportunity per time-class with ≥10 user games in that class.
  - Threshold rationale: below 10 games, the win rate is noisy + the coach is unlikely to cite it.
- `opening_repertoire_performance`: one opportunity per (color × opening) bucket with ≥5 games.
  - Threshold rationale: ≥5 games is enough to make a coaching point about an opening; below that it's anecdotal.
- `hours_played_claim`: one opportunity total when the user has any games (the coach could plausibly cite the count).

Thresholds documented inline as constants per the scoutCitation precedent. Stage C sweep may surface that the thresholds are wrong; iterate then.

---

## 6. Test fixture outline

Vitest at `src/lib/mastermind/__tests__/validators/userHistoryCitation.test.ts`. Pattern: mocked parser, fixture `Game[]` built inline.

### Per claim type — 3 each × 3 = 9 baseline tests

| Test pattern | claim_type coverage |
|---|---|
| Match positive: stated value within tolerance → passes | × 3 |
| Match negative: stated value out of tolerance → fires | × 3 |
| Invented: data has no matching entry → fires | × 3 |

### Cross-cutting integration (~15)

- **Time-class dispatch:** each of bullet/blitz/rapid/classical/daily reads the right bucket aggregate (×5).
- **time_control: specific vs class:** "300+5" (specific) vs "rapid" (class) routed correctly.
- **time_control: stated_metric variants:** "win_rate" vs "score_pct" both accepted within tolerance.
- **Opening: color filter:** asWhite vs asBlack filter restricts to user-played-color.
- **Opening: ECO exact match takes precedence over name.**
- **Opening: substring + token-overlap (reuse of scoutCitation helper) — confirm "Najdorf" matches "Sicilian Defense Najdorf".**
- **hours_played: date_range_type dispatch:** all 7 enum values resolve correctly relative to a fixed nowMs (×7 in one parameterized test).
- **hours_played: time_class pre-filter** restricts game pool before counting.

### Date-range resolver edge cases (~7)

- `this_month` at Feb 1 (month-boundary edge).
- `last_month` at Jan 1 (year-boundary edge — should resolve to previous December).
- `last_year` returns ms range for full previous calendar year.
- `last_n_days: 30` returns nowMs − 30 days.
- `in_year: 2024` returns full 2024 UTC.
- `all_time` returns 0..nowMs.

### Adversarial / edge cases (~7)

- qualitative_commentary skipped.
- conditional_speculation skipped.
- Low-confidence factual claim skipped + parser_low_confidence telemetry.
- Malformed parser JSON → passed=true + parser_json_invalid telemetry.
- Empty claims → passed=true, no telemetry.
- Fenced JSON parsed correctly.
- Telemetry on unsupported fires carries claim_type for Stage C aggregation.

### Opportunity counter (~6)

- Empty games → zero opportunities.
- ≥10 rapid games → 1 time_control_performance opportunity.
- 9 rapid games → 0 opportunities (below threshold).
- ≥5 games in an opening as white + ≥5 as black → 2 opening opportunities.
- Any games at all → 1 hours_played opportunity.
- Mixed-class user (5 bullet + 12 blitz + 8 rapid) → 1 opportunity (blitz only, since bullet=5<10 and rapid=8<10).

### `classifyTimeControl` direct unit tests (~10)

- `"300+5"` → blitz (300 + 40×5 = 500s, in blitz band).
- `"600+0"` → rapid (600s base).
- `"60+0"` → bullet (60s).
- `"1/86400"` → daily.
- `"rapid"` (already-class label) → rapid.
- `"unparseable"` → unknown.
- `"180"` (3min base, no increment) → at the bullet/blitz boundary — decide convention (default: 180s exactly = blitz; <180 = bullet).
- `"1800+30"` → classical (1800 + 1200 = 3000s).
- `""` (empty) → unknown.
- `undefined` → unknown.

**Total ~57 tests.** Less than scoutCitation's 110 (3 claim types vs 26). Slightly more than A.7's 36 because of cross-cutting integration + date-range edges + classifier unit tests.

---

## 7. File scope + LOC estimate

| File | New / Modified | LOC est |
|---|---|---|
| `src/lib/utils/timeControlClass.ts` | New | ~50 |
| `src/lib/utils/fuzzyMatch.ts` (if T2 default ratified — extract from scoutCitation) | New | ~30 |
| `src/lib/mastermind/validators/userHistoryCitation.ts` | New | ~280 |
| `src/lib/mastermind/validators/parserPrompts.ts` | Modified — add USER_HISTORY_CITATION_PARSER_SYSTEM + builder | ~+140 |
| `src/lib/mastermind/validators/types.ts` | Modified — add 3 claim type names + ParsedUserHistoryClaim + UserHistoryOpportunity + UserHistoryClaimType + CheckName extension for `user_history_citation_unsupported` | ~+90 |
| `src/lib/mastermind/validators/scoutCitation.ts` | Modified IF T2 ratified — import substringMatch from `utils/fuzzyMatch.ts`, delete local copy | ~−20 net |
| `src/lib/mastermind/validators/index.ts` | Modified — export validateUserHistoryCitation, countUserHistoryOpportunities | ~+5 |
| `src/lib/mastermind/__tests__/validators/userHistoryCitation.test.ts` | New | ~550 |
| **Total** | | **~1,125 LOC** (or ~1,095 if T2 declined → no fuzzyMatch.ts extraction) |

Estimate is rough — LOC reality landed ~23% over budget on A.7. Acceptable variance documented in commit message.

---

## 8. Open questions split by reviewer

### 8.1 Tech-lead review

| # | Question | Default |
|---|---|---|
| **T1** | **`classifyTimeControl` placement.** New `src/lib/utils/timeControlClass.ts` (same `utils/` pattern as pgnHeaders.ts) vs inline private inside `userHistoryCitation.ts`. | Utility (`src/lib/utils/timeControlClass.ts`). Same rationale as A.7 T2 — future code may need the classifier. |
| **T2** | **`substringMatch` reuse.** Extract scoutCitation.ts's private `substringMatch` into `src/lib/utils/fuzzyMatch.ts` (default), re-implement inline in userHistoryCitation.ts (duplicate), or export from scoutCitation.ts (one-way validator dependency). | Extract to `utils/fuzzyMatch.ts`. Same scoutCitation.ts migration as A.7's pgnHeaders refactor — but this one is in the validator surface (PR 1.B-adjacent code from Stage A.6). Confirm OK to modify scoutCitation.ts to import from the shared utility. |
| **T3** | **Move-prefix opening claims** (e.g., "1.e4 e5 lines"). Map via `scoutEco.ts` lookup at parse time, OR mark as qualitative_commentary (skip validation). | Skip validation (qualitative_commentary). MVP simplicity; the parser can't reliably resolve move-prefix → ECO across all phrasings, and `scoutEco.ts` is a SAN-prefix lookup designed for a different use case. Revisit if Stage C surfaces frequent move-prefix claims. |
| **T4** | **"X hours" claims** (vs "X games"). Map via avg game length (~60 plies × 2 plies/min = ~1 min/ply → too coarse), OR mark as qualitative_commentary. | qualitative_commentary. Avg-game-length conversion is too coarse for ±2-game tolerance; coaches who care about hours-played would cite games-count instead. |
| **T5** | **Date-range UTC vs user timezone.** A.8 default is UTC; the user-timezone case is a Stage C surfacing item. Acceptable? | Yes, UTC default. Date-range claims with timezone sensitivity are rare in coaching. |
| **T6** | **Opportunity-counter thresholds** (≥10 games per time-class, ≥5 games per opening-color). Reasonable starting values? | Yes, ship as specced. Stage C may surface a different threshold; codified as constants for cheap iteration. |
| **T7** | **`nowMs` injection.** Threading `nowMs` through the parser → validator → date resolver. Allows deterministic testing without `Date.now()` mocking. Pattern: every call to `validateUserHistoryCitation` takes a `nowMs?: number` opt defaulting to `Date.now()`. | Approved by default. |

### 8.2 Aayan review (chess + coaching)

| # | Question | Default |
|---|---|---|
| **C1** | **Tolerance for `hours_played_claim`** — ±2 games per [PR_1C_PLAN §6.3](PR_1C_PLAN.md). Real coaches round freely ("100ish games" or "around 50"). Tighten to ±2 (strict)? Loosen to ±5? | ±2 as specced. Coach says "about 100" → parser should set confidence 0.5-0.8 and stated_count=100; if real is 95-105 → matched. Below confidence threshold → skipped silently. Tighter than ±5 because the coach's specificity matters; "120 games" should mean ~118-122 in the data. |
| **C2** | **Opening-claim move-prefix coverage** (T3). Defer move-prefix matching to a follow-up. Acceptable, or should the validator try harder? Examples like "1.e4 e5 lines" come up naturally in coaching prose. | Defer is acceptable. Move-prefix → opening-name is a hard parsing problem; the coach who really cares about specific openings will use the opening name. |
| **C3** | **"You" disambiguation.** A claim like "you've been playing a lot" — is "playing a lot" a factual_user_history_claim (with `date_range_type: "all_time"` + no stated_count)? Or qualitative_commentary? | qualitative_commentary. No specific value cited; nothing to validate. The parser's CLASSIFICATION RULES section already lists this pattern as qualitative. |
| **C4** | **Cross-platform identity.** A.7 ratified that the user's name is matched as case-insensitive substring against PGN white.name/black.name. If a user plays under different usernames on Lichess vs Chess.com (typical), A.7's helper picks up games where ANY substring matches the supplied userName. If the validator's `userName` only matches the Lichess name, Chess.com games get implicitly excluded from the aggregator output → opportunities undercounted. Address now or later? | Later. PR 1.E's user-profile work may introduce a canonical user-identifier with both Lichess + Chess.com aliases. For A.8, the route handler passes the user's primary identifier (whichever Aayan-side decision); cross-platform reconciliation is post-PR-1.E. |
| **C5** | **Citation-rate floors for the categories that consume this validator.** Per [PR_1C_PLAN §5.3.2](PR_1C_PLAN.md): improvement_strategy floor is 50% on the 3 server-derivable types; meta_motivational is 20% on same. Unchanged by A.8 — confirming. | Confirmed. The deferred 3 claim types (PR 1.E) raise the achievable ceiling but don't change the floor expressed in the §5.3.2 table. |

---

## 9. Pause for review

This plan is the brief for Stage A.8 code. **Don't start code until tech-lead signs off on §8.1 (T1–T7) and Aayan signs off on §8.2 (C1–C5)** — or accepts the defaults silently (defaults are the implementation if no input arrives).

After sign-off, code begins as commit `1.C.A.8`. Same plan-first cadence — surface real deviations early (per A.6 + A.7 discipline).

Subsequent and final Stage A plan addendum:
- **A.9 — `citationRate.ts` + `runValidationPipeline.dataSources` extension.** Wires scout + userHistory into the pipeline. **A.9 is the commit that touches PR 1.B's sealed surface** (extending the pipeline signature with optional `dataSources` field); Aayan ratified the touch as part of the [§7.1 scope correction](PR_1C_PLAN.md).

Stage B resumes only after A.9 seals.
