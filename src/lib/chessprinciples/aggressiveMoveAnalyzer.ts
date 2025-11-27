import { Chess } from "chess.js";
import { ChessPrinciple, ChessPrincipleViolation } from "./index";
import { PositionEval } from "@/types/eval";
import {
  openingPrinciples,
  middlegamePrinciples,
  endgamePrinciples,
  generalPrinciples,
} from "./principles";
import { analyzeMovePurposes, MovePurpose } from "./movePurposeAnalyzer";
import {
  analyzeGameSurprises,
  SurpriseAnalysis,
} from "../engine/surpriseAnalyzer";
import { getSurpriseEngineService } from "../engine/surpriseEngineService";

export interface AggressiveMoveAnalysis {
  move: string;
  moveNumber: number;
  isUserMove: boolean;
  evaluationChange: number;
  bestMove: string;
  isBestMove: boolean;
  filteredViolations: ChessPrincipleViolation[];
  movePurpose: MovePurpose | null;
  surpriseAnalysis: SurpriseAnalysis | null;
}

export interface AggressiveGameAnalysis {
  moves: AggressiveMoveAnalysis[];
  topViolations: ChessPrincipleViolation[];
  overallAssessment: string;
  surpriseInsights: string[];
}

export async function analyzeGameAggressively(
  gameHistory: string[],
  userColor: "white" | "black",
  engineAnalysis?: PositionEval
): Promise<AggressiveGameAnalysis> {
  const chess = new Chess();
  const moves: AggressiveMoveAnalysis[] = [];

  // Get move purpose analysis
  const movePurposeAnalysis = await analyzeMovePurposes(
    gameHistory,
    userColor,
    engineAnalysis
  );

  // Get surprise analysis (from chess-surprise-analysis repository)
  const surpriseAnalysis = await analyzeGameSurprises(
    gameHistory,
    userColor,
    engineAnalysis
  );

  // Analyze each move
  for (let i = 0; i < gameHistory.length; i++) {
    const move = gameHistory[i];
    const moveNumber = Math.floor(i / 2) + 1;
    const isUserMove =
      (userColor === "white" && i % 2 === 0) ||
      (userColor === "black" && i % 2 === 1);

    // Get position before the move
    const positionBefore = new Chess(chess.fen());

    // Make the move
    const moveResult = chess.move(move);
    if (!moveResult) continue;

    // Get position after the move
    const positionAfter = new Chess(chess.fen());

    // Calculate evaluation change using proper engine evaluation
    const evaluationChange = await calculateEvaluationChangeWithEngine(
      move,
      positionBefore,
      positionAfter,
      userColor
    );

    // Debug output for significant evaluation changes
    if (Math.abs(evaluationChange) > 0.5) {
      console.log(
        `Move ${moveNumber}. ${move}: evaluation change = ${evaluationChange.toFixed(2)}`
      );
    }

    // Debug output for user moves that don't get violations
    if (isUserMove && evaluationChange >= -0.3) {
      console.log(
        `Move ${moveNumber}. ${move}: evaluation change = ${evaluationChange.toFixed(2)} (no violation - too small)`
      );
    }

    // Only generate violations if this move actually caused a significant evaluation drop
    // AND it's a user move (we only analyze user moves)
    const allViolations =
      evaluationChange < -0.3 && isUserMove
        ? generateViolationsForWorstMove(
            move,
            moveNumber,
            positionBefore,
            positionAfter,
            gameHistory.slice(0, i),
            evaluationChange
          )
        : [];

    // Debug output for violations
    if (isUserMove) {
      console.log(
        `Move ${moveNumber}. ${move}: evaluation change = ${evaluationChange.toFixed(3)}, violations = ${allViolations.length}`
      );
      if (allViolations.length > 0) {
        console.log(
          `  🚨 Violations found:`,
          allViolations.map((v) => `${v.principle.name} (${v.severity})`)
        );
      } else if (evaluationChange < -0.3) {
        console.log(
          `  ⚠️  No violations generated despite significant evaluation drop`
        );
      }
    }

    // Get move purpose information
    const movePurpose = movePurposeAnalysis.moves.find(
      (mp) => mp.move === move && mp.moveNumber === moveNumber
    );

    // Get surprise analysis information
    const surpriseAnalysisForMove = surpriseAnalysis.moves.find(
      (sa) => sa.move === move && sa.moveNumber === moveNumber
    );

    moves.push({
      move,
      moveNumber,
      isUserMove,
      evaluationChange,
      bestMove: "", // We don't need this anymore
      isBestMove: evaluationChange >= -0.3,
      filteredViolations: allViolations,
      movePurpose: movePurpose || null,
      surpriseAnalysis: surpriseAnalysisForMove || null,
    });
  }

  // Get top violations by impact
  const topViolations = getTopViolationsByImpact(moves);

  return {
    moves,
    topViolations,
    overallAssessment: surpriseAnalysis.overallAssessment,
    surpriseInsights: surpriseAnalysis.keyInsights,
  };
}

/**
 * Calculate evaluation change using real engine evaluation
 */
