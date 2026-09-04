import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { excludePuzzleRushLeaderboardEntry } from "@/lib/server/puzzleRushLeaderboard";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
import { logger } from "@/lib/logging";

/**
 * DELETE /api/admin/leaderboards/puzzle-rush  { uid }
 *
 * Takes one entry off the Puzzle Rush board permanently.
 *
 * This exists because the board publishes a score the client reports, and
 * nothing verifies it — a Rush run is adjudicated in the browser, which holds
 * the solutions in order to give instant feedback. Scores are bounded to a
 * plausible range, so the worst case is a believable number rather than an
 * absurd one, but a believable forged number is indistinguishable from a real
 * one and MAX-WINS MAKES IT PERMANENT. Without a way to take an entry down,
 * a single bad row would sit at the top of a mode forever.
 *
 * See docs/PUZZLE_RUSH_LEADERBOARD.md for what a verifiable board would need.
 */

export const runtime = "nodejs";

const log = logger.child({ module: "admin/leaderboards/puzzle-rush" });

const schema = z.object({ uid: z.string().min(1).max(128) });

export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "uid is required" }, { status: 400 });
  }

  try {
    await excludePuzzleRushLeaderboardEntry(parsed.data.uid);
    return NextResponse.json({ ok: true, uid: parsed.data.uid });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }
    log.error("leaderboard exclude failed", { message: String(err) });
    return NextResponse.json({ error: "Exclude failed" }, { status: 500 });
  }
}
