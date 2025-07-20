import { Chess } from 'chess.js';
import { ChessPrinciple, ChessPrincipleViolation } from '../index';
import { middlegamePrinciples } from '../principles';
import { PositionEval } from '@/types/eval';

export interface MiddlegameAnalysisResult {
  appliedPrinciples: ChessPrinciple[];
  violatedPrinciples: ChessPrincipleViolation[];
}

export function analyzeMiddlegamePrinciples(
  position: Chess,
  evaluation: PositionEval
): MiddlegameAnalysisResult {
  const appliedPrinciples: ChessPrinciple[] = [];
  const violatedPrinciples: ChessPrincipleViolation[] = [];
  
  const board = position.board();
  const turn = position.turn();
  
  // 1. Maximize piece activity
  const pieceActivity = analyzePieceActivity(position);
  if (pieceActivity.applied) {
    appliedPrinciples.push(middlegamePrinciples.find(p => p.id === 'maximize-piece-activity')!);
  } else if (pieceActivity.violated) {
    violatedPrinciples.push({
      principle: middlegamePrinciples.find(p => p.id === 'maximize-piece-activity')!,
      severity: 'moderate',
      description: pieceActivity.description,
      shortTermImpact: 'Pieces are passive and less effective',
      longTermImpact: 'Opponent gains space and initiative'
    });
  }
  
  // 2. Improve worst piece
  const worstPiece = analyzeWorstPiece(position);
  if (worstPiece.applied) {
    appliedPrinciples.push(middlegamePrinciples.find(p => p.id === 'improve-worst-piece')!);
  } else if (worstPiece.violated) {
    violatedPrinciples.push({
      principle: middlegamePrinciples.find(p => p.id === 'improve-worst-piece')!,
      severity: 'moderate',
      description: worstPiece.description,
      shortTermImpact: 'Passive pieces reduce tactical opportunities',
      longTermImpact: 'Poor piece coordination limits strategic options'
    });
  }
  
  // 3. Centralize pieces
  const centralization = analyzeCentralization(position);
  if (centralization.applied) {
    appliedPrinciples.push(middlegamePrinciples.find(p => p.id === 'centralize-pieces')!);
  } else if (centralization.violated) {
    violatedPrinciples.push({
      principle: middlegamePrinciples.find(p => p.id === 'centralize-pieces')!,
      severity: 'minor',
      description: centralization.description,
      shortTermImpact: 'Reduced piece influence',
      longTermImpact: 'Less control over key squares and space'
    });
  }
  
  // 4. Think prophylactically (for advanced players)
  const prophylacticThinking = analyzeProphylacticThinking(position);
  if (prophylacticThinking.applied) {
    appliedPrinciples.push(middlegamePrinciples.find(p => p.id === 'think-prophylactically')!);
  } else if (prophylacticThinking.violated) {
    violatedPrinciples.push({
      principle: middlegamePrinciples.find(p => p.id === 'think-prophylactically')!,
      severity: 'minor',
      description: prophylacticThinking.description,
      shortTermImpact: 'Failed to prevent opponent\'s threats',
      longTermImpact: 'Reactive play instead of controlling the game'
    });
  }
  
  // 5. Control open files with rooks
  const fileControl = analyzeFileControl(position);
  if (fileControl.applied) {
    appliedPrinciples.push(middlegamePrinciples.find(p => p.id === 'control-open-files')!);
  } else if (fileControl.violated) {
    violatedPrinciples.push({
      principle: middlegamePrinciples.find(p => p.id === 'control-open-files')!,
      severity: 'moderate',
      description: fileControl.description,
      shortTermImpact: 'Rooks remain passive',
      longTermImpact: 'Missed opportunities for back-rank pressure'
    });
  }
  
  // 4. Maintain king safety
  const kingSafety = analyzeKingSafety(position);
  if (kingSafety.applied) {
    appliedPrinciples.push(middlegamePrinciples.find(p => p.id === 'maintain-king-safety')!);
  } else if (kingSafety.violated) {
    violatedPrinciples.push({
      principle: middlegamePrinciples.find(p => p.id === 'maintain-king-safety')!,
      severity: 'major',
      description: kingSafety.description,
      shortTermImpact: 'King is vulnerable to immediate attack',
      longTermImpact: 'Constant defensive concerns limit strategic options'
    });
  }
  
  // 5. Knights on outposts
  const outposts = analyzeKnightOutposts(position);
  if (outposts.applied) {
    appliedPrinciples.push(middlegamePrinciples.find(p => p.id === 'knights-on-outposts')!);
  }
  
  // 6. Bishops on long diagonals
  const bishopDiagonals = analyzeBishopDiagonals(position);
  if (bishopDiagonals.applied) {
    appliedPrinciples.push(middlegamePrinciples.find(p => p.id === 'bishops-long-diagonals')!);
  }
  
  // 7. Control key squares
  const keySquares = analyzeKeySquareControl(position);
  if (keySquares.applied) {
    appliedPrinciples.push(middlegamePrinciples.find(p => p.id === 'control-key-squares')!);
  } else if (keySquares.violated) {
    violatedPrinciples.push({
      principle: middlegamePrinciples.find(p => p.id === 'control-key-squares')!,
      severity: 'moderate',
      description: keySquares.description,
      shortTermImpact: 'Opponent gains strategic squares',
      longTermImpact: 'Positional disadvantage and reduced mobility'
    });
  }
  
  return { appliedPrinciples, violatedPrinciples };
}

