import { NextResponse } from "next/server";

/**
 * Check Maia-2 microservice health.
 *
 * Instead of checking for a local LC0 binary (impossible on Vercel),
 * we ping the external Maia-2 microservice's /health endpoint.
 */

const MAIA_API_URL = process.env.MAIA_API_URL;

async function checkMaiaServiceHealth(): Promise<{
  available: boolean;
  modelLoaded: boolean;
  error?: string;
}> {
  if (!MAIA_API_URL) {
    return {
      available: false,
      modelLoaded: false,
      error: "MAIA_API_URL environment variable is not set",
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${MAIA_API_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        available: false,
        modelLoaded: false,
        error: `Service returned ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      available: true,
      modelLoaded: data.model_loaded ?? false,
      error: data.error || undefined,
    };
  } catch (error) {
    return {
      available: false,
      modelLoaded: false,
      error:
        error instanceof Error ? error.message : "Failed to reach Maia service",
    };
  }
}

export async function GET() {
  try {
    const health = await checkMaiaServiceHealth();

    return NextResponse.json({
      lc0Available: health.available && health.modelLoaded,
      maiaOptimal: health.available && health.modelLoaded,
      maiaServiceConfigured: !!MAIA_API_URL,
      maiaServiceReachable: health.available,
      maiaModelLoaded: health.modelLoaded,
      model: "maia2",
      message: health.available && health.modelLoaded
        ? "Maia-2 is running and ready for predictions"
        : !MAIA_API_URL
          ? "Maia-2 service not configured. Set MAIA_API_URL environment variable."
          : health.available
            ? `Maia-2 service reachable but model not loaded: ${health.error || "unknown error"}`
            : `Maia-2 service unreachable: ${health.error || "unknown error"}`,
    });
  } catch (error) {
    console.error("Error checking MAIA status:", error);
    return NextResponse.json(
      {
        lc0Available: false,
        maiaOptimal: false,
        maiaServiceConfigured: !!MAIA_API_URL,
        maiaServiceReachable: false,
        maiaModelLoaded: false,
        model: "maia2",
        message: "Unable to check Maia-2 status",
      },
      { status: 500 }
    );
  }
}

