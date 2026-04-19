/**
 * FEN Similarity Detection using Feature Vectors
 *
 * Extracts structural features from FEN positions to find visually/tactically
 * similar boards. Uses ~50-dim feature vector for fast cosine similarity.
 *
 * Use cases:
 * - Show 5-8 similar positions when user practices a tactic
 * - Cluster puzzles by position structure (not just theme tags)
 * - Reinforce pattern recognition across slightly different boards
 */

import { Chess } from "chess.js";

export interface FENFeatures {
  // Material balance (10 dims: Q,R,B,N,P for each side)
  materialWhite: {
    queens: number;
    rooks: number;
    bishops: number;
    knights: number;
    pawns: number;
  };
  materialBlack: {
    queens: number;
    rooks: number;
    bishops: number;
    knights: number;
    pawns: number;
  };

  // Pawn structure (16 dims: 8 files × 2 sides)
  pawnStructure: {
    whitePawnsPerFile: number[]; // [0-8] for files a-h
    blackPawnsPerFile: number[];
  };

  // Pawn weaknesses (8 dims)
  pawnWeaknesses: {
    whiteIsolated: number;
    whiteDoubled: number;
    whiteBackward: number;
    whitePassed: number;
    blackIsolated: number;
    blackDoubled: number;
    blackBackward: number;
    blackPassed: number;
  };

  // King safety (4 dims)
  kingSafety: {
    whiteKingFile: number; // 0-7 for a-h
    whiteKingRank: number; // 0-7 for 1-8
    blackKingFile: number;
    blackKingRank: number;
  };

  // Piece centralization (4 dims: avg distance from center for each side)
  centralization: {
    whiteAvgDistanceFromCenter: number;
    blackAvgDistanceFromCenter: number;
    whitePiecesInCenter: number; // count in d4,d5,e4,e5
    blackPiecesInCenter: number;
  };

  // Game phase (3 dims)
  phase: {
    totalMaterial: number; // 0-78 (Q=9, R=5, B=3, N=3, P=1)
    pieceCount: number; // total pieces excluding pawns
    isEndgame: boolean; // true if totalMaterial < 20
  };

  // Castling/special (4 dims)
  special: {
    whiteCanCastle: number; // 0-2 (neither/one/both)
    blackCanCastle: number;
    hasEnPassant: boolean;
    turn: number; // 0=white, 1=black
  };
}

/**
 * Extract all structural features from a FEN position.
 */