async function calculateEvaluationChangeWithEngine(
  move: string,
  positionBefore: Chess,
  positionAfter: Chess,
  userColor: "white" | "black"
): Promise<number> {
  try {
    console.log(`🔍 Engine evaluation for move: ${move} (${userColor})`);

    // Use the surprise engine service for real evaluations
    const engineService = getSurpriseEngineService();
    console.log("🔄 Initializing engine service...");
    await engineService.initialize();
    console.log("✅ Engine service initialized");

    // Get evaluation before the move
    console.log("🔄 Getting evaluation before move...");
    const evalBefore = await engineService.getEngineEvaluation(
      positionBefore,
      16
    );
    console.log(`📊 Evaluation before: ${evalBefore}`);

    // Get evaluation after the move
    console.log("🔄 Getting evaluation after move...");
    const evalAfter = await engineService.getEngineEvaluation(
      positionAfter,
      16
    );
    console.log(`📊 Evaluation after: ${evalAfter}`);

    // Calculate the change (from the perspective of the player who made the move)
    const evaluationChange =
      userColor === "white"
        ? (evalAfter - evalBefore) / 100 // White's perspective
        : (evalBefore - evalAfter) / 100; // Black's perspective

    console.log(`📈 Evaluation change: ${evaluationChange.toFixed(3)}`);

    return evaluationChange;
  } catch (error) {
    console.error(
      "❌ Engine evaluation failed, using basic evaluation:",
      error
    );
    // Fallback to basic evaluation if engine fails
    const basicEval = calculateBasicEvaluationChange(
      move,
      positionBefore,
      positionAfter,
      userColor
    );
    console.log(`🔄 Using basic evaluation: ${basicEval.toFixed(3)}`);
    return basicEval;
  }
}

function calculateBasicEvaluationChange(
  move: string,
  positionBefore: Chess,
  positionAfter: Chess,
  userColor: "white" | "black"
): number {
  // Calculate material and positional evaluation change
  const materialBefore = calculateMaterial(positionBefore);
  const materialAfter = calculateMaterial(positionAfter);
  const materialChange = materialAfter - materialBefore;

  // Calculate positional factors
  const positionalBefore = calculatePositionalFactors(positionBefore);
  const positionalAfter = calculatePositionalFactors(positionAfter);
  const positionalChange = positionalAfter - positionalBefore;

  // Calculate tactical factors
  const tacticalBefore = calculateTacticalFactors(positionBefore);
  const tacticalAfter = calculateTacticalFactors(positionAfter);
  const tacticalChange = tacticalAfter - tacticalBefore;

  // Calculate development factors (especially important in opening/middlegame)
  const developmentBefore = calculateDevelopmentFactors(positionBefore);
  const developmentAfter = calculateDevelopmentFactors(positionAfter);
  const developmentChange = developmentAfter - developmentBefore;

  // Calculate king safety factors
  const kingSafetyBefore = calculateKingSafetyFactors(positionBefore);
  const kingSafetyAfter = calculateKingSafetyFactors(positionAfter);
  const kingSafetyChange = kingSafetyAfter - kingSafetyBefore;

  // Combine all factors with appropriate weights
  const totalChange =
    materialChange +
    positionalChange * 0.3 +
    tacticalChange * 0.4 +
    developmentChange * 0.2 +
    kingSafetyChange * 0.3;

  // Adjust for color (positive is good for white, negative is good for black)
  return userColor === "white" ? totalChange : -totalChange;
}

function calculateTacticalFactors(position: Chess): number {
  let score = 0;
  const board = position.board();
  const turn = position.turn();

  // Check for checks
  if (position.isCheck()) {
    score += turn === "w" ? -0.5 : 0.5; // Being in check is bad
  }

  // Check for checkmate
  if (position.isCheckmate()) {
    score += turn === "w" ? -10 : 10; // Checkmate is very bad
  }

  // Check for hanging pieces
  const hangingPieces = findHangingPieces(position);
  score += hangingPieces * (turn === "w" ? -0.3 : 0.3);

  // Check for tactical opportunities (captures, forks, pins)
  const tacticalOpportunities = countTacticalOpportunities(position);
  score += tacticalOpportunities * (turn === "w" ? 0.1 : -0.1);

  return score;
}

function calculateDevelopmentFactors(position: Chess): number {
  let score = 0;
  const board = position.board();
  const turn = position.turn();
  const moveCount = position.history().length;

  // Only consider development in opening/middlegame
  if (moveCount > 20) return 0;

  // Count developed pieces (knights and bishops moved from starting squares)
  const developedPieces = countDevelopedPieces(position);
  score += developedPieces * 0.1;

  // Check for castling
  if (hasCastled(position, turn)) {
    score += 0.2;
  }

  // Penalize moving the same piece multiple times in opening
  const repetitiveMoves = countRepetitiveMoves(position, turn);
  score -= repetitiveMoves * 0.1;

  return score;
}

function calculateKingSafetyFactors(position: Chess): number {
  let score = 0;
  const board = position.board();
  const turn = position.turn();

  // Find king position
  const kingSquare = findKingSquare(position, turn);
  if (!kingSquare) return 0;

  // Check if king is in center (bad in middlegame)
  const moveCount = position.history().length;
  if (moveCount > 10 && moveCount < 30) {
    if (isKingInCenter(kingSquare)) {
      score += turn === "w" ? -0.2 : 0.2;
    }
  }

  // Check if king is exposed to attacks
  const kingAttackers = countKingAttackers(position, kingSquare);
  score -= kingAttackers * 0.1;

  // Check if king has escape squares
  const escapeSquares = countKingEscapeSquares(position, kingSquare);
  score += escapeSquares * 0.05;

  return score;
}

