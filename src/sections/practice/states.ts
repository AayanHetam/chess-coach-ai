import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { ChessPuzzle } from "@/lib/chessPuzzlesService";
import type { PuzzleStatus } from "@/components/PracticeChessBoard";

/**
 * Practice puzzle type - same as ChessPuzzle
 * Solved status is NOT stored in the puzzle object itself.
 * Instead, it's stored in puzzleSolvedStatusAtom (by puzzle ID) for persistence.
 * This ensures a single source of truth and prevents synchronization issues.
 */
export type PracticePuzzle = ChessPuzzle;

/**
 * Array of puzzles for current practice session
 */
export const practicePuzzlesAtom = atom<PracticePuzzle[]>([]);

/**
 * Index of currently active puzzle in the practice session
 */
export const currentPuzzleIndexAtom = atom<number>(-1);

/**
 * Current practice theme/skill gap being practiced
 */
export const practiceThemeAtom = atom<string | null>(null);

/**
 * Map tracking solved status for each puzzle by ID
 * Uses localStorage for persistence
 * 
 * CANONICAL SOURCE OF TRUTH: This atom is the single source of truth for solved status.
 * The PracticePuzzle type does NOT include a solved field to avoid synchronization issues.
 * Always read/write solved status through this atom using puzzle.id as the key.
 */
export const puzzleSolvedStatusAtom = atomWithStorage<Record<string, boolean>>(
  "practicePuzzleSolvedStatus",
  {}
);

/**
 * Get current puzzle from practice puzzles array
 */
export const currentPuzzleAtom = atom<PracticePuzzle | null>((get) => {
  const puzzles = get(practicePuzzlesAtom);
  const index = get(currentPuzzleIndexAtom);
  if (index >= 0 && index < puzzles.length) {
    return puzzles[index];
  }
  return null;
});

/**
 * Get solved count for current practice session
 */
export const practiceSolvedCountAtom = atom<number>((get) => {
  const puzzles = get(practicePuzzlesAtom);
  const solvedStatus = get(puzzleSolvedStatusAtom);
  return puzzles.filter((p) => solvedStatus[p.id] === true).length;
});

/**
 * Helper function to check if a puzzle is solved
 * Always use this or puzzleSolvedStatusAtom directly - never store solved in puzzle object
 */
export function isPuzzleSolved(
  puzzleId: string,
  solvedStatus: Record<string, boolean>
): boolean {
  return solvedStatus[puzzleId] === true;
}

/**
 * Shared puzzle board status atom so other components (e.g., PuzzleInfo, CoachExplanation)
 * can react to solve/fail events from PracticeChessBoard.
 */
export const puzzleBoardStatusAtom = atom<PuzzleStatus>("loading");

/**
 * Blind mode toggle — when true, pieces are hidden on the board.
 * User must visualize the position and play moves.
 */
export const blindModeAtom = atomWithStorage<boolean>("chessMastiBlindMode", false);
