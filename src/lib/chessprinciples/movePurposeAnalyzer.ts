import { Chess } from "chess.js";
import { PositionEval } from "@/types/eval";

export interface MovePurpose {
  move: string;
  moveNumber: number;
  purpose:
    | "tactical"
    | "positional"
    | "defensive"
    | "development"
    | "preventive"
    | "unknown";
  surpriseScore: number;
  lowDepthEval: number;
  highDepthEval: number;
  bestMove: string;
  explanation: string;
  tacticalThemes: string[];
}

export interface MovePurposeAnalysis {
  moves: MovePurpose[];
  overallAssessment: string;
}

/**
 * Analyzes the purpose of moves using the chess surprise analysis approach
 * This compares low-depth vs high-depth engine evaluations to understand why moves are "surprising"
 */
export async function analyzeMovePurposes(
  gameHistory: string[],
  userColor: "white" | "black",
  engineAnalysis?: PositionEval
): Promise<MovePurposeAnalysis> {
  const chess = new Chess();
  const movePurposes: MovePurpose[] = [];

  for (let i = 0; i < gameHistory.length; i++) {
    const move = gameHistory[i];
    const moveNumber = Math.floor(i / 2) + 1;
    const isUserMove =
      (userColor === "white" && i % 2 === 0) ||
      (userColor === "black" && i % 2 === 1);

    if (isUserMove) {
      const positionBefore = new Chess(chess.fen());
      const movePurpose = await analyzeSingleMovePurpose(
        move,
        moveNumber,
        positionBefore,
        gameHistory.slice(0, i)
      );
      movePurposes.push(movePurpose);
    }

    // Make the move
    chess.move(move);
  }

  return {
    moves: movePurposes,
    overallAssessment: generateOverallAssessment(movePurposes),
  };
}

/**
 * Analyzes the purpose of a single move using multi-depth analysis
 */
async function analyzeSingleMovePurpose(
  move: string,
  moveNumber: number,
  positionBefore: Chess,
  previousMoves: string[]
): Promise<MovePurpose> {
  // Get engine analysis at different depths
  const lowDepthEval = await getEngineEvaluation(positionBefore, 8); // Low depth
  const highDepthEval = await getEngineEvaluation(positionBefore, 20); // High depth

  // Calculate surprise score (difference between low and high depth evaluations)
  const surpriseScore = Math.abs(highDepthEval - lowDepthEval);

  // Get best move from high-depth analysis
  const bestMove = await getBestMove(positionBefore, 20);

  // Determine move purpose based on surprise score and move characteristics
  const purpose = determineMovePurpose(
    move,
    surpriseScore,
    lowDepthEval,
    highDepthEval
  );

  // Identify tactical themes
  const tacticalThemes = identifyTacticalThemes(move, positionBefore);

  // Generate explanation
  const explanation = generateMoveExplanation(
    move,
    purpose,
    surpriseScore,
    bestMove,
    tacticalThemes,
    previousMoves
  );

  return {
    move,
    moveNumber,
    purpose,
    surpriseScore,
    lowDepthEval,
    highDepthEval,
    bestMove,
    explanation,
    tacticalThemes,
  };
}

/**
 * Determines the purpose of a move based on surprise score and characteristics
 */
function determineMovePurpose(
  move: string,
  surpriseScore: number,
  lowDepthEval: number,
  highDepthEval: number
): MovePurpose["purpose"] {
  // High surprise score indicates tactical mistake
  if (surpriseScore > 1.0) {
    return "tactical";
  }

  // Medium surprise score with specific move characteristics
  if (surpriseScore > 0.5) {
    if (move.includes("Q") && !move.includes("x")) {
      return "positional"; // Queen moves without capture
    }
    if (move.includes("p") && !isCenterPawnMove(move)) {
      return "development"; // Non-central pawn moves
    }
    if (move.includes("K") && !move.includes("O")) {
      return "defensive"; // King moves (not castling)
    }
  }

  // Low surprise score - likely good move
  if (surpriseScore < 0.2) {
    if (move.includes("O")) {
      return "defensive"; // Castling
    }
    if (move.includes("N") || move.includes("B")) {
      return "development"; // Piece development
    }
    if (move.includes("x")) {
      return "tactical"; // Captures
    }
  }

  return "unknown";
}

