import { Chess } from 'chess.js';
import { ChessPrinciple, ChessPrincipleViolation } from './index';
import { PositionEval } from '@/types/eval';
import { openingPrinciples, middlegamePrinciples, endgamePrinciples, generalPrinciples } from './principles';

export interface AggressiveMoveAnalysis {
  moveNumber: number;
  move: string;
  isUserMove: boolean;
  allViolations: ChessPrincipleViolation[];
  evaluationChange: number;
  bestMove?: string;
  isBestMove: boolean;
  filteredViolations: ChessPrincipleViolation[];
}

export interface AggressiveGameAnalysis {
  moves: AggressiveMoveAnalysis[];
  topViolations: ChessPrincipleViolation[];
  overallAssessment: string;
}

export async function analyzeGameAggressively(
  gameHistory: string[],
  userColor: 'white' | 'black',
  engineAnalysis?: PositionEval
): Promise<AggressiveGameAnalysis> {
  const chess = new Chess();
  const moves: AggressiveMoveAnalysis[] = [];
  
  // Analyze each move
  for (let i = 0; i < gameHistory.length; i++) {
    const move = gameHistory[i];
    const moveNumber = Math.floor(i / 2) + 1;
    const isUserMove = (userColor === 'white' && i % 2 === 0) || (userColor === 'black' && i % 2 === 1);
    
    // Get position before the move
    const positionBefore = new Chess(chess.fen());
    
    // Make the move
    const moveResult = chess.move(move);
    if (!moveResult) continue;
    
    // Get position after the move
    const positionAfter = new Chess(chess.fen());
    
    // Calculate evaluation change FIRST (this is the key!)
    const evaluationChange = calculateEvaluationChange(move, positionBefore, positionAfter, userColor);
    
    // Only generate violations if this move actually caused a significant evaluation drop
    const allViolations = evaluationChange < -0.5 ? 
      generateAllViolationsForMove(move, moveNumber, positionBefore, positionAfter, gameHistory.slice(0, i), evaluationChange) :
      [];
    
    // Get best move for this position
    const bestMove = await getBestMoveForPosition(positionBefore);
    const isBestMove = bestMove === move;
    
    // Filter violations - only keep those from moves that actually hurt the position
    const filteredViolations = (evaluationChange < -0.3 && !isBestMove) ? allViolations : [];
    
    moves.push({
      moveNumber,
      move,
      isUserMove,
      allViolations,
      evaluationChange,
      bestMove,
      isBestMove,
      filteredViolations
    });
  }
  
  // Get top violations by evaluation impact
  const topViolations = getTopViolationsByImpact(moves);
  
  console.log(`🎯 Aggressive analysis complete: ${topViolations.length} top violations found`);
  topViolations.forEach((v, i) => {
    console.log(`  ${i + 1}. ${v.description} (${v.severity})`);
  });
  
  return {
    moves,
    topViolations,
    overallAssessment: generateOverallAssessment(topViolations)
  };
}

function generateAllViolationsForMove(
  move: string,
  moveNumber: number,
  positionBefore: Chess,
  positionAfter: Chess,
  previousMoves: string[],
  evaluationChange: number
): ChessPrincipleViolation[] {
  const violations: ChessPrincipleViolation[] = [];
  const gamePhase = determineGamePhase(positionBefore);
  
  // Check against principles, but only when they actually apply
  const allPrinciples = [...generalPrinciples, ...openingPrinciples, ...middlegamePrinciples, ...endgamePrinciples];
  
  for (const principle of allPrinciples) {
    const violation = checkPrincipleViolation(move, principle, positionBefore, positionAfter, moveNumber, previousMoves, evaluationChange);
    if (violation) {
      violations.push(violation);
    }
  }
  
  return violations;
}

