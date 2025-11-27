import { Chess } from "chess.js";
import { ChessPrinciple, ChessPrincipleViolation } from "../index";
import { endgamePrinciples } from "../principles";
import { PositionEval } from "@/types/eval";

export interface EndgameAnalysisResult {
  appliedPrinciples: ChessPrinciple[];
  violatedPrinciples: ChessPrincipleViolation[];
}

export function analyzeEndgamePrinciples(
  position: Chess,
  evaluation: PositionEval
): EndgameAnalysisResult {
  const appliedPrinciples: ChessPrinciple[] = [];
  const violatedPrinciples: ChessPrincipleViolation[] = [];

  const turn = position.turn();

  // 1. Activate the king
  const kingActivation = analyzeKingActivation(position);
  if (kingActivation.applied) {
    appliedPrinciples.push(
      endgamePrinciples.find((p) => p.id === "activate-king")!
    );
  } else if (kingActivation.violated) {
    violatedPrinciples.push({
      principle: endgamePrinciples.find((p) => p.id === "activate-king")!,
      severity: "moderate",
      description: kingActivation.description,
      shortTermImpact: "King cannot support pawns or attack weaknesses",
      longTermImpact: "Missed winning chances or defensive opportunities",
    });
  }

  // 2. Create and support passed pawns
  const passedPawns = analyzePassedPawns(position);
  if (passedPawns.hasPassedPawn) {
    appliedPrinciples.push(
      endgamePrinciples.find((p) => p.id === "create-outside-passed-pawns")!
    );

    if (passedPawns.isSupported) {
      appliedPrinciples.push(
        endgamePrinciples.find((p) => p.id === "support-passed-pawns")!
      );
    } else {
      violatedPrinciples.push({
        principle: endgamePrinciples.find(
          (p) => p.id === "support-passed-pawns"
        )!,
        severity: "moderate",
        description: "Passed pawn lacks proper support",
        shortTermImpact: "Pawn vulnerable to capture",
        longTermImpact: "Cannot advance toward promotion",
      });
    }
  }

  // 3. Blockade opponent's passed pawns
  const blockade = analyzeBlockade(position);
  if (blockade.applied) {
    appliedPrinciples.push(
      endgamePrinciples.find((p) => p.id === "blockade-opponent-pawns")!
    );
  } else if (blockade.violated) {
    violatedPrinciples.push({
      principle: endgamePrinciples.find(
        (p) => p.id === "blockade-opponent-pawns"
      )!,
      severity: "major",
      description: blockade.description,
      shortTermImpact: "Opponent pawn advances freely",
      longTermImpact: "Risk of opponent promotion",
    });
  }

  // 4. Use pawn majorities
  const pawnMajority = analyzePawnMajorities(position);
  if (pawnMajority.applied) {
    appliedPrinciples.push(
      endgamePrinciples.find((p) => p.id === "use-pawn-majorities")!
    );
  }

  // 5. Simplify when ahead
  const simplification = analyzeSimplification(position, evaluation);
  if (simplification.shouldSimplify && !simplification.isSimplifying) {
    violatedPrinciples.push({
      principle: endgamePrinciples.find((p) => p.id === "simplify-when-ahead")!,
      severity: "minor",
      description: "Consider trading pieces to convert material advantage",
      shortTermImpact: "Maintaining complexity may give opponent chances",
      longTermImpact: "Harder to convert advantage in complex positions",
    });
  } else if (simplification.isSimplifying && simplification.shouldSimplify) {
    appliedPrinciples.push(
      endgamePrinciples.find((p) => p.id === "simplify-when-ahead")!
    );
  }

  return { appliedPrinciples, violatedPrinciples };
}

function analyzeKingActivation(position: Chess): {
  applied: boolean;
  violated: boolean;
  description: string;
} {
  const turn = position.turn();
  const kingSquare = findKingSquare(position, turn);

  if (!kingSquare) {
    return { applied: false, violated: true, description: "King not found" };
  }

  const kingFile = kingSquare.charCodeAt(0) - 97; // 0-7
  const kingRank = parseInt(kingSquare[1]) - 1; // 0-7

  // Central squares (d4, d5, e4, e5, c4, c5, f4, f5)
  const isCentralized =
    kingFile >= 2 && kingFile <= 5 && kingRank >= 3 && kingRank <= 4;

  // Advanced position (beyond 4th/5th rank depending on color)
  const isAdvanced = turn === "w" ? kingRank >= 3 : kingRank <= 4;

  // Check if king is supporting pawns or attacking
  const isActivelyParticipating = checkKingActivity(position, kingSquare, turn);

  const isActive = isCentralized || (isAdvanced && isActivelyParticipating);
  const isPassive = !isAdvanced && !isActivelyParticipating;

  return {
    applied: isActive,
    violated: isPassive,
    description: isActive
      ? `King is ${isCentralized ? "centralized" : "actively positioned"}`
      : `King is passive on ${kingSquare} - centralize or advance it`,
  };
}