/**
 * Identifies tactical themes in the position
 */
function identifyTacticalThemes(move: string, position: Chess): string[] {
  const themes: string[] = [];

  // Check for checks
  if (move.includes("+")) {
    themes.push("check");
  }

  // Check for captures
  if (move.includes("x")) {
    themes.push("capture");
  }

  // Check for pins (simplified)
  if (move.includes("B") && (move.includes("g5") || move.includes("g4"))) {
    themes.push("pin");
  }

  // Check for forks (simplified - knight moves)
  if (move.includes("N")) {
    themes.push("potential-fork");
  }

  // Check for discovered attacks
  if (move.includes("R") || move.includes("B")) {
    themes.push("discovered-attack");
  }

  return themes;
}

/**
 * Generates explanation for the move purpose
 */
function generateMoveExplanation(
  move: string,
  purpose: MovePurpose["purpose"],
  surpriseScore: number,
  bestMove: string,
  tacticalThemes: string[],
  gameHistory: string[]
): string {
  const moveNumber = Math.floor(gameHistory.indexOf(move) / 2) + 1;

  switch (purpose) {
    case "tactical":
      if (surpriseScore > 1.0) {
        return `Move ${moveNumber}. ${move} was a tactical mistake. The engine expected ${bestMove} which would have been ${surpriseScore.toFixed(1)} centipawns better. This move allowed tactical opportunities.`;
      } else {
        return `Move ${moveNumber}. ${move} was a tactical move${tacticalThemes.length > 0 ? ` involving ${tacticalThemes.join(", ")}` : ""}.`;
      }

    case "positional":
      return `Move ${moveNumber}. ${move} was a positional move. The engine preferred ${bestMove} by ${surpriseScore.toFixed(1)} centipawns.`;

    case "defensive":
      return `Move ${moveNumber}. ${move} was a defensive move. The engine suggested ${bestMove} as a better defensive option.`;

    case "development":
      return `Move ${moveNumber}. ${move} was a development move. The engine preferred ${bestMove} for better piece coordination.`;

    case "preventive":
      return `Move ${moveNumber}. ${move} was a preventive move to stop opponent threats.`;

    default:
      return `Move ${moveNumber}. ${move} purpose unclear. Engine preferred ${bestMove}.`;
  }
}

/**
 * Generates overall assessment of the game
 */
function generateOverallAssessment(movePurposes: MovePurpose[]): string {
  const tacticalMistakes = movePurposes.filter(
    (m) => m.purpose === "tactical" && m.surpriseScore > 1.0
  ).length;
  const positionalMistakes = movePurposes.filter(
    (m) => m.purpose === "positional" && m.surpriseScore > 0.5
  ).length;

  if (tacticalMistakes > 3) {
    return "Multiple tactical mistakes indicate need for better calculation.";
  } else if (positionalMistakes > 3) {
    return "Multiple positional mistakes indicate need for better strategic understanding.";
  } else if (tacticalMistakes + positionalMistakes > 5) {
    return "Mixed tactical and positional mistakes suggest need for overall improvement.";
  } else {
    return "Generally good play with few significant mistakes.";
  }
}

// Helper functions (these would need to be implemented with actual engine integration)
async function getEngineEvaluation(
  position: Chess,
  depth: number
): Promise<number> {
  // This would integrate with Stockfish or other engine
  // For now, return a placeholder
  return 0;
}

async function getBestMove(position: Chess, depth: number): Promise<string> {
  // This would get the best move from engine analysis
  // For now, return a placeholder
  return "e4";
}

function isCenterPawnMove(move: string): boolean {
  return (
    move.includes("e4") ||
    move.includes("e5") ||
    move.includes("d4") ||
    move.includes("d5")
  );
}