function checkPrincipleViolation(
  move: string,
  principle: ChessPrinciple,
  positionBefore: Chess,
  positionAfter: Chess,
  moveNumber: number,
  previousMoves: string[],
  evaluationChange: number
): ChessPrincipleViolation | null {
  // Only generate violations if the move actually hurt the position
  if (evaluationChange > -0.3) {
    return null;
  }
  
  switch (principle.id) {
    case 'develop-knights-bishops':
      // Only flag if pieces are actually undeveloped
      if (moveNumber <= 15 && !move.includes('N') && !move.includes('B') && hasUndevelopedPieces(positionBefore)) {
        return {
          principle,
          severity: 'moderate',
          description: `${principle.name} was violated on move ${moveNumber}. ${move}`,
          shortTermImpact: 'Missed opportunity to develop pieces',
          longTermImpact: 'Slower piece coordination',
          correctMove: suggestDevelopmentMove(positionBefore, moveNumber)
        };
      }
      break;
      
    case 'control-center-pawns':
      // Only flag if center is actually uncontrolled
      if (moveNumber <= 10 && move.includes('p') && !isCenterControlled(positionBefore) && 
          !['e4', 'd4', 'e5', 'd5'].some(square => move.includes(square))) {
        return {
          principle,
          severity: 'minor',
          description: `${principle.name} was violated on move ${moveNumber}. ${move}`,
          shortTermImpact: 'Missed central control opportunity',
          longTermImpact: 'Reduced space and piece mobility',
          correctMove: suggestCenterControlMove(positionBefore, moveNumber)
        };
      }
      break;
      
    case 'maintain-king-safety':
      // Only flag if king is actually unsafe
      if (moveNumber > 10 && move.includes('K') && !move.includes('O') && isKingUnsafe(positionAfter)) {
        return {
          principle,
          severity: 'moderate',
          description: `${principle.name} was violated on move ${moveNumber}. ${move}`,
          shortTermImpact: 'King becomes more exposed',
          longTermImpact: 'Increased vulnerability to attacks',
          correctMove: 'O-O'
        };
      }
      break;
      
    case 'dont-hang-pieces':
      // Only flag if piece is actually hanging
      if (isPieceHangingAfterMove(move, positionAfter)) {
        return {
          principle,
          severity: 'major',
          description: `${principle.name} was violated on move ${moveNumber}. ${move}`,
          shortTermImpact: 'Immediate material loss',
          longTermImpact: 'Material disadvantage',
          correctMove: suggestDevelopmentMove(positionBefore, moveNumber)
        };
      }
      break;
      
    case 'look-for-basic-tactics':
      // Only flag if tactical opportunity was actually missed
      if (missedTacticalOpportunity(move, positionBefore)) {
        return {
          principle,
          severity: 'moderate',
          description: `${principle.name} was violated on move ${moveNumber}. ${move}`,
          shortTermImpact: 'Missed tactical advantage',
          longTermImpact: 'Lost opportunity for material gain',
          correctMove: suggestDevelopmentMove(positionBefore, moveNumber)
        };
      }
      break;
      
    case 'complete-development-first':
      // Only flag if development is actually incomplete
      if (moveNumber <= 10 && !isDevelopmentMove(move) && !isDevelopmentComplete(positionBefore)) {
        return {
          principle,
          severity: 'minor',
          description: `${principle.name} was violated on move ${moveNumber}. ${move}`,
          shortTermImpact: 'Incomplete piece development',
          longTermImpact: 'Slower coordination and initiative',
          correctMove: suggestDevelopmentMove(positionBefore, moveNumber)
        };
      }
      break;
      
    case 'avoid-moving-same-piece':
      // Only flag if piece was actually moved repeatedly
      if (isRepetitiveMove(move, previousMoves)) {
        return {
          principle,
          severity: 'minor',
          description: `${principle.name} was violated on move ${moveNumber}. ${move}`,
          shortTermImpact: 'Wasted tempo',
          longTermImpact: 'Developmental disadvantage',
          correctMove: suggestDevelopmentMove(positionBefore, moveNumber)
        };
      }
      break;
      
    case 'castle-early':
      // Only flag if castling is actually needed and possible
      if (moveNumber <= 10 && move.includes('K') && !move.includes('O') && canCastle(positionBefore)) {
        return {
          principle,
          severity: 'minor',
          description: `${principle.name} was violated on move ${moveNumber}. ${move}`,
          shortTermImpact: 'King remains in center',
          longTermImpact: 'Delayed king safety',
          correctMove: 'O-O'
        };
      }
      break;
      
    case 'maximize-piece-activity':
      // Only flag if move actually reduces piece activity
      if (!isActiveMove(move, positionAfter) && reducesPieceActivity(move, positionBefore, positionAfter)) {
        return {
          principle,
          severity: 'minor',
          description: `${principle.name} was violated on move ${moveNumber}. ${move}`,
          shortTermImpact: 'Passive piece placement',
          longTermImpact: 'Reduced piece influence',
          correctMove: suggestDevelopmentMove(positionBefore, moveNumber)
        };
      }
      break;
      
    case 'assess-pawn-structure':
      // Only flag if pawn structure is actually weakened
      if (createsPawnWeakness(move, positionAfter)) {
        return {
          principle,
          severity: 'moderate',
          description: `${principle.name} was violated on move ${moveNumber}. ${move}`,
          shortTermImpact: 'Pawn structure compromised',
          longTermImpact: 'Long-term positional disadvantage',
          correctMove: suggestDevelopmentMove(positionBefore, moveNumber)
        };
      }
      break;
  }
  
  return null;
}

