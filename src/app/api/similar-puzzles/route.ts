import { NextRequest, NextResponse } from "next/server";
import { executeRead, isNeo4jConfigured } from "@/lib/neo4j";
import {
  extractFENFeatures,
  featuresToVector,
  cosineSimilarity,
} from "@/lib/fenSimilarity";
import neo4j from "neo4j-driver";
import { z } from "zod";

/**
 * Similar-Puzzles API
 *
 * Given a mistake FEN and one or more tactical themes, returns the top-N puzzles
 * from the Neo4j graph database that:
 *   1. (PRIMARY)   Match the tactical theme/skill — this is the "need to have"
 *   2. (SECONDARY) Are structurally similar to the mistake FEN via the FEN
 *                  similarity model — this is the "like to have"
 *
 * Flow:
 *   - Fetch a wide pool (candidatePoolSize) of puzzles matching any of the themes,
 *     filtered by rating band.
 *   - Score each candidate by cosine similarity of the 49-dim FEN feature vector
 *     to the input mistake FEN.
 *   - Re-rank: puzzles with ALL themes first, then by FEN similarity.
 *   - Return top `limit`.
 *
 * Request body:
 *   {
 *     fen: string                 // Position BEFORE the player's mistake
 *     themes: string[]            // Theme IDs (kebab-case), e.g. ["knight-fork","fork"]
 *     userRating?: number         // For difficulty calibration (default 1500)
 *     limit?: number              // Final number of puzzles returned (default 10)
 *     candidatePoolSize?: number  // Pool to re-rank (default 60)
 *     excludeIds?: string[]
 *   }
 *
 * Response:
 *   {
 *     puzzles: Array<{
 *       puzzleId, fen, moves, rating, themes, popularity,
 *       themeMatchScore,          // 0..1 (fraction of requested themes matched)
 *       fenSimilarity,            // 0..1 cosine similarity to input FEN
 *       combinedScore             // weighted combination
 *     }>
 *     inputThemes: string[]
 *     poolSize: number
 *   }
 */

const schema = z.object({
  fen: z.string().min(10),
  themes: z.array(z.string()).min(1),
  userRating: z.number().int().min(400).max(3000).optional().default(1500),
  limit: z.number().int().min(1).max(50).optional().default(10),
  candidatePoolSize: z.number().int().min(10).max(500).optional().default(60),
  excludeIds: z.array(z.string()).optional().default([]),
  sideToMoveMustMatch: z.boolean().optional().default(false),
});

type Candidate = {
  puzzleId: string;
  fen: string;
  moves: string;
  rating: number;
  themes: string[];
  popularity: number;
  nbPlays: number;
};

