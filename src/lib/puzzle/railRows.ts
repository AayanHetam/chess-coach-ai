import type { PuzzleContext } from "@/lib/validation/puzzleChatSchemas";
import type { SessionResult } from "@/lib/puzzleSession";
import { prettyTheme } from "@/components/puzzle/prettyTheme";

/**
 * The session rail's row list.
 *
 * Extracted from the component because it carried a real bug: the rail
 * concatenated `results` + `currentPuzzle` + `upcoming` unconditionally, and a
 * puzzle stays `currentPuzzle` after it is graded — you only leave it by
 * pressing "New puzzle". So the moment you solved anything, that puzzle
 * appeared TWICE: once with a green check, once as the active row. Same theme,
 * same rating, one puzzle, two lines.
 *
 * The rule now: **one row per puzzle**. Being graded and being where you are
 * standing are independent facts, so they are independent fields — `state`
 * drives the glyph, `isCurrent` drives the highlight. A solved puzzle you are
 * still looking at is one row showing a check AND highlighted.
 */

export type RowState = "solved" | "failed" | "current" | "upcoming";

export interface RailRow {
  key: string;
  label: string;
  rating?: number;
  /** Outcome, which drives the status glyph. */
  state: RowState;
  /** Whether this is the puzzle on the board, which drives the highlight. */
  isCurrent: boolean;
  /** Only set when the row can actually be brought to the board. */
  jumpId?: string;
}

export interface BuildRailRowsInput {
  results: SessionResult[];
  currentPuzzle: PuzzleContext | null;
  upcoming: PuzzleContext[];
  upcomingLimit: number;
}

export function buildRailRows({
  results,
  currentPuzzle,
  upcoming,
  upcomingLimit,
}: BuildRailRowsInput): RailRow[] {
  const currentId = currentPuzzle?.id;

  // The LAST graded entry for the current puzzle, not the first. A puzzle can
  // be attempted more than once in a session (the re-practice queue), and
  // marking every historical attempt as "current" would highlight several rows
  // at once and put `aria-current` on all of them.
  let currentResultIndex = -1;
  if (currentId !== undefined) {
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i].id === currentId) {
        currentResultIndex = i;
        break;
      }
    }
  }

  const graded: RailRow[] = results.map((r, i) => ({
    key: `done-${r.id}-${i}`,
    label: prettyTheme(r.puzzle?.themes ?? [r.theme]),
    rating: r.puzzle?.rating,
    state: r.solved ? "solved" : "failed",
    isCurrent: i === currentResultIndex,
  }));

  // Only add a separate row for the current puzzle when it has NOT been graded
  // yet. Once graded, its own row above is the one true row for it.
  const current: RailRow[] =
    currentPuzzle && currentResultIndex === -1
      ? [
          {
            key: `current-${currentPuzzle.id}`,
            label: prettyTheme(currentPuzzle.themes),
            rating: currentPuzzle.rating,
            state: "current",
            isCurrent: true,
          },
        ]
      : [];

  const queued: RailRow[] = upcoming.slice(0, upcomingLimit).map((p) => ({
    key: `next-${p.id}`,
    label: prettyTheme(p.themes),
    rating: p.rating,
    state: "upcoming",
    isCurrent: false,
    jumpId: p.id,
  }));

  return [...graded, ...current, ...queued];
}