function analyzePassedPawns(position: Chess): {
  hasPassedPawn: boolean;
  isSupported: boolean;
} {
  const turn = position.turn();
  const passedPawns = findPassedPawns(position, turn);

  if (passedPawns.length === 0) {
    return { hasPassedPawn: false, isSupported: false };
  }

  // Check if most advanced passed pawn is supported
  const mostAdvanced = passedPawns.reduce((best, current) => {
    const bestRank = parseInt(best[1]);
    const currentRank = parseInt(current[1]);

    if (turn === "w") {
      return currentRank > bestRank ? current : best;
    } else {
      return currentRank < bestRank ? current : best;
    }
  });

  const isSupported = isPawnSupported(position, mostAdvanced, turn);

  return { hasPassedPawn: true, isSupported };
}

function analyzeBlockade(position: Chess): {
  applied: boolean;
  violated: boolean;
  description: string;
} {
  const turn = position.turn();
  const opponentColor = turn === "w" ? "b" : "w";
  const opponentPassedPawns = findPassedPawns(position, opponentColor);

  if (opponentPassedPawns.length === 0) {
    return {
      applied: false,
      violated: false,
      description: "No opponent passed pawns to blockade",
    };
  }

  let blockedPawns = 0;
  let unblockedDangerous = 0;

  for (const pawnSquare of opponentPassedPawns) {
    const file = pawnSquare[0];
    const rank = parseInt(pawnSquare[1]);
    const nextRank = opponentColor === "w" ? rank + 1 : rank - 1;
    const blockadeSquare = file + nextRank;

    const piece = position.get(blockadeSquare as any);
    if (piece && piece.color === turn) {
      blockedPawns++;
    } else {
      // Check if this is a dangerous passed pawn (advanced)
      const isDangerous = opponentColor === "w" ? rank >= 5 : rank <= 4;
      if (isDangerous) {
        unblockedDangerous++;
      }
    }
  }

  return {
    applied: blockedPawns > 0,
    violated: unblockedDangerous > 0,
    description:
      unblockedDangerous > 0
        ? `${unblockedDangerous} dangerous opponent passed pawns not blockaded`
        : `${blockedPawns}/${opponentPassedPawns.length} opponent passed pawns blockaded`,
  };
}

function analyzePawnMajorities(position: Chess): { applied: boolean } {
  const turn = position.turn();
  const pawnCounts = countPawnsByWing(position);

  // Check for pawn majority on either wing
  const hasKingsideMajority =
    turn === "w"
      ? pawnCounts.white.kingside > pawnCounts.black.kingside
      : pawnCounts.black.kingside > pawnCounts.white.kingside;

  const hasQueensideMajority =
    turn === "w"
      ? pawnCounts.white.queenside > pawnCounts.black.queenside
      : pawnCounts.black.queenside > pawnCounts.white.queenside;

  // Check if we're advancing the majority
  const isAdvancingMajority = checkPawnMajorityAdvancement(
    position,
    turn,
    hasKingsideMajority,
    hasQueensideMajority
  );

  return {
    applied:
      (hasKingsideMajority || hasQueensideMajority) && isAdvancingMajority,
  };
}

function analyzeSimplification(
  position: Chess,
  evaluation: PositionEval
): { shouldSimplify: boolean; isSimplifying: boolean } {
  const pieces = position
    .board()
    .flat()
    .filter((p) => p !== null);
  const turn = position.turn();

  // Check if we have material advantage
  const materialBalance = calculateMaterialBalance(position, turn);
  const shouldSimplify = materialBalance > 0;

  // Check if position is simplifying (fewer pieces than typical middlegame)
  const pieceCount = pieces.length;
  const isSimplifying = pieceCount <= 16; // Arbitrary threshold

  return { shouldSimplify, isSimplifying };
}

// Helper functions

function findKingSquare(position: Chess, color: "w" | "b"): string | null {
  const board = position.board();

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type === "k" && piece.color === color) {
        return String.fromCharCode(97 + file) + (rank + 1);
      }
    }
  }

  return null;
}

