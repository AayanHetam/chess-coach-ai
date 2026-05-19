# PR 1.C Stage A.6 — `scoutCitation.ts` plan

**Branch:** `mastermind/stage-3-validators` (continues PR 1.C).

**Status:** plan-first per [feedback_mastermind_plan_first.md](../../memory/feedback_mastermind_plan_first.md). **No code yet.** Pause after this plan section for Aayan review of the claim-type coverage decision (§1 below).

**Why this exists:** Stage A was reopened 2026-05-18 (see [PR_1C_PLAN.md §7.1](PR_1C_PLAN.md)). `scoutCitation` is the next-to-build of the four outstanding Stage A items. Patterns are well-established from PR 1.B (`evalClaim`, `featureDeltaCitation`), so this plan is intentionally brief — implementation is mechanical once the scope question is settled.

---

## 0. Goal

Cross-check the LLM coach's claims about an opponent (scout output) against the actual `ScoutAnalytics` + `Collisions` data structures produced by [scoutService.ts](../src/lib/scoutService.ts) and typed in [src/types/scout.ts](../src/types/scout.ts). Same parser-then-cross-check pattern as PR 1.B: a cached Haiku parser extracts structured claims from the coach's prose; the validator matches each claim against the live data; unsupported claims fire `feature_citation_unsupported`-equivalent issues. The pipeline regenerates on failures, same control flow as today.

**First consumer:** the per-turn coach response on `/api/enhanced-analysis` when the question category is `opponent_prep` (or when scout output happens to be available for a non-prep turn — defensive coverage). Wired into `runValidationPipeline` via the `dataSources.scout` field added by Stage A.9 (the pipeline extension). Stage B route wiring then plumbs scout output through to the pipeline via `wireValidators.fetchDataSources(...).scout`.

---

## 1. SCOPE — RESOLVED 2026-05-18: Option A (ship all 26 claim types)

Aayan ratified Option A. Reasoning (captured for the audit trail): the 20 in §6.2's header was rounding; the 26-row enumeration is the real count; merging or subsetting costs more than the extra LOC because **merging forces parser ambiguity to be resolved in cross-check logic instead of in the parser, which ages badly**, and **subsetting ships invisible blind spots where the coach can hallucinate freely about uncovered dimensions**. The Haiku parser cost is roughly flat in claim-type count and the cached prompt is a stable contract once shipped, so ship the right scope once.

**Follow-up requirement added to Stage C sweep:** log per-claim-type firing rates across the 50 turns. If three or more claim types never fire, surface them in the sweep report as candidates for merge in a follow-up PR. **Do not auto-merge** — surface to Aayan, decide based on data, not guess. Tracked in [PR_1C_PLAN.md §5.3](PR_1C_PLAN.md) extension once Stage C planning resumes.

**Implementation discipline (plan-first applies inside implementation too):**
- If a claim type turns out to require richer cross-check infrastructure than this plan estimated (e.g., a tolerance needs to be configurable, a dimension needs fuzzy matching when the plan assumed exact), **pause and surface as a deviation**. Don't just write whatever feels right.
- The ~2,120 LOC estimate is a **budget, not a target**. Actual LOC landing at 1,800 or 2,400 is fine as long as the deviation is real implementation reality, not scope creep / scope shrink. Document actual in the commit message.

The rest of this section is the original scope question, kept for the audit trail:

### 1.1 The discrepancy (resolved as Option A)

[PR_1C_PLAN.md §6.2](PR_1C_PLAN.md) audit-revised header reads **"20 claim types total"** but the §6.2.1–§6.2.5 row-by-row enumeration lists **26 distinct claim types**. Counted programmatically:

| §6.2 sub-section | Claim-types enumerated |
|---|---|
| §6.2.1 Opening / prep | 3 (`opponent_plays_opening`, `opponent_strength_opening`, `opponent_weakness_opening`) |
| §6.2.2 Profile | 8 (`archetype`, `profile_dimension`, `rating_by_timeclass`, `peak_rating`, `low_rating`, `latest_rating`, `recent_form_trend`, `phase_elo`) |
| §6.2.3 Stalker | 2 (`stalker_total`, `stalker_factor`) |
| §6.2.4 Psychology | 8 (`tilt_pattern`, `timeout_pattern`, `resign_pattern`, `checkmate_rate`, `quick_loss_pattern`, `long_game_pattern`, `streak_claim`, `avg_game_length`) |
| §6.2.5 Rivals/collisions/novelty/checklist/recent-form | 5 (`rival_record`, `collision_edge`, `novelty_finding`, `checklist_item`, `recent_form_bucket`) |
| **Total** | **26** |

