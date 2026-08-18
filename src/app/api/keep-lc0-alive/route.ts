import { NextResponse } from "next/server";

/**
 * Keep-alive ping for the Lc0 microservice (mirrors /api/keep-maia-alive).
 *
 * Hugging Face free-tier Spaces sleep after 48h of inactivity. A daily Vercel
 * cron (see vercel.json) hits the Space's /health endpoint to keep the
 * container warm.
 *
 * Vercel cron requests include an `Authorization: Bearer <CRON_SECRET>`
 * header when CRON_SECRET is set, which we verify so this can't be abused
 * as an open relay.
 */

const LC0_API_URL = process.env.LC0_API_URL;
const CRON_SECRET = process.env.CRON_SECRET;

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!LC0_API_URL) {
    return NextResponse.json(
      {
        ok: false,
        error: "LC0_API_URL is not configured",
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

    const res = await fetch(`${LC0_API_URL}/health`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    const elapsedMs = Date.now() - startedAt;

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      elapsedMs,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        elapsedMs: Date.now() - startedAt,
        error: "Provider health check unavailable",
        code: "PROVIDER_HEALTH_UNAVAILABLE",
      },
      { status: 502 }
    );
  }
}