function calculateEvaluationChange(move: string, positionBefore: Chess, positionAfter: Chess, userColor: 'white' | 'black'): number {
  // Calculate material and positional evaluation change
  const materialBefore = calculateMaterial(positionBefore);
  const materialAfter = calculateMaterial(positionAfter);
  const materialChange = materialAfter - materialBefore;
  
  // Calculate positional factors
  const positionalBefore = calculatePositionalFactors(positionBefore);
  const positionalAfter = calculatePositionalFactors(positionAfter);
  const positionalChange = positionalAfter - positionalBefore;
  
  // Combine material and positional changes
  const totalChange = materialChange + positionalChange * 0.1;
  
  // Adjust for color (positive is good for white, negative is good for black)
  return userColor === 'white' ? totalChange : -totalChange;
}

function calculateMaterial(position: Chess): number {
  const board = position.board();
  let material = 0;
  
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece) {
        const value = getPieceValue(piece.type);
        material += piece.color === 'w' ? value : -value;
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
  const centerSquares = ['e4', 'd4', 'e5', 'd5', 'c3', 'f3', 'c6', 'f6'] as const;
  for (const square of centerSquares) {
    const piece = position.get(square);
    if (piece) {
      score += piece.color === 'w' ? 0.1 : -0.1;
    }
  }
  
  // Piece development (knights and bishops out)
  const developedPieces = countDevelopedPieces(position);
  score += developedPieces * 0.05;
  
  return score;
}

function getPieceValue(pieceType: string): number {
  const values: { [key: string]: number } = {
    'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0
  };
  return values[pieceType] || 0;
}

async function getBestMoveForPosition(position: Chess): Promise<string> {
  // For now, return a reasonable move (not just the first one)
  const moves = position.moves();
  
  // Prefer development moves in opening
  const developmentMoves = moves.filter(m => m.includes('N') || m.includes('B') || m.includes('O'));
  if (developmentMoves.length > 0) {
    return developmentMoves[0];
  }
  
  // Prefer central moves
  const centralMoves = moves.filter(m => 
    ['e4', 'd4', 'e5', 'd5', 'c3', 'f3', 'c6', 'f6'].some(square => m.includes(square))
  );
  if (centralMoves.length > 0) {
    return centralMoves[0];
  }
  
  return moves[0] || '';
}

function getTopViolationsByImpact(moves: AggressiveMoveAnalysis[]): ChessPrincipleViolation[] {
  const allViolations: Array<ChessPrincipleViolation & { impact: number; moveNumber: number; move: string }> = [];
  
  for (const moveAnalysis of moves) {
    for (const violation of moveAnalysis.filteredViolations) {
      allViolations.push({
        ...violation,
        impact: Math.abs(moveAnalysis.evaluationChange),
        moveNumber: moveAnalysis.moveNumber,
        move: moveAnalysis.move
      });
    }
  }
  
  // Sort by impact and take top 3
  return allViolations
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 3)
    .map(v => ({
      principle: v.principle,
      severity: v.severity,
      description: `${v.moveNumber}. ${v.move}: ${v.description}`,
      shortTermImpact: v.shortTermImpact,
      longTermImpact: v.longTermImpact,
      correctMove: v.correctMove
    }));
}

function generateOverallAssessment(topViolations: ChessPrincipleViolation[]): string {
  if (topViolations.length === 0) {
    return 'Excellent play with no significant principle violations!';
  }
  
  const mainViolation = topViolations[0];
  return `${mainViolation.principle.name}: ${mainViolation.description}`;
}

// Helper functions
function determineGamePhase(position: Chess): 'opening' | 'middlegame' | 'endgame' {
  const moveCount = position.history().length;
  if (moveCount < 10) return 'opening';
  if (moveCount < 30) return 'middlegame';
  return 'endgame';
}

