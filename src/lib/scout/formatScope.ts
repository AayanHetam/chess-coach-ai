// Scoping the dossier to one time class.
//
// A blitz scouting report should not be diluted by their rapid games: the
// openings differ, the clock behaviour differs, and the rating differs. These
// helpers pick which formats are worth offering and narrow the game list.

import type { ScoutGame, TimeClass } from '@/types/scout';

export type FormatScope = TimeClass | 'all';

/**
 * Formats with enough games to stand on their own, most-played first.
 *
 * Offering a format with a handful of games would produce a dossier whose
 * every number is noise, so thin formats are not offered at all.
 */
export const MIN_GAMES_PER_FORMAT = 10;

export interface FormatOption {
  tc: TimeClass;
  games: number;
}

export function availableFormats(games: ScoutGame[]): FormatOption[] {
  const counts = new Map<TimeClass, number>();
  for (const g of games) {
    const tc = g.timeClass;
    // "unknown" is not a format a user can mean — it is missing data.
    if (!tc || tc === 'unknown') continue;
    counts.set(tc, (counts.get(tc) ?? 0) + 1);
  }
  return Array.from(counts, ([tc, count]) => ({ tc, games: count }))
    .filter(f => f.games >= MIN_GAMES_PER_FORMAT)
    .sort((a, b) => b.games - a.games || a.tc.localeCompare(b.tc));
}

export function scopeGames(games: ScoutGame[], scope: FormatScope): ScoutGame[] {
  if (scope === 'all') return games;
  return games.filter(g => g.timeClass === scope);
}