The "20" header appears to come from the inline grouping prose ("3 opening, 7 profile, 2 stalker, 8 psychology + rivals/…") which collapses some categories — the 7-profile count drops one (probably folding `peak_rating`/`low_rating`/`latest_rating` into `profile_dimension`'s broader scope), and the trailing "8 psychology + rivals/…" reads as a single 8-item bucket spanning two sub-sections. Either way the enumerated table has 26 rows.

**Aayan's call — three options:**

| Option | Claim-type count | What it ships | LOC estimate (lib + test) |
|---|---|---|---|
| **A** | **26 — full enumerated coverage** | Every row in §6.2.1–§6.2.5 ships with its own parser claim type + cross-check branch | ~1,400 + ~700 |
| **B** | **20 — collapsed coverage matching the header** | Merge `peak_rating`/`low_rating`/`latest_rating` into a single `rating_landmark` claim (3→1); merge `quick_loss_pattern`/`long_game_pattern` into `loss_length_pattern` (2→1); merge `resign_pattern`/`checkmate_rate`/`streak_claim` into bucketed psychology claims (3→2); keep all others. Lossless in coaching value, narrower API surface. | ~1,100 + ~550 |
| **C** | **High-value subset first** (~15 types: opening 3 + profile collapsed to 4 + stalker 2 + psychology collapsed to 3 + rivals/collisions/novelty 3) | Ship the most-frequently-cited claim shapes first; defer the long tail (checklist items, recent-form buckets, finer psychology splits) to a follow-up PR after Stage C sweep shows real coaching frequencies | ~850 + ~450 |

**Recommended default:** **Option A (ship all 26).** ← ratified.

**Why this scope question mattered:** the parser claim-type enum is a stable contract once it ships — adding a new type later means updating the cached Haiku system prompt, which busts the cache and incurs warmup cost. Better to settle the enum size before code starts.

---

## 2. Data source — `ScoutAnalytics` + `Collisions`

Verified shape (audit §C verified — see [PR_1C_DATA_AUDIT.md §C.2](PR_1C_DATA_AUDIT.md), no drift). Full type definitions at [src/types/scout.ts:240-249](../src/types/scout.ts#L240-L249) and [:229-238](../src/types/scout.ts#L229-L238).

```typescript
interface ScoutAnalytics {
  profile: ProfileSnapshot;       // ovr/atk/def/time/mind scores, ratings, archetype, phase ELO, recent results
  stalker: StalkerScore;          // total 0-100, predictability, factors[]
  prep: TargetedPrep;             // asWhite/asBlack { weaknesses[], strengths[] } each OpeningSummary
  checklist: ChecklistItem[];     // {id, title, detail, severity}
  rivals: FrequentRival[];        // {name, games, wins/draws/losses, scorePct}
  psychology: PsychologySnapshot; // avgGameLength, quickLossRate, longGameLossRate, timeoutRate, ...
  recentBuckets: RecentFormBucket[];   // {label, wins, draws, losses}
  novelty: NoveltyFinding[];      // deviations from book on specific moves
}

interface Collisions {  // separate from ScoutAnalytics
  whenYouPlayWhite: CollisionLine[];
  whenYouPlayBlack: CollisionLine[];
  yourWinRate: number;
  yourGames: number;
  yourUsername: string;
}
```

Both are server-side derived (no localStorage dependency) by `scoutService.ts`. The validator consumes both as inputs (passed via `runValidationPipeline.dataSources.scout` once Stage A.9 ships).

---

## 3. Parser claim types — full Option A enumeration

**Pending Aayan's §1 decision.** If Option A wins, ship all 26 below. If Option B or C, redact rows per the collapse rules.

Format mirrors PR 1.B's `FeatureClaimType` enum in [src/lib/mastermind/validators/types.ts](../src/lib/mastermind/validators/types.ts). Each row: claim type name, example LLM phrasing, ScoutAnalytics field consulted, cross-check tolerance.

### 3.1 Opening / prep (3 — `prep.asWhite/asBlack.{weaknesses,strengths}[]`)

| Claim type | Example phrasing | Source field | Cross-check |
|---|---|---|---|
| `opponent_plays_opening` | "Vinod_kk plays the Sicilian Dragon 60% of the time" | `prep.asBlack.{weaknesses,strengths}[].name + .totalGames / sum(totalGames)` | Stated % within ±5pp of computed frequency |
| `opponent_strength_opening` | "They score 70% with white in the King's Indian Attack" | `prep.asWhite.strengths[].scorePct + .totalGames` | Stated score% within ±5pp |
| `opponent_weakness_opening` | "They struggle as black against 1.d4 (45% score)" | `prep.asBlack.weaknesses[].scorePct + .totalGames` | Stated score% within ±5pp |

### 3.2 Profile (8 — `profile.*`)

| Claim type | Example | Source | Cross-check |
|---|---|---|---|
| `archetype` | "Plays like a positional grinder" | `profile.archetype` | Stated archetype string is `profile.archetype` (case-insensitive substring match) |
| `profile_dimension` | "Attacking score 78" | `profile.{ovr,atk,def,time,mind}` (0–100) | Stated value within ±5 of the field's value |
| `rating_by_timeclass` | "1800 in rapid, 1500 in blitz" | `profile.ratings.{bullet,blitz,rapid,classical,daily}` | Stated rating within ±25 |
| `peak_rating` | "Peaked at 2050" | `profile.peakRating` | Stated within ±25 |
| `low_rating` | "Bottomed out at 1750" | `profile.lowRating` | Stated within ±25 |
| `latest_rating` | "Currently rated 1920" | `profile.latestRating` | Stated within ±25 |
| `recent_form_trend` | "Won 6 of their last 10" | `profile.recent[]` (last N outcomes) + `profile.recentAccuracy` | Stated W/D/L counts within ±1 of derived |
| `phase_elo` | "Endgame ELO 200 below middlegame" | `profile.phaseElo.{opening,middle,endgame,baseline}` | Stated delta within ±50 cp |

### 3.3 Stalker (2 — `stalker.*`)

| Claim type | Example | Source | Cross-check |
|---|---|---|---|
| `stalker_total` | "Stalker Score 72 — highly exploitable" | `stalker.total + .predictability` | Stated score within ±5; predictability bucket exact match |
| `stalker_factor` | "Tilts hard after a loss (factor score 80)" | `stalker.factors[]` matching `tilts`/`time_trouble`/`limited_rep`/`repetitive` | Factor id present in array + score within ±10 |

### 3.4 Psychology (8 — `psychology.*`)

| Claim type | Example | Source | Cross-check |
|---|---|---|---|
| `tilt_pattern` | "Loss rate jumps to 68% after a previous loss" | `psychology.tiltAfterLossLossRate` | Stated % within ±5pp |
| `timeout_pattern` | "Loses 15% of games on time" | `psychology.timeoutRate` | Stated % within ±5pp |
| `resign_pattern` | "Resigns in 60% of losses" | `psychology.resignRate` | Stated % within ±5pp |
| `checkmate_rate` | "Wins 40% of games by checkmate" | `psychology.checkmateRate` | Stated % within ±5pp |
| `quick_loss_pattern` | "Loses 12% of games under 50 plies" | `psychology.quickLossRate` | Stated % within ±5pp |
| `long_game_pattern` | "Long games (>120 plies) are 35% of their losses" | `psychology.longGameLossRate` | Stated % within ±5pp |
| `streak_claim` | "Max win streak 14, longest losing run 7" | `psychology.{maxWinStreak,maxLossStreak}` | Stated streak ±1 |
| `avg_game_length` | "Their games average 60 plies" | `psychology.avgGameLength` | Stated avg within ±10 plies |

### 3.5 Rivals / collisions / novelty / checklist / recent-form (5)

| Claim type | Example | Source | Cross-check |
|---|---|---|---|
| `rival_record` | "You've played them 8 times — you're 3-2-3" | `rivals[].{name,games,wins,draws,losses,scorePct}` | Counts match the entry by name (substring match on name) |
| `collision_edge` | "When you play White and they play Black, you score 65% in the Caro-Kann" | `Collisions.whenYouPlayWhite[]` / `whenYouPlayBlack[]` | Matching `CollisionLine` by `eco`/`name`; `yourScorePct` within ±5pp |
| `novelty_finding` | "On move 8 in game X they deviated from their book" | `novelty[]` `NoveltyFinding` | Matching entry by `gameId` OR `playedMove`+`ply` |
| `checklist_item` | "Watch out for their kingside attack pattern" | `checklist[]` `ChecklistItem` | Entry exists with matching `title` or `id` (substring match) |
| `recent_form_bucket` | "Their last 20 games: 12 wins, 3 draws, 5 losses" | `recentBuckets[]` `{label, wins, draws, losses}` | Bucket exists with matching `label` + counts ±1 |

---

## 4. Haiku cached system prompt skeleton — `SCOUT_CITATION_PARSER_SYSTEM`

Lives in [`src/lib/mastermind/validators/parserPrompts.ts`](../src/lib/mastermind/validators/parserPrompts.ts) alongside the existing two prompts. Same `cacheSystem: true` pattern. Estimated size ~2,400 tokens cached (larger than the feature-citation parser at ~1,200 tokens — the claim-type enumeration is the bulk).

```
You extract opponent-scouting claims from chess coaching prose.

INPUT: a passage of coaching prose discussing the user's opponent (their
opening repertoire, ratings, psychology, recent results, prep notes).

OUTPUT: a JSON array. Each element is one distinct scouting claim found
in the passage:

  {
    "claim_text": verbatim quote from input,
    "claim_type": one of [
      "opponent_plays_opening", "opponent_strength_opening", "opponent_weakness_opening",
      "archetype", "profile_dimension", "rating_by_timeclass",
      "peak_rating", "low_rating", "latest_rating", "recent_form_trend", "phase_elo",
      "stalker_total", "stalker_factor",
      "tilt_pattern", "timeout_pattern", "resign_pattern", "checkmate_rate",
      "quick_loss_pattern", "long_game_pattern", "streak_claim", "avg_game_length",
      "rival_record", "collision_edge", "novelty_finding",
      "checklist_item", "recent_form_bucket"
    ],
    "expected_in_data": {
      "opening_name"?: string,           // e.g. "Sicilian Najdorf"
      "opening_eco"?: string,            // e.g. "B90"
      "opponent_color"?: "white" | "black",  // when the claim names the color the opponent plays
      "stated_pct"?: number,             // claims with % values (frequencies, scores, rates)
      "stated_rating"?: number,          // peak/low/latest/by-time-class
      "time_class"?: "bullet" | "blitz" | "rapid" | "classical" | "daily",
      "stated_value"?: number,           // generic numeric (avg plies, streak counts)
      "stated_archetype"?: string,
      "dimension"?: "ovr" | "atk" | "def" | "time" | "mind",
      "factor_id"?: "time_trouble" | "tilts" | "limited_rep" | "repetitive",
      "phase"?: "opening" | "middle" | "endgame",
      "rival_name"?: string,
      "your_color"?: "white" | "black",  // for collision claims
      "novelty_game_id"?: string,
      "checklist_title"?: string,
      "form_bucket_label"?: string,
      "stated_wins"?: number,
      "stated_draws"?: number,
      "stated_losses"?: number
    },
    "claim_class": "factual_scouting_claim" | "qualitative_commentary" | "conditional_speculation",
    "confidence": number in [0, 1]
  }

Return ONLY the JSON array. No prose. If no scouting claims, return [].

CLASSIFICATION RULES:
- "factual_scouting_claim" — asserts a SPECIFIC value from scout data
  (frequency %, rating number, archetype label, factor score, streak count, etc.).
  Examples:
  - "Vinod_kk plays the Najdorf 60% of the time" → opponent_plays_opening
  - "Their attacking score is 78"                  → profile_dimension, dimension: atk
  - "Currently rated 1920"                          → latest_rating, stated_rating: 1920
  - "Tilts hard after a loss (factor score 80)"    → stalker_factor, factor_id: tilts
  - "You've played them 8 times — you're 3-2-3"    → rival_record
- "qualitative_commentary" — describes opponent style or tendencies
  WITHOUT citing a specific scout value.
  Examples: "they like attacking positions", "they're a strong Najdorf
  player", "watch out for their kingside attacks". NOT a factual_scouting_claim.
- "conditional_speculation" — claims gated on a continuation or hypothesis.
  Examples: "if they play 6.Be3 again, they'll probably continue with...".

ATTRIBUTION RULE: claims attributed to the user, the engine, or an
external source (not the coach asserting from scout data) → classify
as qualitative_commentary. Examples: "you mentioned they tilt" / "the
engine thinks they're better here" — both qualitative_commentary.

CONFIDENCE GUIDE:
- 0.9-1.0: unambiguous factual scouting claim citing a specific value.
- 0.5-0.8: factual but hedged ("around 60%", "roughly 1800").
- 0.0-0.4: vague, qualified, or impossible to map to a single source field.

[The user turn supplies the opponent's username and time-class for
context. Validator handles converting "you" / "your" references vs
"they" / "the opponent" references — parser just extracts claims.]
```

**Size discipline:** the prompt body lists 26 claim types inline plus expected_in_data fields. ~2,400 tokens cached. Per [BUILD_PLAN §10.2](MASTERMIND_BUILD_PLAN.md), `cacheSystem: true` keeps repeat-call cost at $0.1/M cache-read pricing — ~$0.00024 per warm call. Cold-start writeup cost is ~$0.0024 (1× per 5 min). Acceptable.

**User-turn builder** mirrors the existing two: opponent username + time-class + perspective + passage.

```typescript
export interface ScoutCitationParseInput {
  llmResponse: string;
  opponentUsername: string;
  /** Time-class context: lets the parser disambiguate "rated 1800" against the right ratings field. */
  primaryTimeClass?: "bullet" | "blitz" | "rapid" | "classical" | "daily";
}

export function buildScoutCitationUserTurn(input: ScoutCitationParseInput): string;
```

---

## 5. Cross-check logic — `matchScoutClaim(claim, scout, collisions)`

Mirrors `matchClaim` in [featureDeltaCitation.ts](../src/lib/mastermind/validators/featureDeltaCitation.ts). One switch over `claim_type`, each branch reads the relevant ScoutAnalytics field, applies the cross-check tolerance, returns `{ matched: boolean, matchedEntry?: unknown }`.

```typescript
function matchScoutClaim(
  claim: ParsedScoutClaim,
  scout: ScoutAnalytics,
  collisions?: Collisions
): MatchResult {
  switch (claim.claim_type) {
    case "opponent_plays_opening": {
      // Combine asWhite + asBlack lookups since the claim may not specify color.
      const lookups = (opp_color === "white"
        ? scout.prep.asWhite
        : opp_color === "black"
          ? scout.prep.asBlack
          : { weaknesses: [...scout.prep.asWhite.weaknesses, ...scout.prep.asBlack.weaknesses],
              strengths: [...scout.prep.asWhite.strengths, ...scout.prep.asBlack.strengths] });
      const all = [...lookups.weaknesses, ...lookups.strengths];
      const totalAll = all.reduce((s, o) => s + o.totalGames, 0);
      const found = all.find(o => matchOpeningName(o, claim.expected_in_data));
      if (!found) return { matched: false };
      const computedPct = (found.totalGames / totalAll) * 100;
      const ok = Math.abs(computedPct - (claim.expected_in_data.stated_pct ?? 0)) <= 5;
      return { matched: ok, matchedEntry: { opening: found.name, computedPct } };
    }
    case "profile_dimension": { ... }
    // ... 24 more branches, each ~5-10 LOC
  }
}
```

Tolerances are tabled in §3 — most are ±5pp for percentages, ±25 for ratings, ±50cp for phase deltas, ±1 for streak counts, ±10 plies for game length. Codified as constants.

**Substring-match helpers** for opening names, rival names, archetype labels. The LLM may phrase "Sicilian Najdorf" or "Najdorf Sicilian" or just "Najdorf" — match if any of `opening.name + ' ' + opening.variation` or just `opening.name` is a case-insensitive substring of the claim's `opening_name`. Tested with adversarial cases.

---

## 6. Opportunity counting — for citation-rate denominator

Per [PR_1C_PLAN.md §6.2](PR_1C_PLAN.md): each "non-default" entry in scout output counts as one citation opportunity. Stage A.9's `citationRate.ts` aggregates these per turn against actual citations. For scout, the counting helper is:

```typescript
export function countScoutOpportunities(
  scout: ScoutAnalytics,
  collisions?: Collisions
): Opportunity[] {
  const opps: Opportunity[] = [];
  // prep: each weakness/strength entry across both colors = 1 opp each
  // profile: each non-default dimension + ratings entry + landmark + recent + phaseElo = 1 each
  // stalker: total + each non-zero factor = 1 each
  // psychology: each metric with a notable value = 1 each
  // rivals, novelty, checklist, recentBuckets, collisions: each entry = 1 each
  return opps;
}
```

"Non-default" predicates are documented inline (e.g., `timeoutRate > 5%` to count as a notable opportunity, vs every rate ≥ 0 counting). The defining condition for each opportunity is one of two:
1. **Existence-based:** the entry exists in the array (rivals, novelty, checklist, recent buckets, collisions, prep openings) → 1 opp each.
2. **Threshold-based:** the metric is non-default *and exceeds a noteworthiness bar* (e.g., timeout rate above 5% is notable; below 5% the coach is unlikely to cite it). Thresholds tabled in the test fixtures.

For the citation-rate denominator: `opportunities = countScoutOpportunities(scout, collisions).length`. For the numerator: count of claims from the parser that matched ≥1 scout entry. Floor for `opponent_prep` category is **85%** per [PR_1C_PLAN.md §5.3.2](PR_1C_PLAN.md).

---

## 7. Test fixture outline

Vitest at `src/lib/mastermind/__tests__/validators/scoutCitation.test.ts`. Same pattern as the existing 24-test category-classifier file + the existing PR 1.B validator tests. **Mocked parser** returns predetermined `ParsedScoutClaim[]`; **fixture ScoutAnalytics + Collisions** built inline per test.

### 7.1 Coverage by claim type

For each of the 26 claim types (or 20/15 per §1 decision), three tests minimum:
- **Match positive:** real scout data has the entry; coach claims it; validator passes.
- **Match negative:** real scout has the entry; coach claims a different value (outside tolerance); validator fires.
- **Invented:** scout data lacks the entry entirely; coach invents a claim; validator fires.

Plus per-category integration tests covering the cross-check semantics:
- **Opening: color disambiguation.** Coach says "opponent plays Najdorf" without naming color; validator checks both asBlack and asWhite (the opponent plays Najdorf as Black is the typical case, but the parser shouldn't fail if the coach doesn't explicitly say "as black").
- **Profile: dimension dispatch.** Coach says "attacking score 78"; parser extracts `dimension: "atk"`; validator reads `profile.atk`. Cross-check on each dimension separately.
- **Ratings: time-class dispatch.** Coach says "1800 in rapid"; parser extracts `time_class: "rapid", stated_rating: 1800`; validator reads `profile.ratings.rapid`. Test with all 5 time-class values.
- **Stalker factors: ID dispatch.** Coach says "tilts hard"; parser extracts `factor_id: "tilts"`; validator finds the matching `stalker.factors[]` entry.
- **Collisions: color dispatch.** Coach says "when you play White and they play Black, you score 65%"; parser extracts `your_color: "white"`; validator reads `Collisions.whenYouPlayWhite[]`.
- **Substring matching: opening names.** Coach says "Najdorf"; ScoutAnalytics has "Sicilian Najdorf Variation". Validator should match. Coach says "Italian Game"; ScoutAnalytics has "Najdorf"; validator should NOT match.
- **Tolerance edge cases:** stated 1820 vs actual 1845 (diff 25, at boundary) — passes. Stated 1820 vs actual 1846 (diff 26) — fails.

### 7.2 Adversarial cases

- **Metaphorical commentary not flagged.** Coach says "they like attacking positions" → `claim_class: "qualitative_commentary"` → validator skips. No fire.
- **Hedged claims at low confidence.** "Around 60% in the Najdorf, give or take" with confidence 0.7 — still factual_scouting_claim, validator runs. With confidence 0.3 — below threshold, skipped.
- **Attribution rule.** "You mentioned they tilt" → qualitative_commentary (user-attributed). No fire.
- **Stale opening name.** Coach cites "Reti Opening" but the opponent's prep lists only "Anti-Sicilian". No match → fires unsupported.

### 7.3 Opportunity-counter tests

Direct unit tests on `countScoutOpportunities`:
- All-default scout output → zero opportunities.
- Full-rich scout (multiple openings, all profile dimensions filled, all psychology rates > threshold) → known opportunity count.
- Threshold edge cases: timeoutRate at exactly 5% — counts or not? (Decision: ≥ 5% counts. Documented in fixture.)

### 7.4 Test count estimate

- 3 × 26 = 78 claim-type tests (positive/negative/invented per claim) under Option A; ~60 under Option B; ~45 under Option C.
- ~15 cross-cutting integration tests (color dispatch, substring matching, tolerance edges).
- ~10 adversarial tests.
- ~8 opportunity-counter tests.
- **Total ~111 new tests** under Option A; ~93 under B; ~78 under C.

Patterns established by the existing 24-test categoryClassifier suite + PR 1.B's validator tests. Mock parser + inline fixtures; no live API hits.

---

## 8. File scope + LOC estimate (Option A)

| File | New / Modified | LOC est (Option A) |
|---|---|---|
| `src/lib/mastermind/validators/scoutCitation.ts` | New | ~1,100 |
| `src/lib/mastermind/validators/parserPrompts.ts` | Modified — add `SCOUT_CITATION_PARSER_SYSTEM` + `buildScoutCitationUserTurn` | ~+200 |
| `src/lib/mastermind/validators/types.ts` | Modified — add 26 `ScoutClaimType` values + `ParsedScoutClaim` interface + `MatchResult` type | ~+110 |
| `src/lib/mastermind/validators/index.ts` | Modified — export `validateScoutCitation` + new types | ~+10 |
| `src/lib/mastermind/__tests__/validators/scoutCitation.test.ts` | New | ~700 |
| **Total** | | **~1,420 lib + ~700 test = ~2,120 LOC** |

Under Option B: ~1,100 + ~550 = ~1,650 LOC. Under Option C: ~850 + ~450 = ~1,300 LOC.

The `runValidationPipeline.dataSources` extension required to actually CALL `validateScoutCitation` from the pipeline is **deferred to Stage A.9** — a separate plan addendum. This commit ships the validator as a library-only addition; pipeline wiring happens next.

---

## 9. Acceptance gate

- `npx tsc --noEmit` clean on branch-tracked content.
- `npm run test` 100% green (180 existing + ~111 new = 291).
- Dry-run harness (`npx tsx scripts/mastermind/validator-gate-dryrun.ts`) still exits 0 on default config, exits 1 on `--override-tolerance=2000`. The harness uses PR 1.B validators only — scoutCitation isn't yet wired through it. Acceptable for this commit; the harness gets extended in Stage A.9.
- Commit message includes: claim-type count shipped (per §1 decision), LOC totals, test pass count.

---

## 10. Pause for review

**Aayan must answer §1 (claim-type coverage decision) before code begins.** Default is Option A (ship all 26); alternates are Option B (collapse to 20) or Option C (high-value subset of ~15).

After Aayan signs off the scope, this plan section gets a "Resolved: Option X" header and code starts. No further plan-review needed for the implementation itself — the patterns are established by PR 1.B, so the implementation is mechanical against this spec.

Subsequent Stage A plan addenda land for `userHistoryAggregates`, `userHistoryCitation`, and the `citationRate` + `runValidationPipeline.dataSources` extension. Each is a smaller plan section than this one (those data sources have less surface area). Stage B resumes only after all four Stage A items seal.