function hasCastled(position: Chess, color: "w" | "b"): boolean {
  const history = position.history();
  return history.some((move) => move.includes("O-O") || move.includes("O-O-O"));
}

function countRepetitiveMoves(position: Chess, color: "w" | "b"): number {
  const history = position.history();
  const recentMoves = history.slice(-6); // Last 6 moves
  const pieceMoves: { [key: string]: number } = {};

  for (const move of recentMoves) {
    const piece = move.charAt(0);
    pieceMoves[piece] = (pieceMoves[piece] || 0) + 1;
  }

  return Object.values(pieceMoves).filter((count) => count > 1).length;
}

function findKingSquare(position: Chess, color: "w" | "b"): string | null {
  const board = position.board();

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type === "k" && piece.color === color) {
        return String.fromCharCode(97 + file) + (8 - rank);
      }
    }
  }

  return null;
}

function isKingInCenter(kingSquare: string): boolean {
  const file = kingSquare.charCodeAt(0) - 97;
  const rank = 8 - parseInt(kingSquare[1]);

  // King is in center if on files c-f and ranks 3-6
  return file >= 2 && file <= 5 && rank >= 2 && rank <= 5;
}

function countKingAttackers(position: Chess, kingSquare: string): number {
  const moves = position.moves();
  return moves.filter((move) => move.includes(kingSquare)).length;
}

function countKingEscapeSquares(position: Chess, kingSquare: string): number {
  // Count squares around king that are safe
  const file = kingSquare.charCodeAt(0) - 97;
  const rank = 8 - parseInt(kingSquare[1]);
  let safeSquares = 0;

  for (let f = Math.max(0, file - 1); f <= Math.min(7, file + 1); f++) {
    for (let r = Math.max(0, rank - 1); r <= Math.min(7, rank + 1); r++) {
      if (f === file && r === rank) continue; // King's current square

      const square = String.fromCharCode(97 + f) + (8 - r);
      if (!position.moves().some((move) => move.includes(square))) {
        safeSquares++;
      }
    }
  }

  return safeSquares;
}

function findHangingPieces(position: Chess): number {
  let hangingCount = 0;
  const board = position.board();
  const turn = position.turn();

  // Check each piece to see if it can be captured for free or with advantage
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.color === turn) {
        const square = String.fromCharCode(97 + file) + (8 - rank);
        if (isPieceHanging(square, position)) {
          hangingCount += getPieceValue(piece.type);
        }
      }
    }
  }

  return hangingCount;
}

function isPieceHanging(square: string, position: Chess): boolean {
  // Check if a piece can be captured for free or with advantage
  const piece = position.get(square as any);
  if (!piece) return false;

  const pieceValue = getPieceValue(piece.type);
  const attackers = position.moves().filter((m) => m.includes(square));

  // If there are attackers, check if the capture is favorable
  if (attackers.length > 0) {
    // For now, consider it hanging if there are multiple attackers
    return attackers.length >= 2;
  }

  return false;
}

function countTacticalOpportunities(position: Chess): number {
  const moves = position.moves();
  let opportunities = 0;

  // Count checks
  opportunities += moves.filter((m) => m.includes("+")).length;

  // Count captures
  opportunities += moves.filter((m) => m.includes("x")).length;

  // Count moves that attack squares near the enemy king
  const enemyKingSquare = findEnemyKing(position);
  if (enemyKingSquare) {
    opportunities += moves.filter(
      (m) => m.includes(enemyKingSquare) || isNearKing(m, enemyKingSquare)
    ).length;
  }

  return opportunities;
}

function findEnemyKing(position: Chess): string | null {
  const board = position.board();
  const turn = position.turn();
  const enemyColor = turn === "w" ? "b" : "w";

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type === "k" && piece.color === enemyColor) {
        return String.fromCharCode(97 + file) + (8 - rank);
      }
    }
  }

  return null;
}

function isNearKing(move: string, kingSquare: string): boolean {
  // Check if a move attacks squares near the enemy king
  const kingFile = kingSquare.charCodeAt(0) - 97;
  const kingRank = 8 - parseInt(kingSquare[1]);

  // Extract target square from move (simplified)
  const targetSquare = move.match(/[a-h][1-8]/);
  if (targetSquare) {
    const targetFile = targetSquare[0].charCodeAt(0) - 97;
    const targetRank = 8 - parseInt(targetSquare[0][1]);

    // Check if target is within 2 squares of king
    return (
      Math.abs(targetFile - kingFile) <= 2 &&
      Math.abs(targetRank - kingRank) <= 2
    );
  }

  return false;
}