export function extractFENFeatures(fen: string): FENFeatures {
  const chess = new Chess(fen);
  const board = chess.board();

  // Initialize features
  const features: FENFeatures = {
    materialWhite: { queens: 0, rooks: 0, bishops: 0, knights: 0, pawns: 0 },
    materialBlack: { queens: 0, rooks: 0, bishops: 0, knights: 0, pawns: 0 },
    pawnStructure: {
      whitePawnsPerFile: [0, 0, 0, 0, 0, 0, 0, 0],
      blackPawnsPerFile: [0, 0, 0, 0, 0, 0, 0, 0],
    },
    pawnWeaknesses: {
      whiteIsolated: 0,
      whiteDoubled: 0,
      whiteBackward: 0,
      whitePassed: 0,
      blackIsolated: 0,
      blackDoubled: 0,
      blackBackward: 0,
      blackPassed: 0,
    },
    kingSafety: { whiteKingFile: 0, whiteKingRank: 0, blackKingFile: 0, blackKingRank: 0 },
    centralization: {
      whiteAvgDistanceFromCenter: 0,
      blackAvgDistanceFromCenter: 0,
      whitePiecesInCenter: 0,
      blackPiecesInCenter: 0,
    },
    phase: { totalMaterial: 0, pieceCount: 0, isEndgame: false },
    special: { whiteCanCastle: 0, blackCanCastle: 0, hasEnPassant: false, turn: chess.turn() === "w" ? 0 : 1 },
  };

  let whiteDistanceSum = 0,
    blackDistanceSum = 0,
    whitePieceCount = 0,
    blackPieceCount = 0;

  // Parse board
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (!piece) continue;

      const { type, color } = piece;
      const distanceFromCenter = Math.abs(file - 3.5) + Math.abs(rank - 3.5); // Manhattan distance from d4.5/e4.5
      const isCenter = (rank === 3 || rank === 4) && (file === 3 || file === 4); // d4,d5,e4,e5

      // Material count
      if (color === "w") {
        if (type === "q") features.materialWhite.queens++;
        else if (type === "r") features.materialWhite.rooks++;
        else if (type === "b") features.materialWhite.bishops++;
        else if (type === "n") features.materialWhite.knights++;
        else if (type === "p") {
          features.materialWhite.pawns++;
          features.pawnStructure.whitePawnsPerFile[file]++;
        } else if (type === "k") {
          features.kingSafety.whiteKingFile = file;
          features.kingSafety.whiteKingRank = rank;
        }

        if (type !== "p" && type !== "k") whitePieceCount++;
        if (type !== "k") {
          whiteDistanceSum += distanceFromCenter;
          if (isCenter) features.centralization.whitePiecesInCenter++;
        }
      } else {
        if (type === "q") features.materialBlack.queens++;
        else if (type === "r") features.materialBlack.rooks++;
        else if (type === "b") features.materialBlack.bishops++;
        else if (type === "n") features.materialBlack.knights++;
        else if (type === "p") {
          features.materialBlack.pawns++;
          features.pawnStructure.blackPawnsPerFile[file]++;
        } else if (type === "k") {
          features.kingSafety.blackKingFile = file;
          features.kingSafety.blackKingRank = rank;
        }

        if (type !== "p" && type !== "k") blackPieceCount++;
        if (type !== "k") {
          blackDistanceSum += distanceFromCenter;
          if (isCenter) features.centralization.blackPiecesInCenter++;
        }
      }
    }
  }

  // Centralization averages
  const whiteTotalPieces = whitePieceCount + features.materialWhite.pawns;
  const blackTotalPieces = blackPieceCount + features.materialBlack.pawns;
  features.centralization.whiteAvgDistanceFromCenter = whiteTotalPieces > 0 ? whiteDistanceSum / whiteTotalPieces : 0;
  features.centralization.blackAvgDistanceFromCenter = blackTotalPieces > 0 ? blackDistanceSum / blackTotalPieces : 0;

  // Pawn weaknesses (simplified heuristics)
  for (let file = 0; file < 8; file++) {
    const whiteCount = features.pawnStructure.whitePawnsPerFile[file];
    const blackCount = features.pawnStructure.blackPawnsPerFile[file];

    // Doubled pawns
    if (whiteCount > 1) features.pawnWeaknesses.whiteDoubled++;
    if (blackCount > 1) features.pawnWeaknesses.blackDoubled++;

    // Isolated pawns (no friendly pawns on adjacent files)
    const leftFile = file > 0 ? features.pawnStructure.whitePawnsPerFile[file - 1] : 0;
    const rightFile = file < 7 ? features.pawnStructure.whitePawnsPerFile[file + 1] : 0;
    if (whiteCount > 0 && leftFile === 0 && rightFile === 0) features.pawnWeaknesses.whiteIsolated++;

    const blackLeftFile = file > 0 ? features.pawnStructure.blackPawnsPerFile[file - 1] : 0;
    const blackRightFile = file < 7 ? features.pawnStructure.blackPawnsPerFile[file + 1] : 0;
    if (blackCount > 0 && blackLeftFile === 0 && blackRightFile === 0) features.pawnWeaknesses.blackIsolated++;

    // Passed pawns (very simplified: no enemy pawns on this file or adjacent files ahead)
    // Real detection requires rank-by-rank checking - this is a proxy
    if (whiteCount > 0 && blackCount === 0 && blackLeftFile === 0 && blackRightFile === 0) {
      features.pawnWeaknesses.whitePassed++;
    }
    if (blackCount > 0 && whiteCount === 0 && leftFile === 0 && rightFile === 0) {
      features.pawnWeaknesses.blackPassed++;
    }
  }

  // Game phase
  const pieceValues = { q: 9, r: 5, b: 3, n: 3, p: 1 };
  features.phase.totalMaterial =
    (features.materialWhite.queens + features.materialBlack.queens) * 9 +
    (features.materialWhite.rooks + features.materialBlack.rooks) * 5 +
    (features.materialWhite.bishops + features.materialBlack.bishops) * 3 +
    (features.materialWhite.knights + features.materialBlack.knights) * 3 +
    (features.materialWhite.pawns + features.materialBlack.pawns) * 1;
  features.phase.pieceCount = whitePieceCount + blackPieceCount;
  features.phase.isEndgame = features.phase.totalMaterial < 20;

  // Castling rights
  const castlingRights = fen.split(" ")[2];
  features.special.whiteCanCastle = (castlingRights.includes("K") ? 1 : 0) + (castlingRights.includes("Q") ? 1 : 0);
  features.special.blackCanCastle = (castlingRights.includes("k") ? 1 : 0) + (castlingRights.includes("q") ? 1 : 0);
  features.special.hasEnPassant = fen.split(" ")[3] !== "-";

  return features;
}

