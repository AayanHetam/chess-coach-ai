import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import {
  getUserById,
  updateUserProgressMonotone,
} from "@/lib/server/users";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
import { upsertPuzzleRushLeaderboardEntry } from "@/lib/server/puzzleRushLeaderboard";
import { logger } from "@/lib/logging";

/**
 * GET/PUT `users/{uid}.progress` — durable training progress.
 *
 * Why a dedicated route rather than the profile PATCH: `/api/users/me` is for
 * preferences, validated field by field. Progress is a growing blob (rating
 * history, per-theme SRS cards) with entirely different write patterns —
 * written on a debounce during training rather than when someone edits a form.
 *
 * The server is a durable REPLICA, not the source of truth mid-session. The
 * client owns the live state, merges on load (`mergeProgress`), and pushes a
 * debounced snapshot. That keeps training fully functional offline and for
 * signed-out users, which is the existing behaviour and worth preserving.
 */

export const runtime = "nodejs";

const log = logger.child({ module: "progress" });

// Bounds are deliberate. This blob rides a Firestore document (1 MiB hard
// limit) and grows with use, so the two unbounded arrays are capped here
// rather than discovered in production as a write that suddenly fails.
const srsCardSchema = z.object({
  themeId: z.string().min(1).max(64),
  easeFactor: z.number().min(1).max(5),
  interval: z.number().min(0).max(3650),
  attempts: z.number().int().min(0).max(100000),
  nextReview: z.number().min(0),
  lastReviewed: z.number().min(0),
});

const progressSchema = z.object({
  streak: z.object({
    current: z.number().int().min(0).max(100000),
    best: z.number().int().min(0).max(100000),
    lastActiveDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  }),
  stats: z.object({
    rating: z.number().min(0).max(4000),
    totalAttempts: z.number().int().min(0),
    totalSolved: z.number().int().min(0),
    totalFailed: z.number().int().min(0),
    averageTimeMs: z.number().min(0),
    currentStreak: z.number().int().min(0),
    bestStreak: z.number().int().min(0),
    ratingHistory: z
      .array(z.object({ rating: z.number(), timestamp: z.number() }))
      .max(500),
    themeStats: z.record(
      z.string().max(64),
      z.object({
        attempts: z.number().int().min(0),
        solved: z.number().int().min(0),
        avgTimeMs: z.number().min(0),
        recentRatings: z.array(z.number()).max(50).optional(),
      }),
    ),
    // Headroom over the client's 500-record retention so a client that is
    // one release ahead can still sync.
    recentSolves: z.array(z.record(z.string(), z.unknown())).max(520),
  }),
  srs: z.record(z.string().max(64), srsCardSchema),
  // Optional so snapshots written before daily tracking existed still
  // validate. Capped at ~2x the 30-day retention window: a client that
  // stopped pruning should fail its own write, not silently bloat the doc.
  daily: z
    .record(
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      z.object({
        puzzles: z.number().int().min(0).max(100000),
        themes: z.array(z.string().max(64)).max(100),
      }),
    )
    .refine((d) => Object.keys(d).length <= 60, {
      message: "daily log exceeds retention window",
    })
    .optional(),
  // Puzzle Rush best scores. Optional for back-compat with clients that
  // predate rush syncing. A rush score is a solved-puzzle count, so six
  // digits is generous headroom over anything a human can reach.
  rush: z
    .object({
      threeMin: z.number().int().min(0).max(100000),
      fiveMin: z.number().int().min(0).max(100000),
      survivalBest: z.number().int().min(0).max(100000),
    })
    .optional(),
  // Coordinate Trainer best score. Optional for back-compat, same reasoning
  // as `rush` above — a count of squares found in one 60s round.
  coordinate: z
    .object({
      best: z.number().int().min(0).max(100000),
    })
    .optional(),
  updatedAt: z.number(),
});

export async function GET() {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  try {
    const user = await getUserById(guard.session.uid);
    const progress =
      (user as { progress?: unknown } | null)?.progress ?? null;
    return NextResponse.json({ progress });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    log.error("progress GET failed", { message: String(err) });
    return NextResponse.json({ error: "Read failed" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = progressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid progress payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    // Last write wins for most of the blob, on the reasoning that the client
    // merged the server copy into its own state before pushing. That is true
    // of one tab; two tabs each push a superset of a DIFFERENT starting point,
    // and for a best score the loser of that race is a personal best going
    // backwards. So the monotone fields are merged here as well — see
    // updateUserProgressMonotone.
    const storedProgress = await updateUserProgressMonotone(
      guard.session.uid,
      parsed.data as unknown as Record<string, unknown>
    );

    // Best-effort: the global leaderboard is a derived view, not the source
    // of truth, so a failure here must never fail the real progress save.
    // No handle (rare — pre-handle-system migrated accounts) means no entry:
    // that's the opt-in, not an error.
    // Publish what was actually STORED, not what was claimed: if this push was
    // a stale tab's, the merge above already restored the higher value and the
    // board should show that rather than re-litigating it.
    const storedRush = storedProgress.rush as
      | { threeMin: number; fiveMin: number; survivalBest: number }
      | undefined;
    if (storedRush) {
      try {
        const user = await getUserById(guard.session.uid);
        if (user?.handle) {
          await upsertPuzzleRushLeaderboardEntry(
            guard.session.uid,
            user.handle,
            storedRush
          );
        }
      } catch (err) {
        log.warn("puzzle rush leaderboard upsert failed", {
          message: String(err),
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    log.error("progress PUT failed", { message: String(err) });
    return NextResponse.json({ error: "Write failed" }, { status: 500 });
  }
}