function generateViolationsForWorstMove(
  move: string,
  moveNumber: number,
  positionBefore: Chess,
  positionAfter: Chess,
  previousMoves: string[],
  evaluationChange: number
): ChessPrincipleViolation[] {
  console.log(
    `🔍 Generating violations for move ${moveNumber}. ${move} (eval change: ${evaluationChange.toFixed(3)})`
  );

  // PURELY EVALUATION-BASED: Find the most relevant principle to explain why this move was bad
  // Don't check if the move violates principles - just assign the most relevant principle based on the move characteristics

  const gamePhase = determineGamePhase(positionBefore);
  console.log(`  📊 Game phase: ${gamePhase}`);

  const mostRelevantPrinciple = findMostRelevantPrincipleForMove(
    move,
    moveNumber,
    gamePhase,
    evaluationChange
  );
  console.log(
    `  🎯 Most relevant principle: ${mostRelevantPrinciple?.name || "None found"}`
  );

  if (mostRelevantPrinciple) {
    const violation = {
      principle: mostRelevantPrinciple,
      severity: getSeverityFromEvaluationChange(evaluationChange),
      description: `${mostRelevantPrinciple.name} was violated on move ${moveNumber}. ${move}`,
      shortTermImpact: getShortTermImpact(
        mostRelevantPrinciple,
        evaluationChange
      ),
      longTermImpact: getLongTermImpact(
        mostRelevantPrinciple,
        evaluationChange
      ),
      correctMove: suggestCorrectMove(
        positionBefore,
        moveNumber,
        mostRelevantPrinciple
      ),
    };
    console.log(`  ✅ Generated violation: ${violation.description}`);
    return [violation];
  }

  console.log(`  ❌ No principle found for this move`);
  return [];
}

function findMostRelevantPrincipleForMove(
  move: string,
  moveNumber: number,
  gamePhase: "opening" | "middlegame" | "endgame",
  evaluationChange: number
): ChessPrinciple | null {
  // First identify the SPECIFIC MISTAKE that caused the evaluation drop
  const specificMistake = identifySpecificMistake(
    move,
    moveNumber,
    gamePhase,
    evaluationChange
  );
  console.log(`    🔍 Specific mistake identified: ${specificMistake}`);

  // Then map the mistake to the relevant principle that was violated
  const principle = mapMistakeToPrinciple(specificMistake, gamePhase);
  console.log(`    🎯 Mapped to principle: ${principle?.name || "None"}`);

  return principle;
}

