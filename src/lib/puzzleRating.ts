import { atomWithStorage } from "jotai/utils";

/**
 * Puzzle rating system using simplified Elo (Glicko-lite).
 * Tracks solve stats, rating history, and per-theme performance.
 */

export interface PuzzleSolveRecord {
  puzzleId: string;
  puzzleRating: number;
  solved: boolean;
  timeMs: number;
  theme: string;
  timestamp: number;
}

export interface PuzzleStats {
  rating: number;
  totalAttempts: number;
  totalSolved: number;
  totalFailed: number;
  averageTimeMs: number;
  currentStreak: number;
  bestStreak: number;
  ratingHistory: { rating: number; timestamp: number }[];
  themeStats: Record<
    string,
    {
      attempts: number;
      solved: number;
      avgTimeMs: number;
      // Ratings of the last ~10 puzzles attempted in this theme. Powers the
      // curriculum mastery rule ("solving at/above your level"). Optional for
      // back-compat with stats persisted before this field existed.
      recentRatings?: number[];
    }
  >;
  recentSolves: PuzzleSolveRecord[];
}

const DEFAULT_STATS: PuzzleStats = {
  rating: 1200,
  totalAttempts: 0,
  totalSolved: 0,
  totalFailed: 0,
  averageTimeMs: 0,
  currentStreak: 0,
  bestStreak: 0,
  ratingHistory: [{ rating: 1200, timestamp: Date.now() }],
  themeStats: {},
  recentSolves: [],
};

/**
 * Jotai atom persisted to localStorage
 */
export const puzzleStatsAtom = atomWithStorage<PuzzleStats>(
  "chessMastiPuzzleStats",
  DEFAULT_STATS
);

/**
 * Puzzle Rush high scores atom
 */
export interface PuzzleRushScores {
  threeMin: number;
  fiveMin: number;
  survivalBest: number;
}

export const puzzleRushScoresAtom = atomWithStorage<PuzzleRushScores>(
  "chessMastiPuzzleRushScores",
  { threeMin: 0, fiveMin: 0, survivalBest: 0 }
);

/**
 * Calculate new rating after a puzzle attempt using Elo formula.
 * K-factor is higher for newer players (fewer games).
 */
export function calculateNewRating(
  playerRating: number,
  puzzleRating: number,
  solved: boolean,
  totalAttempts: number,
  k?: number
): number {
  // K-factor: explicit override (used by the placement test's fast-converging
  // schedule) else higher for new players, decreasing as they play more.
  const K = k ?? (totalAttempts < 20 ? 40 : totalAttempts < 50 ? 30 : 20);

  // Expected score (probability of solving)
  const expected = 1 / (1 + Math.pow(10, (puzzleRating - playerRating) / 400));

  // Actual score: 1 for solved, 0 for failed
  const actual = solved ? 1 : 0;

  // New rating
  const newRating = Math.round(playerRating + K * (actual - expected));

  // Clamp to reasonable range
  return Math.max(100, Math.min(3500, newRating));
}

/**
 * Update puzzle stats after a solve attempt.
 * Returns the updated stats object (immutable).
 */
export function updatePuzzleStats(
  stats: PuzzleStats,
  record: PuzzleSolveRecord
): PuzzleStats {
  const newRating = calculateNewRating(
    stats.rating,
    record.puzzleRating,
    record.solved,
    stats.totalAttempts
  );

  const newTotalAttempts = stats.totalAttempts + 1;
  const newTotalSolved = stats.totalSolved + (record.solved ? 1 : 0);
  const newTotalFailed = stats.totalFailed + (record.solved ? 0 : 1);
  const newAvgTime = Math.round(
    (stats.averageTimeMs * stats.totalAttempts + record.timeMs) / newTotalAttempts
  );

  const newStreak = record.solved ? stats.currentStreak + 1 : 0;
  const newBestStreak = Math.max(stats.bestStreak, newStreak);

  // Update theme stats
  const themeStats = { ...stats.themeStats };
  const existing = themeStats[record.theme] || { attempts: 0, solved: 0, avgTimeMs: 0 };
  const newThemeAttempts = existing.attempts + 1;
  // Keep the last 10 puzzle ratings attempted in this theme for the mastery rule.
  const recentRatings = [...(existing.recentRatings ?? []), record.puzzleRating].slice(-10);
  themeStats[record.theme] = {
    attempts: newThemeAttempts,
    solved: existing.solved + (record.solved ? 1 : 0),
    avgTimeMs: Math.round(
      (existing.avgTimeMs * existing.attempts + record.timeMs) / newThemeAttempts
    ),
    recentRatings,
  };

  // Keep last 100 rating history points
  const ratingHistory = [
    ...stats.ratingHistory,
    { rating: newRating, timestamp: record.timestamp },
  ].slice(-100);

  // Keep last 50 recent solves
  const recentSolves = [...stats.recentSolves, record].slice(-50);

  return {
    rating: newRating,
    totalAttempts: newTotalAttempts,
    totalSolved: newTotalSolved,
    totalFailed: newTotalFailed,
    averageTimeMs: newAvgTime,
    currentStreak: newStreak,
    bestStreak: newBestStreak,
    ratingHistory,
    themeStats,
    recentSolves,
  };
}

/**
 * Get solve rate as a percentage.
 */
export function getSolveRate(stats: PuzzleStats): number {
  if (stats.totalAttempts === 0) return 0;
  return Math.round((stats.totalSolved / stats.totalAttempts) * 100);
}

/**
 * Format time in milliseconds to a human-readable string.
 */
export function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}
