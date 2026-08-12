/**
 * POST /api/ratings/lookup
 *
 * Resolve the signed-in user's chess rating from their linked Lichess /
 * Chess.com accounts and persist it to their profile.
 *
 * Usernames come from the stored profile, never from the request body — the
 * body only says "refresh me". That keeps this from being an open proxy that
 * lets anyone enumerate arbitrary accounts through our origin.
 *
 * Absence is a first-class result. If neither account has an established
 * rating, we write nothing and say so; the caller must not substitute a
 * number (SILENT_SUBSTITUTION_HANDOFF §1.1).
 */

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getUserById, updateUser } from "@/lib/server/users";
import { fetchRatingsFor } from "@/lib/rating/fetchPlatformRatings";
import {
  selectCalibrationRating,
  type PlatformRatings,
} from "@/lib/rating/platformRatings";

export const runtime = "nodejs";

/** A successful lookup is reusable for this long before a refresh re-fetches. */
export const RATING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const { session } = guard;

  const user = await getUserById(session.uid);
  if (!user) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  // `force` is what the "Refresh my rating" button sends. Without it we honour
  // the TTL so an auto-refresh on page load can't hammer the platforms.
  let force = false;
  try {
    const body = (await request.json()) as { force?: boolean } | null;
    force = body?.force === true;
  } catch {
    // Empty body is fine — treat as a non-forced refresh.
  }

  const fetchedAt = user.platformRatingFetchedAt ?? 0;
  if (!force && Date.now() - fetchedAt < RATING_TTL_MS && user.platformRating) {
    return NextResponse.json({
      status: "cached",
      rating: user.platformRating,
      rawRating: user.platformRatingRaw,
      platform: user.platformRatingSource,
      perf: user.platformRatingPerf,
      fetchedAt,
    });
  }

  const targets: { platform: "lichess" | "chesscom"; username: string }[] = [];
  if (user.lichessUsername?.trim())
    targets.push({ platform: "lichess", username: user.lichessUsername.trim() });
  if (user.chesscomUsername?.trim())
    targets.push({ platform: "chesscom", username: user.chesscomUsername.trim() });

  if (targets.length === 0) {
    return NextResponse.json(
      { status: "no_username", message: "Add a Lichess or Chess.com username first." },
      { status: 200 }
    );
  }

  const results = await Promise.all(
    targets.map(async (t) => ({ ...t, outcome: await fetchRatingsFor(t.platform, t.username) }))
  );

  const sources: PlatformRatings[] = [];
  const problems: { platform: string; status: string; reason?: string }[] = [];
  for (const r of results) {
    if (r.outcome.status === "ok") sources.push(r.outcome.ratings);
    else
      problems.push({
        platform: r.platform,
        status: r.outcome.status,
        ...(r.outcome.status === "unavailable" ? { reason: r.outcome.reason } : {}),
      });
  }

  const selection = selectCalibrationRating(sources);

  if (!selection) {
    // Deliberately does NOT clear a previously-stored rating: a transient
    // outage must not silently downgrade a user who had a good value.
    return NextResponse.json({
      status: problems.length === targets.length ? "unavailable" : "no_established_rating",
      message:
        problems.length === targets.length
          ? "Could not reach the chess sites just now."
          : "No established rating found on that account yet — play a few more rated games.",
      problems,
      // Every perf we saw, so the UI can explain WHY nothing qualified.
      inspected: sources.map((s) => ({ platform: s.platform, perfs: s.perfs })),
    });
  }

  await updateUser(session.uid, {
    platformRating: selection.rating,
    platformRatingRaw: selection.rawRating,
    platformRatingSource: selection.platform,
    platformRatingPerf: selection.perf as "bullet" | "blitz" | "rapid" | "classical",
    platformRatingFetchedAt: Date.now(),
  });

  return NextResponse.json({
    status: "ok",
    rating: selection.rating,
    rawRating: selection.rawRating,
    platform: selection.platform,
    perf: selection.perf,
    games: selection.games,
    fetchedAt: Date.now(),
    // All established perfs across both platforms — this is the payload the
    // profile UI shows off ("we found your account"), and it is the reason the
    // auto-detect feels impressive rather than just convenient.
    all: sources.map((s) => ({ platform: s.platform, username: s.username, perfs: s.perfs })),
    problems,
  });
}
