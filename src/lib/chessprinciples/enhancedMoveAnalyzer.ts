import { Chess } from "chess.js";
import { PositionEval } from "@/types/eval";

export interface EnhancedMoveAnalysis {
  move: string;
  moveNumber: number;
  surpriseScore: number;
  lowDepthEval: number;
  highDepthEval: number;
  bestMove: string;
  movePurpose:
    | "tactical"
    | "positional"
    | "defensive"
    | "development"
    | "preventive"
    | "unknown";
  tacticalThemes: string[];
  positionInsights: string[];
  pieceSquareAnalysis: string[];
  pinnedPieces: string[];
  trappedPieces: string[];
  mobilityAnalysis: string[];
  explanation: string;
}

export interface EnhancedGameAnalysis {
  moves: EnhancedMoveAnalysis[];
  overallAssessment: string;
  keyInsights: string[];
}

/**
 * Enhanced move analyzer that combines:
 * 1. Chess Surprise Analysis (multi-depth evaluation comparison)
 * 2. Explainable AI heuristics (PSQT, pinned pieces, trapped pieces, mobility)
 */
export async function analyzeGameEnhanced(
  gameHistory: string[],
  userColor: "white" | "black",
  engineAnalysis?: PositionEval
): Promise<EnhancedGameAnalysis> {
  const chess = new Chess();
  const moves: EnhancedMoveAnalysis[] = [];
  const keyInsights: string[] = [];

  for (let i = 0; i < gameHistory.length; i++) {
    const move = gameHistory[i];
    const moveNumber = Math.floor(i / 2) + 1;
    const isUserMove =
      (userColor === "white" && i % 2 === 0) ||
      (userColor === "black" && i % 2 === 1);

    if (isUserMove) {
      const positionBefore = new Chess(chess.fen());
      const analysis = await analyzeSingleMoveEnhanced(
        move,
        moveNumber,
        positionBefore,
        gameHistory.slice(0, i)
      );
      moves.push(analysis);

      // Collect key insights for significant moves
      if (analysis.surpriseScore > 1.0) {
        keyInsights.push(
          `Move ${moveNumber}. ${move}: ${analysis.explanation}`
        );
      }
    }

    // Make the move
    chess.move(move);
  }

  return {
    moves,
    overallAssessment: generateEnhancedAssessment(moves),
    keyInsights,
  };
}

/**
 * Comprehensive analysis of a single move using multiple approaches
 */
async function analyzeSingleMoveEnhanced(
  move: string,
  moveNumber: number,
  positionBefore: Chess,
  previousMoves: string[]
): Promise<EnhancedMoveAnalysis> {
  // 1. SURPRISE ANALYSIS (from chess-surprise-analysis)
  const lowDepthEval = await getEngineEvaluation(positionBefore, 8);
  const highDepthEval = await getEngineEvaluation(positionBefore, 20);
  const surpriseScore = Math.abs(highDepthEval - lowDepthEval);
  const bestMove = await getBestMove(positionBefore, 20);

  // 2. MOVE PURPOSE CLASSIFICATION
  const movePurpose = determineMovePurpose(
    move,
    surpriseScore,
    lowDepthEval,
    highDepthEval
  );

  // 3. TACTICAL THEME IDENTIFICATION
  const tacticalThemes = identifyTacticalThemes(move, positionBefore);

  // 4. POSITION INSIGHTS (from python-chessx)
  const positionInsights = await generatePositionInsights(positionBefore);

  // 5. PIECE-SQUARE TABLE ANALYSIS
  const pieceSquareAnalysis = analyzePieceSquareTables(positionBefore);

  // 6. PINNED PIECES ANALYSIS
  const pinnedPieces = findPinnedPieces(positionBefore);

  // 7. TRAPPED PIECES ANALYSIS
  const trappedPieces = findTrappedPieces(positionBefore);

  // 8. MOBILITY ANALYSIS
  const mobilityAnalysis = analyzeMobility(positionBefore);

  // 9. COMPREHENSIVE EXPLANATION
  const explanation = generateComprehensiveExplanation(
    move,
    moveNumber,
    movePurpose,
    surpriseScore,
    bestMove,
    tacticalThemes,
    positionInsights,
    pieceSquareAnalysis
  );

  return {
    move,
    moveNumber,
    surpriseScore,
    lowDepthEval,
    highDepthEval,
    bestMove,
    movePurpose,
    tacticalThemes,
    positionInsights,
    pieceSquareAnalysis,
    pinnedPieces,
    trappedPieces,
    mobilityAnalysis,
    explanation,
  };
}

