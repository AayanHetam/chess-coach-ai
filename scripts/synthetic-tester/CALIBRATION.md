# Helpfulness-judge calibration procedure

The Claude jury (`helpfulnessJury.ts`) is **uncalibrated**: its raw EVs are
directional only and must NOT be trusted as a merge gate until calibrated against
human raters. This is the one-time human gate from `OBJECTIVE.md` Phase 1.

## Why
LLM-as-judge rubrics cluster and carry self-/verbosity-bias. A per-dimension
linear recalibration against expert human ratings roughly halves RMS error and
makes the score trustworthy. Subjective dims (insight, assistance) have low raw
inter-rater agreement, so a multi-rater + recalibration pass is mandatory, not
optional.

## Steps
1. **Generate data to rate.** Run a baseline that persists coach text:
   ```
   npx tsx scripts/synthetic-tester/runHelpfulnessBaseline.ts --eval-set scripts/synthetic-tester/fixtures/helpfulness/eval-set-50.json --max-cost 6
   ```
   (Persists `coachText` + `grounding` per row in the run JSON.)
2. **Build the /calibrate rater packet AND export rater worksheets**
   (auto-scores withheld to avoid anchoring):
   ```
   # Insight-aware packet for the /calibrate page. Splits each coach response
   # into the units the coach actually emits: one INSIGHT item per key move
   # (board + move/best/classification come from the coach's own [INSIGHT]
   # header, so board and prose always match) plus one full-game review item.
   # FENs are derived from the fixture's moveHistory with an off-by-one guard;
   # any insight whose movePlayedSan is illegal from the derived FEN is DROPPED
   # (and console.warn'd). No coach re-run, no Stockfish.
   npx tsx scripts/synthetic-tester/buildInsightCalibrationData.ts --run scripts/synthetic-tester/runs/helpbaseline-XXXX.json
   # -> public/calibration-data.json (then open /calibrate to rate)

   # Worksheet CSV export (legacy single-checkpoint flow):
   npx tsx scripts/synthetic-tester/exportCalibrationSheet.ts --run scripts/synthetic-tester/runs/helpbaseline-XXXX.json --rater A
   # repeat for raters B, C
   ```
   The older `buildCalibrationData.ts` (one item per fixture, keyed off the
   single artificial-checkpoint move) is kept but superseded: it showed one
   mismatched board against a whole-game response. Prefer
   `buildInsightCalibrationData.ts`.
3. **Collect ratings.** Give each sheet to a **distinct rater rated ≥1600**
   (≥3 raters). Each fills `d1..d7` with 0/1/2 per the rubric in
   `helpfulnessPrompt.ts` (dim definitions). Same rubric the judge uses.
4. **Compute calibration.** For each dimension, pair the jury EV (from the run
   JSON's `rows[].dims`) with the mean human rating, and fit:
   ```ts
   import { fitDimensionRecalibration, interRaterDisagreement } from "./helpfulnessCalibration";
   const cal = fitDimensionRecalibration(pairs); // {slope, intercept, maeBefore, maeAfter, pearson}
   ```
   Also compute `interRaterDisagreement(ratingsPerItem)` per dimension.
5. **Acceptance.** Trust the auto-gate only when, per dimension:
   - inter-rater disagreement is low (mean pairwise abs diff ≤ ~0.5 on the 0–2 scale; ≈ Krippendorff α ≥ 0.67 once enough data), AND
   - recalibration reduces error (`maeAfter < maeBefore`) and post-recal MAE is small (≤ ~0.4).
   Store the fitted per-dim `{slope, intercept}` and apply via `applyRecalibration` in future runs.
6. **Re-check periodically.** The rubric is only valid if its score predicts real
   learning (puzzle-accuracy lift) — that's the slow outcome gate in `OBJECTIVE.md`,
   run quarterly, not in CI.

## Status
Harness built (`helpfulnessCalibration.ts` + tests, `exportCalibrationSheet.ts`,
runner persistence). **Actual calibration is blocked on rater access** — provide
≥3 raters ≥1600 to execute steps 3–5.