function checkKingActivity(
  position: Chess,
  kingSquare: string,
  color: "w" | "b"
): boolean {
  // Simplified check: king is active if it's near pawns or enemy pieces
  const kingFile = kingSquare.charCodeAt(0) - 97;
  const kingRank = parseInt(kingSquare[1]) - 1;

  // Check adjacent squares for pawns or enemy pieces
  for (let fileOffset = -1; fileOffset <= 1; fileOffset++) {
    for (let rankOffset = -1; rankOffset <= 1; rankOffset++) {
      if (fileOffset === 0 && rankOffset === 0) continue;

      const checkFile = kingFile + fileOffset;
      const checkRank = kingRank + rankOffset;

      if (checkFile >= 0 && checkFile < 8 && checkRank >= 0 && checkRank < 8) {
        const checkSquare =
          String.fromCharCode(97 + checkFile) + (checkRank + 1);
        const piece = position.get(checkSquare as any);

        if (piece && (piece.type === "p" || piece.color !== color)) {
          return true;
        }
      }
    }
  }

  return false;
}

function findPassedPawns(position: Chess, color: "w" | "b"): string[] {
  const passedPawns: string[] = [];
  const board = position.board();

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type === "p" && piece.color === color) {
        const square = String.fromCharCode(97 + file) + (rank + 1);
        if (isPawnPassed(position, square, color)) {
          passedPawns.push(square);
        }
      }
    }
  }

  return passedPawns;
}

function isPawnPassed(
  position: Chess,
  pawnSquare: string,
  color: "w" | "b"
): boolean {
  const file = pawnSquare.charCodeAt(0) - 97;
  const rank = parseInt(pawnSquare[1]) - 1;
  const opponentColor = color === "w" ? "b" : "w";

  // Check files: same file and adjacent files
  for (const fileOffset of [-1, 0, 1]) {
    const checkFile = file + fileOffset;
    if (checkFile < 0 || checkFile >= 8) continue;

    // Check ranks ahead of the pawn
    const startRank = color === "w" ? rank + 1 : rank - 1;
    const endRank = color === "w" ? 7 : 0;
    const direction = color === "w" ? 1 : -1;

    for (
      let checkRank = startRank;
      color === "w" ? checkRank <= endRank : checkRank >= endRank;
      checkRank += direction
    ) {
      const checkSquare = String.fromCharCode(97 + checkFile) + (checkRank + 1);
      const piece = position.get(checkSquare as any);

      if (piece && piece.type === "p" && piece.color === opponentColor) {
        return false; // Opponent pawn blocks the path
      }
    }
  }

  return true;
}

function isPawnSupported(
  position: Chess,
  pawnSquare: string,
  color: "w" | "b"
): boolean {
  const file = pawnSquare.charCodeAt(0) - 97;
  const rank = parseInt(pawnSquare[1]) - 1;

  // Check for supporting pieces (king, rook, other pawns)
  const supportingSquares = [
    // Behind the pawn
    String.fromCharCode(97 + file) + (color === "w" ? rank : rank + 2),
    // Diagonal support from other pawns
    String.fromCharCode(97 + file - 1) + (color === "w" ? rank : rank + 2),
    String.fromCharCode(97 + file + 1) + (color === "w" ? rank : rank + 2),
  ];

  for (const square of supportingSquares) {
    if (
      square[0] < "a" ||
      square[0] > "h" ||
      square[1] < "1" ||
      square[1] > "8"
    )
      continue;

    const piece = position.get(square as any);
    if (
      piece &&
      piece.color === color &&
      (piece.type === "k" || piece.type === "r" || piece.type === "p")
    ) {
      return true;
    }
  }

  return false;
}

function countPawnsByWing(position: Chess): {
  white: { kingside: number; queenside: number };
  black: { kingside: number; queenside: number };
} {
  const counts = {
    white: { kingside: 0, queenside: 0 },
    black: { kingside: 0, queenside: 0 },
  };

  const board = position.board();

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type === "p") {
        const wing = file >= 4 ? "kingside" : "queenside";
        const colorKey = piece.color === "w" ? "white" : "black";
        counts[colorKey][wing]++;
      }
    }
  }

  return counts;
}

function checkPawnMajorityAdvancement(
  position: Chess,
  color: "w" | "b",
  hasKingsideMajority: boolean,
  hasQueensideMajority: boolean
): boolean {
  // Simplified: check if most advanced pawn on majority side is reasonably advanced
  if (!hasKingsideMajority && !hasQueensideMajority) return false;

  const board = position.board();
  let mostAdvancedRank = color === "w" ? 1 : 8;

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type === "p" && piece.color === color) {
        const wing = file >= 4 ? "kingside" : "queenside";

        if (
          (hasKingsideMajority && wing === "kingside") ||
          (hasQueensideMajority && wing === "queenside")
        ) {
          const actualRank = rank + 1;
          if (
            color === "w"
              ? actualRank > mostAdvancedRank
              : actualRank < mostAdvancedRank
          ) {
            mostAdvancedRank = actualRank;
          }
        }
      }
    }
  }

  // Consider advanced if beyond 4th rank for white, before 5th rank for black
  return color === "w" ? mostAdvancedRank >= 4 : mostAdvancedRank <= 5;
}

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
