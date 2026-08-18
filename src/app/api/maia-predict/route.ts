import { NextResponse } from "next/server";
import { maiaPredictSchema, validateRequest } from "@/lib/validation/schemas";
import { requireSession } from "@/lib/auth/session";

/**
 * Maia-2 Prediction API — proxies to external Maia-2 microservice.
 *
 * The Maia-2 model (NeurIPS 2024) runs as a separate Python/FastAPI service
 * because Vercel serverless cannot run PyTorch or native binaries like LC0.
 * Set the MAIA_API_URL environment variable to point to your deployed service.
 */

const MAIA_API_URL = process.env.MAIA_API_URL;

export async function POST(req: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  try {
    const body = await req.json();

    const parsed = validateRequest(maiaPredictSchema, body);
    if (!parsed.success) return parsed.response;
    const { fen, rating, opponent_rating } = parsed.data;

    if (!MAIA_API_URL) {
      return NextResponse.json(
        {
          error: "Maia API not configured",
          message:
            "MAIA_API_URL environment variable is not set. Deploy the Maia-2 microservice and set the URL.",
          fallback: true,
        },
        { status: 503 }
      );
    }

    // Proxy to external Maia-2 microservice
    const response = await fetch(`${MAIA_API_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fen,
        rating: rating || 1500,
        opponent_rating: opponent_rating || rating || 1500,
      }),
    });

    if (!response.ok) {
      console.error("Maia-2 service request failed", {
        status: response.status,
        code: "provider_http_error",
      });
      return NextResponse.json(
        {
          error: "AI opponent is temporarily unavailable.",
          code: "AI_PROVIDER_UNAVAILABLE",
          fallback: true,
        },
        { status: 502 }
      );
    }

    const prediction = await response.json();

    return NextResponse.json({
      humanLikeMove: prediction.humanLikeMove,
      confidence: prediction.confidence,
      alternativeMoves: prediction.alternativeMoves,
      rating: prediction.rating,
      model: prediction.model || "maia2",
    });
  } catch {
    console.error("Maia prediction request failed", {
      code: "provider_network_error",
    });
    return NextResponse.json(
      {
        error: "AI opponent is temporarily unavailable.",
        code: "AI_PROVIDER_UNAVAILABLE",
        fallback: true,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Return API documentation
  const serviceStatus = MAIA_API_URL ? "configured" : "not configured";

  return NextResponse.json({
    name: "Maia-2 Prediction API",
    description:
      "Get human-like move predictions using Maia-2 (NeurIPS 2024). Proxies to an external Maia-2 microservice.",
    serviceUrl: MAIA_API_URL ? "(configured)" : "(not set — set MAIA_API_URL)",
    serviceStatus,
    endpoints: {
      POST: {
        description: "Predict human-like move for a position",
        body: {
          fen: "string (required) - FEN position",
          rating: "number (optional) - Player ELO rating (default: 1500)",
          opponent_rating:
            "number (optional) - Opponent ELO rating (default: same as rating)",
        },
        response: {
          humanLikeMove: "string - Predicted human-like move in SAN notation",
          confidence: "number - Confidence score (0-1)",
          alternativeMoves: "array - Alternative moves with probabilities",
          rating: "number - Rating level used for prediction",
          model: "string - Model used (maia2)",
        },
      },
    },
  });
}
