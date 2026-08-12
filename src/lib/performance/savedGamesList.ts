/**
 * How many saved analyses to show, and what to call the leftovers.
 *
 * Extracted from the page because the counting and the wording are where the
 * mistakes live, not the rendering: a naive `+ "es"` pluraliser turns
 * "analysis" into "analysises", and a toggle keyed off the hidden count strands
 * a "Show fewer" that hides nothing once the list is deleted back down to the
 * limit. Both were written and both were wrong; this is the part worth testing.
 */

/** Rows shown before the list collapses behind a toggle. */
export const SAVED_GAMES_LIMIT = 10;

export interface SavedGamesListState {
  /** How many rows to render. */
  visibleCount: number;
  /** How many are held back right now. Zero while expanded. */
  hiddenCount: number;
  /** Panel subtitle, or undefined when there is nothing to say. */
  subtitle: string | undefined;
  /** Toggle caption, or null when no toggle should render at all. */
  toggleLabel: string | null;
}

export function describeSavedGamesList(
  total: number,
  expanded: boolean,
  limit = SAVED_GAMES_LIMIT
): SavedGamesListState {
  const safeTotal = Math.max(0, Math.floor(total) || 0);
  const visibleCount = expanded ? safeTotal : Math.min(safeTotal, limit);
  const hiddenCount = safeTotal - visibleCount;
  // Keyed off the total, not the hidden count: while expanded nothing is
  // hidden, yet the toggle must still be there to collapse again.
  const collapsible = safeTotal > limit;

  return {
    visibleCount,
    hiddenCount,
    subtitle:
      safeTotal === 0
        ? undefined
        : hiddenCount > 0
          ? // Names both numbers. "10 saved games" for someone holding 60
            // would be a quiet lie about the size of their own library.
            `Showing your ${visibleCount} most recent of ${safeTotal} saved games`
          : `${safeTotal} saved game${safeTotal === 1 ? "" : "s"}, coach conversations included`,
    toggleLabel: !collapsible
      ? null
      : expanded
        ? "Show fewer"
        : `Show ${hiddenCount} older ${hiddenCount === 1 ? "analysis" : "analyses"}`,
  };
}
