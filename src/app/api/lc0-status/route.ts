import { NextResponse } from "next/server";

/**
 * Check Lc0 microservice health (mirrors /api/maia-status).
 *
 * Pings the external lc0 service's /health endpoint. The grounding voter
 * degrades gracefully when the service is absent, so this route exists for
 * operational visibility, not gating.
 */

const LC0_API_URL = process.env.LC0_API_URL;

async function checkLc0ServiceHealth(): Promise<{
  available: boolean;
  modelLoaded: boolean;
  error?: string;
}> {
  if (!LC0_API_URL) {
    return {
      available: false,
      modelLoaded: false,
      error: "LC0_API_URL environment variable is not set",
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${LC0_API_URL}/health`, {
      signal: controller.signal,
      cache: "no-store",
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
        error instanceof Error ? error.message : "Failed to reach Lc0 service",
    };
  }
}

export async function GET() {
  const health = await checkLc0ServiceHealth();

  return NextResponse.json({
    lc0Configured: !!LC0_API_URL,
    lc0Reachable: health.available,
    lc0ModelLoaded: health.modelLoaded,
    lc0Ready: health.available && health.modelLoaded,
    model: "lc0/maia-1900",
    message:
      health.available && health.modelLoaded
        ? "Lc0 is running and ready for evaluations"
        : !LC0_API_URL
          ? "Lc0 service not configured. Set LC0_API_URL environment variable."
          : health.available
            ? `Lc0 service reachable but engine not loaded: ${health.error || "unknown error"}`
            : `Lc0 service unreachable: ${health.error || "unknown error"}`,
  });
}
