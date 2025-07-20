import { Chess } from 'chess.js';

function countDoubledPawns(position: Chess, color: 'w' | 'b'): number {
  const board = position.board();
  const pawnFiles: { [file: string]: number } = {};
  
  // Count pawns per file
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type === 'p' && piece.color === color) {
        const fileName = String.fromCharCode(97 + file);
        pawnFiles[fileName] = (pawnFiles[fileName] || 0) + 1;
      }
    }
  }
  
  // Count doubled pawns (files with more than 1 pawn)
  let doubled = 0;
  for (const file in pawnFiles) {
    if (pawnFiles[file] > 1) {
      doubled += pawnFiles[file] - 1;
    }
  }
  
  return doubled;
}

function countIsolatedPawns(position: Chess, color: 'w' | 'b'): number {
  const board = position.board();
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const pawnFiles: { [file: string]: boolean } = {};
  
  // Map which files have pawns
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type === 'p' && piece.color === color) {
        const fileName = String.fromCharCode(97 + file);
        pawnFiles[fileName] = true;
      }
    }
  }
  
  // Count isolated pawns
  let isolated = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (pawnFiles[file]) {
      const leftFile = i > 0 ? files[i - 1] : null;
      const rightFile = i < 7 ? files[i + 1] : null;
      
      const hasLeftSupport = leftFile && pawnFiles[leftFile];
      const hasRightSupport = rightFile && pawnFiles[rightFile];
      
      if (!hasLeftSupport && !hasRightSupport) {
        isolated++;
      }
    }
  }
  
  return isolated;
}

/**
 * Validates whether a principle violation makes sense for the given move
 * This prevents false positives like claiming e5 creates doubled pawns
 */
export function validatePrincipleViolation(
  move: string,
  positionBefore: Chess,
  positionAfter: Chess,
  violationType: string,
  description: string
): boolean {
  // Get the actual move details
  const moveDetails = getMoveDetails(move, positionBefore);
  if (!moveDetails) return false;

  switch (violationType) {
    case 'assess-pawn-structure':
      return validatePawnStructureViolation(move, moveDetails, positionBefore, positionAfter, description);
    
    case 'maintain-king-safety':
      return validateKingSafetyViolation(move, moveDetails, positionBefore, positionAfter);
    
    case 'develop-knights-bishops':
      return validateDevelopmentViolation(move, moveDetails, positionBefore, positionAfter);
    
    default:
      return true; // Allow other violations for now
  }
}

function getMoveDetails(move: string, position: Chess) {
  try {
    const tempPosition = new Chess(position.fen());
    const moveObj = tempPosition.move(move);
    return moveObj;
  } catch {
    return null;
  }
}

function validatePawnStructureViolation(
  move: string,
  moveDetails: any,
  positionBefore: Chess,
  positionAfter: Chess,
  description: string
): boolean {
  // Sanity check: Standard opening moves cannot create doubled pawns
  const standardOpeningMoves = ['e4', 'e5', 'd4', 'd5', 'Nf3', 'Nf6', 'Nc3', 'Nc6', 'c4', 'c5'];
  if (standardOpeningMoves.includes(move)) {
    console.log(`❌ Rejecting pawn structure violation for standard opening move: ${move}`);
    return false;
  }

  // If claiming doubled pawns, verify the move actually created them
  if (description.includes('doubled')) {
    const doubledBefore = countDoubledPawns(positionBefore, moveDetails.color);
    const doubledAfter = countDoubledPawns(positionAfter, moveDetails.color);
    
    if (doubledAfter <= doubledBefore) {
      console.log(`❌ Rejecting doubled pawn claim: ${doubledBefore} → ${doubledAfter} for move ${move}`);
      return false;
    }

    // Check if the move was a capture that could actually create doubled pawns
    if (!moveDetails.captured) {
      console.log(`❌ Rejecting doubled pawn claim: No capture in move ${move}`);
      return false;
    }
  }

  // If claiming isolated pawns, check if it's reasonable
  if (description.includes('isolated')) {
    const isolatedBefore = countIsolatedPawns(positionBefore, moveDetails.color);
    const isolatedAfter = countIsolatedPawns(positionAfter, moveDetails.color);
    
    // Only flag if the move significantly worsened isolation
    return isolatedAfter > isolatedBefore;
  }

  return true;
}

