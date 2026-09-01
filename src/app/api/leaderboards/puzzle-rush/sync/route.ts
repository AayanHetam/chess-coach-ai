/**
 * POST /api/leaderboards/puzzle-rush/sync
 *   { rush: { threeMin, fiveMin, survivalBest }, mode?: RushMode }
 *
 * Decoupled from PUT /api/progress on purpose. That endpoint's leaderboard
 * upsert only fires when the client actually PUSHES a progress snapshot —
 * and useProgressSync hydrates/pushes at most once per app-session (guarded
 * by `hydratedFor`, mounted once in _app.tsx). A user signed in since before
 * this feature shipped, whose score hasn't changed since, may never push
 * again in a given browser session — so their entry never appears even
 * though their score is real. This endpoint lets the Rush screen sync
 * opportunistically on every view, independent of that timing.
 *
 * It answers with the board itself, which is what makes a just-set personal
 * best visible at once: GET /api/leaderboards/puzzle-rush is served from a
 * per-instance in-memory cache, so the obvious "write, then re-GET" can be
 * answered by a different Vercel instance holding a snapshot from before the
 * write and show the player their OLD score for a full TTL. The read here
 * follows the write inside one request against Firestore, which is strongly
 * consistent, so the response cannot be stale with respect to the write it
 * just made.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { getUserById } from "@/lib/server/users";
import {
  getPuzzleRushLeaderboard,
  getPuzzleRushRank,
  upsertPuzzleRushLeaderboardEntry,
  RUSH_LEADERBOARD_MODES,
  type RushMode,
} from "@/lib/server/puzzleRushLeaderboard";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
import { logger } from "@/lib/logging";

export const runtime = "nodejs";

const log = logger.child({ module: "leaderboards/puzzle-rush/sync" });

const scoreSchema = z.number().int().min(0).max(100000);

const bodySchema = z.object({
  rush: z.object({
    threeMin: scoreSchema,
    fiveMin: scoreSchema,
    survivalBest: scoreSchema,
  }),
  mode: z.enum(["threeMin", "fiveMin", "survivalBest"]).optional(),
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
      { status: 400 }
    );
  }

  const mode: RushMode = parsed.data.mode ?? RUSH_LEADERBOARD_MODES[0];

  try {
    const user = await getUserById(guard.session.uid);
    if (!user?.handle) {
      // No public handle — same opt-in-by-write rule as the progress path.
      // Still answer with the board: someone without a handle can read it.
      const entries = await getPuzzleRushLeaderboard(mode);
      return NextResponse.json({
        ok: true,
        synced: false,
        mode,
        entries,
        rank: null,
      });
    }

    // May return null (nothing worth publishing) and never lowers a
    // published best — both enforced in upsertPuzzleRushLeaderboardEntry.
    const published = await upsertPuzzleRushLeaderboardEntry(
      guard.session.uid,
      user.handle,
      parsed.data.rush
    );

    const [entries, rank] = await Promise.all([
      getPuzzleRushLeaderboard(mode),
      published
        ? getPuzzleRushRank(mode, published[mode])
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      ok: true,
      synced: published !== null,
      mode,
      entries,
      // The player's own standing, so the board means something to the ~99%
      // of players who are not in the rendered top slice.
      rank,
      score: published ? published[mode] : 0,
      // So the board can mark which row is the reader's own. Already public —
      // it is the same handle rendered in every other row.
      handle: user.handle,
    });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }
    log.error("leaderboard sync failed", { message: String(err) });
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