function identifySpecificMistake(
  move: string,
  moveNumber: number,
  gamePhase: "opening" | "middlegame" | "endgame",
  evaluationChange: number
): string {
  // PRIORITY 1: Significant evaluation drops are usually tactical mistakes
  if (evaluationChange < -1.0) {
    return "missed-tactical-opportunity";
  }

  // PRIORITY 2: Material loss (hanging pieces)
  if (evaluationChange < -2.0) {
    return "left-piece-undefended";
  }

  // PRIORITY 3: Tactical mistakes for moderate drops
  if (evaluationChange < -0.8) {
    // If the move involves captures, checks, or allows tactical responses, it's tactical
    if (
      move.includes("x") ||
      move.includes("+") ||
      move.includes("Q") ||
      move.includes("R")
    ) {
      return "missed-tactical-opportunity";
    }

    // If it's a pawn move that allows tactical responses, it's tactical
    // This catches moves like c5 that allow opponent to force favorable trades
    if (move.includes("p")) {
      return "missed-tactical-opportunity";
    }
  }

  // PRIORITY 4: Moves that allow opponent to force favorable trades
  if (evaluationChange < -0.5) {
    // Pawn moves that allow opponent to force trades (like c5 allowing Qb6)
    if (move.includes("p") && allowsOpponentTrade(move)) {
      return "allowed-opponent-trade";
    }

    // Moves that allow opponent to force tactical sequences
    if (allowsOpponentTactic(move)) {
      return "missed-tactical-opportunity";
    }
  }

  // Only check development mistakes for small evaluation drops in opening
  if (gamePhase === "opening" && moveNumber <= 10 && evaluationChange < -0.3) {
    // Don't move the king too early
    if (move.includes("K") && !move.includes("O") && moveNumber <= 6) {
      return "moved-king-early";
    }

    // Don't expose the queen early
    if (move.includes("Q") && !move.includes("x") && moveNumber <= 6) {
      return "exposed-queen-early";
    }

    // Don't push excessive edge pawns
    if (
      move.includes("p") &&
      (move.includes("a3") ||
        move.includes("h3") ||
        move.includes("a6") ||
        move.includes("h6"))
    ) {
      return "pushed-edge-pawns";
    }

    // Don't block central pawns
    if (
      move.includes("p") &&
      (move.includes("d3") ||
        move.includes("e3") ||
        move.includes("d6") ||
        move.includes("e6"))
    ) {
      return "blocked-central-pawns";
    }

    // Don't weaken the castling position
    if (move.includes("p") && (move.includes("g3") || move.includes("g6"))) {
      return "weakened-castling-position";
    }

    // Don't over-move one piece
    if (isRepetitiveMove(move, [])) {
      return "over-moved-piece";
    }

    // Don't create early pawn weaknesses
    if (move.includes("p") && evaluationChange < -0.5) {
      return "created-pawn-weaknesses";
    }

    // Don't ignore opponent threats
    if (evaluationChange < -1.0) {
      return "ignored-opponent-threats";
    }

    // Don't launch premature attacks
    if (move.includes("Q") || (move.includes("R") && evaluationChange < -0.8)) {
      return "launched-premature-attack";
    }

    // Don't allow easy pins
    if (allowsPin(move)) {
      return "allowed-easy-pin";
    }
  }

  // Middlegame Mistakes (only for small evaluation drops)
  if (gamePhase === "middlegame" && evaluationChange < -0.5) {
    // Don't allow forks or pins
    if (allowsForkOrPin(move)) {
      return "allowed-fork-or-pin";
    }

    // Don't weaken your king's pawn shield
    if (
      move.includes("p") &&
      (move.includes("f3") ||
        move.includes("g3") ||
        move.includes("h3") ||
        move.includes("f6") ||
        move.includes("g6") ||
        move.includes("h6"))
    ) {
      return "weakened-king-shield";
    }

    // Don't trade into worse positions
    if (move.includes("x") && evaluationChange < -0.5) {
      return "traded-into-worse-position";
    }

    // Don't ignore open files
    if (ignoresOpenFile(move)) {
      return "ignored-open-file";
    }

    // Don't overextend pawns
    if (move.includes("p") && evaluationChange < -0.8) {
      return "overextended-pawns";
    }

    // Don't trap major pieces
    if ((move.includes("Q") || move.includes("R")) && evaluationChange < -0.5) {
      return "trapped-major-piece";
    }

    // Don't block your own pieces
    if (blocksOwnPieces(move)) {
      return "blocked-own-pieces";
    }

    // Don't ignore counterplay
    if (ignoresCounterplay(move, evaluationChange)) {
      return "ignored-counterplay";
    }
  }

  // Endgame Mistakes
  if (gamePhase === "endgame") {
    // Don't keep the king passive
    if (move.includes("K") && keepsKingPassive(move)) {
      return "kept-king-passive";
    }

    // Don't allow opponent passed pawns
    if (allowsPassedPawn(move)) {
      return "allowed-opponent-passed-pawn";
    }

    // Don't trade into losing endgames
    if (move.includes("x") && evaluationChange < -1.0) {
      return "traded-into-losing-endgame";
    }

    // Don't place rooks in front of pawns
    if (move.includes("R") && placesRookInFrontOfPawn(move)) {
      return "placed-rook-in-front-of-pawn";
    }

    // Don't lose the opposition
    if (move.includes("K") && losesOpposition(move)) {
      return "lost-opposition";
    }

    // Don't allow king infiltration
    if (allowsKingInfiltration(move)) {
      return "allowed-king-infiltration";
    }

    // Don't trade minor pieces carelessly
    if (
      (move.includes("N") || move.includes("B")) &&
      move.includes("x") &&
      evaluationChange < -0.5
    ) {
      return "traded-minor-pieces-carelessly";
    }

    // Don't miss zugzwang opportunities
    if (missedZugzwang(move)) {
      return "missed-zugzwang-opportunity";
    }

    // Don't create weak pawns late
    if (move.includes("p") && evaluationChange < -0.5) {
      return "created-weak-pawns-late";
    }
  }

  // Default to tactical mistake for any significant evaluation drop
  if (evaluationChange < -0.5) {
    return "missed-tactical-opportunity";
  }

  return "general-mistake";
}

function mapMistakeToPrinciple(
  mistake: string,
  gamePhase: "opening" | "middlegame" | "endgame"
): ChessPrinciple | null {
  // Map specific mistakes to the principles they violate

  // Tactical mistakes ALWAYS map to "Look for basic tactics" regardless of game phase
  if (
    mistake === "missed-tactical-opportunity" ||
    mistake === "allowed-opponent-trade"
  ) {
    return (
      generalPrinciples.find((p) => p.id === "look-for-basic-tactics") || null
    );
  }

  // Opening mistakes map to opening principles
  if (gamePhase === "opening") {
    switch (mistake) {
      case "moved-king-early":
      case "weakened-castling-position":
        return openingPrinciples.find((p) => p.id === "castle-early") || null;
      case "exposed-queen-early":
        return (
          openingPrinciples.find((p) => p.id === "dont-bring-queen-early") ||
          null
        );
      case "pushed-edge-pawns":
      case "blocked-central-pawns":
      case "created-pawn-weaknesses":
        return (
          openingPrinciples.find((p) => p.id === "limit-pawn-moves") || null
        );
      case "over-moved-piece":
        return (
          openingPrinciples.find((p) => p.id === "avoid-moving-same-piece") ||
          null
        );
      case "ignored-opponent-threats":
      case "allowed-easy-pin":
      case "launched-premature-attack":
        return (
          generalPrinciples.find((p) => p.id === "look-for-basic-tactics") ||
          null
        );
      default:
        return (
          openingPrinciples.find((p) => p.id === "develop-knights-bishops") ||
          null
        );
    }
  }

  // Middlegame mistakes map to middlegame principles
  if (gamePhase === "middlegame") {
    switch (mistake) {
      case "left-piece-undefended":
        return (
          generalPrinciples.find((p) => p.id === "dont-hang-pieces") || null
        );
      case "allowed-fork-or-pin":
        return (
          generalPrinciples.find((p) => p.id === "look-for-basic-tactics") ||
          null
        );
      case "weakened-king-shield":
        return (
          middlegamePrinciples.find((p) => p.id === "maintain-king-safety") ||
          null
        );
      case "traded-into-worse-position":
      case "ignored-open-file":
      case "overextended-pawns":
        return (
          generalPrinciples.find((p) => p.id === "assess-pawn-structure") ||
          null
        );
      case "trapped-major-piece":
      case "blocked-own-pieces":
        return (
          middlegamePrinciples.find(
            (p) => p.id === "maximize-piece-activity"
          ) || null
        );
      case "ignored-counterplay":
        return (
          generalPrinciples.find((p) => p.id === "look-for-basic-tactics") ||
          null
        );
      default:
        return (
          generalPrinciples.find((p) => p.id === "look-for-basic-tactics") ||
          null
        );
    }
  }

  // Endgame mistakes map to endgame principles
  if (gamePhase === "endgame") {
    switch (mistake) {
      case "kept-king-passive":
      case "lost-opposition":
      case "allowed-king-infiltration":
        return endgamePrinciples.find((p) => p.id === "activate-king") || null;
      case "allowed-opponent-passed-pawn":
      case "placed-rook-in-front-of-pawn":
        return (
          endgamePrinciples.find((p) => p.id === "support-passed-pawns") || null
        );
      case "traded-into-losing-endgame":
      case "traded-minor-pieces-carelessly":
        return (
          endgamePrinciples.find((p) => p.id === "avoid-bad-trades") || null
        );
      case "missed-zugzwang-opportunity":
        return (
          endgamePrinciples.find((p) => p.id === "create-zugzwang") || null
        );
      case "created-weak-pawns-late":
        return (
          generalPrinciples.find((p) => p.id === "assess-pawn-structure") ||
          null
        );
      default:
        return (
          generalPrinciples.find((p) => p.id === "look-for-basic-tactics") ||
          null
        );
    }
  }

  // Default to tactical awareness
  return (
    generalPrinciples.find((p) => p.id === "look-for-basic-tactics") || null
  );
}