function analyzePieceActivity(position: Chess): { applied: boolean; violated: boolean; description: string } {
  const moves = position.moves({ verbose: true });
  const pieces = position.board().flat().filter(p => p !== null);
  const turn = position.turn();
  
  // Count pieces that have good mobility
  let activePieces = 0;
  let totalPieces = 0;
  
  for (const piece of pieces) {
    if (piece && piece.color === turn && piece.type !== 'p' && piece.type !== 'k') {
      totalPieces++;
      
      // Count moves available to this piece
      const pieceMoves = moves.filter(move => move.from === getSquareFromPiece(piece, position));
      if (pieceMoves.length >= 3) {
        activePieces++;
      }
    }
  }
  
  const activityRatio = totalPieces > 0 ? activePieces / totalPieces : 0;
  
  return {
    applied: activityRatio >= 0.6,
    violated: activityRatio < 0.3,
    description: `${activePieces} of ${totalPieces} pieces are active - improve piece mobility`
  };
}

function analyzeCentralization(position: Chess): { applied: boolean; violated: boolean; description: string } {
  const board = position.board();
  const turn = position.turn();
  const centralSquares = ['d4', 'd5', 'e4', 'e5'];
  
  let centralizedPieces = 0;
  
  for (const square of centralSquares) {
    const piece = position.get(square as any);
    if (piece && piece.color === turn && (piece.type === 'n' || piece.type === 'b')) {
      centralizedPieces++;
    }
  }
  
  return {
    applied: centralizedPieces >= 1,
    violated: centralizedPieces === 0,
    description: centralizedPieces === 0 
      ? 'No pieces control central squares - consider centralizing knights or bishops'
      : `${centralizedPieces} pieces centralized`
  };
}

function analyzeFileControl(position: Chess): { applied: boolean; violated: boolean; description: string } {
  const board = position.board();
  const turn = position.turn();
  const openFiles = findOpenFiles(position);
  
  let rooksOnOpenFiles = 0;
  let totalRooks = 0;
  
  // Find rooks and check if they're on open/semi-open files
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.color === turn && piece.type === 'r') {
        totalRooks++;
        
        const fileName = String.fromCharCode(97 + file); // Convert to a-h
        if (openFiles.includes(fileName)) {
          rooksOnOpenFiles++;
        }
      }
    }
  }
  
  return {
    applied: rooksOnOpenFiles >= 1 && openFiles.length > 0,
    violated: rooksOnOpenFiles === 0 && openFiles.length > 1,
    description: openFiles.length === 0 
      ? 'No open files available'
      : `${rooksOnOpenFiles} of ${totalRooks} rooks on open files (${openFiles.join(', ')} files open)`
  };
}

function analyzeKingSafety(position: Chess): { applied: boolean; violated: boolean; description: string } {
  const turn = position.turn();
  const kingSquare = findKingSquare(position, turn);
  
  if (!kingSquare) {
    return { applied: false, violated: true, description: 'King not found' };
  }
  
  // Check if king is castled (basic check)
  const kingFile = kingSquare.charCodeAt(0) - 97; // Convert to 0-7
  const isLikelyCastled = turn === 'w' ? 
    (kingFile === 2 || kingFile === 6) : // c1/g1 for white
    (kingFile === 2 || kingFile === 6);   // c8/g8 for black
  
  // Check for pawn shield
  const hasGoodPawnShield = checkPawnShield(position, kingSquare, turn);
  
  // Check for immediate threats
  const kingInCheck = position.isCheck();
  const threatCount = countThreatsToKing(position, kingSquare, turn);
  
  const isSafe = (isLikelyCastled || hasGoodPawnShield) && !kingInCheck && threatCount < 2;
  const isUnsafe = kingInCheck || threatCount > 2 || (!isLikelyCastled && !hasGoodPawnShield);
  
  return {
    applied: isSafe,
    violated: isUnsafe,
    description: isUnsafe ? 
      `King safety concerns: ${kingInCheck ? 'in check, ' : ''}${threatCount} threats, ${hasGoodPawnShield ? 'good' : 'weak'} pawn shield` :
      'King is well-protected'
  };
}

