import { NextRequest, NextResponse } from "next/server";
import { executeRead, isNeo4jConfigured } from "@/lib/neo4j";
import neo4j from "neo4j-driver";
import { z } from "zod";
import {
  logger,
  withRequestContext,
  extractRequestId,
} from "@/lib/logging";

// ── Request Schema ────────────────────────────────────────────────────────────

const adaptivePuzzlesSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  themes: z.array(z.string()).optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  limit: z.number().int().positive().max(50).default(20),
  excludePuzzleIds: z.array(z.string()).optional(),
});

// ── Neo4j Query Types ─────────────────────────────────────────────────────────

interface PuzzleRecord {
  puzzleId: string;
  fen: string;
  moves: string;
  rating: number;
  themes: string[];
  popularity: number;
  nbPlays: number;
}

interface AdaptivePuzzleResponse {
  puzzles: PuzzleRecord[];
  recommendationReason: string;
  struggledThemes: string[];
  fallbackUsed: boolean;
}

// ── Adaptive Puzzle Recommendation Query ─────────────────────────────────────

/**
 * Ryan's adaptive puzzle query from chess-graph:
 *
 * 1. Find themes the user struggled with (STRUGGLED_WITH relationship)
 * 2. Find puzzles with those themes
 * 3. Exclude puzzles already attempted
 * 4. Filter by difficulty if specified
 * 5. Return top N puzzles ordered by rating
 */
async function getAdaptivePuzzles(params: {
  userId: string;
  themes?: string[];
  difficulty?: "beginner" | "intermediate" | "advanced";
  limit: number;
  excludePuzzleIds?: string[];
}): Promise<AdaptivePuzzleResponse> {
  const { userId, themes, difficulty, limit, excludePuzzleIds = [] } = params;

  // ── Query 1: Find themes user struggled with ──
  const struggledThemesQuery = `
    MATCH (u:User {id: $userId})-[:STRUGGLED_WITH]->(t:Theme)
    RETURN t.name AS theme, t.id AS themeId
    ORDER BY t.name
  `;

  const struggledThemesResult = await executeRead<{ theme: string; themeId: string }>(
    struggledThemesQuery,
    { userId }
  );

  const struggledThemes = struggledThemesResult.map((r) => r.theme);
  const struggledThemeIds = struggledThemesResult.map((r) => r.themeId);
  // Match by both name and id so callers can use either
  const targetThemes = themes && themes.length > 0 ? themes : [...struggledThemes, ...struggledThemeIds];

  if (targetThemes.length === 0) {
    // No themes specified and no struggled themes found — return popular puzzles
    return await getFallbackPuzzles(limit, excludePuzzleIds);
  }

  // ── Query 2: Find adaptive puzzles ──
  const difficultyFilter = difficulty
    ? `AND p.rating >= $minRating AND p.rating <= $maxRating`
    : "";

  const adaptiveQuery = `
    MATCH (p:Puzzle)-[:HAS_THEME]->(t:Theme)
    WHERE (t.name IN $themes OR t.id IN $themes)
      AND NOT p.puzzleId IN $excludeIds
      ${difficultyFilter}
      AND NOT EXISTS((:User {id: $userId})-[:ATTEMPTED]->(p))
    WITH DISTINCT p
    RETURN p.puzzleId AS puzzleId,
           p.fen AS fen,
           p.moves AS moves,
           p.rating AS rating,
           [(p)-[:HAS_THEME]->(theme:Theme) | theme.name] AS themes,
           p.popularity AS popularity,
           p.nbPlays AS nbPlays
    ORDER BY rand()
    LIMIT $limit
  `;

  const ratingRanges = {
    beginner: { min: 0, max: 1500 },
    intermediate: { min: 1500, max: 2000 },
    advanced: { min: 2000, max: 3000 },
  };

  const queryParams: Record<string, any> = {
    userId,
    themes: targetThemes,
    excludeIds: excludePuzzleIds,
    limit: neo4j.int(limit),
  };

  if (difficulty) {
    queryParams.minRating = Math.floor(ratingRanges[difficulty].min);
    queryParams.maxRating = Math.floor(ratingRanges[difficulty].max);
  }

  const puzzles = await executeRead<PuzzleRecord>(adaptiveQuery, queryParams);

  return {
    puzzles,
    recommendationReason:
      themes && themes.length > 0
        ? `Puzzles targeting themes: ${themes.join(", ")}`
        : `Adaptive puzzles targeting your struggled themes: ${struggledThemes.join(", ")}`,
    struggledThemes,
    fallbackUsed: false,
  };
}

