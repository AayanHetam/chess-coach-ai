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
    const { fen, themes, limit = 5, command = "find_similar", difficulty, excludeIds } = await req.json();

    if (command === "find_similar") {
      if (!themes || themes.length === 0) {
        return NextResponse.json(
          { error: "Themes are required for find_similar" },
          { status: 400 }
        );
      }

      const puzzles = await queryPuzzles({
        themes,
        limit,
        shuffle: true,
        excludeIds: excludeIds || undefined,
      });

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
        excludeIds: excludeIds || undefined,
      });

      return NextResponse.json({
        success: true,
        puzzles,
        count: puzzles.length,
      });
    } else if (command === "random") {
      const puzzles = await queryPuzzles({
        limit,
        difficulty: difficulty as DifficultyBand | DifficultyBand[] | undefined,
        shuffle: true,
        excludeIds: excludeIds || undefined,
      });

      return NextResponse.json({
        success: true,
        puzzles,
        count: puzzles.length,
      });
    } else if (command === "daily") {
      // Deterministic daily puzzle based on date
      const today = new Date().toISOString().slice(0, 10);
      const seed = today.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      const allPuzzles = await queryPuzzles({
        limit: 500,
        shuffle: false,
      });
      if (allPuzzles.length === 0) {
        return NextResponse.json({ success: false, error: "No puzzles available" });
      }
      const idx = seed % allPuzzles.length;
      return NextResponse.json({
        success: true,
        puzzle: allPuzzles[idx],
        date: today,
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
