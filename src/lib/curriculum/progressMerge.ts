import type { PuzzleStats, PuzzleRushScores } from "@/lib/puzzleRating";
import type { ThemeSrsCard } from "@/lib/curriculum/puzzleThemeSrs";
import type { StreakState } from "@/lib/curriculum/streak";
import { mergeDailyLog, type DailyLog } from "@/lib/curriculum/dailyLog";

/**
 * Merging local (localStorage) progress with the server copy.
 *
 * Context: streak, SRS cards and puzzle stats were localStorage-only, so a
 * cache clear erased the user's programme and a second device never saw it.
 * For a coach that's a shrug; for a "30-day plan" it's a promise the product
 * can't keep. Syncing means two copies can disagree, and the merge has to be
 * deterministic and lossless in the ways that matter.
 *
 * Design rule: **never let a sync lose training the user actually did.** Each
 * field merges on its own monotonic signal rather than a single document-level
 * "last write wins", because the two copies can each be ahead on different
 * fields — solve on your phone offline, then open your laptop, and a
 * whole-document winner would silently discard one of them.
 */

export interface StoredProgress {
  streak: StreakState;
  stats: PuzzleStats;
  srs: Record<string, ThemeSrsCard>;
  /** Per-day training record. Optional for back-compat: snapshots written
   *  before daily tracking existed have no `daily` key. */
  daily?: DailyLog;
  /** Puzzle Rush best scores. Optional for back-compat: snapshots written
   *  before rush scores synced have no `rush` key. */
  rush?: PuzzleRushScores;
  /** Epoch ms of the last write. Diagnostic only — not the merge key. */
  updatedAt: number;
}

/** Streaks merge on the later active day; `best` is the max of both. */
export function mergeStreak(a: StreakState, b: StreakState): StreakState {
  const best = Math.max(a.best, b.best);
  if (!a.lastActiveDay) return { ...b, best };
  if (!b.lastActiveDay) return { ...a, best };
  // YYYY-MM-DD is lexicographically ordered, so string compare is date compare.
  const ahead = a.lastActiveDay >= b.lastActiveDay ? a : b;
  return { ...ahead, best };
}

/**
 * Stats merge on `totalAttempts`, which only ever increases. It's the honest
 * proxy for "which copy has seen more training"; `rating` is not, because it
 * moves both ways and a lower rating can be the newer truth.
 */
export function mergeStats(a: PuzzleStats, b: PuzzleStats): PuzzleStats {
  if (a.totalAttempts === b.totalAttempts) {
    // Same amount of training recorded — prefer the longer rating history,
    // which breaks the tie toward the copy with more retained detail.
    return a.ratingHistory.length >= b.ratingHistory.length ? a : b;
  }
  return a.totalAttempts > b.totalAttempts ? a : b;
}

/**
 * SRS merges **per theme**, not wholesale: you might have drilled forks on
 * your phone and pins on your laptop, and taking either card set entirely
 * would throw away half the schedule. Within a theme, more attempts wins;
 * ties break on the later review.
 */
export function mergeSrs(
  a: Record<string, ThemeSrsCard>,
  b: Record<string, ThemeSrsCard>,
): Record<string, ThemeSrsCard> {
  const out: Record<string, ThemeSrsCard> = { ...a };
  for (const [theme, card] of Object.entries(b)) {
    const mine = out[theme];
    if (!mine) {
      out[theme] = card;
      continue;
    }
    if (card.attempts > mine.attempts) {
      out[theme] = card;
    } else if (
      card.attempts === mine.attempts &&
      card.lastReviewed > mine.lastReviewed
    ) {
      out[theme] = card;
    }
  }
  return out;
}

/**
 * Rush best scores merge per MODE, max wins. A high score only ever goes up,
 * so max is lossless — and per-mode matters for the same reason SRS merges
 * per theme: a 3-minute record on your phone and a survival record on your
 * laptop are both training the user actually did, and a whole-object winner
 * would discard one of them.
 */
export function mergeRush(
  a: PuzzleRushScores | undefined,
  b: PuzzleRushScores | undefined,
): PuzzleRushScores | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    threeMin: Math.max(a.threeMin, b.threeMin),
    fiveMin: Math.max(a.fiveMin, b.fiveMin),
    survivalBest: Math.max(a.survivalBest, b.survivalBest),
  };
}

/** Field-wise merge of two progress snapshots. Commutative by construction. */
export function mergeProgress(
  a: StoredProgress,
  b: StoredProgress,
): StoredProgress {
  return {
    streak: mergeStreak(a.streak, b.streak),
    stats: mergeStats(a.stats, b.stats),
    srs: mergeSrs(a.srs, b.srs),
    daily: mergeDailyLog(a.daily ?? {}, b.daily ?? {}),
    rush: mergeRush(a.rush, b.rush),
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}
