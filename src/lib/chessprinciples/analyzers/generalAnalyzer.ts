import { Chess } from "chess.js";
import { ChessPrinciple, ChessPrincipleViolation } from "../index";
import { generalPrinciples } from "../principles";
import { PositionEval } from "@/types/eval";

export interface GeneralAnalysisResult {
  appliedPrinciples: ChessPrinciple[];
  violatedPrinciples: ChessPrincipleViolation[];
}

export function analyzeGeneralPrinciples(
  position: Chess,
  evaluation: PositionEval
): GeneralAnalysisResult {
  const appliedPrinciples: ChessPrinciple[] = [];
  const violatedPrinciples: ChessPrincipleViolation[] = [];

  // 1. Don't hang pieces (highest priority for beginners)
  const hangingPieces = analyzeHangingPieces(position);
  if (hangingPieces.violated) {
    violatedPrinciples.push({
      principle: generalPrinciples.find((p) => p.id === "dont-hang-pieces")!,
      severity: "major",
      description: hangingPieces.description,
      shortTermImpact: "Immediate material loss weakens position",
      longTermImpact: "Material disadvantage is difficult to recover from",
    });
  } else if (hangingPieces.applied) {
    appliedPrinciples.push(
      generalPrinciples.find((p) => p.id === "dont-hang-pieces")!
    );
  }

  // 2. Look for basic tactics
  const basicTactics = analyzeBasicTactics(position);
  if (basicTactics.missedOpportunity) {
    violatedPrinciples.push({
      principle: generalPrinciples.find(
        (p) => p.id === "look-for-basic-tactics"
      )!,
      severity: "moderate",
      description: basicTactics.description,
      shortTermImpact:
        "Missed tactical opportunity for material gain or advantage",
      longTermImpact: "Accumulation of missed tactics reduces winning chances",
    });
  } else if (basicTactics.applied) {
    appliedPrinciples.push(
      generalPrinciples.find((p) => p.id === "look-for-basic-tactics")!
    );
  }

  // 3. Maintain material balance
  const materialBalance = analyzeMaterialBalance(position, evaluation);
  if (materialBalance.applied) {
    appliedPrinciples.push(
      generalPrinciples.find((p) => p.id === "maintain-material-balance")!
    );
  } else if (materialBalance.violated) {
    violatedPrinciples.push({
      principle: generalPrinciples.find(
        (p) => p.id === "maintain-material-balance"
      )!,
      severity: materialBalance.severity,
      description: materialBalance.description,
      shortTermImpact:
        "Material disadvantage affects immediate tactical options",
      longTermImpact: "Harder to achieve favorable outcomes with less material",
    });
  }

  // 2. Control space
  const spaceControl = analyzeSpaceControl(position);
  if (spaceControl.applied) {
    appliedPrinciples.push(
      generalPrinciples.find((p) => p.id === "control-space")!
    );
  } else if (spaceControl.violated) {
    violatedPrinciples.push({
      principle: generalPrinciples.find((p) => p.id === "control-space")!,
      severity: "moderate",
      description: spaceControl.description,
      shortTermImpact: "Reduced piece mobility and options",
      longTermImpact: "Opponent gains strategic advantage and initiative",
    });
  }

  // 3. Assess pawn structure
  const pawnStructure = analyzePawnStructure(position);
  if (pawnStructure.hasWeaknesses) {
    violatedPrinciples.push({
      principle: generalPrinciples.find(
        (p) => p.id === "assess-pawn-structure"
      )!,
      severity: "moderate",
      description: pawnStructure.description,
      shortTermImpact: "Weak pawns become targets for attack",
      longTermImpact: "Permanent structural disadvantage",
    });
  } else if (pawnStructure.isGood) {
    appliedPrinciples.push(
      generalPrinciples.find((p) => p.id === "assess-pawn-structure")!
    );
  }

  // 4. Calculate accurately (check for tactical opportunities/blunders)
  const tacticalAwareness = analyzeTacticalAwareness(position, evaluation);
  if (tacticalAwareness.applied) {
    appliedPrinciples.push(
      generalPrinciples.find((p) => p.id === "calculate-accurately")!
    );
  } else if (tacticalAwareness.violated) {
    violatedPrinciples.push({
      principle: generalPrinciples.find(
        (p) => p.id === "calculate-accurately"
      )!,
      severity: tacticalAwareness.severity,
      description: tacticalAwareness.description,
      shortTermImpact: "Missed tactics or vulnerable to opponent tactics",
      longTermImpact: "Accumulation of tactical errors affects game outcome",
    });
  }

  return { appliedPrinciples, violatedPrinciples };
}

