import { Chess } from 'chess.js';
import { ChessPrinciple, ChessPrincipleViolation } from '../index';
import { openingPrinciples } from '../principles';

export interface OpeningAnalysisResult {
  appliedPrinciples: ChessPrinciple[];
  violatedPrinciples: ChessPrincipleViolation[];
}

export function analyzeOpeningPrinciples(
  position: Chess,
  moveHistory?: string[]
): OpeningAnalysisResult {
  const appliedPrinciples: ChessPrinciple[] = [];
  const violatedPrinciples: ChessPrincipleViolation[] = [];
  
  const fen = position.fen();
  const board = position.board();
  const history = moveHistory || position.history();
  const turn = position.turn();
  
  // Analyze each opening principle
  
  // 1. Control the center with pawns
  const centerControl = analyzeCenterControl(position);
  if (centerControl.applied) {
    appliedPrinciples.push(openingPrinciples.find(p => p.id === 'control-center-pawns')!);
  } else if (centerControl.violated) {
    violatedPrinciples.push({
      principle: openingPrinciples.find(p => p.id === 'control-center-pawns')!,
      severity: 'moderate',
      description: 'Limited central pawn presence - consider moves like e4, d4, e5, or d5',
      shortTermImpact: 'Opponent gains space and piece mobility',
      longTermImpact: 'Reduced strategic options and cramped position'
    });
  }
  
  // 2. Develop knights and bishops early
  const development = analyzePieceDevelopment(position, history);
  if (development.applied) {
    appliedPrinciples.push(openingPrinciples.find(p => p.id === 'develop-knights-bishops')!);
  } else if (development.violated) {
    violatedPrinciples.push({
      principle: openingPrinciples.find(p => p.id === 'develop-knights-bishops')!,
      severity: 'moderate',
      description: development.description,
      shortTermImpact: 'Slower piece coordination and initiative loss',
      longTermImpact: 'Opponent completes development first, gaining tempo advantage'
    });
  }
  
  // 3. Complete development before attacking
  const completeDevelopment = analyzeCompleteDevelopment(position, history);
  if (completeDevelopment.applied) {
    appliedPrinciples.push(openingPrinciples.find(p => p.id === 'complete-development-first')!);
  } else if (completeDevelopment.violated) {
    violatedPrinciples.push({
      principle: openingPrinciples.find(p => p.id === 'complete-development-first')!,
      severity: 'moderate',
      description: completeDevelopment.description,
      shortTermImpact: 'Premature attacks may fail and lose tempo',
      longTermImpact: 'Incomplete development leads to positional disadvantage'
    });
  }
  
  // 3. Avoid moving the same piece multiple times
  const repetitiveMoves = analyzeRepetitiveMoves(history);
  if (repetitiveMoves.violated) {
    violatedPrinciples.push({
      principle: openingPrinciples.find(p => p.id === 'avoid-moving-same-piece')!,
      severity: 'minor',
      description: repetitiveMoves.description,
      shortTermImpact: 'Lost tempo and slower development',
      longTermImpact: 'Opponent gains developmental advantage'
    });
  }
  
  // 4. Castle early
  const castling = analyzeCastling(position, history);
  if (castling.applied) {
    appliedPrinciples.push(openingPrinciples.find(p => p.id === 'castle-early')!);
  } else if (castling.violated) {
    violatedPrinciples.push({
      principle: openingPrinciples.find(p => p.id === 'castle-early')!,
      severity: castling.severity,
      description: castling.description,
      shortTermImpact: 'King remains vulnerable to attack',
      longTermImpact: 'Difficulty coordinating rooks and maintaining king safety'
    });
  }
  
  // 5. Don't bring queen out too early
  const queenDevelopment = analyzeEarlyQueenDevelopment(position, history);
  if (queenDevelopment.violated) {
    violatedPrinciples.push({
      principle: openingPrinciples.find(p => p.id === 'dont-bring-queen-early')!,
      severity: 'moderate',
      description: queenDevelopment.description,
      shortTermImpact: 'Queen becomes target for enemy attacks',
      longTermImpact: 'Lost tempo defending the queen instead of developing'
    });
  }
  
  // 6. Limit excessive pawn moves
  const pawnMoves = analyzePawnMoves(history);
  if (pawnMoves.violated) {
    violatedPrinciples.push({
      principle: openingPrinciples.find(p => p.id === 'limit-pawn-moves')!,
      severity: 'minor',
      description: pawnMoves.description,
      shortTermImpact: 'Slower piece development',
      longTermImpact: 'Opponent gains initiative through faster development'
    });
  }
  
  return { appliedPrinciples, violatedPrinciples };
}

