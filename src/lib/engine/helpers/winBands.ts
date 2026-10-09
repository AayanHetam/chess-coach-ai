/**
 * The review's bands: how much of a move's winning chances it gave up, and
 * the verdict that loss earns. Moved here from moveClassification.ts
 * (pathway 3.5) so the review and gradeMove.ts read one table and cannot
 * drift. Pure and client-safe: the enums only, never the opening book the
 * classifier imports.
 */
import { MoveClassification } from "@/types/enums";

// Chess.com's Expected Points Model thresholds
export const WIN_LOSS_THRESHOLDS = {
  BEST: 0.0,
  EXCELLENT_MAX: 0.02,
  GOOD_MAX: 0.05,
  INACCURACY_MAX: 0.1,
  MISTAKE_MAX: 0.2,
  BLUNDER_MAX: 1.0,
} as const;

// Convert win percentage difference to expected points loss
const winPercentageToExpectedPoints = (winPercentageDiff: number): number => {
  // Chess.com's expected points formula
  // This converts our win percentage model to their expected points model
  return Math.abs(winPercentageDiff) / 100;
};

/**
 * Chess.com-compatible classification based on expected points loss: the
 * mover's loss from White's win percentage before the move to White's win
 * percentage after it. A gain is no loss.
 */
export function classifyWinLoss(
  lastWhiteWin: number,
  positionWhiteWin: number,
  isWhiteMove: boolean
): MoveClassification {
  const winPercentageDiff =
    (positionWhiteWin - lastWhiteWin) * (isWhiteMove ? 1 : -1);

  const expectedPointsLoss = winPercentageToExpectedPoints(
    Math.min(0, winPercentageDiff)
  );

  if (expectedPointsLoss === WIN_LOSS_THRESHOLDS.BEST) {
    return MoveClassification.Best;
  }
  if (expectedPointsLoss <= WIN_LOSS_THRESHOLDS.EXCELLENT_MAX) {
    return MoveClassification.Excellent;
  }
  if (expectedPointsLoss <= WIN_LOSS_THRESHOLDS.GOOD_MAX) {
    return MoveClassification.Good;
  }
  if (expectedPointsLoss <= WIN_LOSS_THRESHOLDS.INACCURACY_MAX) {
    return MoveClassification.Inaccuracy;
  }
  if (expectedPointsLoss <= WIN_LOSS_THRESHOLDS.MISTAKE_MAX) {
    return MoveClassification.Mistake;
  }

  return MoveClassification.Blunder;
}