function validateKingSafetyViolation(
  move: string,
  moveDetails: any,
  positionBefore: Chess,
  positionAfter: Chess
): boolean {
  // Don't flag king safety for normal development moves
  if (moveDetails.piece === 'n' || moveDetails.piece === 'b') {
    const moveCount = positionBefore.history().length;
    if (moveCount < 15) { // Opening phase
      console.log(`❌ Rejecting king safety violation for development move in opening: ${move}`);
      return false;
    }
  }

  // Don't flag king safety for standard pawn moves in opening
  if (moveDetails.piece === 'p') {
    const moveCount = positionBefore.history().length;
    const standardPawnMoves = ['e4', 'e5', 'd4', 'd5', 'c4', 'c5', 'f4', 'f5'];
    if (moveCount < 10 && standardPawnMoves.includes(move)) {
      console.log(`❌ Rejecting king safety violation for standard pawn move: ${move}`);
      return false;
    }
  }

  return true;
}

function validateDevelopmentViolation(
  move: string,
  moveDetails: any,
  positionBefore: Chess,
  positionAfter: Chess
): boolean {
  // Don't flag development violations for actual development moves
  if (moveDetails.piece === 'n' || moveDetails.piece === 'b') {
    const piece = positionBefore.get(moveDetails.from);
    const startingSquares = {
      'wn': ['b1', 'g1'],
      'bn': ['b8', 'g8'],
      'wb': ['c1', 'f1'],
      'bb': ['c8', 'f8']
    };
    
        if (piece) {
      const pieceKey = piece.color + piece.type;
      if (startingSquares[pieceKey as keyof typeof startingSquares]?.includes(moveDetails.from)) {
        console.log(`❌ Rejecting development violation for actual development: ${move}`);
        return false;
      }
    }
  }

  return true;
}

/**
 * Checks if a move is obviously good and shouldn't be flagged for principle violations
 */
export function isObviouslyGoodMove(move: string, position: Chess): boolean {
  const standardOpeningMoves = [
    'e4', 'e5', 'd4', 'd5', 'Nf3', 'Nf6', 'Nc3', 'Nc6', 
    'Bc4', 'Bc5', 'Bb5', 'Be7', 'O-O', 'c4', 'c5'
  ];
  
  const moveCount = position.history().length;
  
  // Standard opening moves in first 15 moves
  if (moveCount < 15 && standardOpeningMoves.includes(move)) {
    return true;
  }
  
  // Castling is almost always good
  if (move === 'O-O' || move === 'O-O-O') {
    return true;
  }
  
  return false;
}

/**
 * Enhanced validation that considers the full context and skill level
 */
export function shouldFlagViolation(
  move: string,
  moveNumber: number,
  positionBefore: Chess,
  positionAfter: Chess,
  violationType: string,
  description: string,
  severity: 'minor' | 'moderate' | 'major',
  skillLevel?: any
): boolean {
  // Never flag obviously good moves
  if (isObviouslyGoodMove(move, positionBefore)) {
    console.log(`✅ Skipping violation for obviously good move: ${move}`);
    return false;
  }
  
  // Skill-level specific filtering for new principles
  if (skillLevel) {
    // "Think prophylactically" only for advanced players (1800+)
    if (violationType === 'think-prophylactically' && skillLevel.minRating < 1800) {
      console.log(`✅ Skipping prophylactic thinking violation for ${skillLevel.name} level`);
      return false;
    }
    
    // "Improve worst piece" only for intermediate+ players (1400+)
    if (violationType === 'improve-worst-piece' && skillLevel.minRating < 1400) {
      console.log(`✅ Skipping piece activity violation for ${skillLevel.name} level`);
      return false;
    }
    
    // For beginners, prioritize hanging pieces and basic tactics
    if (skillLevel.name === 'Beginner') {
      const priorityViolations = ['dont-hang-pieces', 'look-for-basic-tactics', 'castle-early'];
      if (!priorityViolations.includes(violationType)) {
        console.log(`✅ Skipping non-priority violation for beginner: ${violationType}`);
        return false;
      }
    }
  }
  
  // Validate the specific violation type
  if (!validatePrincipleViolation(move, positionBefore, positionAfter, violationType, description)) {
    return false;
  }
  
  // Extra conservative in opening
  if (moveNumber <= 10 && severity !== 'major') {
    console.log(`✅ Skipping ${severity} violation in opening: ${move}`);
    return false;
  }
  
  return true;
} 