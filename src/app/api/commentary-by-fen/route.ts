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

const commentaryByFenSchema = z.object({
  fen: z.string().min(10, "FEN string required"),
  limit: z.number().int().positive().max(20).default(5),
  minRating: z.number().int().positive().optional(),
});

// ── Neo4j Query Types ─────────────────────────────────────────────────────────

interface CommentaryRecord {
  id: string;
  text: string;
  move: string;
  moveNumber: number;
  playerRating: number;
  opening: string;
  gameId: string;
}

interface CommentaryResponse {
  fen: string;
  commentaries: CommentaryRecord[];
  totalFound: number;
  avgRating: number;
}

// ── Query Commentary for Position ─────────────────────────────────────────────

/**
 * Query expert commentary for a specific chess position.
 *
 * This implements Ryan's Position-as-hub model: given a FEN string,
 * find all Commentary nodes linked to that Position node.
 *
 * Useful for enriching AI coach responses with real expert analysis
 * from the Jhamtani dataset (298k+ move-commentary pairs).
 */
async function getCommentaryForFEN(params: {
  fen: string;
  limit: number;
  minRating?: number;
}): Promise<CommentaryResponse> {
  const { fen, limit, minRating } = params;

  // Normalize FEN (only position part, ignore move counters)
  const normalizedFen = fen.split(" ").slice(0, 4).join(" ");

  const ratingFilter = minRating ? `AND c.playerRating >= $minRating` : "";

  const query = `
    MATCH (pos:Position)<-[:FROM_POSITION]-(c:Commentary)
    WHERE pos.fen STARTS WITH $fen
      ${ratingFilter}
    RETURN c.id AS id,
           c.text AS text,
           c.move AS move,
           c.moveNumber AS moveNumber,
           c.playerRating AS playerRating,
           c.opening AS opening,
           c.gameId AS gameId
    ORDER BY c.playerRating DESC
    LIMIT $limit
  `;

  const results = await executeRead<CommentaryRecord>(query, {
    fen: normalizedFen,
    limit: neo4j.int(limit),
    minRating: neo4j.int(minRating || 0),
  });

  const totalFound = results.length;
  const avgRating =
    totalFound > 0
      ? results.reduce((sum, r) => sum + r.playerRating, 0) / totalFound
      : 0;

  return {
    fen: normalizedFen,
    commentaries: results,
    totalFound,
    avgRating: Math.round(avgRating),
  };
}

/**
 * Query commentary for similar positions (fallback if exact match not found).
 * Uses partial FEN matching on piece placement only.
 */
async function getCommentaryForSimilarPositions(params: {
  fen: string;
  limit: number;
}): Promise<CommentaryRecord[]> {
  const { fen, limit } = params;

  // Extract only piece placement (first part of FEN)
  const piecePlacement = fen.split(" ")[0];
  const pattern = piecePlacement.slice(0, 20); // Match first 20 chars

  const query = `
    MATCH (pos:Position)<-[:FROM_POSITION]-(c:Commentary)
    WHERE pos.fen STARTS WITH $pattern
    RETURN c.id AS id,
           c.text AS text,
           c.move AS move,
           c.moveNumber AS moveNumber,
           c.playerRating AS playerRating,
           c.opening AS opening,
           c.gameId AS gameId
    ORDER BY c.playerRating DESC
    LIMIT $limit
  `;

  return executeRead<CommentaryRecord>(query, { pattern, limit: neo4j.int(limit) });
}

// ── API Route Handler ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const requestId = extractRequestId(request.headers);

  return withRequestContext(requestId, async () => {
    try {
      // Check if Neo4j is configured
      if (!isNeo4jConfigured()) {
        logger.warn("Neo4j not configured, commentary unavailable");
        return NextResponse.json(
          {
            error: "Commentary system not configured",
            message: "Neo4j database is not set up.",
          },
          { status: 503 }
        );
      }

      const body = await request.json();
      const parsed = commentaryByFenSchema.safeParse(body);

      if (!parsed.success) {
        logger.warn("Invalid commentary request", {
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

      const { fen, limit, minRating } = parsed.data;

      logger.info("Fetching commentary for FEN", { fen, limit, minRating });

      const result = await getCommentaryForFEN({ fen, limit, minRating });

      // If no exact matches, try similar positions
      if (result.totalFound === 0) {
        logger.info("No exact matches, trying similar positions");
        const similar = await getCommentaryForSimilarPositions({ fen, limit });
        result.commentaries = similar;
        result.totalFound = similar.length;
      }

      logger.info("Commentary retrieved", {
        fen,
        count: result.totalFound,
        avgRating: result.avgRating,
      });

      return NextResponse.json(result);
    } catch (error: any) {
      logger.error("Commentary query error", { error });
      return NextResponse.json(
        {
          error: "Failed to fetch commentary",
          message: error.message || "An unexpected error occurred",
        },
        { status: 500 }
      );
    }
  });
}

/**
 * Health check endpoint
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

    return NextResponse.json({
      status: "configured",
      message: "Commentary system is available",
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
