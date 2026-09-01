import { atomWithStorage } from "jotai/utils";

/**
 * Coordinate Trainer best score: most squares correctly identified in one
 * 60-second round. Kept out of puzzleRating.ts on purpose — that file is
 * chartered around the puzzle Elo system, and this isn't a puzzle score.
 */
export interface CoordinateTrainerBest {
  best: number;
}

export const coordinateTrainerBestAtom =
  atomWithStorage<CoordinateTrainerBest>("chessMastiCoordinateTrainerBest", {
    best: 0,
  });
