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
 * BUILD_SHA is the fallback for deploys that did NOT come from the git
 * integration. Vercel blocks any commit whose AUTHOR is not a member of the
 * team, so a release written by a collaborator can only reach prod via
 * `scripts/deploy/deploy-sha.sh`, which uploads a plain directory with no git
 * metadata attached. Vercel injects nothing in that case, and VERCEL_* names
 * are reserved -- passing --build-env VERCEL_GIT_COMMIT_SHA is silently
 * ignored -- so the script passes BUILD_SHA instead. Without this fallback
 * such a deploy reports "dev", and Deploy verify then reads a healthy prod as
 * a frozen one. (Happened for real on 47aafa98, 2026-08-17.)
 *
 * GET /api/version → { sha, ref, env, serverTime }
 */

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      sha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_SHA || "dev",
      ref:
        process.env.VERCEL_GIT_COMMIT_REF || process.env.BUILD_REF || null,
      env: process.env.VERCEL_ENV || "local",
      serverTime: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
