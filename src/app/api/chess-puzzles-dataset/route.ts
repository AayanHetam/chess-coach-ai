import { NextResponse } from "next/server";
import {
  queryPuzzles,
  findSimilarPuzzles,
  getDailyPuzzle,
  getAvailableThemes,
  getCorpusStats,
} from "@/lib/puzzleRepository";
import { isNeo4jConfigured } from "@/lib/neo4j";
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
