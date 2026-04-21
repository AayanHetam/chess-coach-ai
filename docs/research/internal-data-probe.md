# Internal Data Probe: Does Structural Similarity Amplify Concept-Reinforcement?

**Status:** Part A2 — probe sketch. Primary finding: **we have no usable puzzle-attempt logs** in Firestore, so the direct probe cannot run. This doc records that gap, specifies the minimum logging needed to close it, and proposes a public-data proxy analysis that can run immediately.

---

## 1. What we'd ideally measure

> After a student misses a puzzle with concept C, does their success rate on a *next-day* puzzle with concept C correlate with the structural similarity between the two puzzles?

Operationalization:

- For each (user, missed puzzle P1, next-day attempted puzzle P2) tuple where both puzzles share concept C:
  - `x` = embedding-cosine(P1, P2) using any reasonable position encoder (stopgap: the current 50-dim handcrafted vector; better: the B3 learned embedding once trained).
  - `y` = 1 if P2 solved on first attempt, 0 otherwise.
- Fit a mixed-effects logistic regression: `y ~ x + user_elo + puzzle_elo + (1 | user) + (1 | concept)`.
- Look for a positive, significant `x` coefficient: higher structural similarity → higher solve probability, *controlling for concept*.

A positive effect would be direct internal evidence for the thesis of Part A1. A null effect would be a warning signal (though not a refutation — concept labels may be too coarse to see the within-concept variation).

---

## 2. Why we can't run it today

Survey of the codebase (`src/lib/firestoreUsers.ts`, `src/lib/puzzleRating.ts`, `src/lib/chessPuzzlesService.ts`, puzzle UI components) finds no persisted puzzle-attempt log. Observations:

- Puzzle Rush scores are stored in a Jotai atom (`puzzleRushScoresAtom`) — local only, not synced.
- `puzzleRating.ts` has no Firestore writes.
- No `puzzleAttempts` subcollection under `users/{uid}` exists in any Firestore schema we could find.
- Grep for `puzzleAttempt|PuzzleAttempt` returns hits only in `repetitTraining.ts` (opening-repertoire drilling, not tactic puzzles) and `PracticeChessBoard.tsx` (in-memory component state).

Conclusion: there is no longitudinal per-user puzzle-outcome record. The Part A3 A/B trial and the A2 probe both block on this.

---

## 3. Minimum logging to unblock (ship with Part C3 telemetry)

Add a Firestore subcollection:

```
users/{uid}/puzzleAttempts/{attemptId}
  puzzleId: string
  fen: string
  servedAt: Timestamp
  firstAttemptAt: Timestamp
  solved: boolean
  attemptsUsed: number
  userEloAtTime: number
  servingContext: 'reinforcement' | 'rush' | 'daily' | 'probe'
  anchorPuzzleId?: string            // the miss that triggered this reinforcement, if any
  detectedConcepts: string[]         // from the B2 classifier
  embeddingCosineToAnchor?: number   // captured at serve time for retrospective analysis
```

This is the same log the Part C3 telemetry plan already calls for, just made concrete. Write-on-event from the puzzle UI; batch-buffer to stay within Firestore free-tier budgets.

Expected time to accumulate a probe-capable dataset: ~2 weeks at current traffic levels, assuming ~50 daily active puzzle solvers × 10 attempts/day = ~7k attempts, enough for exploratory analysis on the most common concepts.

---

## 4. Proxy analysis we can run now (public Lichess data)

Lichess publishes per-puzzle solve-rate statistics (field `Popularity` and the implicit rating-adjusted solve rate from their puzzle rating model). We already have the 100K-puzzle CSV.

Proxy question, answerable today: **do puzzles with similar structure *and* shared theme cluster in solve-rate, more tightly than puzzles with shared theme but different structure?**

Sketch:
1. Take pairs of puzzles that share a common Lichess theme tag (e.g., `backRankMate`).
2. For each pair, compute the 50-dim cosine similarity.
3. Compute the absolute difference in Lichess puzzle rating (a proxy for empirical difficulty).
4. Bin pairs by cosine similarity. Within each theme, check whether high-cosine pairs have tighter rating distributions than low-cosine pairs.

A positive result would say: within a theme, structural similarity predicts empirical difficulty coherence. Not the same as "similar examples teach better," but a directional signal that structural similarity carries real information about the position beyond the theme tag. Costs <1 hour of compute and gives us something to cite internally before the A/B trial is possible.

Defer this to after Part B1/B2 ship (so concept labels, not Lichess themes, are the grouping variable) — the analysis is strictly stronger with concept labels.

---

## 5. Decision

- Do not block Part B on A2 — the literature synthesis (A1) carries the justification.
- Ship puzzleAttempt logging as the **first** concrete artifact of Part C3 telemetry so A2 becomes runnable within 2 weeks of Part B landing.
- Run the Lichess-public proxy analysis opportunistically once concept labels exist.
