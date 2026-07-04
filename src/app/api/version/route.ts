import { NextResponse } from "next/server";

/**
 * Deployment identity probe.
 *
 * Returns the git commit SHA baked into this deployment so an external
 * process (the autonomous ship loop, an uptime check, a human) can answer
 * "is commit X live on this host yet?" without Vercel dashboard access.
 *
 * VERCEL_GIT_COMMIT_SHA is injected by Vercel's git integration at build
 * time; locally it is unset and we report "dev".
 *
 * GET /api/version → { sha, ref, env, serverTime }
 */

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      sha: process.env.VERCEL_GIT_COMMIT_SHA || "dev",
      ref: process.env.VERCEL_GIT_COMMIT_REF || null,
      env: process.env.VERCEL_ENV || "local",
      serverTime: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