/**
 * Determines move purpose using surprise score and characteristics
 */
function determineMovePurpose(
  move: string,
  surpriseScore: number,
  lowDepthEval: number,
  highDepthEval: number
): EnhancedMoveAnalysis["movePurpose"] {
  // High surprise score indicates tactical mistake
  if (surpriseScore > 1.0) {
    return "tactical";
  }

  // Medium surprise score with specific characteristics
  if (surpriseScore > 0.5) {
    if (move.includes("Q") && !move.includes("x")) {
      return "positional";
    }
    if (move.includes("p") && !isCenterPawnMove(move)) {
      return "development";
    }
    if (move.includes("K") && !move.includes("O")) {
      return "defensive";
    }
  }

  // Low surprise score - likely good move
  if (surpriseScore < 0.2) {
    if (move.includes("O")) {
      return "defensive";
    }
    if (move.includes("N") || move.includes("B")) {
      return "development";
    }
    if (move.includes("x")) {
      return "tactical";
    }
  }

  return "unknown";
}

/**
 * Identifies tactical themes in the position
 */
function identifyTacticalThemes(move: string, position: Chess): string[] {
  const themes: string[] = [];

  if (move.includes("+")) {
    themes.push("check");
  }
  if (move.includes("x")) {
    themes.push("capture");
  }
  if (move.includes("B") && (move.includes("g5") || move.includes("g4"))) {
    themes.push("pin");
  }
  if (move.includes("N")) {
    themes.push("potential-fork");
  }
  if (move.includes("R") || move.includes("B")) {
    themes.push("discovered-attack");
  }

  return themes;
}

/**
 * Generates position insights based on engine evaluation
 */
async function generatePositionInsights(position: Chess): Promise<string[]> {
  const insights: string[] = [];
  const evaluation = await getEngineEvaluation(position, 16);

  if (Math.abs(evaluation) < 0.6) {
    insights.push("Position is approximately equal");
  } else if (evaluation > 0) {
    if (evaluation < 1.25) {
      insights.push("White has a slight advantage");
    } else if (evaluation < 2.5) {
      insights.push("White has a significant advantage");
    } else {
      insights.push("White is winning");
    }
  } else {
    if (evaluation > -1.25) {
      insights.push("Black has a slight advantage");
    } else if (evaluation > -2.5) {
      insights.push("Black has a significant advantage");
    } else {
      insights.push("Black is winning");
    }
  }

  return insights;
}

/**
 * Analyzes piece-square table evaluations
 */
function analyzePieceSquareTables(position: Chess): string[] {
  const analysis: string[] = [];
  const board = position.board();

  // Simplified PSQT analysis
  const whitePieces = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  const blackPieces = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };

  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const square = i * 8 + j;
      const piece = board[i][j];

      if (piece) {
        const pieceType = piece.type;
        const isWhite = piece.color;

        if (isWhite) {
          whitePieces[pieceType]++;
        } else {
          blackPieces[pieceType]++;
        }
      }
    }
  }

  // Generate insights based on piece placement
  if (whitePieces.p > blackPieces.p) {
    analysis.push("White has better pawn structure");
  } else if (blackPieces.p > whitePieces.p) {
    analysis.push("Black has better pawn structure");
  }

  return analysis;
}

/**
 * Finds pinned pieces in the position
 */
function findPinnedPieces(position: Chess): string[] {
  const pinned: string[] = [];
  const board = position.board();

  // Simplified pin detection
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const square = i * 8 + j;
      const piece = board[i][j];

      if (piece && (piece.type === "r" || piece.type === "q")) {
        // Check for potential pins along ranks and files
        if (isPinnedPiece(position, square)) {
          pinned.push(
            `${piece.color ? "White" : "Black"} ${piece.type} at ${getSquareName(square)} is pinned`
          );
        }
      }
    }
  }

  return pinned;
}

