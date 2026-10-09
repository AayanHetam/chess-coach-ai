/**
 * The evaluation arc's mark for the move the game was decided on
 * (gameStory.ts, pathway 2.7). Where it sits and what it says, apart from
 * the arc's drawing, so the arithmetic is pinned by a unit test: the arc
 * places ply k at k / (len - 1) of its width, and so does the mark.
 *
 * Pure and client-safe.
 */

export interface DecisiveMove {
  /** The cursor value after the move. */
  ply: number;
  moveNumber: number;
  color: "w" | "b";
  san: string;
}

export interface DecisiveMark {
  ply: number;
  /** Across the arc, 0 to 100. */
  percent: number;
  /** "8. Nc7+", the strip's spelling. */
  label: string;
  title: string;
  ariaLabel: string;
}

/** The move as the strip writes it: "8. Nc7+", "8... Kd8". */
export function decisiveLabel(d: DecisiveMove): string {
  return `${d.moveNumber}${d.color === "w" ? "." : "..."} ${d.san}`;
}

/**
 * The mark, or null: nothing while the sweep runs, for a game too short to
 * draw, or for a ply outside the arc.
 */
export function decisiveMark(
  decisive: DecisiveMove | null | undefined,
  seriesLength: number,
  opts: { analyzing: boolean }
): DecisiveMark | null {
  if (!decisive || opts.analyzing || seriesLength < 2) return null;
  if (decisive.ply <= 0 || decisive.ply >= seriesLength) return null;
  const label = decisiveLabel(decisive);
  return {
    ply: decisive.ply,
    percent: (decisive.ply / (seriesLength - 1)) * 100,
    label,
    title: `${label} decided the game`,
    ariaLabel: `Go to ${label}, the move that decided the game`,
  };
}
