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
    
    // Generate ALL possible violations for this move
    const allViolations = generateAllViolationsForMove(
      move,
      moveNumber,
      positionBefore,
      positionAfter,
      gameHistory.slice(0, i)
    );
    
    // Get evaluation change (simplified for now)
    const evaluationChange = calculateEvaluationChange(move, positionBefore, positionAfter);
    
    // Get best move for this position (simplified)
    const bestMove = await getBestMoveForPosition(positionBefore);
    const isBestMove = bestMove === move;
    
    // Filter out violations from best moves
    const filteredViolations = isBestMove ? [] : allViolations;
    
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
  previousMoves: string[]
): ChessPrincipleViolation[] {
  const violations: ChessPrincipleViolation[] = [];
  const gamePhase = determineGamePhase(positionBefore);
  
  // Check against ALL principles, not just "likely" ones
  const allPrinciples = [...generalPrinciples, ...openingPrinciples, ...middlegamePrinciples, ...endgamePrinciples];
  
  for (const principle of allPrinciples) {
    const violation = checkPrincipleViolation(move, principle, positionBefore, positionAfter, moveNumber, previousMoves);
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
  previousMoves: string[]
): ChessPrincipleViolation | null {
  // Create "stretch arguments" - even good moves can violate some principles
  switch (principle.id) {
    case 'develop-knights-bishops':
      if (!move.includes('N') && !move.includes('B') && moveNumber <= 15) {
        console.log(`🔍 Violation found: ${moveNumber}. ${move} doesn't develop pieces`);
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
      if (move.includes('p') && !['e4', 'd4', 'e5', 'd5'].some(square => move.includes(square)) && moveNumber <= 10) {
        console.log(`🔍 Violation found: ${moveNumber}. ${move} doesn't control center`);
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
      if (move.includes('K') && moveNumber > 10 && !move.includes('O')) {
        console.log(`🔍 Violation found: ${moveNumber}. ${move} moves king unsafely`);
        return {
          principle,
          severity: 'moderate',
          description: `${principle.name} was violated on move ${moveNumber}. ${move}`,
          shortTermImpact: 'King becomes more exposed',
          longTermImpact: 'Increased vulnerability to attacks',
          correctMove: 'O-O' // Suggest castling for king safety
        };
      }
      break;
      
    case 'dont-hang-pieces':
      // Check if the moved piece is now hanging
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
      if (moveNumber <= 10 && !isDevelopmentMove(move)) {
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
      if (moveNumber <= 10 && move.includes('K') && !move.includes('O')) {
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
      if (!isActiveMove(move, positionAfter)) {
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

function calculateEvaluationChange(move: string, positionBefore: Chess, positionAfter: Chess): number {
  // Simplified evaluation change calculation
  // In a real implementation, this would use engine analysis
  const materialBefore = calculateMaterial(positionBefore);
  const materialAfter = calculateMaterial(positionAfter);
  return materialAfter - materialBefore;
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

function getPieceValue(pieceType: string): number {
  const values: { [key: string]: number } = {
    'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0
  };
  return values[pieceType] || 0;
}

async function getBestMoveForPosition(position: Chess): Promise<string> {
  // Simplified best move detection
  // In a real implementation, this would use engine analysis
  const moves = position.moves();
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
      longTermImpact: v.longTermImpact
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

function isPieceHangingAfterMove(move: string, position: Chess): boolean {
  // Simplified hanging piece detection
  return false; // Placeholder
}

function missedTacticalOpportunity(move: string, position: Chess): boolean {
  // Simplified tactical opportunity detection
  return false; // Placeholder
}

function isDevelopmentMove(move: string): boolean {
  return move.includes('N') || move.includes('B') || move.includes('O');
}

function isRepetitiveMove(move: string, previousMoves: string[]): boolean {
  // Check if this piece was moved recently
  return false; // Placeholder
}

function isActiveMove(move: string, position: Chess): boolean {
  // Simplified active move detection
  return true; // Placeholder
}

function createsPawnWeakness(move: string, position: Chess): boolean {
  // Simplified pawn weakness detection
  return false; // Placeholder
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