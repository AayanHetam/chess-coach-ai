import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { getUserById, updateUser } from "@/lib/server/users";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
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
    recentSolves: z.array(z.record(z.string(), z.unknown())).max(200),
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
    // Last write wins at this layer on purpose: the client has already merged
    // the server copy into its own state before pushing, so what arrives here
    // is a superset of what's stored. Merging again server-side would need a
    // transaction for no added safety.
    await updateUser(guard.session.uid, {
      progress: parsed.data,
    } as Parameters<typeof updateUser>[1]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    log.error("progress PUT failed", { message: String(err) });
    return NextResponse.json({ error: "Write failed" }, { status: 500 });
  }
}
