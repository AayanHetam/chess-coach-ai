import { LineEval, PositionEval } from "@/types/eval";
import {
  getLineWinPercentage,
  getPositionWinPercentage,
} from "./winPercentage";
import { MoveClassification } from "@/types/enums";
import { openings } from "@/data/openings";
import { getIsPieceSacrifice, isSimplePieceRecapture } from "@/lib/chess";

// Chess.com's Expected Points Model thresholds
const CHESS_COM_THRESHOLDS = {
  BEST: 0.00,
  EXCELLENT_MAX: 0.02,
  GOOD_MAX: 0.05, 
  INACCURACY_MAX: 0.10,
  MISTAKE_MAX: 0.20,
  BLUNDER_MAX: 1.00,
};

// Convert win percentage difference to expected points loss
const winPercentageToExpectedPoints = (winPercentageDiff: number): number => {
  // Chess.com's expected points formula
  // This converts our win percentage model to their expected points model
  return Math.abs(winPercentageDiff) / 100;
};

export const getMovesClassification = (
  rawPositions: PositionEval[],
  uciMoves: string[],
  fens: string[]
): PositionEval[] => {
  const positionsWinPercentage = rawPositions.map(getPositionWinPercentage);
  let currentOpening: string | undefined = undefined;

  const positions = rawPositions.map((rawPosition, index) => {
    if (index === 0) return rawPosition;

    const currentFen = fens[index].split(" ")[0];
    const opening = openings.find((opening) => opening.fen === currentFen);
    if (opening) {
      currentOpening = opening.name;
      return {
        ...rawPosition,
        opening: opening.name,
        moveClassification: MoveClassification.Opening,
      };
    }

    const prevPosition = rawPositions[index - 1];

    // Forced moves (only one legal move)
    if (prevPosition.lines.length === 1) {
      return {
        ...rawPosition,
        opening: currentOpening,
        moveClassification: MoveClassification.Forced,
      };
    }

    const playedMove = uciMoves[index - 1];
    const lastPositionWinPercentage = positionsWinPercentage[index - 1];
    const positionWinPercentage = positionsWinPercentage[index];
    const isWhiteMove = index % 2 === 1;

    const lastPositionAlternativeLine: LineEval | undefined =
      prevPosition.lines.filter((line) => line.pv[0] !== playedMove)?.[0];
    const lastPositionAlternativeLineWinPercentage = lastPositionAlternativeLine
      ? getLineWinPercentage(lastPositionAlternativeLine)
      : undefined;

    const bestLinePvToPlay = rawPosition.lines[0].pv;
    const fenTwoMovesAgo = index > 1 ? fens[index - 2] : null;
    const uciNextTwoMoves: [string, string] | null =
      index > 1 ? [uciMoves[index - 2], uciMoves[index - 1]] : null;

    // Check for special move classifications first
    if (
      isBrilliantMove(
        lastPositionWinPercentage,
        positionWinPercentage,
        isWhiteMove,
        playedMove,
        bestLinePvToPlay,
        fens[index - 1],
        lastPositionAlternativeLineWinPercentage
      )
    ) {
      return {
        ...rawPosition,
        opening: currentOpening,
        moveClassification: MoveClassification.Brilliant,
      };
    }

    if (
      isGreatMove(
        lastPositionWinPercentage,
        positionWinPercentage,
        isWhiteMove,
        lastPositionAlternativeLineWinPercentage,
        fenTwoMovesAgo,
        uciNextTwoMoves
      )
    ) {
      return {
        ...rawPosition,
        opening: currentOpening,
        moveClassification: MoveClassification.Great,
      };
    }

    // Check for Miss (missed opportunity to capitalize on opponent's mistake)
    if (
      isMissedOpportunity(
        index,
        rawPositions,
        uciMoves,
        fens,
        isWhiteMove
      )
    ) {
      return {
        ...rawPosition,
        opening: currentOpening,
        moveClassification: MoveClassification.Miss,
      };
    }

    // Best move check
    if (playedMove === prevPosition.bestMove) {
      return {
        ...rawPosition,
        opening: currentOpening,
        moveClassification: MoveClassification.Best,
      };
    }

    // Chess.com-style basic classification using expected points
    const moveClassification = getChessComClassification(
      lastPositionWinPercentage,
      positionWinPercentage,
      isWhiteMove
    );

    return {
      ...rawPosition,
      opening: currentOpening,
      moveClassification,
    };
  });

  return positions;
};

