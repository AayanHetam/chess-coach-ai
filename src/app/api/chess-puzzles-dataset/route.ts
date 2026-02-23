import { NextResponse } from "next/server";
import {
  queryPuzzles,
  findSimilarPuzzles,
  getDatabaseIndex,
  getAvailableThemes,
  type DifficultyBand,
} from "@/lib/puzzleDatabase";

export async function POST(req: Request) {
  try {
    const { fen, themes, limit = 5, command = "find_similar", difficulty } = await req.json();

    if (command === "find_similar") {
      if (!themes || themes.length === 0) {
        return NextResponse.json(
          { error: "Themes are required for find_similar" },
          { status: 400 }
        );
      }

      const puzzles = await findSimilarPuzzles(themes, undefined, limit);

      return NextResponse.json({
        success: true,
        puzzles,
        count: puzzles.length,
      });
    } else if (command === "by_theme") {
      if (!themes || themes.length === 0) {
        return NextResponse.json(
          { error: "Themes are required for by_theme command" },
          { status: 400 }
        );
      }

      const puzzles = await queryPuzzles({
        themes,
        limit,
        difficulty: difficulty as DifficultyBand | DifficultyBand[] | undefined,
        shuffle: true,
      });

      return NextResponse.json({
        success: true,
        puzzles,
        count: puzzles.length,
      });
    } else {
      return NextResponse.json(
        { error: `Unknown command: ${command}` },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error querying chess puzzles dataset:", error);
    return NextResponse.json(
      {
        error: "Failed to query chess puzzles dataset",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const command = searchParams.get("command") || "stats";

    if (command === "stats") {
      const index = getDatabaseIndex();
      return NextResponse.json({
        success: true,
        total_puzzles: index.totalPuzzles,
        themes: getAvailableThemes(),
        status: "loaded",
        generatedAt: index.generatedAt,
      });
    } else if (command === "themes") {
      return NextResponse.json({
        success: true,
        themes: getAvailableThemes(),
        count: getAvailableThemes().length,
      });
    } else {
      return NextResponse.json(
        { error: `Unknown command: ${command}` },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error querying chess puzzles dataset:", error);
    return NextResponse.json(
      {
        error: "Failed to query chess puzzles dataset",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