function hasUndevelopedPieces(position: Chess): boolean {
  const board = position.board();
  let undevelopedCount = 0;
  
  // Check if knights and bishops are still on starting squares
  const startingSquares = ['b1', 'g1', 'b8', 'g8', 'c1', 'f1', 'c8', 'f8'] as const;
  for (const square of startingSquares) {
    const piece = position.get(square);
    if (piece && (piece.type === 'n' || piece.type === 'b')) {
      undevelopedCount++;
    }
  }
  
  return undevelopedCount > 0;
}

function isCenterControlled(position: Chess): boolean {
  const centerSquares = ['e4', 'd4', 'e5', 'd5'] as const;
  return centerSquares.some(square => position.get(square));
}

function isKingUnsafe(position: Chess): boolean {
  // Check if king is in check or exposed
  return position.isCheck() || position.isCheckmate();
}

function isPieceHangingAfterMove(move: string, position: Chess): boolean {
  // Check if the moved piece can be captured for free or with advantage
  const moves = position.moves();
  const captureMoves = moves.filter(m => m.includes('x'));
  
  // If there are many capture moves, the piece might be hanging
  return captureMoves.length > 2;
}

function missedTacticalOpportunity(move: string, position: Chess): boolean {
  // Check if there are tactical opportunities (checks, captures, threats)
  const moves = position.moves();
  const tacticalMoves = moves.filter(m => 
    m.includes('+') || m.includes('x') || m.includes('#')
  );
  
  return tacticalMoves.length > 0;
}

function isDevelopmentComplete(position: Chess): boolean {
  return !hasUndevelopedPieces(position);
}

function isDevelopmentMove(move: string): boolean {
  return move.includes('N') || move.includes('B') || move.includes('O');
}

function isRepetitiveMove(move: string, previousMoves: string[]): boolean {
  // Check if this piece was moved recently
  const pieceType = move.charAt(0);
  const recentMoves = previousMoves.slice(-4);
  return recentMoves.some(m => m.charAt(0) === pieceType);
}

function canCastle(position: Chess): boolean {
  return position.moves().some(m => m.includes('O'));
}

function isActiveMove(move: string, position: Chess): boolean {
  // Check if move improves piece activity
  return true; // Simplified for now
}

function reducesPieceActivity(move: string, positionBefore: Chess, positionAfter: Chess): boolean {
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
  const startingSquares = ['b1', 'g1', 'b8', 'g8', 'c1', 'f1', 'c8', 'f8'] as const;
  for (const square of startingSquares) {
    const piece = position.get(square);
    if (!piece || piece.type !== 'n' && piece.type !== 'b') {
      count++;
    }
  }
  
  return count;
}

function suggestDevelopmentMove(position: Chess, moveNumber: number): string {
  // Suggest a development move based on the position
  const moves = position.moves();
  
  // Look for knight development first
  const knightMoves = moves.filter(m => m.includes('N'));
  if (knightMoves.length > 0) {
    return knightMoves[0];
  }
  
  // Look for bishop development
  const bishopMoves = moves.filter(m => m.includes('B'));
  if (bishopMoves.length > 0) {
    return bishopMoves[0];
  }
  
  // Look for castling
  const castleMoves = moves.filter(m => m.includes('O'));
  if (castleMoves.length > 0) {
    return castleMoves[0];
  }
  
  // Fallback to first legal move
  return moves[0] || '';
}

function suggestCenterControlMove(position: Chess, moveNumber: number): string {
  // Suggest a center control move
  const moves = position.moves();
  
  // Look for central pawn moves
  const centralPawnMoves = moves.filter(m => 
    m.includes('p') && ['e4', 'd4', 'e5', 'd5'].some(square => m.includes(square))
  );
  if (centralPawnMoves.length > 0) {
    return centralPawnMoves[0];
  }
  
  // Look for knight moves to center
  const centerKnightMoves = moves.filter(m => 
    m.includes('N') && ['e4', 'd4', 'e5', 'd5', 'c3', 'f3', 'c6', 'f6'].some(square => m.includes(square))
  );
  if (centerKnightMoves.length > 0) {
    return centerKnightMoves[0];
  }
  
  // Fallback to development move
  return suggestDevelopmentMove(position, moveNumber);
} 