function analyzeKnightOutposts(position: Chess): { applied: boolean } {
  const turn = position.turn();
  const outpostSquares = turn === 'w' ? 
    ['d5', 'e5', 'f5', 'c5', 'd6', 'e6', 'f6'] :
    ['d4', 'e4', 'f4', 'c4', 'd3', 'e3', 'f3'];
  
  for (const square of outpostSquares) {
    const piece = position.get(square as any);
    if (piece && piece.type === 'n' && piece.color === turn) {
      // Check if the knight can't be attacked by enemy pawns
      if (isSquareSafeFromPawns(position, square, turn)) {
        return { applied: true };
      }
    }
  }
  
  return { applied: false };
}

function analyzeBishopDiagonals(position: Chess): { applied: boolean } {
  const turn = position.turn();
  const board = position.board();
  
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type === 'b' && piece.color === turn) {
        const square = String.fromCharCode(97 + file) + (rank + 1);
        const diagonalLength = getLongestDiagonalLength(square);
        
        if (diagonalLength >= 5) { // On a long diagonal
          return { applied: true };
        }
      }
    }
  }
  
  return { applied: false };
}

function analyzeKeySquareControl(position: Chess): { applied: boolean; violated: boolean; description: string } {
  const turn = position.turn();
  const keySquares = ['d4', 'd5', 'e4', 'e5'];
  
  let controlledSquares = 0;
  let opponentControlledSquares = 0;
  
  for (const square of keySquares) {
    const attacks = position.moves({ verbose: true }).filter(move => move.to === square);
    const defenses = getDefendingMoves(position, square, turn);
    
    if (attacks.length > defenses.length) {
      controlledSquares++;
    }
    
    // Check opponent control (simplified)
    const opponentAttacks = countOpponentAttacks(position, square, turn);
    if (opponentAttacks > attacks.length) {
      opponentControlledSquares++;
    }
  }
  
  return {
    applied: controlledSquares >= 2,
    violated: opponentControlledSquares > controlledSquares,
    description: `Control ${controlledSquares}/4 key central squares`
  };
}

// Helper functions

function getSquareFromPiece(piece: any, position: Chess): string {
  // This is a simplified helper - in a real implementation, you'd need to track piece positions
  return 'a1'; // Placeholder
}

function findOpenFiles(position: Chess): string[] {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const openFiles: string[] = [];
  
  for (const file of files) {
    let hasPawns = false;
    for (let rank = 1; rank <= 8; rank++) {
      const square = file + rank;
      const piece = position.get(square as any);
      if (piece && piece.type === 'p') {
        hasPawns = true;
        break;
      }
    }
    if (!hasPawns) {
      openFiles.push(file);
    }
  }
  
  return openFiles;
}

function findKingSquare(position: Chess, color: 'w' | 'b'): string | null {
  const board = position.board();
  
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type === 'k' && piece.color === color) {
        return String.fromCharCode(97 + file) + (rank + 1);
      }
    }
  }
  
  return null;
}

function checkPawnShield(position: Chess, kingSquare: string, color: 'w' | 'b'): boolean {
  // Simplified pawn shield check
  const kingFile = kingSquare.charCodeAt(0) - 97;
  const kingRank = parseInt(kingSquare[1]) - 1;
  
  const direction = color === 'w' ? 1 : -1;
  let shieldPawns = 0;
  
  for (let fileOffset = -1; fileOffset <= 1; fileOffset++) {
    const checkFile = kingFile + fileOffset;
    const checkRank = kingRank + direction;
    
    if (checkFile >= 0 && checkFile < 8 && checkRank >= 0 && checkRank < 8) {
      const checkSquare = String.fromCharCode(97 + checkFile) + (checkRank + 1);
      const piece = position.get(checkSquare as any);
      if (piece && piece.type === 'p' && piece.color === color) {
        shieldPawns++;
      }
    }
  }
  
  return shieldPawns >= 2;
}

function countThreatsToKing(position: Chess, kingSquare: string, color: 'w' | 'b'): number {
  // Simplified threat counting
  const opponentColor = color === 'w' ? 'b' : 'w';
  
  // This would need a more sophisticated implementation to count actual threats
  return position.isCheck() ? 1 : 0;
}