function getSeverityFromEvaluationChange(
  evaluationChange: number
): "minor" | "moderate" | "major" {
  const absChange = Math.abs(evaluationChange);
  if (absChange >= 2.0) return "major";
  if (absChange >= 1.0) return "moderate";
  return "minor";
}

function getShortTermImpact(
  principle: ChessPrinciple,
  evaluationChange: number
): string {
  const absChange = Math.abs(evaluationChange);

  switch (principle.id) {
    case "dont-hang-pieces":
      return "Immediate material loss";
    case "look-for-basic-tactics":
      return absChange >= 1.0
        ? "Missed tactical advantage"
        : "Missed opportunity";
    case "dont-bring-queen-early":
      return "Queen becomes a target";
    case "develop-knights-bishops":
      return "Missed development opportunity";
    case "maintain-king-safety":
      return "King becomes exposed";
    case "maximize-piece-activity":
      return "Passive piece placement";
    default:
      return "Position weakened";
  }
}

function getLongTermImpact(
  principle: ChessPrinciple,
  evaluationChange: number
): string {
  switch (principle.id) {
    case "dont-hang-pieces":
      return "Material disadvantage";
    case "look-for-basic-tactics":
      return "Lost winning chances";
    case "dont-bring-queen-early":
      return "Development disadvantage";
    case "develop-knights-bishops":
      return "Slower coordination";
    case "maintain-king-safety":
      return "Vulnerability to attacks";
    case "maximize-piece-activity":
      return "Reduced piece influence";
    default:
      return "Long-term positional weakness";
  }
}

function suggestCorrectMove(
  position: Chess,
  moveNumber: number,
  principle: ChessPrinciple
): string {
  switch (principle.id) {
    case "dont-hang-pieces":
      return suggestSafeMove(position, moveNumber);
    case "look-for-basic-tactics":
      return suggestTacticalMove(position, moveNumber);
    case "dont-bring-queen-early":
    case "develop-knights-bishops":
      return suggestDevelopmentMove(position, moveNumber);
    case "maintain-king-safety":
      return "O-O";
    case "maximize-piece-activity":
      return suggestDevelopmentMove(position, moveNumber);
    default:
      return suggestDevelopmentMove(position, moveNumber);
  }
}

function calculateMaterial(position: Chess): number {
  const board = position.board();
  let material = 0;

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece) {
        const value = getPieceValue(piece.type);
        material += piece.color === "w" ? value : -value;
      }
    }
  }

  return material;
}

function calculatePositionalFactors(position: Chess): number {
  // Calculate center control, piece activity, king safety, etc.
  let score = 0;
  const board = position.board();

  // Center control
  const centerSquares = [
    "e4",
    "d4",
    "e5",
    "d5",
    "c3",
    "f3",
    "c6",
    "f6",
  ] as const;
  for (const square of centerSquares) {
    const piece = position.get(square);
    if (piece) {
      score += piece.color === "w" ? 0.1 : -0.1;
    }
  }

  // Piece development (knights and bishops out)
  const developedPieces = countDevelopedPieces(position);
  score += developedPieces * 0.05;

  return score;
}

function getPieceValue(pieceType: string): number {
  const values: { [key: string]: number } = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 0,
  };
  return values[pieceType] || 0;
}