// Chess.com-compatible classification based on expected points loss
const getChessComClassification = (
  lastPositionWinPercentage: number,
  positionWinPercentage: number,
  isWhiteMove: boolean
): MoveClassification => {
  const winPercentageDiff =
    (positionWinPercentage - lastPositionWinPercentage) *
    (isWhiteMove ? 1 : -1);

  const expectedPointsLoss = winPercentageToExpectedPoints(Math.min(0, winPercentageDiff));

  if (expectedPointsLoss === CHESS_COM_THRESHOLDS.BEST) {
    return MoveClassification.Best;
  }
  if (expectedPointsLoss <= CHESS_COM_THRESHOLDS.EXCELLENT_MAX) {
    return MoveClassification.Excellent;
  }
  if (expectedPointsLoss <= CHESS_COM_THRESHOLDS.GOOD_MAX) {
    return MoveClassification.Good;
  }
  if (expectedPointsLoss <= CHESS_COM_THRESHOLDS.INACCURACY_MAX) {
    return MoveClassification.Inaccuracy;
  }
  if (expectedPointsLoss <= CHESS_COM_THRESHOLDS.MISTAKE_MAX) {
    return MoveClassification.Mistake;
  }
  
  return MoveClassification.Blunder;
};

// Detect missed opportunities (Chess.com's "Miss" category)
const isMissedOpportunity = (
  currentIndex: number,
  positions: PositionEval[],
  uciMoves: string[],
  fens: string[],
  isWhiteMove: boolean
): boolean => {
  // A miss occurs when:
  // 1. The opponent made a mistake in the previous move
  // 2. The player had an opportunity to gain a significant advantage
  // 3. The player failed to capitalize and the position became equal or worse

  if (currentIndex < 2) return false; // Need at least 2 moves to detect

  const opponentMoveIndex = currentIndex - 1;
  const prevPositions = positions.slice(0, currentIndex + 1);
  const positionsWinPercentage = prevPositions.map(getPositionWinPercentage);

  // Check if opponent made a mistake in the previous move
  const opponentIsWhite = !isWhiteMove;
  const beforeOpponentMoveWinPercentage = positionsWinPercentage[opponentMoveIndex - 1];
  const afterOpponentMoveWinPercentage = positionsWinPercentage[opponentMoveIndex];
  
  const opponentWinPercentageDiff =
    (afterOpponentMoveWinPercentage - beforeOpponentMoveWinPercentage) *
    (opponentIsWhite ? 1 : -1);

  // Opponent made a significant mistake (lost >10% win probability)
  const opponentMadeMistake = opponentWinPercentageDiff < -10;

  if (!opponentMadeMistake) return false;

  // Check if player had a winning opportunity but missed it
  const beforePlayerMoveWinPercentage = positionsWinPercentage[currentIndex - 1];
  const afterPlayerMoveWinPercentage = positionsWinPercentage[currentIndex];
  
  const playerWinPercentageDiff =
    (afterPlayerMoveWinPercentage - beforePlayerMoveWinPercentage) *
    (isWhiteMove ? 1 : -1);

  // Player had a winning position but failed to maintain advantage
  const playerWinning = isWhiteMove 
    ? beforePlayerMoveWinPercentage > 75 
    : beforePlayerMoveWinPercentage < 25;

  const playerLostAdvantage = playerWinPercentageDiff < -5;

  // Check if there was a better move that would have maintained/increased advantage
  const prevPosition = positions[currentIndex - 1];
  if (prevPosition.lines.length < 2) return false;

  const bestLineWinPercentage = getLineWinPercentage(prevPosition.lines[0]);
  const bestMoveAdvantage = isWhiteMove
    ? bestLineWinPercentage - beforePlayerMoveWinPercentage
    : beforePlayerMoveWinPercentage - bestLineWinPercentage;

  return playerWinning && playerLostAdvantage && bestMoveAdvantage > 10;
};

