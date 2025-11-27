import { NextResponse } from "next/server";
import { identifyTacticalThemes, getTacticalPatterns, formatTacticalThemesForPrompt } from "@/lib/chessPuzzlesService";

export async function POST(req: Request) {
  try {
    const { fen, principalVariation, bestMove } = await req.json();

    if (!fen) {
      return NextResponse.json(
        { error: "FEN position is required" },
        { status: 400 }
      );
    }

    // Identify tactical themes from the position and principal variation
    const themes = identifyTacticalThemes(
      fen,
      principalVariation || [],
      bestMove || ""
    );

    // Get tactical pattern descriptions
    const patterns = getTacticalPatterns(themes);

    // Format for AI coach prompt
    const tacticalAnalysis = formatTacticalThemesForPrompt(themes, patterns);

    return NextResponse.json({
      themes,
      patterns,
      tacticalAnalysis,
      success: true,
    });
  } catch (error) {
    console.error("Error analyzing tactical themes:", error);
    return NextResponse.json(
      {
        error: "Failed to analyze tactical themes",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    name: "Chess Puzzles Tactical Analysis API",
    description:
      "Identifies tactical themes and patterns in chess positions to help explain Stockfish's reasoning",
    endpoints: {
      POST: {
        description: "Analyze a position for tactical themes",
        body: {
          fen: "string (required) - FEN position",
          principalVariation: "array (optional) - Stockfish's principal variation",
          bestMove: "string (optional) - Best move suggested by Stockfish",
        },
        response: {
          themes: "array - Identified tactical themes",
          patterns: "array - Tactical pattern descriptions",
          tacticalAnalysis: "string - Formatted analysis for AI coach",
        },
      },
    },
  });
}

