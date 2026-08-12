import type { PuzzleStats, PuzzleSolveRecord } from "@/lib/puzzleRating";

/**
 * "Last N puzzles" summaries for the performance dashboard.
 *
 * Windowing by COUNT rather than by date, deliberately. A calendar window
 * ("last 7 days") is empty for anyone who took a week off and punishes nobody
 * consistently; an all-time number punishes you forever for mistakes made when
 * you were 400 points weaker. A recency window is the marginal view — how you
 * are playing now — and "all" stays available as the total.
 *
 * The failure mode this module exists to prevent: asking for the last 500 when
 * you have solved 10 must show exactly what the last 20 shows, not an empty
 * chart, a divide-by-zero, or a differently-shaped answer. Every summary
 * therefore reports the sample size it actually used, and the UI states it.
 */

export const PUZZLE_WINDOWS = [20, 50, 100, 500, "all"] as const;
export type PuzzleWindow = (typeof PUZZLE_WINDOWS)[number];

export interface ThemeAccuracy {
  theme: string;
  attempts: number;
  solved: number;
  /** 0-100, or null when there are no attempts. Never fabricate a 0%. */
  accuracy: number | null;
}

export interface DifficultyBucket {
  label: string;
  min: number;
  max: number;
  attempts: number;
  solved: number;
  accuracy: number | null;
}

export interface PuzzleSummary {
  window: PuzzleWindow;
  /** Solves that actually informed this summary. */
  sampleSize: number;
  /**
   * True when the window asked for more puzzles than exist. Not an error —
   * the UI says "your last 12 puzzles" instead of pretending it has 500.
   */
  truncated: boolean;
  themes: ThemeAccuracy[];
  difficulty: DifficultyBucket[];
  solved: number;
  /** 0-100, or null when the window is empty. */
  overallAccuracy: number | null;
}

/**
 * Rating bands. Mirrors the /puzzles filter chips so a user drilling "1200-1599"
 * sees the same bucket boundaries reported back to them.
 */
const BANDS: ReadonlyArray<{ label: string; min: number; max: number }> = [
  { label: "Under 1200", min: 0, max: 1199 },
  { label: "1200–1599", min: 1200, max: 1599 },
  { label: "1600–1999", min: 1600, max: 1999 },
  { label: "2000+", min: 2000, max: Number.MAX_SAFE_INTEGER },
];

function pct(solved: number, attempts: number): number | null {
  if (attempts <= 0) return null;
  return Math.round((solved / attempts) * 100);
}

/** Newest-first slice of the solve log. */
function takeRecent(
  solves: PuzzleSolveRecord[],
  window: PuzzleWindow
): PuzzleSolveRecord[] {
  // recentSolves is stored oldest-first; the dashboard reasons in "most
  // recent N", so reverse before slicing.
  const newestFirst = [...solves].reverse();
  if (window === "all") return newestFirst;
  return newestFirst.slice(0, window);
}

/**
 * Summarise a window of puzzle history.
 *
 * `all` reads lifetime `themeStats` rather than the solve log, because the log
 * is capped at 500 records — for a heavy user, "all" genuinely means more than
 * the log remembers. Below that cap the two agree by construction, which is
 * what makes the windows collapse cleanly for a new user.
 */
export function summarizePuzzleWindow(
  stats: PuzzleStats,
  window: PuzzleWindow
): PuzzleSummary {
  const logged = (stats.recentSolves ?? []).length;
  const lifetime = stats.totalAttempts ?? 0;
  // When the solve log covers the entire history, compute EVERY window from
  // it — including "all". Reading "all" from lifetime themeStats while the
  // numbered windows read the log lets the two disagree, which is the exact
  // inconsistency this module exists to prevent. themeStats is only needed
  // once the log has been truncated past what the user actually played.
  const logCoversEverything = logged >= lifetime;

  if (window === "all" && !logCoversEverything) {
    const themes: ThemeAccuracy[] = Object.entries(stats.themeStats ?? {})
      .map(([theme, s]) => ({
        theme,
        attempts: s.attempts,
        solved: s.solved,
        accuracy: pct(s.solved, s.attempts),
      }))
      .filter((t) => t.attempts > 0)
      .sort((a, b) => b.attempts - a.attempts);

    // Difficulty needs per-solve ratings, which lifetime themeStats does not
    // carry — so it comes from the log even for "all". Flagged as truncated
    // when the log is shorter than lifetime attempts so the UI can say so.
    const solves = takeRecent(stats.recentSolves ?? [], "all");
    return {
      window,
      sampleSize: stats.totalAttempts ?? 0,
      truncated: solves.length < (stats.totalAttempts ?? 0),
      themes,
      difficulty: bucketByDifficulty(solves),
      solved: stats.totalSolved ?? 0,
      overallAccuracy: pct(stats.totalSolved ?? 0, stats.totalAttempts ?? 0),
    };
  }

  const solves = takeRecent(stats.recentSolves ?? [], window);
  const byTheme = new Map<string, { attempts: number; solved: number }>();
  let solvedCount = 0;

  for (const s of solves) {
    if (s.solved) solvedCount++;
    const theme = s.theme || "untagged";
    const acc = byTheme.get(theme) ?? { attempts: 0, solved: 0 };
    acc.attempts++;
    if (s.solved) acc.solved++;
    byTheme.set(theme, acc);
  }

  const themes: ThemeAccuracy[] = Array.from(byTheme.entries())
    .map(([theme, v]) => ({
      theme,
      attempts: v.attempts,
      solved: v.solved,
      accuracy: pct(v.solved, v.attempts),
    }))
    .sort((a, b) => b.attempts - a.attempts);

  return {
    window,
    sampleSize: solves.length,
    // The user asked for more than exists. Every shorter window returns the
    // same numbers, which is the point.
    truncated: isTruncated(solves.length, window),
    themes,
    difficulty: bucketByDifficulty(solves),
    solved: solvedCount,
    overallAccuracy: pct(solvedCount, solves.length),
  };
}

/**
 * Did the window ask for more than exists?
 *
 * "all" is never truncated when it reaches this path — it got everything by
 * definition. Comparing a number against the string "all" would evaluate to
 * `false` via NaN, which is the right answer for the wrong reason and would
 * break the moment the window vocabulary grew another string.
 */
function isTruncated(count: number, window: PuzzleWindow): boolean {
  return window !== "all" && count < window;
}

function bucketByDifficulty(solves: PuzzleSolveRecord[]): DifficultyBucket[] {
  return BANDS.map((band) => {
    let attempts = 0;
    let solved = 0;
    for (const s of solves) {
      const r = s.puzzleRating;
      if (typeof r !== "number" || !Number.isFinite(r)) continue;
      if (r < band.min || r > band.max) continue;
      attempts++;
      if (s.solved) solved++;
    }
    return { ...band, attempts, solved, accuracy: pct(solved, attempts) };
  });
}

/**
 * Colour band for an accuracy figure, mirroring the reference dashboard.
 * `null` accuracy has no band — the UI shows a neutral "--".
 */
export function accuracyBand(
  accuracy: number | null
): "none" | "low" | "fair" | "ok" | "good" | "great" {
  if (accuracy === null) return "none";
  if (accuracy < 60) return "low";
  if (accuracy < 70) return "fair";
  if (accuracy < 80) return "ok";
  if (accuracy < 90) return "good";
  return "great";
}
