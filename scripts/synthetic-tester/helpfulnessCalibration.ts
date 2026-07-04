/**
 * Helpfulness-judge calibration (Phase 1).
 *
 * The Claude jury is UNCALIBRATED — its raw EVs are directional, not trustworthy
 * as a gate. Before they can be trusted, fit a per-dimension linear recalibration
 * against human ratings and report agreement. This module is pure math; the
 * human-rating COLLECTION is a separate gate (see exportCalibrationSheet.ts +
 * CALIBRATION.md). Per-dim recalibration (LLM-Rubric style) is the documented way
 * to roughly halve judge RMS error against human raters.
 */
export interface Pair {
  auto: number; // jury EV for the dimension (0..2)
  human: number; // human rating for the dimension (0..2)
}

export interface DimCalibration {
  n: number;
  slope: number;
  intercept: number;
  maeBefore: number; // mean |auto - human|
  maeAfter: number; // mean |recalibrated(auto) - human|
  pearson: number; // correlation of auto vs human (NaN if degenerate)
}

function clamp02(x: number): number {
  return Math.max(0, Math.min(2, x));
}
function mean(a: number[]): number {
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
}

/** Least-squares fit of human ≈ slope*auto + intercept for one dimension. */
export function fitDimensionRecalibration(pairs: Pair[]): DimCalibration {
  const n = pairs.length;
  if (n === 0) return { n: 0, slope: 1, intercept: 0, maeBefore: NaN, maeAfter: NaN, pearson: NaN };
  const ax = pairs.map((p) => p.auto);
  const hy = pairs.map((p) => p.human);
  const mx = mean(ax);
  const my = mean(hy);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = ax[i] - mx;
    const dy = hy[i] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  // No variance in auto → can't fit a slope; fall back to a constant offset.
  const slope = sxx > 0 ? sxy / sxx : 1;
  const intercept = my - slope * mx;
  const pearson = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
  const maeBefore = mean(pairs.map((p) => Math.abs(p.auto - p.human)));
  const maeAfter = mean(pairs.map((p) => Math.abs(clamp02(slope * p.auto + intercept) - p.human)));
  return { n, slope, intercept, maeBefore, maeAfter, pearson };
}

/** Apply a fitted recalibration to a raw jury EV, clamped to the rubric range. */
export function applyRecalibration(autoEv: number, cal: DimCalibration): number {
  return clamp02(cal.slope * autoEv + cal.intercept);
}

/**
 * Mean pairwise absolute difference across raters, averaged over items (0..2;
 * lower = better inter-rater agreement). A transparent stand-in for Krippendorff's
 * α while the rating set is small; α can replace this once enough data exists.
 */
export function interRaterDisagreement(ratingsPerItem: number[][]): number {
  const diffs: number[] = [];
  for (const raters of ratingsPerItem) {
    for (let i = 0; i < raters.length; i++) {
      for (let j = i + 1; j < raters.length; j++) {
        diffs.push(Math.abs(raters[i] - raters[j]));
      }
    }
  }
  return diffs.length ? mean(diffs) : NaN;
}