/**
 * Finds trapped pieces in the position
 */
function findTrappedPieces(position: Chess): string[] {
  const trapped: string[] = [];
  const board = position.board();

  // Simplified trapped piece detection
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const square = i * 8 + j;
      const piece = board[i][j];

      if (piece && isTrappedPiece(position, square)) {
        trapped.push(
          `${piece.color ? "White" : "Black"} ${piece.type} at ${getSquareName(square)} is trapped`
        );
      }
    }
  }

  return trapped;
}

/**
 * Analyzes mobility (number of legal moves)
 */
function analyzeMobility(position: Chess): string[] {
  const analysis: string[] = [];
  const whiteMoves = position.moves().length;

  // Create position from opponent's perspective
  const opponentPosition = new Chess(position.fen());
  opponentPosition.move("a1a1"); // Make a null move to switch turns
  const blackMoves = opponentPosition.moves().length;

  if (whiteMoves > blackMoves) {
    analysis.push(
      `White has better mobility (${whiteMoves} vs ${blackMoves} moves)`
    );
  } else if (blackMoves > whiteMoves) {
    analysis.push(
      `Black has better mobility (${blackMoves} vs ${whiteMoves} moves)`
    );
  } else {
    analysis.push("Mobility is equal");
  }

  return analysis;
}

/**
 * Generates comprehensive explanation combining all analyses
 */
function generateComprehensiveExplanation(
  move: string,
  moveNumber: number,
  purpose: EnhancedMoveAnalysis["movePurpose"],
  surpriseScore: number,
  bestMove: string,
  tacticalThemes: string[],
  positionInsights: string[],
  pieceSquareAnalysis: string[]
): string {
  let explanation = `Move ${moveNumber}. ${move}: `;

  if (surpriseScore > 1.0) {
    explanation += `This was a significant tactical mistake. The engine expected ${bestMove} which would be ${surpriseScore.toFixed(1)} centipawns better. `;
  } else if (surpriseScore > 0.5) {
    explanation += `This move was suboptimal. The engine preferred ${bestMove} by ${surpriseScore.toFixed(1)} centipawns. `;
  } else {
    explanation += `This was a reasonable move. `;
  }

  explanation += `The move's purpose was ${purpose}. `;

  if (tacticalThemes.length > 0) {
    explanation += `Tactical themes involved: ${tacticalThemes.join(", ")}. `;
  }

  if (positionInsights.length > 0) {
    explanation += positionInsights[0] + ". ";
  }

  if (pieceSquareAnalysis.length > 0) {
    explanation += pieceSquareAnalysis[0] + ". ";
  }

  return explanation;
}

/**
 * Generates overall assessment of the game
 */
function generateEnhancedAssessment(moves: EnhancedMoveAnalysis[]): string {
  const tacticalMistakes = moves.filter(
    (m) => m.movePurpose === "tactical" && m.surpriseScore > 1.0
  ).length;
  const positionalMistakes = moves.filter(
    (m) => m.movePurpose === "positional" && m.surpriseScore > 0.5
  ).length;

  if (tacticalMistakes > 3) {
    return "Multiple tactical mistakes indicate need for better calculation and tactical awareness.";
  } else if (positionalMistakes > 3) {
    return "Multiple positional mistakes indicate need for better strategic understanding.";
  } else if (tacticalMistakes + positionalMistakes > 5) {
    return "Mixed tactical and positional mistakes suggest need for overall improvement.";
  } else {
    return "Generally good play with few significant mistakes.";
  }
}

// Helper functions (placeholders for engine integration)
async function getEngineEvaluation(
  position: Chess,
  depth: number
): Promise<number> {
  // This would integrate with Stockfish
  return 0;
}

async function getBestMove(position: Chess, depth: number): Promise<string> {
  // This would get the best move from engine analysis
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

function isPinnedPiece(position: Chess, square: number): boolean {
  // Simplified pin detection
  return false;
}

function isTrappedPiece(position: Chess, square: number): boolean {
  // Simplified trapped piece detection
  return false;
}

function getSquareName(square: number): string {
  const files = "abcdefgh";
  const ranks = "87654321";
  const file = files[square % 8];
  const rank = ranks[Math.floor(square / 8)];
  return file + rank;
}