function isSquareSafeFromPawns(position: Chess, square: string, color: 'w' | 'b'): boolean {
  // Check if square can be attacked by opponent pawns
  const opponentColor = color === 'w' ? 'b' : 'w';
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1]) - 1;
  
  const pawnDirection = opponentColor === 'w' ? 1 : -1;
  const attackRank = rank - pawnDirection;
  
  if (attackRank >= 0 && attackRank < 8) {
    for (const fileOffset of [-1, 1]) {
      const attackFile = file + fileOffset;
      if (attackFile >= 0 && attackFile < 8) {
        const attackSquare = String.fromCharCode(97 + attackFile) + (attackRank + 1);
        const piece = position.get(attackSquare as any);
        if (piece && piece.type === 'p' && piece.color === opponentColor) {
          return false;
        }
      }
    }
  }
  
  return true;
}

function getLongestDiagonalLength(square: string): number {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1]) - 1;
  
  // Calculate maximum diagonal length from this square
  const toTopRight = Math.min(7 - file, 7 - rank);
  const toBottomLeft = Math.min(file, rank);
  const toTopLeft = Math.min(file, 7 - rank);
  const toBottomRight = Math.min(7 - file, rank);
  
  return Math.max(
    toTopRight + toBottomLeft + 1,
    toTopLeft + toBottomRight + 1
  );
}

function getDefendingMoves(position: Chess, square: string, color: 'w' | 'b'): any[] {
  // Simplified - would need proper implementation
  return [];
}

function countOpponentAttacks(position: Chess, square: string, color: 'w' | 'b'): number {
  // Simplified - would need proper implementation
  return 0;
}

function analyzeWorstPiece(position: Chess): {
  applied: boolean;
  violated: boolean;
  description: string;
} {
  const board = position.board();
  const turn = position.turn();
  const pieceActivity: { [key: string]: number } = {};
  
  // Calculate activity score for each piece
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.color === turn && piece.type !== 'k') {
        const square = String.fromCharCode(97 + file) + (8 - rank);
        const activity = calculatePieceActivity(position, square, piece);
        pieceActivity[`${piece.type}${square}`] = activity;
      }
    }
  }
  
  if (Object.keys(pieceActivity).length === 0) {
    return {
      applied: true,
      violated: false,
      description: 'No pieces to evaluate'
    };
  }
  
  // Find the least active piece
  const worstPieceEntry = Object.entries(pieceActivity)
    .reduce((worst, current) => 
      current[1] < worst[1] ? current : worst
    );
  
  const [worstPiece, activityScore] = worstPieceEntry;
  
  // Consider it a violation if the worst piece has very low activity (< 3)
  if (activityScore < 3) {
    return {
      applied: false,
      violated: true,
      description: `${worstPiece} is very passive (activity: ${activityScore}). Consider improving its position.`
    };
  }
  
  // Also check if there's a big gap between best and worst pieces
  const maxActivity = Math.max(...Object.values(pieceActivity));
  if (maxActivity - activityScore > 5) {
    return {
      applied: false,
      violated: true,
      description: `${worstPiece} is much less active than other pieces. Look for ways to improve its position.`
    };
  }
  
  return {
    applied: true,
    violated: false,
    description: 'Pieces are reasonably well coordinated'
  };
}

function calculatePieceActivity(position: Chess, square: string, piece: any): number {
  let activity = 0;
  
  // Get available moves for this piece
  const moves = position.moves({ 
    square: square as any,
    verbose: true 
  });
  
  // Base activity from number of legal moves
  activity += moves.length;
  
  // Bonus for being in central squares
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1]) - 1;
  const centralBonus = Math.max(0, 3 - Math.abs(3.5 - file) - Math.abs(3.5 - rank));
  activity += centralBonus;
  
  // Bonus for attacking enemy pieces
  const attackedPieces = moves.filter(move => move.captured).length;
  activity += attackedPieces * 2;
  
  // Penalty for being on the back rank (except rooks and queen)
  if ((piece.type === 'n' || piece.type === 'b') && 
      ((piece.color === 'w' && rank === 0) || (piece.color === 'b' && rank === 7))) {
    activity -= 2;
  }
  
  return Math.max(0, activity);
}

