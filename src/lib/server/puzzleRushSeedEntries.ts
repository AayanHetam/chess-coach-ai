import type { LeaderboardEntry, RushMode } from "./puzzleRushLeaderboard";

/**
 * Placeholder entries shown on the Puzzle Rush board while it is too empty to
 * be worth looking at.
 *
 * THESE ARE NOT REAL PLAYERS. Nobody scored these numbers; the handles belong
 * to no account. They exist so a board with two rows on it does not read as a
 * dead product, and they are removed automatically — see SEED_UNTIL_REAL_ENTRIES
 * below — once enough real scores exist to fill it.
 *
 * Two properties hold by construction, and should keep holding:
 *
 *  1. **Display-only.** They are merged into the response on the way out and
 *     are NEVER written to the `puzzleRushLeaderboard` collection. Writing
 *     them would mix invented rows into real data, make them permanent under
 *     the collection's max-wins rule, and leave something to clean up later.
 *     Deleting this file removes every trace of them.
 *  2. **They never outrank a real player unfairly**, because ranks are
 *     computed over the merged set — a player is told the position they would
 *     actually see, not one that ignores the rows above them.
 *
 * Scores are pitched at ordinary club-level results and deliberately span a
 * wide range, including several low ones. A board of uniformly strong scores
 * would tell a beginner they are last, which is the opposite of the point.
 */

export interface SeedEntry {
  handle: string;
  threeMin: number;
  fiveMin: number;
  survivalBest: number;
}

/**
 * Stop showing placeholders on a mode once this many real players have a score
 * in it. Checked per mode, because "has 100 people played 3-minute Rush" is a
 * single-field count — the collection's index invariant does not allow a query
 * that spans all three at once.
 */
export const SEED_UNTIL_REAL_ENTRIES = 100;

/** A zero means that player simply has no result in that mode, as with a real
 *  account that has only ever run one of them. */
export const SEED_ENTRIES: SeedEntry[] = [
  { handle: "blitzkid07", threeMin: 26, fiveMin: 38, survivalBest: 19 },
  { handle: "zugzwangzz", threeMin: 24, fiveMin: 33, survivalBest: 16 },
  { handle: "knightmare22", threeMin: 22, fiveMin: 31, survivalBest: 14 },
  { handle: "shortcastle99", threeMin: 20, fiveMin: 27, survivalBest: 0 },
  { handle: "pawnstorm88", threeMin: 18, fiveMin: 0, survivalBest: 9 },
  { handle: "checkplease21", threeMin: 17, fiveMin: 23, survivalBest: 12 },
  { handle: "forkyoulater", threeMin: 15, fiveMin: 0, survivalBest: 11 },
  { handle: "chessnut14", threeMin: 11, fiveMin: 19, survivalBest: 6 },
  { handle: "endgameenjoyer", threeMin: 9, fiveMin: 16, survivalBest: 22 },
  { handle: "rookiemistake", threeMin: 7, fiveMin: 12, survivalBest: 0 },
  { handle: "blunderbus5", threeMin: 4, fiveMin: 10, survivalBest: 4 },
  { handle: "skewered_again", threeMin: 3, fiveMin: 0, survivalBest: 5 },
];

/** Placeholders for one mode, in the same shape a real row takes. */
export function seedEntriesFor(mode: RushMode): LeaderboardEntry[] {
  return SEED_ENTRIES.filter((seed) => seed[mode] > 0).map((seed) => ({
    handle: seed.handle,
    score: seed[mode],
  }));
}

/**
 * Real rows plus placeholders, ordered by score.
 *
 * A placeholder whose handle matches a real one is dropped: handles are unique
 * per account, so if somebody registers a name used here, the real player owns
 * it. Leaving both in would put two identical names on the board and make the
 * client highlight the wrong row as "you".
 */
export function withSeedEntries(
  real: LeaderboardEntry[],
  mode: RushMode,
  realCount: number,
  limit: number
): LeaderboardEntry[] {
  if (realCount >= SEED_UNTIL_REAL_ENTRIES) return real.slice(0, limit);
  const taken = new Set(real.map((entry) => entry.handle));
  const seeds = seedEntriesFor(mode).filter((seed) => !taken.has(seed.handle));
  return [...real, ...seeds].sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * How many rows sit above `score` once placeholders are counted. Added to a
 * real player's rank so the number they are told matches the board they are
 * looking at.
 */
export function seedEntriesAbove(
  mode: RushMode,
  score: number,
  realCount: number
): number {
  if (realCount >= SEED_UNTIL_REAL_ENTRIES) return 0;
  return seedEntriesFor(mode).filter((seed) => seed.score > score).length;
}
