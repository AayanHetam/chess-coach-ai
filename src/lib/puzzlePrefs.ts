import { atomWithStorage } from "jotai/utils";

/**
 * Per-device puzzle-solving preferences.
 *
 * Kept out of the Firestore user profile on purpose: these are input-ergonomics
 * choices, and the right answer genuinely differs between a laptop and a phone
 * for the same person. localStorage (per-device) is the correct scope.
 */

/**
 * Confirm-move ("stage then submit") mode.
 *
 * ON by default for everyone, per Aayan's 2026-08-10 call — dropping a piece
 * stages the move and arms the Submit button instead of grading immediately.
 * Kills mis-drops and adds a beat of deliberation, which is the whole point of
 * the Acely format (docs/PUZZLE_TRAINING_LAYOUT_SPEC.md §3.5).
 *
 * IMPORTANT: this gates the USER's moves only. In a multi-move puzzle the
 * opponent's replies still auto-play — they are applied inside the reply timer
 * in puzzles.tsx and never travel through the staging path.
 */
export const confirmMovesAtom = atomWithStorage<boolean>(
  "cm_puzzle_confirm_moves",
  true,
);