/**
 * Convert FENFeatures to a flat vector (50 dimensions) for similarity calculation.
 */
export function featuresToVector(features: FENFeatures): number[] {
  return [
    // Material (10)
    features.materialWhite.queens,
    features.materialWhite.rooks,
    features.materialWhite.bishops,
    features.materialWhite.knights,
    features.materialWhite.pawns,
    features.materialBlack.queens,
    features.materialBlack.rooks,
    features.materialBlack.bishops,
    features.materialBlack.knights,
    features.materialBlack.pawns,

    // Pawn structure (16)
    ...features.pawnStructure.whitePawnsPerFile,
    ...features.pawnStructure.blackPawnsPerFile,

    // Pawn weaknesses (8)
    features.pawnWeaknesses.whiteIsolated,
    features.pawnWeaknesses.whiteDoubled,
    features.pawnWeaknesses.whiteBackward,
    features.pawnWeaknesses.whitePassed,
    features.pawnWeaknesses.blackIsolated,
    features.pawnWeaknesses.blackDoubled,
    features.pawnWeaknesses.blackBackward,
    features.pawnWeaknesses.blackPassed,

    // King safety (4)
    features.kingSafety.whiteKingFile,
    features.kingSafety.whiteKingRank,
    features.kingSafety.blackKingFile,
    features.kingSafety.blackKingRank,

    // Centralization (4)
    features.centralization.whiteAvgDistanceFromCenter,
    features.centralization.blackAvgDistanceFromCenter,
    features.centralization.whitePiecesInCenter,
    features.centralization.blackPiecesInCenter,

    // Phase (3 - convert boolean to 0/1)
    features.phase.totalMaterial,
    features.phase.pieceCount,
    features.phase.isEndgame ? 1 : 0,

    // Special (4)
    features.special.whiteCanCastle,
    features.special.blackCanCastle,
    features.special.hasEnPassant ? 1 : 0,
    features.special.turn,
  ];
}

/**
 * Calculate cosine similarity between two feature vectors.
 * Returns a value between 0 (completely different) and 1 (identical).
 */
export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2[i] * vec2[i];
  }

  mag1 = Math.sqrt(mag1);
  mag2 = Math.sqrt(mag2);

  if (mag1 === 0 || mag2 === 0) return 0;

  return dotProduct / (mag1 * mag2);
}

/**
 * Find N most similar positions to a target FEN from a list of candidates.
 *
 * @param targetFen - The position to match
 * @param candidateFens - Array of [puzzleId, fen] pairs
 * @param topN - Number of results to return
 * @param minSimilarity - Minimum similarity threshold (0-1)
 * @returns Array of {puzzleId, fen, similarity} sorted by similarity DESC
 */
export function findSimilarPositions(
  targetFen: string,
  candidateFens: Array<{ puzzleId: string; fen: string }>,
  topN: number = 5,
  minSimilarity: number = 0.7
): Array<{ puzzleId: string; fen: string; similarity: number }> {
  const targetVector = featuresToVector(extractFENFeatures(targetFen));

  const similarities = candidateFens.map((candidate) => {
    const candidateVector = featuresToVector(extractFENFeatures(candidate.fen));
    const similarity = cosineSimilarity(targetVector, candidateVector);
    return {
      puzzleId: candidate.puzzleId,
      fen: candidate.fen,
      similarity,
    };
  });

  return similarities
    .filter((s) => s.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topN);
}

/**
 * Quick position similarity check (returns true if positions are structurally similar).
 * Faster than full vector calculation - use for filtering large datasets.
 */
export function isStructurallySimilar(fen1: string, fen2: string, threshold: number = 0.75): boolean {
  const f1 = extractFENFeatures(fen1);
  const f2 = extractFENFeatures(fen2);

  // Quick checks first (cheap comparisons)
  if (Math.abs(f1.phase.totalMaterial - f2.phase.totalMaterial) > 10) return false; // Very different material
  if (Math.abs(f1.materialWhite.pawns - f2.materialWhite.pawns) > 3) return false; // Very different pawn structure
  if (f1.phase.isEndgame !== f2.phase.isEndgame) return false; // Different phase

  // If quick checks pass, do full similarity
  const v1 = featuresToVector(f1);
  const v2 = featuresToVector(f2);
  return cosineSimilarity(v1, v2) >= threshold;
}
