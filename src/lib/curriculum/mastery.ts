/**
 * Mastery model — derived entirely from the existing per-theme `themeStats`
 * (in `puzzleStatsAtom`), so there's no second store of accuracy data. A theme
 * is "mastered" only when the user is solving it reliably AT OR ABOVE their own
 * level (the rating clause uses the `recentRatings` signal added to themeStats).
 */

import type { PuzzleStats } from "@/lib/puzzleRating";
import { SYLLABUS, CurriculumUnit } from "./syllabus";

export const MASTERY_MIN_ATTEMPTS = 10;
export const MASTERY_MIN_ACCURACY = 0.8;
/** Solved puzzles must average within this margin BELOW the live rating. */
export const MASTERY_RATING_MARGIN = 50;

export interface ThemePoolStat {
  attempts: number;
  solved: number;
  accuracy: number;
  /** Mean of the pooled `recentRatings`, or null if none recorded. */
  avgRecentRating: number | null;
}

/** Pool the themeStats across a set of theme ids (a unit covers ≥1 theme). */
export function poolThemeStats(
  themeIds: string[],
  stats: PuzzleStats
): ThemePoolStat {
  let attempts = 0;
  let solved = 0;
  const ratings: number[] = [];
  for (const id of themeIds) {
    const t = stats.themeStats[id];
    if (!t) continue;
    attempts += t.attempts;
    solved += t.solved;
    if (t.recentRatings) ratings.push(...t.recentRatings);
  }
  return {
    attempts,
    solved,
    accuracy: attempts > 0 ? solved / attempts : 0,
    avgRecentRating:
      ratings.length > 0
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : null,
  };
}

export function isThemeMastered(
  themeId: string,
  stats: PuzzleStats,
  liveRating: number
): boolean {
  return isPoolMastered(poolThemeStats([themeId], stats), liveRating);
}

export function isUnitMastered(
  unit: CurriculumUnit,
  stats: PuzzleStats,
  liveRating: number
): boolean {
  return isPoolMastered(poolThemeStats(unit.themes, stats), liveRating);
}

function isPoolMastered(pool: ThemePoolStat, liveRating: number): boolean {
  if (pool.attempts < MASTERY_MIN_ATTEMPTS) return false;
  if (pool.accuracy < MASTERY_MIN_ACCURACY) return false;
  if (pool.avgRecentRating === null) return false;
  return pool.avgRecentRating >= liveRating - MASTERY_RATING_MARGIN;
}

export interface CurriculumProgress {
  masteredUnitIds: string[];
  unlockedUnitIds: string[];
  /** First unlocked, not-yet-mastered unit — where the daily plan defaults to. */
  currentUnitId: string | null;
}

/**
 * Walk the syllabus: a unit is unlocked if it's first OR the previous unit is
 * mastered. `currentUnitId` is the first unlocked unit that isn't mastered yet.
 * Access is never hard-locked elsewhere — this only drives the recommended path.
 */
export function computeCurriculumProgress(
  stats: PuzzleStats,
  liveRating: number
): CurriculumProgress {
  const masteredUnitIds: string[] = [];
  const unlockedUnitIds: string[] = [];
  let currentUnitId: string | null = null;
  let prevMastered = true; // first unit always unlocked

  for (const unit of SYLLABUS) {
    if (prevMastered) unlockedUnitIds.push(unit.id);
    const mastered =
      unlockedUnitIds.includes(unit.id) &&
      isUnitMastered(unit, stats, liveRating);
    if (mastered) masteredUnitIds.push(unit.id);
    if (!currentUnitId && unlockedUnitIds.includes(unit.id) && !mastered) {
      currentUnitId = unit.id;
    }
    prevMastered = mastered;
  }

  return { masteredUnitIds, unlockedUnitIds, currentUnitId };
}
