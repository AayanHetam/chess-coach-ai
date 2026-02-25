import { atomWithStorage } from "jotai/utils";
import type { DrillProgress } from "@/types/openings";

/**
 * SM-2 Spaced Repetition Algorithm
 * Adapted for chess opening line drilling.
 *
 * Quality scale: 0-5
 *   5 = perfect recall, no hesitation
 *   4 = correct after brief thought
 *   3 = correct but with difficulty
 *   2 = wrong but close (recognized the idea)
 *   1 = wrong, vaguely remembered
 *   0 = complete blackout
 */

const DEFAULT_EASE_FACTOR = 2.5;
const MIN_EASE_FACTOR = 1.3;

export function calculateNextReview(
  progress: DrillProgress,
  quality: number
): DrillProgress {
  const q = Math.max(0, Math.min(5, quality));
  let { easeFactor, interval } = progress;

  if (q >= 3) {
    // Correct response
    if (progress.attempts === 0) {
      interval = 1;
    } else if (interval <= 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
  } else {
    // Incorrect — reset interval
    interval = 1;
  }

  // Update ease factor
  easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor);

  const now = Date.now();
  const nextReview = now + interval * 24 * 60 * 60 * 1000;

  return {
    ...progress,
    easeFactor,
    interval,
    nextReview,
    lastDrilled: now,
    attempts: progress.attempts + 1,
    correctFirstTry: progress.correctFirstTry + (q >= 4 ? 1 : 0),
  };
}

export function createInitialProgress(
  repertoireId: string,
  lineId: string
): DrillProgress {
  return {
    repertoireId,
    lineId,
    attempts: 0,
    correctFirstTry: 0,
    maxDepthReached: 0,
    easeFactor: DEFAULT_EASE_FACTOR,
    interval: 0,
    nextReview: 0,
    lastDrilled: 0,
  };
}

/**
 * Check if a line is due for review.
 */
export function isDueForReview(progress: DrillProgress): boolean {
  if (progress.attempts === 0) return true;
  return Date.now() >= progress.nextReview;
}

/**
 * Determine quality rating from drill performance.
 */
export function qualityFromDrill(
  hadError: boolean,
  depthReached: number,
  totalMoves: number
): number {
  const ratio = totalMoves > 0 ? depthReached / totalMoves : 0;
  if (!hadError && ratio >= 1) return 5;
  if (!hadError && ratio >= 0.7) return 4;
  if (!hadError) return 3;
  if (ratio >= 0.5) return 2;
  if (ratio > 0) return 1;
  return 0;
}

/**
 * Persistent storage for drill progress across all lines.
 * Key: `${repertoireId}/${lineId}`
 */
export const drillProgressAtom = atomWithStorage<Record<string, DrillProgress>>(
  "chessMastiDrillProgress",
  {}
);

/**
 * Get progress for a specific line, or create default.
 */
export function getLineProgress(
  allProgress: Record<string, DrillProgress>,
  repertoireId: string,
  lineId: string
): DrillProgress {
  const key = `${repertoireId}/${lineId}`;
  return allProgress[key] || createInitialProgress(repertoireId, lineId);
}

/**
 * Count lines due for review in a repertoire.
 */
export function countDueReviews(
  allProgress: Record<string, DrillProgress>,
  repertoireId: string
): number {
  return Object.entries(allProgress)
    .filter(([key, prog]) => key.startsWith(`${repertoireId}/`) && isDueForReview(prog))
    .length;
}
