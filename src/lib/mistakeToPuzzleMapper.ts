/**
 * Mistake-to-Puzzle Mapper
 *
 * Core intelligence for the adaptive puzzle generation system.
 * Given a specific mistake in a game, finds targeted puzzles that address
 * the exact tactical/positional concept the player missed.
 *
 * This is the key differentiator: instead of generic "fork" puzzles,
 * we find puzzles with similar board geometry, piece configuration,
 * and tactical motif.
 */

import { Chess } from "chess.js";

export interface MistakeContext {
  fen: string;                    // Position where mistake occurred
  movePlayed: string;             // The bad move (SAN)
  correctMove: string;            // Best move (SAN)
  evalBefore: number;             // Eval in centipawns
  evalAfter: number;              // Eval after mistake
  tacticalMotifs: string[];       // From detectTacticalMotifs()
  piecesInvolved: string[];       // e.g., ["knight", "rook", "king"]
  keySquares: string[];           // Critical squares (e.g., ["e5", "f7", "g8"])
}

export interface PuzzleMatchCriteria {
  themes: string[];               // Required tactical themes
  specificThemes: string[];       // More granular themes for better matches
  ratingRange: { min: number; max: number };
  positionalSimilarity: {
    pieceTypes: string[];         // Must involve same piece types
    targetSquares?: string[];     // Prefer puzzles with action on similar squares
  };
  limit: number;
}

/**
 * Analyzes a mistake and generates puzzle matching criteria.
 *
 * This function extracts the "essence" of what the player missed:
 * - What tactic did they overlook? (fork, pin, discovered attack, etc.)
 * - Which pieces were involved?
 * - What was the geometric pattern? (knight from e5 to f7, etc.)
 * - How difficult should the practice be? (based on eval drop)
 */
export function extractPuzzleMatchingCriteria(
  mistake: MistakeContext,
  userRating: number = 1500
): PuzzleMatchCriteria {
  const evalDrop = Math.abs(mistake.evalAfter - mistake.evalBefore);

  // Determine difficulty based on eval drop
  // Larger mistakes = practice easier puzzles to build fundamentals
  let ratingAdjustment = 0;
  if (evalDrop > 500) {
    // Blunder (5+ pawns) → practice at -200 rating
    ratingAdjustment = -200;
  } else if (evalDrop > 300) {
    // Mistake (3-5 pawns) → practice at -100 rating
    ratingAdjustment = -100;
  } else {
    // Inaccuracy → practice at same level
    ratingAdjustment = 0;
  }

  const targetRating = userRating + ratingAdjustment;

  // Extract specific tactical themes
  const themes = [...mistake.tacticalMotifs];
  const specificThemes: string[] = [];

  // Build specific theme combinations
  // Example: ["fork", "knight"] → look for "knight-fork" or "knight" + "fork"
  if (mistake.piecesInvolved.includes("knight") && themes.includes("FORK")) {
    specificThemes.push("knight-fork");
  }
  if (mistake.piecesInvolved.includes("bishop") && themes.includes("PIN")) {
    specificThemes.push("bishop-pin");
  }
  if (themes.includes("DISCOVERED CHECK") || themes.includes("DISCOVERED ATTACK")) {
    specificThemes.push("discovered-attack");
  }
  if (themes.includes("BACK RANK")) {
    specificThemes.push("back-rank-mate", "back-rank");
  }
  if (themes.includes("SACRIFICE")) {
    specificThemes.push("sacrifice");
  }

  // Extract piece types for positional matching
  const pieceTypes = mistake.piecesInvolved.filter(p => p !== "pawn");

  return {
    themes: themes.map(t => t.toLowerCase().replace(/ /g, "-")),
    specificThemes,
    ratingRange: {
      min: Math.max(800, targetRating - 300),
      max: Math.min(3000, targetRating + 200),
    },
    positionalSimilarity: {
      pieceTypes,
      targetSquares: mistake.keySquares,
    },
    limit: 5,
  };
}

/**
 * Analyzes the missed opportunity in a position to extract key squares and pieces.
 *
 * Compares what the player did vs. what they should have done to identify:
 * - Which pieces were critical
 * - What squares were important
 * - What tactical pattern was missed
 */
export function analyzeMissedOpportunity(
  fenBefore: string,
  movePlayed: string,
  correctMove: string
): { piecesInvolved: string[]; keySquares: string[] } {
  const pieces: Set<string> = new Set();
  const squares: Set<string> = new Set();

  try {
    const game = new Chess(fenBefore);

    // Parse the correct move to see what pieces/squares were involved
    const correctMoveObj = game.move(correctMove);
    if (correctMoveObj) {
      const pieceNames: Record<string, string> = {
        p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king"
      };

      pieces.add(pieceNames[correctMoveObj.piece] || correctMoveObj.piece);
      squares.add(correctMoveObj.from);
      squares.add(correctMoveObj.to);

      // If it's a capture, the captured piece is also involved
      if (correctMoveObj.captured) {
        pieces.add(pieceNames[correctMoveObj.captured] || correctMoveObj.captured);
      }

      // Check if the move gives check - king is involved
      if (game.inCheck()) {
        pieces.add("king");
        // Find king square
        const board = game.board();
        for (const row of board) {
          for (const sq of row) {
            if (sq && sq.type === "k" && sq.color !== correctMoveObj.color) {
              squares.add(sq.square);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Error analyzing missed opportunity:", error);
  }

  return {
    piecesInvolved: Array.from(pieces),
    keySquares: Array.from(squares),
  };
}

/**
 * Builds a Neo4j Cypher query to find puzzles matching the criteria.
 *
 * Query strategy:
 * 1. Start with specific themes (highest priority)
 * 2. Fall back to general themes
 * 3. Filter by rating range
 * 4. Prioritize puzzles involving same piece types
 * 5. Return diversified set (not all the same sub-theme)
 */
export function buildPuzzleMatchQuery(criteria: PuzzleMatchCriteria): {
  query: string;
  params: Record<string, any>;
} {
  const query = `
    // Try specific themes first
    OPTIONAL MATCH (p1:Puzzle)-[:HAS_THEME]->(t1:Theme)
    WHERE t1.id IN $specificThemes
      AND p.rating >= $minRating
      AND p.rating <= $maxRating
    WITH collect(DISTINCT p1) AS specificMatches

    // Fall back to general themes
    MATCH (p:Puzzle)-[:HAS_THEME]->(t:Theme)
    WHERE (t.id IN $themes OR t.name IN $themes)
      AND p.rating >= $minRating
      AND p.rating <= $maxRating
      AND NOT p.puzzleId IN $excludeIds

    // Prefer puzzles with specific themes
    WITH p,
         CASE WHEN p IN specificMatches THEN 2.0 ELSE 1.0 END AS specificityScore,
         [(p)-[:HAS_THEME]->(theme:Theme) | theme.name] AS allThemes

    // Diversification: prefer puzzles with different theme combinations
    WITH p, specificityScore, allThemes,
         rand() AS randomizer

    ORDER BY specificityScore DESC, p.popularity DESC, randomizer
    LIMIT $limit

    RETURN p.puzzleId AS puzzleId,
           p.fen AS fen,
           p.moves AS moves,
           p.rating AS rating,
           allThemes AS themes,
           p.popularity AS popularity,
           p.nbPlays AS nbPlays,
           specificityScore
  `;

  return {
    query,
    params: {
      themes: criteria.themes,
      specificThemes: criteria.specificThemes,
      minRating: criteria.ratingRange.min,
      maxRating: criteria.ratingRange.max,
      excludeIds: [],
      limit: criteria.limit,
    },
  };
}