async function getBestMoveForPosition(position: Chess): Promise<string> {
  // For now, return a reasonable move (not just the first one)
  const moves = position.moves();

  // Prefer development moves in opening
  const developmentMoves = moves.filter(
    (m) => m.includes("N") || m.includes("B") || m.includes("O")
  );
  if (developmentMoves.length > 0) {
    return developmentMoves[0];
  }

  // Prefer central moves
  const centralMoves = moves.filter((m) =>
    ["e4", "d4", "e5", "d5", "c3", "f3", "c6", "f6"].some((square) =>
      m.includes(square)
    )
  );
  if (centralMoves.length > 0) {
    return centralMoves[0];
  }

  return moves[0] || "";
}

function getTopViolationsByImpact(
  moves: AggressiveMoveAnalysis[]
): ChessPrincipleViolation[] {
  const allViolations: Array<
    ChessPrincipleViolation & {
      impact: number;
      moveNumber: number;
      move: string;
    }
  > = [];

  for (const moveAnalysis of moves) {
    for (const violation of moveAnalysis.filteredViolations) {
      allViolations.push({
        ...violation,
        impact: Math.abs(moveAnalysis.evaluationChange),
        moveNumber: moveAnalysis.moveNumber,
        move: moveAnalysis.move,
      });
    }
  }

  // Sort by impact and take top 3
  return allViolations
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 3)
    .map((v) => ({
      principle: v.principle,
      severity: v.severity,
      description: `${v.moveNumber}. ${v.move}: ${v.description}`,
      shortTermImpact: v.shortTermImpact,
      longTermImpact: v.longTermImpact,
      correctMove: v.correctMove,
    }));
}

function generateOverallAssessment(
  topViolations: ChessPrincipleViolation[]
): string {
  if (topViolations.length === 0) {
    return "Excellent play with no significant principle violations!";
  }

  const mainViolation = topViolations[0];
  return `${mainViolation.principle.name}: ${mainViolation.description}`;
}

// Helper functions
function determineGamePhase(
  position: Chess
): "opening" | "middlegame" | "endgame" {
  const moveCount = position.history().length;
  if (moveCount < 10) return "opening";
  if (moveCount < 30) return "middlegame";
  return "endgame";
}

function hasUndevelopedPieces(position: Chess): boolean {
  const board = position.board();
  let undevelopedCount = 0;

  // Check if knights and bishops are still on starting squares
  const startingSquares = [
    "b1",
    "g1",
    "b8",
    "g8",
    "c1",
    "f1",
    "c8",
    "f8",
  ] as const;
  for (const square of startingSquares) {
    const piece = position.get(square);
    if (piece && (piece.type === "n" || piece.type === "b")) {
      undevelopedCount++;
    }
  }

  return undevelopedCount > 0;
}

function isCenterControlled(position: Chess): boolean {
  const centerSquares = ["e4", "d4", "e5", "d5"] as const;
  return centerSquares.some((square) => position.get(square));
}

function isKingUnsafe(position: Chess): boolean {
  // Check if king is in check or exposed
  return position.isCheck() || position.isCheckmate();
}

function isPieceHangingAfterMove(move: string, position: Chess): boolean {
  // Check if the moved piece can be captured for free or with advantage
  const moves = position.moves();
  const captureMoves = moves.filter((m) => m.includes("x"));

  // If there are many capture moves, the piece might be hanging
  return captureMoves.length > 2;
}

function missedTacticalOpportunity(move: string, position: Chess): boolean {
  // Check if there are tactical opportunities (checks, captures, threats)
  const moves = position.moves();
  const tacticalMoves = moves.filter(
    (m) => m.includes("+") || m.includes("x") || m.includes("#")
  );

  return tacticalMoves.length > 0;
}

function isDevelopmentComplete(position: Chess): boolean {
  return !hasUndevelopedPieces(position);
}

function isDevelopmentMove(move: string): boolean {
  return move.includes("N") || move.includes("B") || move.includes("O");
}

function isRepetitiveMove(move: string, previousMoves: string[]): boolean {
  // Check if this piece was moved recently
  const pieceType = move.charAt(0);
  const recentMoves = previousMoves.slice(-4);
  return recentMoves.some((m) => m.charAt(0) === pieceType);
}

function canCastle(position: Chess): boolean {
  return position.moves().some((m) => m.includes("O"));
}

function isActiveMove(move: string, position: Chess): boolean {
  // Check if move improves piece activity
  return true; // Simplified for now
}

function reducesPieceActivity(
  move: string,
  positionBefore: Chess,
  positionAfter: Chess
): boolean {
  // Check if move reduces piece mobility
  const movesBefore = positionBefore.moves().length;
  const movesAfter = positionAfter.moves().length;
  return movesAfter < movesBefore;
}

function createsPawnWeakness(move: string, position: Chess): boolean {
  // Check if move creates isolated, doubled, or backward pawns
  return false; // Simplified for now
}

function countDevelopedPieces(position: Chess): number {
  const board = position.board();
  let count = 0;

  // Count pieces that have moved from starting squares
  const startingSquares = [
    "b1",
    "g1",
    "b8",
    "g8",
    "c1",
    "f1",
    "c8",
    "f8",
  ] as const;
  for (const square of startingSquares) {
    const piece = position.get(square);
    if (!piece || (piece.type !== "n" && piece.type !== "b")) {
      count++;
    }
  }

  return count;
}

