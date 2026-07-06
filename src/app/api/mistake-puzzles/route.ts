import { NextRequest, NextResponse } from "next/server";
import { isNeo4jConfigured } from "@/lib/neo4j";
import { findMistakePuzzles } from "@/lib/mistakePuzzles";
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

    const result = await findMistakePuzzles(parsed.data);
    if (result.notConfigured) {
      return NextResponse.json(
        {
          error: "Puzzle system not configured",
          message: "Neo4j database is not set up.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(result);
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
