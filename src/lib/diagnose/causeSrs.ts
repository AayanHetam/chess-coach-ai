/**
 * Spaced repetition per cause of a mistake (pathway 4.7).
 *
 * A drill set from the diagnosing question trains one cause (a check not
 * seen, a loose piece, a fork, a threat seen and played into, a move made
 * without the blunder check). /puzzles reviews that cause's card once for
 * every graded puzzle of the set, through the theme cards' own SM-2
 * (puzzleThemeSrs.ts `reviewCard`).
 *
 * The cards live in their own atom under their own storage key, never in
 * `puzzleThemeSrsAtom`: /plan, the week plan and the session runner read
 * that atom's due themes and query the feed with them, and `/api/progress`
 * syncs it. Nothing reads the cause cards yet. The recap (pathway 6.6)
 * will.
 */
import { atomWithStorage } from "jotai/utils";
import {
  createCard,
  qualityFromOutcome,
  reviewCard,
  type ThemeSrsCard,
} from "@/lib/curriculum/puzzleThemeSrs";
import type { DiagnoseCause } from "./gradeAnswer";

export const CAUSE_SRS_STORAGE_KEY = "chessMastiCauseSrs";
export const DRILL_CAUSE_STORAGE_KEY = "chessMastiDrillCause";

/** One SM-2 card per cause, keyed by `causeCardId`. */
export const causeSrsAtom = atomWithStorage<Record<string, ThemeSrsCard>>(
  CAUSE_SRS_STORAGE_KEY,
  {}
);

/**
 * The set /analysis just handed to /puzzles: its cause and every puzzle id
 * in it. /puzzles takes it with the practice queue and clears it.
 */
export const drillCauseAtom = atomWithStorage<{
  cause: DiagnoseCause;
  ids: string[];
} | null>(DRILL_CAUSE_STORAGE_KEY, null);

/** The cause's card id: "cause:hanging". */
export function causeCardId(cause: DiagnoseCause): string {
  return `cause:${cause}`;
}

/** The cards with the cause's card reviewed once: quality 4 for a solve, 1 for a miss. */
export function reviewCause(
  cards: Record<string, ThemeSrsCard>,
  cause: DiagnoseCause,
  solved: boolean,
  now: number
): Record<string, ThemeSrsCard> {
  const id = causeCardId(cause);
  const card = cards[id] ?? createCard(id);
  return {
    ...cards,
    [id]: reviewCard(card, qualityFromOutcome(solved, solved), now),
  };
}