export async function POST(request: NextRequest) {
  try {
    if (!isNeo4jConfigured()) {
      return NextResponse.json(
        { error: "Neo4j not configured" },
        { status: 503 }
      );
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const {
      fen,
      themes,
      userRating,
      limit,
      candidatePoolSize,
      excludeIds,
      sideToMoveMustMatch,
    } = parsed.data;

    // Normalize themes to kebab-case lowercase (matches how they are stored in Neo4j)
    const normalizedThemes = themes.map((t) => normalizeThemeId(t));

    // Rating band
    const ratingMin = Math.max(400, userRating - 300);
    const ratingMax = Math.min(3000, userRating + 300);

    // Pull a wide pool of puzzles matching any theme, ordered by specificity (most themes matched first)
    const cypher = `
      MATCH (p:Puzzle)-[:HAS_THEME]->(t:Theme)
      WHERE t.id IN $themes
        AND p.rating >= $minRating
        AND p.rating <= $maxRating
        AND NOT p.puzzleId IN $excludeIds
      WITH p, collect(DISTINCT t.id) AS matchedThemes
      MATCH (p)-[:HAS_THEME]->(allT:Theme)
      WITH p, matchedThemes, collect(DISTINCT allT.id) AS allThemes
      RETURN p.puzzleId  AS puzzleId,
             p.fen       AS fen,
             p.moves     AS moves,
             p.rating    AS rating,
             allThemes   AS themes,
             matchedThemes AS matchedThemes,
             coalesce(p.popularity, 0) AS popularity,
             coalesce(p.nbPlays, 0)    AS nbPlays
      ORDER BY size(matchedThemes) DESC, p.popularity DESC
      LIMIT $limit
    `;

    const records = await executeRead<
      Candidate & { matchedThemes: string[] }
    >(cypher, {
      themes: normalizedThemes,
      minRating: neo4j.int(ratingMin),
      maxRating: neo4j.int(ratingMax),
      excludeIds,
      limit: neo4j.int(candidatePoolSize),
    });

    if (records.length === 0) {
      return NextResponse.json({
        puzzles: [],
        inputThemes: normalizedThemes,
        poolSize: 0,
        note: "No puzzles matched the requested themes in the selected rating band.",
      });
    }

    // Compute FEN feature vector for the mistake position
    let mistakeVector: number[] | null = null;
    let mistakeTurn: 0 | 1 = 0;
    try {
      const mistakeFeatures = extractFENFeatures(fen);
      mistakeVector = featuresToVector(mistakeFeatures);
      mistakeTurn = mistakeFeatures.special.turn as 0 | 1;
    } catch (e) {
      console.warn("Could not extract features from mistake FEN:", (e as Error).message);
    }

    // Re-rank by combined score: theme match (primary) + FEN similarity (secondary)
    const scored = records.map((r) => {
      const themeMatchScore =
        r.matchedThemes.length / normalizedThemes.length; // fraction of requested themes matched

      let fenSimilarity = 0;
      let candTurn: 0 | 1 = 0;
      if (mistakeVector) {
        try {
          const candFeatures = extractFENFeatures(r.fen);
          candTurn = candFeatures.special.turn as 0 | 1;
          const candVector = featuresToVector(candFeatures);
          fenSimilarity = cosineSimilarity(mistakeVector, candVector);
        } catch {
          fenSimilarity = 0;
        }
      }

      // If caller requires side-to-move match, penalize mismatches heavily
      const turnMatch = candTurn === mistakeTurn;
      const turnPenalty = sideToMoveMustMatch && !turnMatch ? 0 : 1;

      // Combined score: 70% theme match, 30% FEN similarity (secondary rank)
      // Theme match is dominant so wrong-theme puzzles never beat correct-theme ones.
      const combinedScore = (themeMatchScore * 0.7 + fenSimilarity * 0.3) * turnPenalty;

      return {
        puzzleId: r.puzzleId,
        fen: r.fen,
        moves: r.moves,
        rating: r.rating,
        themes: r.themes,
        popularity: r.popularity,
        nbPlays: r.nbPlays,
        matchedThemes: r.matchedThemes,
        themeMatchScore,
        fenSimilarity: Math.round(fenSimilarity * 1000) / 1000,
        turnMatch,
        combinedScore: Math.round(combinedScore * 1000) / 1000,
      };
    });

    // Sort: theme-matched first (at least one), then by combinedScore
    scored.sort((a, b) => {
      // Primary: more themes matched wins
      if (b.matchedThemes.length !== a.matchedThemes.length) {
        return b.matchedThemes.length - a.matchedThemes.length;
      }
      // Secondary: combined score (FEN similarity tiebreaker)
      return b.combinedScore - a.combinedScore;
    });

    const topPuzzles = scored.slice(0, limit);

    return NextResponse.json({
      puzzles: topPuzzles,
      inputThemes: normalizedThemes,
      poolSize: records.length,
      ratingBand: { min: ratingMin, max: ratingMax },
    });
  } catch (error: any) {
    console.error("similar-puzzles error:", error);
    return NextResponse.json(
      { error: "Failed to fetch similar puzzles", message: error.message },
      { status: 500 }
    );
  }
}

/**
 * Convert any theme string (camelCase, spaces, Title Case) to the kebab-case
 * format used as the Theme.id in Neo4j (e.g. "knightFork" → "knight-fork").
 */
function normalizeThemeId(theme: string): string {
  return theme
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1-$2") // camelCase → kebab
    .replace(/\s+/g, "-")                 // spaces → dashes
    .replace(/_+/g, "-")                  // underscores → dashes
    .toLowerCase();
}