function analyzeMaterialBalance(
  position: Chess,
  evaluation: PositionEval
): {
  applied: boolean;
  violated: boolean;
  severity: "minor" | "moderate" | "major";
  description: string;
} {
  const turn = position.turn();
  const balance = calculateMaterialBalance(position, turn);

  // Check if there are recent captures or sacrifices in the evaluation
  const hasRecentSacrifice = evaluation.lines?.[0]?.pv?.some((move) =>
    position
      .history({ verbose: true })
      .some(
        (histMove) =>
          histMove.captured && !isGoodSacrifice(position, histMove.san)
      )
  );

  if (balance >= 0) {
    return {
      applied: true,
      violated: false,
      severity: "minor",
      description:
        balance > 0
          ? `Material advantage: +${balance}`
          : "Material equality maintained",
    };
  }

  const severity: "minor" | "moderate" | "major" =
    Math.abs(balance) <= 1
      ? "minor"
      : Math.abs(balance) <= 3
        ? "moderate"
        : "major";

  return {
    applied: false,
    violated: true,
    severity,
    description: `Material disadvantage: ${balance} (${Math.abs(balance)} points behind)`,
  };
}

function analyzeSpaceControl(position: Chess): {
  applied: boolean;
  violated: boolean;
  description: string;
} {
  const turn = position.turn();
  const moves = position.moves({ verbose: true });
  const opponentMoves = getOpponentMoveCount(position);

  // Count squares controlled
  const controlledSquares = new Set();
  for (const move of moves) {
    controlledSquares.add(move.to);
  }

  // Central squares control is especially important
  const centralSquares = ["d4", "d5", "e4", "e5"];
  let centralControl = 0;

  for (const square of centralSquares) {
    if (controlledSquares.has(square)) {
      centralControl++;
    }
  }

  const totalControlled = controlledSquares.size;
  const spaceAdvantage = totalControlled > opponentMoves;
  const centralAdvantage = centralControl >= 2;

  return {
    applied: spaceAdvantage || centralAdvantage,
    violated: !spaceAdvantage && centralControl === 0,
    description:
      !spaceAdvantage && centralControl === 0
        ? `Limited space control: ${totalControlled} squares, ${centralControl}/4 central squares`
        : `Good space control: ${totalControlled} squares, ${centralControl}/4 central squares`,
  };
}

function analyzePawnStructure(position: Chess): {
  hasWeaknesses: boolean;
  isGood: boolean;
  description: string;
} {
  const turn = position.turn();
  const board = position.board();

  let isolatedPawns = 0;
  let doubledPawns = 0;
  let backwardPawns = 0;
  let pawnIslands = 0;

  // Simple pawn structure analysis
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const pawnFiles: { [file: string]: number[] } = {};

  // Map pawns by file
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type === "p" && piece.color === turn) {
        const fileName = String.fromCharCode(97 + file);
        if (!pawnFiles[fileName]) pawnFiles[fileName] = [];
        pawnFiles[fileName].push(rank);
      }
    }
  }

  // Count doubled pawns
  for (const file in pawnFiles) {
    if (pawnFiles[file].length > 1) {
      doubledPawns += pawnFiles[file].length - 1;
    }
  }

  // Count isolated pawns
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (pawnFiles[file] && pawnFiles[file].length > 0) {
      const leftFile = i > 0 ? files[i - 1] : null;
      const rightFile = i < 7 ? files[i + 1] : null;

      const hasLeftSupport =
        leftFile && pawnFiles[leftFile] && pawnFiles[leftFile].length > 0;
      const hasRightSupport =
        rightFile && pawnFiles[rightFile] && pawnFiles[rightFile].length > 0;

      if (!hasLeftSupport && !hasRightSupport) {
        isolatedPawns += pawnFiles[file].length;
      }
    }
  }

  // Count pawn islands (simplified)
  let inIsland = false;
  for (const file of files) {
    const hasPawn = pawnFiles[file] && pawnFiles[file].length > 0;
    if (hasPawn && !inIsland) {
      pawnIslands++;
      inIsland = true;
    } else if (!hasPawn) {
      inIsland = false;
    }
  }

  const hasSignificantWeaknesses =
    isolatedPawns > 1 || doubledPawns > 1 || pawnIslands > 3;
  const hasMinorWeaknesses = isolatedPawns === 1 || doubledPawns === 1;
  const isGood =
    !hasSignificantWeaknesses && !hasMinorWeaknesses && pawnIslands <= 2;

  let description = "";
  if (hasSignificantWeaknesses) {
    description = `Pawn weaknesses: ${isolatedPawns} isolated, ${doubledPawns} doubled, ${pawnIslands} islands`;
  } else if (hasMinorWeaknesses) {
    description = `Minor pawn issues: ${isolatedPawns} isolated, ${doubledPawns} doubled`;
  } else {
    description = `Solid pawn structure with ${pawnIslands} pawn islands`;
  }

  return {
    hasWeaknesses: hasSignificantWeaknesses || hasMinorWeaknesses,
    isGood,
    description,
  };
}

