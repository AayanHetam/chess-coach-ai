import { NextResponse } from "next/server";

/**
 * Deprecated: LC0 installation is no longer needed.
 *
 * Maia-2 now runs as an external Python microservice (see maia-service/).
 * This endpoint is kept for backward compatibility but returns a helpful
 * message directing users to the new architecture.
 */
export async function POST(): Promise<NextResponse> {
  return NextResponse.json({
    success: false,
    message:
      "LC0 installation is no longer needed. Maia-2 now runs as a separate microservice. " +
      "Deploy the maia-service/ directory to Railway, Fly.io, or Render, then set MAIA_API_URL.",
    deprecated: true,
  });
}
