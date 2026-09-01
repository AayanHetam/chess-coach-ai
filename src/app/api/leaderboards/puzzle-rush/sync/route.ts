/**
 * POST /api/leaderboards/puzzle-rush/sync  { rush: { threeMin, fiveMin, survivalBest } }
 *
 * Decoupled from PUT /api/progress on purpose. That endpoint's leaderboard
 * upsert only fires when the client actually PUSHES a progress snapshot —
 * and useProgressSync hydrates/pushes at most once per app-session (guarded
 * by `hydratedFor`, mounted once in _app.tsx). A user signed in since before
 * this feature shipped, whose score hasn't changed since, may never push
 * again in a given browser session — so their entry never appears even
 * though their score is real. This endpoint lets the Rush screen sync
 * opportunistically on every view, independent of that timing.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { getUserById } from "@/lib/server/users";
import { upsertPuzzleRushLeaderboardEntry } from "@/lib/server/puzzleRushLeaderboard";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
import { logger } from "@/lib/logging";

export const runtime = "nodejs";

const log = logger.child({ module: "leaderboards/puzzle-rush/sync" });

const bodySchema = z.object({
  rush: z.object({
    threeMin: z.number().int().min(0).max(100000),
    fiveMin: z.number().int().min(0).max(100000),
    survivalBest: z.number().int().min(0).max(100000),
  }),
});

export async function POST(request: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid rush payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // All-zero is a fresh account, not a score — nothing worth publishing.
  const { threeMin, fiveMin, survivalBest } = parsed.data.rush;
  if (threeMin === 0 && fiveMin === 0 && survivalBest === 0) {
    return NextResponse.json({ ok: true, synced: false });
  }

  try {
    const user = await getUserById(guard.session.uid);
    if (!user?.handle) {
      // No public handle — same opt-in-by-write rule as the progress path.
      return NextResponse.json({ ok: true, synced: false });
    }
    await upsertPuzzleRushLeaderboardEntry(guard.session.uid, user.handle, parsed.data.rush);
    return NextResponse.json({ ok: true, synced: true });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    log.error("leaderboard sync failed", { message: String(err) });
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