function analyzeCenterControl(position: Chess): { applied: boolean; violated: boolean } {
  const fen = position.fen();
  const pieces = fen.split(' ')[0];
  
  // Check for central pawns on e4, d4, e5, d5
  const centralSquares = ['e4', 'd4', 'e5', 'd5'];
  let centralPawns = 0;
  
  for (const square of centralSquares) {
    const piece = position.get(square as any);
    if (piece && piece.type === 'p') {
      centralPawns++;
    }
  }
  
  // Check if pawns attack central squares
  const attacks = position.moves({ verbose: true }).filter(move => 
    centralSquares.includes(move.to) && move.piece === 'p'
  );
  
  return {
    applied: centralPawns >= 1 || attacks.length > 0,
    violated: centralPawns === 0 && attacks.length === 0 && position.history().length > 6
  };
}

function analyzePieceDevelopment(position: Chess, history: string[]): { applied: boolean; violated: boolean; description: string } {
  const board = position.board();
  const turn = position.turn();
  const moveCount = history.length;
  
  let developedMinorPieces = 0;
  let totalMinorPieces = 0;
  
  // Count developed minor pieces
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.color === turn && (piece.type === 'n' || piece.type === 'b')) {
        totalMinorPieces++;
        
        // Check if piece is developed (not on starting square)
        const isWhite = piece.color === 'w';
        const startingRank = isWhite ? 0 : 7;
        
        if (rank !== startingRank) {
          developedMinorPieces++;
        }
      }
    }
  }
  
  const developmentRatio = totalMinorPieces > 0 ? developedMinorPieces / totalMinorPieces : 0;
  const expectedDevelopment = Math.min(moveCount / 8, 0.75); // Expected development based on move count
  
  return {
    applied: developmentRatio >= 0.5 && moveCount > 4,
    violated: developmentRatio < expectedDevelopment && moveCount > 8,
    description: `${developedMinorPieces} of ${totalMinorPieces} minor pieces developed - focus on knights and bishops`
  };
}

function analyzeRepetitiveMoves(history: string[]): { violated: boolean; description: string } {
  const pieceMoveCounts: { [piece: string]: number } = {};
  const recentMoves = history.slice(-10); // Look at last 10 moves
  
  for (const move of recentMoves) {
    // Extract piece from move notation (simplified)
    const piece = move.match(/^[NBRQK]/)?.[0] || 'P';
    pieceMoveCounts[piece] = (pieceMoveCounts[piece] || 0) + 1;
  }
  
  const maxMoves = Math.max(...Object.values(pieceMoveCounts));
  const excessivePiece = Object.entries(pieceMoveCounts).find(([_, count]) => count === maxMoves)?.[0];
  
  return {
    violated: maxMoves > 2 && recentMoves.length >= 6,
    description: `The ${excessivePiece === 'P' ? 'pawn' : excessivePiece} has been moved ${maxMoves} times recently - develop other pieces`
  };
}

