import { NextRequest, NextResponse } from "next/server";
import { executeRead, isNeo4jConfigured } from "@/lib/neo4j";
import {
  extractPuzzleMatchingCriteria,
  analyzeMissedOpportunity,
  type MistakeContext,
} from "@/lib/mistakeToPuzzleMapper";
import neo4j from "neo4j-driver";
import { z } from "zod";

/**
 * Mistake-to-Puzzle API
 *
 * Given a specific mistake in a game, returns targeted puzzles that address
 * the exact tactical concept the player missed.
 *
 * This is the core of adaptive learning: instead of generic "practice forks",
 * we find puzzles with similar board geometry and tactical motifs.
 *
 * Request body:
 * {
 *   fen: string,              // Position where mistake occurred
 *   movePlayed: string,        // The bad move (SAN)
 *   correctMove: string,       // Best move (SAN)
 *   evalBefore: number,        // Eval before mistake (centipawns)
 *   evalAfter: number,         // Eval after mistake
 *   tacticalMotifs: string[],  // From detectTacticalMotifs()
 *   userRating?: number        // For difficulty calibration
 * }
 */

const mistakePuzzleSchema = z.object({
  fen: z.string().min(10),
  movePlayed: z.string().min(2),
  correctMove: z.string().min(2),
  evalBefore: z.number(),
  evalAfter: z.number(),
  tacticalMotifs: z.array(z.string()),
  userRating: z.number().int().min(800).max(3000).optional().default(1500),
});

export async function POST(request: NextRequest) {
  try {
    if (!isNeo4jConfigured()) {
      return NextResponse.json(
        {
          error: "Puzzle system not configured",
          message: "Neo4j database is not set up.",
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const parsed = mistakePuzzleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const {
      fen,
      movePlayed,
      correctMove,
      evalBefore,
      evalAfter,
      tacticalMotifs,
      userRating,
    } = parsed.data;

    // Analyze what the player missed
    const { piecesInvolved, keySquares } = analyzeMissedOpportunity(
      fen,
      movePlayed,
      correctMove
    );

    // Build mistake context
    const mistakeContext: MistakeContext = {
      fen,
      movePlayed,
      correctMove,
      evalBefore,
      evalAfter,
      tacticalMotifs,
      piecesInvolved,
      keySquares,
    };

    // Extract puzzle matching criteria
    const criteria = extractPuzzleMatchingCriteria(
      mistakeContext,
      userRating
    );

    // Query Neo4j for matching puzzles
    const query = `
      // Match puzzles with relevant themes (both specific and general)
      MATCH (p:Puzzle)-[:HAS_THEME]->(t:Theme)
      WHERE (t.id IN $specificThemes OR t.name IN $specificThemes OR
             t.id IN $themes OR t.name IN $themes)
        AND p.rating >= $minRating
        AND p.rating <= $maxRating

      WITH DISTINCT p

      // Get all themes for each puzzle
      MATCH (p)-[:HAS_THEME]->(theme:Theme)
      WITH p, collect(theme.name) AS allThemes

      // Calculate specificity score: higher for specific theme matches
      WITH p, allThemes,
           CASE
             WHEN size([t IN allThemes WHERE t IN $specificThemes]) > 0 THEN 2.0
             ELSE 1.0
           END AS specificityScore,
           rand() AS randomizer

      ORDER BY specificityScore DESC, p.popularity DESC, randomizer
      LIMIT $limit

      RETURN p.puzzleId AS puzzleId,
             p.fen AS fen,
             p.moves AS moves,
             p.rating AS rating,
             allThemes AS themes,
             p.popularity AS popularity,
             p.nbPlays AS nbPlays
    `;

    const puzzles = await executeRead<{
      puzzleId: string;
      fen: string;
      moves: string;
      rating: number;
      themes: string[];
      popularity: number;
      nbPlays: number;
    }>(query, {
      themes: criteria.themes,
      specificThemes: criteria.specificThemes,
      minRating: criteria.ratingRange.min,
      maxRating: criteria.ratingRange.max,
      limit: neo4j.int(criteria.limit),
    });

    // Build explanation of why these puzzles were chosen
    const explanation = buildPuzzleExplanation(
      mistakeContext,
      criteria,
      puzzles.length
    );

    return NextResponse.json({
      puzzles,
      explanation,
      matchCriteria: {
        themes: criteria.themes,
        specificThemes: criteria.specificThemes,
        ratingRange: criteria.ratingRange,
        piecesInvolved: mistakeContext.piecesInvolved,
        keySquares: mistakeContext.keySquares,
      },
      mistakeSeverity: categorizeMistake(evalBefore, evalAfter),
    });
  } catch (error: any) {
    console.error("Mistake-puzzle API error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate puzzle recommendations",
        message: error.message || "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}

/**
 * Generate human-readable explanation of puzzle recommendations.
 */
function buildPuzzleExplanation(
  mistake: MistakeContext,
  criteria: any,
  puzzleCount: number
): string {
  if (puzzleCount === 0) {
    return "No matching puzzles found. Try our general practice section.";
  }

  const evalDrop = Math.abs(mistake.evalAfter - mistake.evalBefore);
  const severity = evalDrop > 500 ? "blunder" : evalDrop > 300 ? "mistake" : "inaccuracy";

  const tacticsDesc =
    mistake.tacticalMotifs.length > 0
      ? `involving ${mistake.tacticalMotifs.join(" and ").toLowerCase()}`
      : "in similar positions";

  const piecesDesc =
    mistake.piecesInvolved.length > 0
      ? ` with ${mistake.piecesInvolved.join(", ")}`
      : "";

  return `You ${severity === "blunder" ? "missed a critical tactic" : `made a ${severity}`} ${tacticsDesc}${piecesDesc}. These ${puzzleCount} puzzles will help you recognize this pattern in future games.`;
}

/**
 * Categorize mistake severity for UI display.
 */
function categorizeMistake(
  evalBefore: number,
  evalAfter: number
): "blunder" | "mistake" | "inaccuracy" {
  const drop = Math.abs(evalAfter - evalBefore);
  if (drop > 500) return "blunder";
  if (drop > 300) return "mistake";
  return "inaccuracy";
}

/**
 * Health check
 */
export async function GET() {
  return NextResponse.json({
    name: "Mistake-to-Puzzle Mapper API",
    description:
      "Generates targeted puzzle recommendations based on specific mistakes in games",
    status: isNeo4jConfigured() ? "operational" : "not_configured",
  });
}
