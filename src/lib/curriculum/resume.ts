import { atomWithStorage } from "jotai/utils";
import type { PuzzleContext } from "@/lib/validation/puzzleChatSchemas";
import type { PuzzleFeedFilters } from "@/hooks/usePuzzleFeed";

/**
 * Constant-save for the puzzle surface.
 *
 * `/puzzles` writes the puzzle the user is currently on (plus the active
 * filters) here on every advance, so a returning user resumes the exact
 * position instead of getting a fresh random puzzle — closing the gap that
 * `practicePuzzlesAtom`/`currentPuzzleIndexAtom` (memory-only) left open.
 *
 * `/plan` reads it to render a "Continue where you left off" button.
 *
 * Persisted (atomWithStorage → localStorage) so it survives reloads and
 * full-page OAuth redirects. Stale entries (> RESUME_TTL_MS old) are treated
 * as absent by `isResumeFresh` so we never resurface a week-old puzzle.
 */

export interface PuzzleResumeState {
  /** The puzzle the user was on (full feed shape, board-renderable as-is). */
  puzzle: PuzzleContext;
  /** Feed filters active at the time, so the stream continues in-context. */
  filters: PuzzleFeedFilters;
  /** Wall-clock of the last write. */
  updatedAt: number;
}

/** A resume entry older than this is ignored (one week). */
export const RESUME_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const puzzleResumeAtom = atomWithStorage<PuzzleResumeState | null>(
  "chessMastiPuzzleResume",
  null
);

/** True when `state` exists and is recent enough to resurface. */
export function isResumeFresh(
  state: PuzzleResumeState | null,
  now: number
): state is PuzzleResumeState {
  if (!state || !state.puzzle) return false;
  return now - state.updatedAt <= RESUME_TTL_MS;
}
