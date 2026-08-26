/**
 * The daily time budget, and what it's worth in minutes.
 *
 * Lives in its own module because both `quizConfig` and `goalPatch` need it and
 * they already import each other — a real ES module cycle. Cycles of this shape
 * happen to work when every use is inside a function body, and break with an
 * undefined import the moment someone reads one at module scope. Rather than
 * leave that trap armed, the shared leaf moves here and both sides depend on it
 * instead of on each other.
 *
 * `quizConfig` re-exports these so existing imports keep working.
 */

export type TimeCommitment = "under-10" | "10-30" | "30-plus" | "60-plus";

/**
 * Representative minutes/day for each band, for the improvement model.
 *
 * The bands the UI offers are 15 / 30 / 60. "under-10" is LEGACY: existing
 * profiles still carry it, so it must keep mapping to real minutes, but no
 * option writes it any more (see TIME_OPTIONS in quizConfig).
 *
 * Each band maps to exactly what its option promises — the projection must
 * never assume more practice than we asked for, or the date it produces is a
 * target the user never agreed to.
 */
export const MINUTES_PER_DAY: Record<TimeCommitment, number> = {
  "under-10": 8,
  "10-30": 15,
  "30-plus": 30,
  "60-plus": 60,
};

export function minutesPerDayFor(time: TimeCommitment | undefined): number {
  return time ? MINUTES_PER_DAY[time] : 0;
}
