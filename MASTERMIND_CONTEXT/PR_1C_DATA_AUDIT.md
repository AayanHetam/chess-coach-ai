# PR 1.C Data Audit — verifying data-source assumptions before §6 finalization

**Date:** 2026-05-17
**Audit posture:** read-only investigation. No code changes, no live database queries. Findings are sourced from current branch state (`mastermind/stage-3-validators`) cross-referenced against [MASTERMIND_DATA_INVENTORY.md](MASTERMIND_DATA_INVENTORY.md), [MASTERMIND_TOOLS.md](MASTERMIND_TOOLS.md), [MASTERMIND_CODEBASE_MAP.md](MASTERMIND_CODEBASE_MAP.md), and CLAUDE.md.

**Why this audit exists.** Aayan flagged 2026-05-17 that two pieces of project context turned out stale: (a) the Jhamtani commentary corpus was previously documented as living in Neo4j Aura but may have been removed, and (b) the Lichess puzzle corpus is 100K, not the 200K some docs cite. By extension, the other data sources PR 1.C depends on (Scout output, Firestore user history) may also be misdescribed. Before PR_1C_PLAN.md §6 (the three new citation validators) is finalized, this audit verifies the actual state.

**Verification limits.** Three things cannot be answered from this branch alone:
- **Live Aura row counts** — `MATCH (n:Commentary) RETURN count(n)` and `MATCH (p:Puzzle) RETURN count(p)`. Requires a live Aura session.
- **Live Firestore document existence** — whether actual user docs carry the optional fields documented in code, in production.
- **HF Maia state** — out of audit scope.

For each source below, the doc records: what the docs claim, what the code shows, what's verifiable / unverifiable from the audit, and a recommendation for Aayan to act on.

---

## Source A — Jhamtani commentary corpus

### A.1 What the docs claim