// Brilliant moves are good piece sacrifices (Chess.com definition)
const isBrilliantMove = (
  lastPositionWinPercentage: number,
  positionWinPercentage: number,
  isWhiteMove: boolean,
  playedMove: string,
  bestLinePvToPlay: string[],
  fen: string,
  lastPositionAlternativeLineWinPercentage: number | undefined
): boolean => {
  if (!lastPositionAlternativeLineWinPercentage) return false;

  const winPercentageDiff =
    (positionWinPercentage - lastPositionWinPercentage) *
    (isWhiteMove ? 1 : -1);
  if (winPercentageDiff < -2) return false;

  const isPieceSacrifice = getIsPieceSacrifice(
    fen,
    playedMove,
    bestLinePvToPlay
  );
  if (!isPieceSacrifice) return false;

  if (
    isLosingOrAlternateCompletelyWinning(
      positionWinPercentage,
      lastPositionAlternativeLineWinPercentage,
      isWhiteMove
    )
  ) {
    return false;
  }

  return true;
};

// Great moves are critical to game outcome or the only good move (Chess.com definition)
const isGreatMove = (
  lastPositionWinPercentage: number,
  positionWinPercentage: number,
  isWhiteMove: boolean,
  lastPositionAlternativeLineWinPercentage: number | undefined,
  fenTwoMovesAgo: string | null,
  uciMoves: [string, string] | null
): boolean => {
  if (!lastPositionAlternativeLineWinPercentage) return false;

  const winPercentageDiff =
    (positionWinPercentage - lastPositionWinPercentage) *
    (isWhiteMove ? 1 : -1);
  if (winPercentageDiff < -2) return false;

  if (
    fenTwoMovesAgo &&
    uciMoves &&
    isSimplePieceRecapture(fenTwoMovesAgo, uciMoves)
  )
    return false;

  if (
    isLosingOrAlternateCompletelyWinning(
      positionWinPercentage,
      lastPositionAlternativeLineWinPercentage,
      isWhiteMove
    )
  ) {
    return false;
  }

  const hasChangedGameOutcome = getHasChangedGameOutcome(
    lastPositionWinPercentage,
    positionWinPercentage,
    isWhiteMove
  );

  const isTheOnlyGoodMove = getIsTheOnlyGoodMove(
    positionWinPercentage,
    lastPositionAlternativeLineWinPercentage,
    isWhiteMove
  );

  return hasChangedGameOutcome || isTheOnlyGoodMove;
};

const isLosingOrAlternateCompletelyWinning = (
  positionWinPercentage: number,
  lastPositionAlternativeLineWinPercentage: number,
  isWhiteMove: boolean
): boolean => {
  const isLosing = isWhiteMove
    ? positionWinPercentage < 50
    : positionWinPercentage > 50;
  const isAlternateCompletelyWinning = isWhiteMove
    ? lastPositionAlternativeLineWinPercentage > 97
    : lastPositionAlternativeLineWinPercentage < 3;

  return isLosing || isAlternateCompletelyWinning;
};

const getHasChangedGameOutcome = (
  lastPositionWinPercentage: number,
  positionWinPercentage: number,
  isWhiteMove: boolean
): boolean => {
  const winPercentageDiff =
    (positionWinPercentage - lastPositionWinPercentage) *
    (isWhiteMove ? 1 : -1);
  return (
    winPercentageDiff > 10 &&
    ((lastPositionWinPercentage < 50 && positionWinPercentage > 50) ||
      (lastPositionWinPercentage > 50 && positionWinPercentage < 50))
  );
};

const getIsTheOnlyGoodMove = (
  positionWinPercentage: number,
  lastPositionAlternativeLineWinPercentage: number,
  isWhiteMove: boolean
): boolean => {
  const winPercentageDiff =
    (positionWinPercentage - lastPositionAlternativeLineWinPercentage) *
    (isWhiteMove ? 1 : -1);
  return winPercentageDiff > 10;
};