function analyzeTacticalAwareness(
  position: Chess,
  evaluation: PositionEval
): {
  applied: boolean;
  violated: boolean;
  severity: "minor" | "moderate" | "major";
  description: string;
} {
  const turn = position.turn();

  // Check for immediate tactical threats
  const isInCheck = position.isCheck();
  const canCaptureForFree = checkForHangingPieces(position);
  const hasDiscoveredAttacks = checkForDiscoveredAttacks(position);
  const hasForks = checkForForks(position);
  const hasPins = checkForPins(position);

  // Check if best move is significantly better (indicating missed tactic)
  const bestEval = evaluation.lines?.[0];
  const currentEval = getPositionEvaluation(position);

  let significantTacticalDifference = false;
  if (bestEval && bestEval.cp !== undefined && currentEval !== undefined) {
    const evalDiff = Math.abs(bestEval.cp - currentEval);
    significantTacticalDifference = evalDiff > 100; // Significant advantage missed
  }

  const tacticalThreats = [
    canCaptureForFree,
    hasDiscoveredAttacks,
    hasForks,
    hasPins,
  ].filter(Boolean).length;

  if (isInCheck && !position.isCheckmate()) {
    return {
      applied: false,
      violated: true,
      severity: "major",
      description: "Must address check - calculate escape moves carefully",
    };
  }

  if (canCaptureForFree) {
    return {
      applied: false,
      violated: true,
      severity: "major",
      description: "Free material available - look for hanging pieces",
    };
  }

  if (significantTacticalDifference) {
    return {
      applied: false,
      violated: true,
      severity: "moderate",
      description: "Significant tactical opportunity missed - calculate deeper",
    };
  }

  if (tacticalThreats > 0) {
    return {
      applied: true,
      violated: false,
      severity: "minor",
      description: `Good tactical awareness: ${tacticalThreats} tactical themes available`,
    };
  }

  return {
    applied: true,
    violated: false,
    severity: "minor",
    description: "Position calculated accurately",
  };
}

// Helper functions

function calculateMaterialBalance(position: Chess, color: "w" | "b"): number {
  const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const board = position.board();

  let balance = 0;

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece) {
        const value = pieceValues[piece.type];
        if (piece.color === color) {
          balance += value;
        } else {
          balance -= value;
        }
      }
    }
  }

  return balance;
}

function isGoodSacrifice(position: Chess, move: string): boolean {
  // Simplified: check if sacrifice leads to checkmate or significant advantage
  // This would need more sophisticated analysis in a real implementation
  return move.includes("#") || move.includes("+");
}

function getOpponentMoveCount(position: Chess): number {
  // Create a copy and switch turns to count opponent moves
  const tempPosition = new Chess(position.fen());
  const currentTurn = tempPosition.turn();

  // Switch the turn in FEN
  const fenParts = tempPosition.fen().split(" ");
  fenParts[1] = currentTurn === "w" ? "b" : "w";

  try {
    const opponentPosition = new Chess(fenParts.join(" "));
    return opponentPosition.moves().length;
  } catch {
    return 20; // Default reasonable number if FEN manipulation fails
  }
}

function checkForHangingPieces(position: Chess): boolean {
  const turn = position.turn();
  const moves = position.moves({ verbose: true });

  // Look for captures that win material
  for (const move of moves) {
    if (move.captured) {
      // Simple check: if we can capture and the piece value is significant
      const capturedValue = getPieceValue(move.captured);
      const movingValue = getPieceValue(move.piece);

      if (capturedValue > movingValue) {
        return true; // Found a favorable capture
      }
    }
  }

  return false;
}

function checkForDiscoveredAttacks(position: Chess): boolean {
  // Simplified check for discovered attacks
  const moves = position.moves({ verbose: true });

  for (const move of moves) {
    // Look for moves that could reveal attacks
    if (move.piece === "n" || move.piece === "b") {
      // This would need more sophisticated analysis
      // For now, just check if it's a piece that commonly creates discovered attacks
      return true;
    }
  }

  return false;
}

function checkForForks(position: Chess): boolean {
  const moves = position.moves({ verbose: true });

  for (const move of moves) {
    if (move.piece === "n") {
      // Knights are common forking pieces
      // This would need more sophisticated analysis to check if the move actually creates a fork
      return true;
    }
  }

  return false;
}

function checkForPins(position: Chess): boolean {
  // Simplified pin detection
  const board = position.board();
  const turn = position.turn();

  // Look for potential pins with bishops, rooks, and queens
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (
        piece &&
        piece.color === turn &&
        (piece.type === "b" || piece.type === "r" || piece.type === "q")
      ) {
        // This would need more sophisticated analysis to detect actual pins
        return true;
      }
    }
  }

  return false;
}

