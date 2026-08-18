/**
 * POST /api/ratings/preview  { platform, username }
 *
 * Unauthenticated rating lookup, used by ONE caller: the onboarding quiz, which
 * needs the visitor's current rating to draw their goal projection before they
 * have an account.
 *
 * ── Why this exists when /api/ratings/lookup deliberately refuses to do it ──
 *
 * `/lookup` takes usernames only from the stored profile, specifically so it
 * can't be used as an open proxy. This route accepts a username from the body,
 * which is the thing that route avoids. That is a real, deliberate trade:
 *
 *  - The data is already public. Both upstream endpoints are unauthenticated
 *    and world-readable; nothing here is disclosed that a browser could not
 *    fetch directly. There is no privacy boundary being crossed.
 *  - The genuine risk is being a free relay that gets OUR egress IP
 *    rate-limited by Lichess or Chess.com — an availability problem, not a
 *    disclosure one. So this route is rate-limited per IP and caches hard.
 *  - It returns ONLY a rating summary. No games, no history, no account
 *    metadata, nothing that would make it useful for scraping.
 *
 * Absence stays absence: an unknown username returns not_found, and a player
 * with no established rating returns no_established_rating. Neither invents a
 * number (SILENT_SUBSTITUTION §1.1).
 */

import { NextResponse } from "next/server";
import { fetchRatingsFor } from "@/lib/rating/fetchPlatformRatings";
import { selectCalibrationRating } from "@/lib/rating/platformRatings";

export const runtime = "nodejs";

/** Per-IP budget. Generous for a human filling in a quiz, useless for scraping. */
const RATE_LIMIT = { windowMs: 60_000, max: 10 };
const CACHE_TTL_MS = 10 * 60_000;

/**
 * Module-level maps, so they reset on cold start and are per-instance rather
 * than global. That is fine for both jobs here: the rate limit is a courtesy
 * throttle, not a security control, and the cache is an optimisation. Neither
 * needs to be strongly consistent, and neither is worth a Redis dependency.
 */
const hits = new Map<string, number[]>();
const cache = new Map<string, { at: number; body: unknown }>();

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  if (recent.length >= RATE_LIMIT.max) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  // Opportunistic sweep so an instance that lives a long time doesn't grow
  // one entry per visitor forever.
  if (hits.size > 5000) {
    for (const k of Array.from(hits.keys())) {
      const v = hits.get(k) ?? [];
      if (v.every((t: number) => now - t > RATE_LIMIT.windowMs)) hits.delete(k);
    }
  }
  return false;
}

export async function POST(request: Request) {
  let platform: unknown;
  let username: unknown;
  try {
    const body = (await request.json()) as { platform?: unknown; username?: unknown };
    platform = body?.platform;
    username = body?.username;
  } catch {
    return NextResponse.json({ status: "bad_request" }, { status: 400 });
  }

  if ((platform !== "lichess" && platform !== "chesscom") || typeof username !== "string") {
    return NextResponse.json({ status: "bad_request" }, { status: 400 });
  }
  const handle = username.trim();
  if (!handle) return NextResponse.json({ status: "bad_request" }, { status: 400 });

  const key = `${platform}:${handle.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.body);
  }

  // Checked AFTER the cache so a repeated lookup of the same handle — which
  // costs us nothing upstream — never burns the caller's budget.
  if (rateLimited(clientIp(request))) {
    return NextResponse.json(
      { status: "rate_limited", message: "Too many lookups. Try again in a minute." },
      { status: 429 }
    );
  }

  const outcome = await fetchRatingsFor(platform, handle);
  if (outcome.status !== "ok") {
    const body =
      outcome.status === "not_found"
        ? { status: "not_found", message: `No ${platform === "lichess" ? "Lichess" : "Chess.com"} account called "${handle}".` }
        : { status: "unavailable", message: "Couldn't reach the chess site just now." };
    // Only not_found is cached — an outage must not be remembered for 10 min.
    if (outcome.status === "not_found") cache.set(key, { at: Date.now(), body });
    return NextResponse.json(body);
  }

  const selection = selectCalibrationRating([outcome.ratings]);
  const body = selection
    ? {
        status: "ok" as const,
        rating: selection.rating,
        rawRating: selection.rawRating,
        platform: selection.platform,
        perf: selection.perf,
        perfs: outcome.ratings.perfs,
      }
    : {
        status: "no_established_rating" as const,
        message: "No established rating there yet — play a few more rated games.",
        perfs: outcome.ratings.perfs,
      };

  cache.set(key, { at: Date.now(), body });
  return NextResponse.json(body);
}