/**
 * Fallback: Return popular puzzles when no themes are available.
 */
async function getFallbackPuzzles(
  limit: number,
  excludePuzzleIds: string[]
): Promise<AdaptivePuzzleResponse> {
  const fallbackQuery = `
    MATCH (p:Puzzle)
    WHERE NOT p.puzzleId IN $excludeIds
    RETURN p.puzzleId AS puzzleId,
           p.fen AS fen,
           p.moves AS moves,
           p.rating AS rating,
           [(p)-[:HAS_THEME]->(t:Theme) | t.name] AS themes,
           p.popularity AS popularity,
           p.nbPlays AS nbPlays
    ORDER BY p.popularity DESC, p.rating DESC
    LIMIT $limit
  `;

  const puzzles = await executeRead<PuzzleRecord>(fallbackQuery, {
    excludeIds: excludePuzzleIds,
    limit: neo4j.int(limit),
  });

  return {
    puzzles,
    recommendationReason: "Popular puzzles (no struggled themes found yet)",
    struggledThemes: [],
    fallbackUsed: true,
  };
}

// ── API Route Handler ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const requestId = extractRequestId(request.headers);

  return withRequestContext(requestId, async () => {
    try {
      // Check if Neo4j is configured
      if (!isNeo4jConfigured()) {
        logger.warn("Neo4j not configured, adaptive puzzles unavailable");
        return NextResponse.json(
          {
            error: "Adaptive puzzle system not configured",
            message:
              "Neo4j database is not set up. Falling back to regular puzzle selection.",
          },
          { status: 503 }
        );
      }

      const body = await request.json();
      const parsed = adaptivePuzzlesSchema.safeParse(body);

      if (!parsed.success) {
        logger.warn("Invalid adaptive puzzles request", {
          errors: parsed.error.issues,
        });
        return NextResponse.json(
          {
            error: "Invalid request parameters",
            details: parsed.error.issues,
          },
          { status: 400 }
        );
      }

      const { userId, themes, difficulty, limit, excludePuzzleIds } =
        parsed.data;

      logger.info("Fetching adaptive puzzles", {
        userId,
        themes,
        difficulty,
        limit,
      });

      const result = await getAdaptivePuzzles({
        userId,
        themes,
        difficulty,
        limit,
        excludePuzzleIds,
      });

      logger.info("Adaptive puzzles retrieved", {
        userId,
        count: result.puzzles.length,
        fallbackUsed: result.fallbackUsed,
      });

      return NextResponse.json(result);
    } catch (error: any) {
      logger.error("Adaptive puzzles error", { error });
      return NextResponse.json(
        {
          error: "Failed to fetch adaptive puzzles",
          message: error.message || "An unexpected error occurred",
        },
        { status: 500 }
      );
    }
  });
}

/**
 * Health check endpoint for Neo4j connection.
 */
export async function GET() {
  try {
    const configured = isNeo4jConfigured();
    if (!configured) {
      return NextResponse.json(
        {
          status: "not_configured",
          message: "Neo4j environment variables not set",
        },
        { status: 503 }
      );
    }

    // Could add verifyConnection() here if needed
    return NextResponse.json({
      status: "configured",
      message: "Adaptive puzzle system is available",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "error",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
