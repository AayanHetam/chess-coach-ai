import { NextResponse } from "next/server";
import { MaiaServerService } from "@/lib/engine/maiaServerService";
import { join } from "path";

export async function POST(req: Request) {
  try {
    const { fen, rating } = await req.json();

    if (!fen) {
      return NextResponse.json(
        { error: "FEN position is required" },
        { status: 400 }
      );
    }

    // Get server-side Maia service instance (auto-downloads weights)
    const weightsDir =
      process.env.MAIA_WEIGHTS_PATH ||
      join(process.cwd(), "maia-weights");
    const maiaService = MaiaServerService.getInstance(weightsDir);

    // Initialize if needed (will auto-download weights)
    try {
      await maiaService.initialize(rating || 1500);
    } catch (error) {
      console.error("Maia initialization error:", error);
      // Return a fallback response if Maia is not available
      return NextResponse.json(
        {
          error: "Maia engine not available",
          message:
            error instanceof Error
              ? error.message
              : "Maia engine is not configured. The system will attempt to download weights automatically on first use.",
          fallback: true,
        },
        { status: 503 }
      );
    }

    // Get prediction
    const prediction = await maiaService.predictMove(fen, rating || 1500);

    return NextResponse.json({
      humanLikeMove: prediction.humanLikeMove,
      confidence: prediction.confidence,
      alternativeMoves: prediction.alternativeMoves,
      rating: prediction.rating,
    });
  } catch (error) {
    console.error("Maia prediction error:", error);
    return NextResponse.json(
      {
        error: "Failed to get Maia prediction",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  // Return API documentation
  return NextResponse.json({
    name: "Maia Prediction API",
    description: "Get human-like move predictions using Maia engine",
    endpoints: {
      POST: {
        description: "Predict human-like move for a position",
        body: {
          fen: "string (required) - FEN position",
          rating: "number (optional) - Player rating (default: 1500)",
        },
        response: {
          humanLikeMove: "string - Predicted human-like move in SAN notation",
          confidence: "number - Confidence score (0-1)",
          alternativeMoves: "array - Alternative moves with probabilities",
          rating: "number - Rating level used for prediction",
        },
      },
    },
    notes: [
      "Requires Lc0 engine to be installed",
      "Requires Maia weight files (maia-1100.pb, maia-1500.pb, maia-1900.pb, maia-2100.pb)",
      "Rating determines which Maia model to use",
    ],
  });
}