function analyzeProphylacticThinking(position: Chess): {
  applied: boolean;
  violated: boolean;
  description: string;
} {
  // This is an advanced concept - simplified implementation
  // For now, we'll check if the position has obvious weaknesses that could be exploited
  
  const turn = position.turn();
  const board = position.board();
  const vulnerabilities: string[] = [];
  
  // Check for obvious weaknesses that should be prevented
  // 1. Undefended back rank
  if (hasWeakBackRank(position, turn)) {
    vulnerabilities.push('weak back rank');
  }
  
  // 2. King exposed without pawn cover
  if (hasExposedKing(position, turn)) {
    vulnerabilities.push('exposed king');
  }
  
  // 3. Pieces that can be easily attacked next move
  const exposedPieces = findExposedPieces(position, turn);
  if (exposedPieces.length > 0) {
    vulnerabilities.push(`exposed pieces: ${exposedPieces.join(', ')}`);
  }
  
  // If there are obvious vulnerabilities, it suggests lack of prophylactic thinking
  if (vulnerabilities.length > 0) {
    return {
      applied: false,
      violated: true,
      description: `Prophylactic thinking needed - vulnerabilities: ${vulnerabilities.slice(0, 2).join(', ')}`
    };
  }
  
  return {
    applied: true,
    violated: false,
    description: 'Position shows good prophylactic preparation'
  };
}

function getPieceValue(pieceType: string): number {
  const values: { [key: string]: number } = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  return values[pieceType] || 0;
}

function countKnightThreats(position: Chess, knightSquare: string): number {
  const moves = position.moves({ 
    square: knightSquare as any,
    verbose: true 
  });
  
  return moves.filter(move => move.captured).length;
}

function hasWeakBackRank(position: Chess, color: string): boolean {
  const board = position.board();
  const backRank = color === 'w' ? 0 : 7;
  
  // Check if king is on back rank without escape squares
  let kingOnBackRank = false;
  let hasEscapeSquares = false;
  
  for (let file = 0; file < 8; file++) {
    const piece = board[backRank][file];
    if (piece && piece.color === color && piece.type === 'k') {
      kingOnBackRank = true;
      
      // Check for escape squares
      const kingSquare = String.fromCharCode(97 + file) + (8 - backRank);
      const kingMoves = position.moves({ 
        square: kingSquare as any,
        verbose: true 
      });
      
      hasEscapeSquares = kingMoves.length > 0;
      break;
    }
  }
  
  // Also check if there are any pieces defending the back rank
  let hasBackRankDefense = false;
  for (let file = 0; file < 8; file++) {
    const piece = board[backRank][file];
    if (piece && piece.color === color && piece.type === 'r') {
      hasBackRankDefense = true;
      break;
    }
  }
  
  return kingOnBackRank && !hasEscapeSquares && !hasBackRankDefense;
}

function hasExposedKing(position: Chess, color: string): boolean {
  const board = position.board();
  let kingSquare = '';
  
  // Find the king
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.color === color && piece.type === 'k') {
        kingSquare = String.fromCharCode(97 + file) + (8 - rank);
        break;
      }
    }
    if (kingSquare) break;
  }
  
  if (!kingSquare) return false;
  
  // Check if king has adequate pawn cover
  const file = kingSquare.charCodeAt(0) - 97;
  const rank = parseInt(kingSquare[1]) - 1;
  
  let pawnCover = 0;
  const pawnDirection = color === 'w' ? 1 : -1;
  
  // Check squares in front of king for pawn protection
  for (let f = Math.max(0, file - 1); f <= Math.min(7, file + 1); f++) {
    const checkRank = rank + pawnDirection;
    if (checkRank >= 0 && checkRank < 8) {
      const piece = board[7 - checkRank][f];
      if (piece && piece.color === color && piece.type === 'p') {
        pawnCover++;
      }
    }
  }
  
  return pawnCover < 2; // King is exposed if less than 2 protecting pawns
}

function findExposedPieces(position: Chess, color: string): string[] {
  const board = position.board();
  const exposedPieces: string[] = [];
  
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.color === color && piece.type !== 'k' && piece.type !== 'p') {
        const square = String.fromCharCode(97 + file) + (8 - rank);
        
        // Check if piece can be easily attacked
        const opponentColor = color === 'w' ? 'b' : 'w';
        let canBeAttacked = false;
        
        // Simple check: see if opponent pawns can attack this square
        for (let r = 0; r < 8; r++) {
          for (let f = 0; f < 8; f++) {
            const opponentPiece = board[r][f];
            if (opponentPiece && opponentPiece.color === opponentColor && opponentPiece.type === 'p') {
              const pawnSquare = String.fromCharCode(97 + f) + (8 - r);
              const pawnMoves = position.moves({ 
                square: pawnSquare as any,
                verbose: true 
              });
              
              if (pawnMoves.some(move => move.to === square)) {
                canBeAttacked = true;
                break;
              }
            }
          }
          if (canBeAttacked) break;
        }
        
        if (canBeAttacked) {
          exposedPieces.push(`${piece.type.toUpperCase()}${square}`);
        }
      }
    }
  }
  
  return exposedPieces;
} 