function analyzeCastling(position: Chess, history: string[]): { applied: boolean; violated: boolean; severity: 'minor' | 'moderate' | 'major'; description: string } {
  const turn = position.turn();
  const moveCount = history.length;
  const halfMoveCount = turn === 'w' ? Math.ceil(moveCount / 2) : Math.floor(moveCount / 2);
  
  // Check if already castled
  const hasCastled = history.some(move => move.includes('O-O'));
  
  if (hasCastled) {
    return { applied: true, violated: false, severity: 'minor', description: 'Successfully castled' };
  }
  
  // Check if castling is still possible
  const canCastle = position.getCastlingRights(turn);
  const canCastleKingside = canCastle.k;
  const canCastleQueenside = canCastle.q;
  
  if (!canCastleKingside && !canCastleQueenside) {
    return {
      applied: false,
      violated: true,
      severity: 'major',
      description: 'Lost castling rights - king or rook moved too early'
    };
  }
  
  if (halfMoveCount > 8) {
    return {
      applied: false,
      violated: true,
      severity: 'moderate',
      description: 'Consider castling soon for king safety'
    };
  }
  
  return { applied: false, violated: false, severity: 'minor', description: 'Castling still available' };
}

function analyzeEarlyQueenDevelopment(position: Chess, history: string[]): { violated: boolean; description: string } {
  const queenMoves = history.filter(move => move.startsWith('Q')).length;
  const totalMoves = history.length;
  const phase = totalMoves / 2; // Rough move number for current player
  
  return {
    violated: queenMoves > 0 && phase < 6,
    description: `Queen developed too early (move ${Math.ceil(phase)}) - develop minor pieces first`
  };
}

function analyzePawnMoves(history: string[]): { violated: boolean; description: string } {
  const recentMoves = history.slice(-8);
  const pawnMoves = recentMoves.filter(move => !move.match(/^[NBRQK]/)).length;
  const pawnRatio = recentMoves.length > 0 ? pawnMoves / recentMoves.length : 0;
  
  return {
    violated: pawnRatio > 0.6 && recentMoves.length >= 6,
    description: `${pawnMoves} of last ${recentMoves.length} moves were pawn moves - focus on piece development`
  };
}

function analyzeCompleteDevelopment(position: Chess, history: string[]): {
  applied: boolean;
  violated: boolean;
  description: string;
} {
  const board = position.board();
  const turn = position.turn();
  const totalMoves = history.length;
  const currentPlayerMoves = Math.ceil(totalMoves / 2);
  
  // Count developed pieces
  let developedMinorPieces = 0;
  let totalMinorPieces = 0;
  let hasCastled = false;
  let isAttacking = false;
  
  // Check for castling in history
  hasCastled = history.some(move => move === 'O-O' || move === 'O-O-O');
  
  // Count developed pieces and check for attacking moves
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.color === turn) {
        // Count minor pieces
        if (piece.type === 'n' || piece.type === 'b') {
          totalMinorPieces++;
          
          // Check if developed (not on starting squares)
          const startingRank = turn === 'w' ? 0 : 7;
          if (rank !== startingRank) {
            developedMinorPieces++;
          }
        }
      }
    }
  }
  
  // Check for attacking moves in recent history
  const recentMoves = history.slice(-6);
  const attackingPatterns = [
    /x/, // captures
    /\+/, // checks
    /Q[a-h][1-8]/, // early queen moves to active squares
  ];
  
  isAttacking = recentMoves.some(move => 
    attackingPatterns.some(pattern => pattern.test(move))
  );
  
  // Development completion criteria
  const developmentRatio = totalMinorPieces > 0 ? developedMinorPieces / totalMinorPieces : 1;
  const isDevelopmentComplete = developmentRatio >= 0.75 && hasCastled;
  
  // Check if attacking prematurely
  if (isAttacking && !isDevelopmentComplete && currentPlayerMoves <= 12) {
    return {
      applied: false,
      violated: true,
      description: `Attacking with incomplete development. ${developedMinorPieces}/${totalMinorPieces} minor pieces developed, ${hasCastled ? 'castled' : 'not castled'}`
    };
  }
  
  // Check if development is progressing well
  if (currentPlayerMoves <= 15 && isDevelopmentComplete) {
    return {
      applied: true,
      violated: false,
      description: 'Good development - pieces developed and king castled before major attacks'
    };
  }
  
  // Neutral case - no violation but not fully applied either
  return {
    applied: currentPlayerMoves > 15 || isDevelopmentComplete,
    violated: false,
    description: `Development in progress: ${developedMinorPieces}/${totalMinorPieces} minor pieces, ${hasCastled ? 'castled' : 'not castled'}`
  };
} 