function suggestDevelopmentMove(position: Chess, moveNumber: number): string {
  // Suggest a development move based on the position
  const moves = position.moves();

  // Look for knight development first
  const knightMoves = moves.filter((m) => m.includes("N"));
  if (knightMoves.length > 0) {
    return knightMoves[0];
  }

  // Look for bishop development
  const bishopMoves = moves.filter((m) => m.includes("B"));
  if (bishopMoves.length > 0) {
    return bishopMoves[0];
  }

  // Look for castling
  const castleMoves = moves.filter((m) => m.includes("O"));
  if (castleMoves.length > 0) {
    return castleMoves[0];
  }

  // Fallback to first legal move
  return moves[0] || "";
}

function suggestCenterControlMove(position: Chess, moveNumber: number): string {
  // Suggest a center control move
  const moves = position.moves();

  // Look for central pawn moves
  const centralPawnMoves = moves.filter(
    (m) =>
      m.includes("p") &&
      ["e4", "d4", "e5", "d5"].some((square) => m.includes(square))
  );
  if (centralPawnMoves.length > 0) {
    return centralPawnMoves[0];
  }

  // Look for knight moves to center
  const centerKnightMoves = moves.filter(
    (m) =>
      m.includes("N") &&
      ["e4", "d4", "e5", "d5", "c3", "f3", "c6", "f6"].some((square) =>
        m.includes(square)
      )
  );
  if (centerKnightMoves.length > 0) {
    return centerKnightMoves[0];
  }

  // Fallback to development move
  return suggestDevelopmentMove(position, moveNumber);
}

function suggestSafeMove(position: Chess, moveNumber: number): string {
  // Suggest a safe move that doesn't hang pieces
  const moves = position.moves();

  // Look for moves that don't involve captures (safer)
  const safeMoves = moves.filter((m) => !m.includes("x"));
  if (safeMoves.length > 0) {
    return safeMoves[0];
  }

  // Fallback to development move
  return suggestDevelopmentMove(position, moveNumber);
}

function suggestTacticalMove(position: Chess, moveNumber: number): string {
  // Suggest a tactical move (check, capture, or threat)
  const moves = position.moves();

  // Look for checks first
  const checkMoves = moves.filter((m) => m.includes("+"));
  if (checkMoves.length > 0) {
    return checkMoves[0];
  }

  // Look for captures
  const captureMoves = moves.filter((m) => m.includes("x"));
  if (captureMoves.length > 0) {
    return captureMoves[0];
  }

  // Look for moves that create threats
  const threatMoves = moves.filter(
    (m) =>
      m.includes("N") || m.includes("B") || m.includes("Q") || m.includes("R")
  );
  if (threatMoves.length > 0) {
    return threatMoves[0];
  }

  // Fallback to development move
  return suggestDevelopmentMove(position, moveNumber);
}

function isCenterPawnMove(move: string): boolean {
  return ["e4", "d4", "e5", "d5"].some((square) => move.includes(square));
}

function countPawnMoves(moves: string[]): number {
  return moves.filter((move) => move.includes("p")).length;
}

// Helper functions for mistake identification
function allowsPin(move: string): boolean {
  // Simplified check - in a real implementation, this would analyze the position
  return false;
}

function allowsForkOrPin(move: string): boolean {
  // Simplified check - in a real implementation, this would analyze the position
  return false;
}

function ignoresOpenFile(move: string): boolean {
  // Simplified check - in a real implementation, this would analyze the position
  return false;
}

function blocksOwnPieces(move: string): boolean {
  // Simplified check - in a real implementation, this would analyze the position
  return false;
}

function ignoresCounterplay(move: string, evaluationChange: number): boolean {
  // Simplified check - if evaluation drops significantly, might be ignoring counterplay
  return evaluationChange < -1.0;
}

function keepsKingPassive(move: string): boolean {
  // Simplified check - in a real implementation, this would analyze the position
  return false;
}

function allowsPassedPawn(move: string): boolean {
  // Simplified check - in a real implementation, this would analyze the position
  return false;
}

function placesRookInFrontOfPawn(move: string): boolean {
  // Simplified check - in a real implementation, this would analyze the position
  return false;
}

function losesOpposition(move: string): boolean {
  // Simplified check - in a real implementation, this would analyze the position
  return false;
}

function allowsKingInfiltration(move: string): boolean {
  // Simplified check - in a real implementation, this would analyze the position
  return false;
}

function missedZugzwang(move: string): boolean {
  // Simplified check - in a real implementation, this would analyze the position
  return false;
}

// Add new helper functions for better tactical mistake detection
function allowsOpponentTrade(move: string): boolean {
  // Simplified check - in a real implementation, this would analyze if the move allows opponent to force trades
  // For moves like c5 that allow Qb6 forcing queen trade
  return (
    move.includes("p") &&
    (move.includes("c5") ||
      move.includes("c4") ||
      move.includes("d5") ||
      move.includes("d4"))
  );
}

function allowsOpponentTactic(move: string): boolean {
  // Simplified check - in a real implementation, this would analyze if the move allows opponent tactical opportunities
  return false;
}
