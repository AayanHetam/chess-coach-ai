import { NextResponse } from "next/server";
import {
  queryPuzzles,
  findSimilarPuzzles,
  getDailyPuzzle,
  getAvailableThemes,
  getCorpusStats,
} from "@/lib/puzzleRepository";
import { isNeo4jConfigured, executeRead } from "@/lib/neo4j";
import { puzzleDatasetSchema, validateRequest } from "@/lib/validation/schemas";

/**
 * Neo4j-backed puzzle dataset API.
 *
 * Replaces the legacy JSON-file-backed service. Retrieves from the ~200k
 * Lichess puzzle graph (Puzzle + Theme nodes, HAS_THEME relationships).
 *
 * Commands:
 *   - by_theme      — puzzles tagged with one of the requested themes
 *   - find_similar  — alias for by_theme with randomized order
 *   - random        — uniformly random puzzles, optional rating band
 *   - daily         — deterministic puzzle-of-the-day
 */

export async function POST(req: Request) {
  try {
    if (!isNeo4jConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: "Puzzle database is not configured",
          details:
            "Neo4j environment variables (NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD) are missing.",
        },
        { status: 503 }
      );
    }

    const body = await req.json();
    const parsed = validateRequest(puzzleDatasetSchema, body);
    if (!parsed.success) return parsed.response;
    const { themes, limit, command, difficulty, excludeIds } = parsed.data;

    if (command === "find_similar" || command === "by_theme") {
      if (!themes || themes.length === 0) {
        return NextResponse.json(
          { success: false, error: "Themes are required for this command" },
          { status: 400 }
        );
      }

      const puzzles =
        command === "find_similar"
          ? await findSimilarPuzzles(
              themes,
              undefined,
              limit,
              excludeIds ?? []
            )
          : await queryPuzzles({
              themes,
              limit,
              difficulty,
              excludeIds: excludeIds ?? [],
            });

      return NextResponse.json({
        success: true,
        puzzles,
        count: puzzles.length,
      });
    }

    if (command === "random") {
      const puzzles = await queryPuzzles({
        limit,
        difficulty,
        excludeIds: excludeIds ?? [],
      });
      return NextResponse.json({
        success: true,
        puzzles,
        count: puzzles.length,
      });
    }

    if (command === "daily") {
      const puzzle = await getDailyPuzzle();
      const today = new Date().toISOString().slice(0, 10);
      if (!puzzle) {
        return NextResponse.json({
          success: false,
          error: "No puzzles available",
        });
      }
      return NextResponse.json({ success: true, puzzle, date: today });
    }

    return NextResponse.json(
      { success: false, error: `Unknown command: ${command}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error querying chess puzzles dataset:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to query chess puzzles dataset",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    if (!isNeo4jConfigured()) {
      return NextResponse.json(
        { success: false, error: "Puzzle database is not configured" },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(req.url);
    const command = searchParams.get("command") || "stats";

    if (command === "stats") {
      const stats = await getCorpusStats();
      return NextResponse.json({
        success: true,
        total_puzzles: stats.totalPuzzles,
        themes: stats.themes.map((t) => t.id),
        themeDetails: stats.themes,
        source: "neo4j",
        status: "loaded",
      });
    }

    if (command === "themes") {
      const themes = await getAvailableThemes();
      return NextResponse.json({
        success: true,
        themes,
        count: themes.length,
      });
    }

    // [PHASE-B-DIAGNOSTICS] probe: confirm the live Aura instance actually has
    // HAS_THEME edges from puzzles to a known theme node, and report each
    // matched puzzle's full theme-id list so we can diff against what the
    // similar-puzzles route returns.
    if (command === "probe") {
      const records = await executeRead<{
        puzzleId: string;
        rating: number;
        themeIds: string[];
      }>(
        `MATCH (p:Puzzle)-[:HAS_THEME]->(t:Theme)
         WHERE t.id = "exposed-king"
         RETURN p.puzzleId AS puzzleId, p.rating AS rating,
                [(p)-[:HAS_THEME]->(theme) | theme.id] AS themeIds
         LIMIT 3`
      );
      return NextResponse.json({
        success: true,
        probe: "exposed-king HAS_THEME edges",
        count: records.length,
        records,
      });
    }

    // [PHASE-B-DIAGNOSTICS] puzzle_shape: dump a single Puzzle node's full
    // properties + all relationships so we can confirm field names (themes
    // property vs HAS_THEME relationship) and the actual data shape.
    if (command === "puzzle_shape") {
      const records = await executeRead<{
        puzzle: Record<string, unknown>;
        relationships: Array<{
          rel_type: string;
          other_label: string[];
          other_id: string;
        }>;
      }>(
        `MATCH (p:Puzzle) WHERE p.puzzleId IS NOT NULL
         RETURN p AS puzzle,
                [(p)-[r]-(other) | { rel_type: type(r), other_label: labels(other), other_id: coalesce(other.id, other.puzzleId) }] AS relationships
         LIMIT 1`
      );
      return NextResponse.json({
        success: true,
        probe: "single Puzzle node + all relationships",
        count: records.length,
        records,
      });
    }

    return NextResponse.json(
      { success: false, error: `Unknown command: ${command}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error querying chess puzzles dataset:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to query chess puzzles dataset",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
