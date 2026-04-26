import { NextRequest, NextResponse } from "next/server";
import { executeRead, isNeo4jConfigured } from "@/lib/neo4j";
import {
  extractFENFeatures,
  featuresToVector,
  cosineSimilarity,
} from "@/lib/fenSimilarity";
import { getReinforcements } from "@/lib/concept/conceptRetrieval";
import neo4j from "neo4j-driver";
import { z } from "zod";

/**
 * Similar-Puzzles API — concept-first retrieval (v2) with legacy theme-cosine
 * blend (v1) as guarded fallback.
 *
 * v2 (default; controlled by NEXT_PUBLIC_RETRIEVAL_V2):
 *   Delegates to src/lib/concept/conceptRetrieval.ts — hard concept filter,
 *   structural rerank, MMR diversity pass. See docs/research/concept-
 *   similarity-rationale.md for design rationale.
 *
 * v1 (fallback):
 *   The original 70% theme / 30% cosine blend. Runs when:
 *     - NEXT_PUBLIC_RETRIEVAL_V2 is explicitly "false"
 *     - v2 returns zero puzzles (e.g., corpus not yet concept-classified)
 *   Per the migration plan, v1 is deleted after 2 weeks of green v2 metrics.
 *
 * Request body adds optional `solutionUci` and `anchorConcepts` for v2; if
 * neither is supplied, v2 labels the response `unclassified` and uses theme
 * fallback so the UI can badge it honestly (Part C2 of the plan).
 */

const schema = z.object({
  fen: z.string().min(10),
  themes: z.array(z.string()).min(1),
  userRating: z.number().int().min(400).max(3000).optional().default(1500),
  limit: z.number().int().min(1).max(50).optional().default(10),
  candidatePoolSize: z.number().int().min(10).max(500).optional().default(60),
  excludeIds: z.array(z.string()).optional().default([]),
  sideToMoveMustMatch: z.boolean().optional().default(false),
  /** UCI solution (Lichess convention: move 0 = opponent setup, move 1 = solver). */
  solutionUci: z.array(z.string()).optional(),
  /** Pre-computed concept IDs from upstream caller; bypasses detector. */
  anchorConcepts: z.array(z.string()).optional(),
});

type ReqBody = z.infer<typeof schema>;

const V2_ENABLED =
  (process.env.NEXT_PUBLIC_RETRIEVAL_V2 ?? "true").toLowerCase() !== "false";

export async function POST(request: NextRequest) {
  try {
    if (!isNeo4jConfigured()) {
      return NextResponse.json({ error: "Neo4j not configured" }, { status: 503 });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 }
      );
    }

    // [PHASE-B-DIAGNOSTICS]
    console.log("similar-puzzles.request", {
      themes: parsed.data.themes,
      hasFen: !!parsed.data.fen,
      v2Enabled: V2_ENABLED,
      userElo: parsed.data.userRating,
    });

    if (V2_ENABLED) {
      const v2 = await runV2(parsed.data);
      if (v2.puzzles.length > 0 || v2.anchorConcepts.length > 0) {
        // [PHASE-B-DIAGNOSTICS]
        console.log("similar-puzzles.result", {
          themesRequested: parsed.data.themes,
          puzzleCount: v2.puzzles?.length ?? 0,
          fallbackUsed: v2.fallbackUsed,
          themesOnFirstPuzzle: (v2.puzzles?.[0] as { themes?: unknown })?.themes,
        });
        return NextResponse.json(v2);
      }
      // V2 produced nothing classifiable — drop through to V1 for continuity
    }

    const v1 = await runV1(parsed.data);
    // [PHASE-B-DIAGNOSTICS]
    console.log("similar-puzzles.result", {
      themesRequested: parsed.data.themes,
      puzzleCount: v1.puzzles?.length ?? 0,
      fallbackUsed: (v1 as { fallbackUsed?: unknown }).fallbackUsed,
      themesOnFirstPuzzle: (v1.puzzles?.[0] as { themes?: unknown })?.themes,
    });
    return NextResponse.json(v1);
  } catch (error: any) {
    console.error("similar-puzzles error:", error);
    return NextResponse.json(
      { error: "Failed to fetch similar puzzles", message: error.message },
      { status: 500 }
    );
  }
}

// ── v2 (concept-first) ────────────────────────────────────────────────────
async function runV2(req: ReqBody) {
  const result = await getReinforcements({
    anchorFen: req.fen,
    anchorSolutionUci: req.solutionUci,
    anchorConcepts: req.anchorConcepts,
    themes: req.themes,
    userElo: req.userRating,
    limit: req.limit,
    excludeIds: req.excludeIds,
  });

  return {
    version: "v2",
    anchorConcepts: result.anchorConcepts,
    fallbackUsed: result.fallbackUsed,
    embeddingVersion: result.embeddingVersion,
    poolSize: result.poolSize,
    puzzles: result.puzzles,
    notes: result.notes,
  };
}

// ── v1 (legacy theme / cosine blend; temporary) ───────────────────────────
async function runV1(req: ReqBody) {
  const normalizedThemes = req.themes.map(normalizeThemeId);
  const ratingMin = Math.max(400, req.userRating - 300);
  const ratingMax = Math.min(3000, req.userRating + 300);

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

  const records = await executeRead<{
    puzzleId: string;
    fen: string;
    moves: string;
    rating: number;
    themes: string[];
    matchedThemes: string[];
    popularity: number;
    nbPlays: number;
  }>(cypher, {
    themes: normalizedThemes,
    minRating: neo4j.int(ratingMin),
    maxRating: neo4j.int(ratingMax),
    excludeIds: req.excludeIds,
    limit: neo4j.int(req.candidatePoolSize),
  });

  if (records.length === 0) {
    return {
      version: "v1",
      puzzles: [],
      inputThemes: normalizedThemes,
      poolSize: 0,
      note: "No puzzles matched the requested themes in the selected rating band.",
    };
  }

  let mistakeVector: number[] | null = null;
  let mistakeTurn: 0 | 1 = 0;
  try {
    const mistakeFeatures = extractFENFeatures(req.fen);
    mistakeVector = featuresToVector(mistakeFeatures);
    mistakeTurn = mistakeFeatures.special.turn as 0 | 1;
  } catch (e) {
    console.warn("Could not extract features from mistake FEN:", (e as Error).message);
  }

  const scored = records.map((r) => {
    const themeMatchScore = r.matchedThemes.length / normalizedThemes.length;
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
    const turnMatch = candTurn === mistakeTurn;
    const turnPenalty = req.sideToMoveMustMatch && !turnMatch ? 0 : 1;
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

  scored.sort((a, b) => {
    if (b.matchedThemes.length !== a.matchedThemes.length) {
      return b.matchedThemes.length - a.matchedThemes.length;
    }
    return b.combinedScore - a.combinedScore;
  });

  return {
    version: "v1",
    puzzles: scored.slice(0, req.limit),
    inputThemes: normalizedThemes,
    poolSize: records.length,
    ratingBand: { min: ratingMin, max: ratingMax },
  };
}

function normalizeThemeId(theme: string): string {
  return theme
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/\s+/g, "-")
    .replace(/_+/g, "-")
    .toLowerCase();
}