function getPositionEvaluation(position: Chess): number | undefined {
  // This would typically come from the engine evaluation
  // For now, return undefined as we don't have access to the current position evaluation
  return undefined;
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

function analyzeHangingPieces(position: Chess): {
  applied: boolean;
  violated: boolean;
  description: string;
} {
  const board = position.board();
  const turn = position.turn();
  const hangingPieces: string[] = [];

  // Check all pieces of the current player
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.color === turn) {
        const square = String.fromCharCode(97 + file) + (8 - rank);

        // Check if this piece is defended
        const isDefended = isPieceDefended(position, square, turn);
        const isAttacked = isPieceAttacked(
          position,
          square,
          turn === "w" ? "b" : "w"
        );

        if (isAttacked && !isDefended && piece.type !== "k") {
          hangingPieces.push(`${piece.type.toUpperCase()}${square}`);
        }
      }
    }
  }

  if (hangingPieces.length > 0) {
    return {
      applied: false,
      violated: true,
      description: `Undefended pieces detected: ${hangingPieces.join(", ")}. Always check piece safety before moving.`,
    };
  }

  return {
    applied: true,
    violated: false,
    description: "All pieces are properly defended",
  };
}

function analyzeBasicTactics(position: Chess): {
  applied: boolean;
  missedOpportunity: boolean;
  description: string;
} {
  const moves = position.moves({ verbose: true });
  const turn = position.turn();
  const tacticalOpportunities: string[] = [];

  // Check for tactical opportunities in available moves
  for (const move of moves) {
    const tempPosition = new Chess(position.fen());
    tempPosition.move(move);

    // Look for captures that win material
    if (move.captured) {
      const capturedValue = getPieceValue(move.captured);
      const capturingValue = getPieceValue(move.piece);

      // Simple material gain check
      if (capturedValue > capturingValue) {
        tacticalOpportunities.push(`${move.san} wins material`);
      }
    }

    // Look for checks that might lead to tactics
    if (tempPosition.inCheck()) {
      tacticalOpportunities.push(`${move.san} gives check`);
    }

    // Look for forks (simplified - knight moves attacking multiple pieces)
    if (move.piece === "n") {
      const knightAttacks = getKnightAttacks(move.to, tempPosition);
      if (knightAttacks.length >= 2) {
        tacticalOpportunities.push(`${move.san} potential fork`);
      }
    }
  }

  // Also check if opponent left hanging pieces that can be captured
  const opponentHangingPieces = findHangingPieces(
    position,
    turn === "w" ? "b" : "w"
  );
  if (opponentHangingPieces.length > 0) {
    tacticalOpportunities.push(
      `Can capture hanging pieces: ${opponentHangingPieces.join(", ")}`
    );
  }

  if (tacticalOpportunities.length > 0) {
    return {
      applied: false,
      missedOpportunity: true,
      description: `Tactical opportunities available: ${tacticalOpportunities.slice(0, 3).join("; ")}`,
    };
  }

  return {
    applied: true,
    missedOpportunity: false,
    description: "No obvious tactical opportunities missed",
  };
}

function isPieceDefended(
  position: Chess,
  square: string,
  color: string
): boolean {
  // Get all pieces of the same color and check if any can defend this square
  const board = position.board();

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.color === color) {
        const fromSquare = String.fromCharCode(97 + file) + (8 - rank);
        if (fromSquare !== square) {
          // Check if this piece can move to defend the target square
          const moves = position.moves({
            square: fromSquare as any,
            verbose: true,
          });

          if (moves.some((move) => move.to === square)) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

function isPieceAttacked(
  position: Chess,
  square: string,
  byColor: string
): boolean {
  // Check if any piece of the given color can attack the square
  const board = position.board();

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.color === byColor) {
        const fromSquare = String.fromCharCode(97 + file) + (8 - rank);
        const moves = position.moves({
          square: fromSquare as any,
          verbose: true,
        });

        if (moves.some((move) => move.to === square)) {
          return true;
        }
      }
    }
  }

  return false;
}

function getKnightAttacks(square: string, position: Chess): string[] {
  const moves = position.moves({
    square: square as any,
    verbose: true,
  });

  return moves
    .filter((move) => move.captured || position.get(move.to))
    .map((move) => move.to);
}

function findHangingPieces(position: Chess, color: string): string[] {
  const board = position.board();
  const hangingPieces: string[] = [];

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.color === color) {
        const square = String.fromCharCode(97 + file) + (8 - rank);

        const isDefended = isPieceDefended(position, square, color);
        const isAttacked = isPieceAttacked(
          position,
          square,
          color === "w" ? "b" : "w"
        );

        if (isAttacked && !isDefended && piece.type !== "k") {
          hangingPieces.push(`${piece.type.toUpperCase()}${square}`);
        }
      }
    }
  }

  return hangingPieces;
}
