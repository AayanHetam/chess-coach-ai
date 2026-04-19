import { NextResponse } from "next/server";

/**
 * Keep-alive ping for the Maia-2 microservice.
 *
 * Hugging Face free-tier Spaces sleep after 48h of inactivity. This endpoint
 * is invoked by a Vercel cron job (see vercel.json) every 12h to hit the
 * Space's /health endpoint and keep the container warm.
 *
 * Vercel cron requests include an `Authorization: Bearer <CRON_SECRET>`
 * header when CRON_SECRET is set, which we verify so this can't be abused
 * as an open relay.
 */

const MAIA_API_URL = process.env.MAIA_API_URL;
const CRON_SECRET = process.env.CRON_SECRET;

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Authorize: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`.
  // If CRON_SECRET is not set we still allow the call (useful for local
  // testing / external uptime monitors), but log a warning.
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!MAIA_API_URL) {
    return NextResponse.json(
      {
        ok: false,
        error: "MAIA_API_URL is not configured",
      },
      { status: 503 }
    );
  }

  const startedAt = Date.now();

  try {
    // HF Spaces can take 30-90s to wake from SLEEPING state, so use a long
    // timeout. We don't care about the response body — just want HF to
    // re-spin the container.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 110_000);

    const res = await fetch(`${MAIA_API_URL}/health`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    const body = await res.text().catch(() => "");
    const elapsedMs = Date.now() - startedAt;

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      elapsedMs,
      target: `${MAIA_API_URL}/health`,
      preview: body.slice(0, 200),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Failed to ping Maia",
      },
      { status: 502 }
    );
  }
}