| Source | Claim |
|---|---|
| [MASTERMIND_DATA_INVENTORY.md §preloaded](MASTERMIND_DATA_INVENTORY.md) | "Jhamtani et al. (ACL 2018) ChessCommentaryGeneration corpus under `chess-commentary/`" exists in `data/`. Loader is design-only; *"Not currently wired into a runtime endpoint — it's a sidecar that could feed the `(Commentary)−[:FROM_POSITION]→(Position)` edges."* |
| [PR_1C_PLAN.md §6.4](PR_1C_PLAN.md) | Validator data source = Neo4j Jhamtani commentary corpus. Schema = `:Concept` nodes with `:HAS_COMMENTARY` edges to `:CommentaryEntry` nodes containing example games + prose. |
| [src/app/faq/page.tsx:59](../src/app/faq/page.tsx#L59), [LandingFeatures.tsx:111](../src/components/landing/LandingFeatures.tsx#L111), [architecture/page.tsx:229](../src/app/architecture/page.tsx#L229), [how-it-works/page.tsx:182](../src/app/how-it-works/page.tsx#L182) | Public marketing claims "298,000+ Jhamtani expert-commentary pairs" joined to the puzzle graph. |
| [scripts/neo4j-loaders/load-commentary.mjs](../scripts/neo4j-loaders/load-commentary.mjs) | Loader exists. Downloads from `github.com/harsh19/ChessCommentaryGeneration`. Default limit 500. Builds `(Position)←[:FROM_POSITION]−(Commentary)` and `(Commentary)−[:IN_OPENING]→(Opening)` edges per [setup-graph.mjs:7](../scripts/neo4j-loaders/setup-graph.mjs#L7). |
| [src/app/api/commentary-by-fen/route.ts](../src/app/api/commentary-by-fen/route.ts) | Live route. Queries `MATCH (pos:Position)<-[:FROM_POSITION]-(c:Commentary)` and returns `{id, text, move, moveNumber, playerRating, opening, gameId}`. |
| [scripts/concept-pipeline/README.md:14](../scripts/concept-pipeline/README.md#L14) | "`04-link-commentary.ts` — *(Part B6 — future)* Links the orphaned Jhamtani commentary nodes to their nearest puzzles by embedding cosine." Implies commentary nodes exist in some form but are orphan (not linked to puzzles). |

### A.2 What the code shows

| Verifiable from code | State |
|---|---|
| `data/chess-commentary/` on disk | **Present** (verified via `ls`). Subdirs: `Code/`, `Data/`, `README.md`. |
| Loader script for Aura | **Present** at `scripts/neo4j-loaders/load-commentary.mjs`. Schema produced: `:Commentary` node with `{id, text, move, moveNumber, playerRating, opening, gameId}`, `:Position` and `:Opening` linked nodes. |
| Live HTTP route | **Present** at `/api/commentary-by-fen`. Schema verified — queries `:Commentary` nodes via `[:FROM_POSITION]` from `:Position`. |
| In-app consumers of the route | **Zero** outside the route itself. No `fetch("/api/commentary-by-fen")` anywhere in `src/`. |
| Use in concept-retrieval pipeline | **None.** [src/lib/concept/conceptRetrieval.ts](../src/lib/concept/conceptRetrieval.ts) does not reference Commentary nodes; the retrieval pipeline operates over `Puzzle`/`Theme`/`Position` only. |
| Schema vs PR_1C_PLAN.md §6.4 spec | **Material mismatch.** Plan-§6.4 specced `:Concept` nodes with `:HAS_COMMENTARY` edges. Actual loader builds `:Commentary` nodes hung off `:Position`. No `:Concept` node type, no `:HAS_COMMENTARY` edge. |

### A.3 What this audit cannot verify

- Whether the `:Commentary` nodes still exist in the live Aura instance, or whether Aayan removed them.
- The actual node count if they exist.
- Whether the public marketing claim "298,000+" was ever populated to Aura or has always been aspirational.

### A.4 Delta vs PR_1C_PLAN.md §6.4

| Aspect | §6.4 spec | Code reality | Delta |
|---|---|---|---|
| Node type | `:Concept` | `:Commentary` | Different name |
| Relationship | `:HAS_COMMENTARY` | `:FROM_POSITION` (from Position) | Different edge model — Position-hub, not Concept-hub |
| Schema fields | `text snippets + example games` per `:CommentaryEntry` | `{id, text, move, moveNumber, playerRating, opening, gameId}` directly on `:Commentary` | Different shape; no separate Entry type |
| Concept-to-position grouping | `conceptDetector.detectConcepts(fen)` → concept-keyed opportunities | Position-keyed; opportunities would have to be derived via FEN match + concept-tag filter | The plan's opportunity-counting model needs reworking |

### A.5 Recommendation for Aayan

Three options for `jhamtaniCitation.ts` in PR 1.C:

| Option | Cost | What it requires |
|---|---|---|
| **A. Wire it up first** — verify Aura state, re-load Jhamtani via `load-commentary.mjs` if needed, re-spec §6.4 with `:Commentary` node shape. **Becomes a precursor sub-PR before §6.4 ships.** | Medium — Aura load is mechanical but takes a session; §6.4 needs rewrite | Confirm Aura has `:Commentary` nodes (or schedule a reload); rewrite §6.4 against `:Commentary` shape |
| **B. Drop** — remove `jhamtaniCitation.ts` from PR 1.C scope. Concept-explanation category falls back to citation rate 0 against an empty source (no opportunities = no floor failure). | Low — clean removal; §6.4 → trash | Update §6, §2.5, §5.3.2 to reflect "concept explanation has no automated citation validator in 1.C" |
| **C. Defer** — split `jhamtaniCitation.ts` into a follow-up PR ("PR 1.D"). PR 1.C ships without it; concept-explanation citation tracking is paused until 1.D. | Low — defer cleanly; concept_explanation category gets a known-gap note | Same as B for §6, plus a "deferred to 1.D" stub in §11 (CMIP redirection) clarifying that PR 1.D depends on confirmed Jhamtani Aura state |

**Surfacing for Aayan:** the public marketing claim of "298,000+ Jhamtani expert-commentary pairs" is on **four** prod pages right now. If A.3 reveals the corpus is in fact removed, those pages assert something not true. That's a separate concern from PR 1.C but worth flagging in the same breath — the audit isn't the place to fix marketing copy, but it surfaces the dependency.

---

## Source B — Lichess puzzle corpus

### B.1 What the docs claim

| Source | Claim |
|---|---|
| MASTERMIND_DATA_INVENTORY.md SUMMARY | "Live database is Neo4j (Aura free tier) holding **~200,000 puzzles** loaded from the 100k CSV." Discrepancy table flags this: doc says 200k, CSV is 100k. "Resolves with a live `count(p:Puzzle)` against Aura." |
| MASTERMIND_DATA_INVENTORY.md §Preloaded | CSV file: `data/lichess_puzzles_100k.csv` — 100,001 rows (1 header + 100,000 puzzles), 18 MB. Verified on disk. |
| Public site copy (FAQ, LandingFeatures, how-it-works, architecture) | "**100,000+** Lichess puzzles" — matches the CSV, not the 200k claim. |
| Ingest filter thresholds | `MIN_POPULARITY=60`, `MIN_NB_PLAYS=50`, `MAX_RATING_DEVIATION=120` per [scripts/build-puzzle-db.py:31-33](../scripts/build-puzzle-db.py#L31-L33). |
| `.mjs` vs `.py` ingest filter | `import-lichess-puzzles.mjs:49` defaults `MIN_NB_PLAYS=100`, not 50. Discrepancy already documented. |
| User update 2026-05-17 | "Lichess puzzle corpus is 100K, not 200K. Filter thresholds may or may not still match what's in Aura." |

### B.2 What the code shows

| Verifiable from code | State |
|---|---|
| Source CSV file size | `data/lichess_puzzles_100k.csv` — **100,001 rows**, 18 MB. Confirmed. |
| Loader thresholds | Two scripts; `.py` uses 50/60/120; `.mjs` uses 100/60/120. **Disagree on `MIN_NB_PLAYS`.** |
| Loader default limit | `load-puzzles.mjs` defaults `--limit=100000`. |
| Schema | `:Puzzle {puzzleId, fen, moves, rating, popularity, nbPlays}` per [puzzleRepository.ts:7-15,68-88](../src/lib/puzzleRepository.ts#L7-L88). Confirmed in current code. |
| Connection wiring | [neo4j.ts:20-40](../src/lib/neo4j.ts#L20-L40) — driver pool, `disableLosslessIntegers`. Live integration point unchanged. |

### B.3 What this audit cannot verify

- Actual `count(p:Puzzle)` in Aura (100k vs 200k vs other).
- Whether the live nodes were loaded with `.py` filters (50) or `.mjs` filters (100).
- Whether the live `min(p.nbPlays)` matches what `puzzleRepository.ts` expects.

### B.4 Delta vs PR_1C_PLAN.md (no direct §6 dep — used by featureDeltaCitation indirectly)

PR 1.C's three new validators (§6.2, §6.3, §6.4) do **not** directly query the puzzle corpus. The puzzle graph is used by `mistakeToPuzzleMapper` and `conceptRetrieval` — not by the new validators.

**Implication:** B is not a §6 blocker. It IS, however, the data the public site copy stakes claims about. If Aura has fewer than 100k puzzles (or different filter thresholds), the FAQ/landing copy may be off.

### B.5 Recommendation for Aayan

- **No PR 1.C action required.** The puzzle corpus doesn't gate any §6 validator.
- **Separate action — verify live count.** A one-off `MATCH (p:Puzzle) RETURN count(p), min(p.nbPlays), max(p.rating)` against Aura would resolve the 100k-vs-200k question and let the doc be updated. Not gating Stage A; can run anytime in the next 2 weeks.
- **MASTERMIND_DATA_INVENTORY.md fix.** Update the SUMMARY claim "~200,000 puzzles" to "~100,000 puzzles per CSV size; live Aura count pending verification" (done in §F.1 below).

---

## Source C — Scout output shape

### C.1 What the docs claim

| Source | Claim |
|---|---|
| PR_1C_PLAN.md §6.2 | `scoutService.ts` returns: opening tree, repertoire collisions, Stalker Score, tilt/timeout profiles. **Five claim types speced:** `opponent_plays_opening`, `repertoire_collision`, `stalker_score_claim`, `tilt_pattern`, `timeout_pattern`. |
| MASTERMIND_TOOLS.md `opponent_scout` | "✅ wraps [scoutService.ts:16-22](../src/lib/scoutService.ts#L16-L22) + [api/scout/](../src/app/api/scout/) + [shareCard.ts](../src/lib/shareCard.ts) — End-to-end pipeline already wired." |

### C.2 What the code shows

`src/types/scout.ts` is the authoritative type definition. **The actual output is substantially richer than §6.2 specced.**

**Actual `ScoutAnalytics` shape (verified against [src/types/scout.ts:240-249](../src/types/scout.ts#L240-L249)):**

```ts
export interface ScoutAnalytics {
  profile: ProfileSnapshot;       // ovr/atk/def/time/mind 0-100, ratings by time class, phase ELOs, archetype, win/draw/loss rates, peak/low rating, recent results
  stalker: StalkerScore;          // total 0-100, predictability, factors[] (time_trouble | tilts | limited_rep | repetitive)
  prep: TargetedPrep;             // asWhite/asBlack { weaknesses[], strengths[] } each OpeningSummary { eco, name, variation, moves, totalGames, scorePct, wins/draws/losses, lowSample }
  checklist: ChecklistItem[];     // {id, title, detail, severity}
  rivals: FrequentRival[];        // {name, games, wins/draws/losses, scorePct}
  psychology: PsychologySnapshot; // avgGameLength, quickLossRate, longGameLossRate, timeoutRate, resignRate, checkmateRate, maxWinStreak, maxLossStreak, tiltAfterLossLossRate
  recentBuckets: RecentFormBucket[]; // {label, wins, draws, losses}
  novelty: NoveltyFinding[];      // opponent deviations from their book on specific moves
}
```

**Plus separately:** `Collisions` ([scout.ts:229-238](../src/types/scout.ts#L229-L238)) carries `whenYouPlayWhite[]` / `whenYouPlayBlack[]` arrays of `CollisionLine { moves, eco, name, variation, yourColor, yourScorePct/Games, theirScorePct/Games, edge }`. Used for the "repertoire collision" PR_1C §6.2 claim — but the data shape is far more detailed than the plan accounts for.

### C.3 Delta vs §6.2

§6.2 specced 5 claim types. The actual scout output supports **many more**. Below, mapping each spec claim to data reality plus the new claim types §6.2 missed:

| Spec claim | Maps to ScoutAnalytics field | Notes |
|---|---|---|
| `opponent_plays_opening` | `prep.asWhite/asBlack.weaknesses+strengths[].name/eco/scorePct/totalGames` | Spec wording is correct; cross-check is straightforward (frequency = totalGames / sum) |
| `repertoire_collision` | Not in `ScoutAnalytics` — lives in separate `Collisions` type | Spec assumed flat collision data; actual data is structured by color × line. Cross-check needs both `whenYouPlayWhite[]` and `whenYouPlayBlack[]` |
| `stalker_score_claim` | `stalker.total` + `stalker.factors[].id/score` | Spec correct; factor-level granularity available but not in spec |
| `tilt_pattern` | `psychology.tiltAfterLossLossRate`, `stalker.factors` (id:`tilts`) | Spec correct; numeric value lives in psychology |
| `timeout_pattern` | `psychology.timeoutRate`, `stalker.factors` (id:`time_trouble`) | Spec correct |

**Claim types §6.2 missed:**

| Missing claim type | Data source | Why it matters |
|---|---|---|
| `archetype` | `profile.archetype` (string) | Coach naturally says "they play like a positional grinder" |
| `profile_dimension` | `profile.ovr/atk/def/time/mind` (5 numeric scores) | Coach cites these directly: "they have a high attacking score" |
| `rating_by_timeclass` | `profile.ratings.{bullet,blitz,rapid,classical,daily}` | Coach cites "1800 in rapid, 1500 in blitz" |
| `peak_rating` / `low_rating` | `profile.peakRating`, `profile.lowRating` | Coach narrates rating-trajectory shape |
| `recent_form_trend` | `profile.recent[]` (last N outcomes), `profile.recentAccuracy` | Coach cites "won 6 of last 10" |
| `phase_elo` | `profile.phaseElo.{baseline,opening,middle,endgame}` | Coach cites "their endgame ELO is 200 below their middlegame" |
| `quick_loss_rate` | `psychology.quickLossRate` | Distinct from tilt; coach cites "loses 15% of games in under 50 plies" |
| `long_game_loss_rate` | `psychology.longGameLossRate` | Same pattern |
| `resign_rate` / `checkmate_rate` | `psychology.resignRate`, `psychology.checkmateRate` | Coach cites how opponent typically ends games |
| `win_streak` / `loss_streak` | `psychology.maxWinStreak`, `psychology.maxLossStreak` | Streak claims |
| `checklist_item` | `checklist[]` | Coach references prep checklist items by id or title |
| `rival_record` | `rivals[]` | "You've played them 12 times, you're 4-2-6" |
| `recent_form_bucket` | `recentBuckets[]` | "Their last 20 rated games: 12 wins, 3 draws, 5 losses" |
| `novelty_finding` | `novelty[]` | "They deviated from book on move 8 in this game and lost" |
| `collision_edge` | `Collisions.whenYouPlayWhite[]` / `whenYouPlayBlack[]` | Color-specific edge claims |

### C.4 Recommendation for Aayan

§6.2 is **materially incomplete**. Three options:

| Option | Cost | What it gives |
|---|---|---|
| **A. Expand §6.2 to cover all of ScoutAnalytics + Collisions** | Higher LOC (~600 vs 280), more parser claim types, larger test surface | Full coverage; high citation rate floor (85%) is achievable because validator sees everything coach might cite |
| **B. Ship §6.2 with current 5 claim types only** | Original ~280 LOC | Validator catches the most obvious citation patterns; missing claim types fall through as "qualitative_commentary" or get falsely flagged as unsupported (validator can't verify them). Citation-rate denominator under-counts |
| **C. Phase scout coverage** — ship 1.C with the 5 specced types + a tier-2 list (collisions, profile_dimension, archetype, rating_by_timeclass), defer the rest to a follow-up | Medium LOC | Reasonable middle ground |

**Recommended default: A.** The scout output is the richest single data source PR 1.C touches and the citation floor is 85%. Under-counting opportunities will skew the metric — either by missing validator fires (false-passes on invented claims) or by inflating citation rates (the coach incidentally mentioned `archetype` but my validator didn't count it as a "citation" because the spec didn't list it). Doing the full expansion is the right answer.

---

## Source D — User history in Firestore

### D.1 What the docs claim

| Source | Claim |
|---|---|
| PR_1C_PLAN.md §6.3 | "Firestore (`users/{uid}/games`, `users/{uid}/puzzle_stats`, `users/{uid}/rating_history`). All reads server-side via Firebase Admin." |
| §6.3 parser claim types | `rating_trajectory`, `time_control_performance`, `puzzle_stats_claim`, `opening_repertoire_performance`, `hours_played_claim`, `puzzle_rating_trajectory` (6 types) |
| MASTERMIND_TOOLS.md `get_weakness_profile`, `get_srs_state`, `get_repetit_history` | All marked **🟡 partial — localStorage-only, no server endpoint** |

### D.2 What the code shows

**Firestore subcollections actually under `users/{uid}` (verified by exhaustive grep of `src/app/api/`):**

| Subcollection | Source | Schema |
|---|---|---|
| `games` | [api/games/route.ts:8](../src/app/api/games/route.ts#L8) `SUBCOLLECTION = "games"`. Stores `Game` ([src/types/game.ts](../src/types/game.ts#L3-L17)) with embedded `GameEval` after analysis | `{pgn, white, black, result, eval?, termination?, timeControl?, ...}` |
| `chats` | [api/chats/route.ts:8](../src/app/api/chats/route.ts#L8) `SUBCOLLECTION = "chats"` | Chat history records |
| **none for puzzle_stats** | Not found in any route under `src/app/api/` | — |
| **none for rating_history** | Not found | — |
| **none for repertoire** | Not found | — |

**User document fields** (from [src/lib/firestoreUsers.ts](../src/lib/firestoreUsers.ts) `UserProfile` interface):

```ts
{
  uid, email, displayName?, photoURL?, bio?,
  chesscomUsername?, lichessUsername?,
  selfReportedRating?, primaryPlatform?,
  rating?,                          // a single scalar; not a history
  coachTone?, playingStyle?, studyGoals?, favoriteOpenings?,
  boardTheme?, pieceSet?,
  createdAt?, updatedAt?,
}
```

**Where puzzle stats actually live** ([src/lib/puzzleRating.ts:46](../src/lib/puzzleRating.ts#L46)):

```ts
export const puzzleStatsAtom = atomWithStorage<PuzzleStats>(
  "chessMastiPuzzleStats",      // localStorage key
  DEFAULT_STATS
);
```

`PuzzleStats` includes `rating`, `totalAttempts`, `totalSolved`, `currentStreak`, `bestStreak`, `ratingHistory[]`, `themeStats`, `recentSolves[]`. All **localStorage-only**. No `/api/puzzle-stats` endpoint exists.

### D.3 Delta vs §6.3

| Spec claim type | Spec data source | Reality | Verdict |
|---|---|---|---|
| `rating_trajectory` | `users/{uid}/rating_history` | **Does not exist server-side.** `puzzleStats.ratingHistory` is localStorage-only. User doc carries only a scalar `rating`, no history. | **Unverifiable from server** without a client upload |
| `time_control_performance` | (implied) games subcollection aggregation | **Derivable.** `users/{uid}/games[].timeControl + .result + .white/black` → win-rate by time control. Requires server-side aggregation logic. | Verifiable; new code needed |
| `puzzle_stats_claim` | `users/{uid}/puzzle_stats` | **Does not exist server-side.** Lives in localStorage. | **Unverifiable from server** without upload |
| `opening_repertoire_performance` | (implied) games subcollection aggregation | **Derivable.** Parse PGN headers for ECO/opening, aggregate. | Verifiable; new code needed |
| `hours_played_claim` | (implied) games subcollection count | **Derivable.** Count `games` subcollection by date range. | Verifiable; new code needed |
| `puzzle_rating_trajectory` | `users/{uid}/puzzle_stats.ratingHistory[]` | **Does not exist server-side.** Lives in localStorage. | **Unverifiable from server** without upload |

**Three of six §6.3 claim types depend on localStorage data the server cannot read.** This was anticipated in MASTERMIND_TOOLS.md (`get_weakness_profile`, `get_srs_state`, `get_repetit_history` marked 🟡 partial); §6.3 inadvertently re-claimed those as server-readable.

### D.4 Recommendation for Aayan

| Option | Cost | What it gives |
|---|---|---|
| **A. Sync puzzle stats to Firestore as a precursor sub-PR** | Medium — adds `POST /api/puzzle-stats` (client posts on update) + Firestore writes + server-side migration | All 6 §6.3 claim types become server-readable. Closes the same gap as MASTERMIND_TOOLS.md `get_weakness_profile` 🟡 partials. Big win beyond just PR 1.C. |
| **B. Ship §6.3 with only the 3 server-derivable types** | Low — drop `rating_trajectory`, `puzzle_stats_claim`, `puzzle_rating_trajectory` from the validator. Add new aggregator helpers for the games-derived types. | Citation floor at 50% (improvement_strategy) and 20% (meta_motivational) becomes harder to hit because fewer claim types count as opportunities. Some classes of useful citation go unverified |
| **C. Defer §6.3 entirely** — drop `userHistoryCitation.ts` from PR 1.C. | Lowest | improvement_strategy + meta_motivational categories have no citation validator in 1.C. Floor failures inevitable on those categories — unless the floor is also dropped or the categories are excluded from gate |

**Recommended default: B + A as a follow-up.** Ship §6.3 with the 3 server-derivable claim types in PR 1.C (closes the most common citation patterns); add the puzzle-stats-sync work as a Phase 1.5 prerequisite alongside CMIP. When puzzle stats land in Firestore, expand §6.3 to the remaining 3 in a follow-up PR.

---

## Source E — PR 1.A feature delta + piece-role diff

### E.1 What §6 specs assume

| Source | Claim |
|---|---|
| PR_1B featureDeltaCitation.ts (already shipped) | Cross-checks `claim_type` against `PositionFeatureDelta` fields: `materialDelta.{white/black}`, `kingSafetyDelta.{white/black}`, `pawnStructureDelta.passedPawnsGained/Lost.{white/black}`, `pawnStructureDelta.openFilesGained/Lost`, `pawnStructureDelta.{doubledPawnsChange/isolatedPawnsChange}.{white/black}`, `hangingPiecesDelta.{newlyHanging/nowDefended}`, `threatsDelta.{newThreats/resolvedThreats}` |
| PR_1B featureDeltaCitation.ts | Cross-checks `claim_type: role_gained/role_lost` against `RoleChange[]` with fields `{square, piece, color, gained: PieceRole[], lost: PieceRole[]}` |

### E.2 What the code shows

**PositionFeatureDelta** ([src/lib/mastermind/featureDelta.ts:56](../src/lib/mastermind/featureDelta.ts#L56)):

```ts
interface PositionFeatureDelta {
  fenBefore: string;
  fenAfter: string;
  resolutionFen: string;
  resolutionReason: ResolutionReason;
  materialDelta: { white: number; black: number };
  pawnStructureDelta: PawnStructureDelta;  // doubledPawnsChange, isolatedPawnsChange, passedPawnsGained/Lost, openFilesGained/Lost, semiOpenFilesGained/Lost
  kingSafetyDelta: { white: number; black: number };
  pieceActivityDelta: PieceActivityDelta;  // gainedActive, lostActive, newlyTrapped
  hangingPiecesDelta: HangingPiecesDelta;  // newlyHanging, nowDefended
  threatsDelta: ThreatsDelta;              // newThreats, resolvedThreats, carriedOverThreats
  isEmptyDelta: boolean;
}
```

**RoleChange** ([src/lib/mastermind/pieceRoles.ts:23](../src/lib/mastermind/pieceRoles.ts#L23)):

```ts
interface RoleChange {
  square: Square;
  piece: PieceSymbol;
  color: Color;
  gained: PieceRole[];     // attacker | defender | pinned | pinning | overworked | outpost | bad-bishop | tactical-anchor
  lost: PieceRole[];
}
```

**Verified against PR 1.B featureDeltaCitation.ts:** every field referenced by the validator's `matchClaim` function exists in PositionFeatureDelta / RoleChange. No drift detected.

### E.3 Delta vs §6 plan

**None.** PR 1.A primitives match what PR 1.B and PR 1.C plan to consume. featureDeltaCitation.ts (PR 1.B) is already wired correctly. PR 1.C's new validators don't touch these structures directly.

**Tangentially noted but not blocking:** `pieceActivityDelta` and `threatsDelta.carriedOverThreats` are populated by PR 1.A but not currently used by featureDeltaCitation. Coach claims like "the knight became more active" or "the threat persisted" would map to these fields if a future claim type covered them. Not in §6 scope.

### E.4 Recommendation for Aayan

**No action.** Source E is verified clean.

---

## F. Audit summary

### F.1 Per-source verdict table

| Source | Verifiable status | §6 mismatch severity | Recommendation |
|---|---|---|---|
| **A — Jhamtani corpus** | Loader + route + data dir present; **live Aura state unknown**; route has zero in-app callers; schema in plan ≠ schema in loader | **Material** — wrong node type name, wrong edge model | Aayan decides: A (wire it up first, sub-PR), B (drop), C (defer to 1.D). **Public marketing copy depends on this; flag as separate concern.** |
| **B — Lichess puzzles** | CSV is 100k; loader scripts disagree on `MIN_NB_PLAYS`; live count unknown | **No §6 dep** | No PR 1.C blocker. Verify count separately; update DATA_INVENTORY claim from "~200k" → "~100k pending verification" |
| **C — Scout output** | Type definitions verified; **§6.2 covers ~30% of actual data surface** | **Material** — 5 spec claim types vs ~20 real opportunity types | Aayan decides: A (expand to full coverage, recommended), B (ship as is, accept under-counting), C (phase coverage) |
| **D — Firestore user history** | Subcollections verified: only `games` + `chats`; puzzle stats are localStorage-only; rating history is localStorage-only | **Material** — 3 of 6 §6.3 claim types unverifiable from server | Aayan decides: A (sync puzzle stats to Firestore as precursor), B (ship 3 derivable + defer 3), C (drop §6.3) |
| **E — PR 1.A primitives** | Schemas verified; PR 1.B already wired correctly | **None** | No action |

### F.2 Aggregate impact on PR 1.C

If all "recommended default" options are taken:

- **A — defer (option C):** PR 1.C ships without `jhamtaniCitation.ts`. Concept-explanation category gets a "no citation validator in 1.C" note. Citation rate floor (60%) cannot fire → effectively excluded from the gate for now.
- **B — verify separately:** Doc fix only.
- **C — expand fully (option A):** §6.2 grows from 5 to ~20 claim types. Validator LOC roughly doubles (560 → ~1100). Test LOC roughly doubles (280 → ~550).
- **D — ship 3 + defer 3 (option B + A follow-up):** §6.3 ships with `time_control_performance`, `opening_repertoire_performance`, `hours_played_claim`. Three other claim types deferred to a follow-up after puzzle-stats sync ships.
- **E — no change.**

**New PR 1.C LOC totals (under recommended defaults):**

| | Original revised (2026-05-17) | Audit-revised (post-2026-05-17 audit) |
|---|---:|---:|
| `scoutCitation.ts` lib | ~280 | **~1,100** (full ScoutAnalytics coverage) |
| `scoutCitation.ts` tests | ~280 | **~550** |
| `userHistoryCitation.ts` lib | ~260 | **~150** (3 server-derivable claim types only) |
| `userHistoryCitation.ts` tests | ~270 | **~160** |
| `jhamtaniCitation.ts` lib | ~240 | **0** (deferred) |
| `jhamtaniCitation.ts` tests | ~250 | **0** (deferred) |
| Other §6 lib (classifier, citationRate, prompts, types, index) | ~600 | ~600 |
| Other §6 tests | ~320 | ~320 |
| **§6 lib subtotal** | **~1,380** | **~1,850** (+34%) |
| **§6 test subtotal** | **~1,120** | **~1,030** |

Net: PR 1.C grows by ~470 lib LOC and shrinks slightly on test LOC because deferring jhamtani removes its test surface. Stage B + Stage C unchanged.

### F.3 What needs to happen before Stage A.1 code starts

1. **Aayan reviews this audit's recommendations** and picks per-source: A (wire-up sub-PR) / B (drop or partial) / C (defer).
2. **PR_1C_PLAN.md §6 is re-revised** with the decisions: §6.2 scope set, §6.3 scope set, §6.4 either re-specced against `:Commentary` shape or removed entirely.
3. **MASTERMIND_DATA_INVENTORY.md is updated** with the audit findings as corrected ground truth (separate commit to keep the audit and the inventory update distinct).
4. **Only then does 1.C.A.1 (`categoryClassifier.ts`) code start.**

### F.4 Out-of-scope concerns flagged for follow-up

- **Public marketing copy** on FAQ / LandingFeatures / how-it-works / architecture claims "298,000+ Jhamtani expert-commentary pairs." If Aura no longer has those nodes, the copy is asserting something not true. Separate concern; not in this audit's lane to fix but worth flagging in the same breath as Aayan's per-source call on Source A.
- **`MIN_NB_PLAYS` divergence** between `.py` (50) and `.mjs` (100) ingest scripts. Already in DATA_INVENTORY discrepancy table; live Aura count would resolve which value was applied. Not gating.
- **Local Lc0 vs HF Spaces Maia coexistence.** Already in DATA_INVENTORY discrepancy table. Out of audit scope.
