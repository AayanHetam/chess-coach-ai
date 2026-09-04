/**
 * GET /api/leaderboards/puzzle-rush?mode=threeMin|fiveMin|survivalBest
 *
 * Unauthenticated, public top-50 read. The data itself carries no privacy
 * boundary — a handle + a score, the same pair already visible in-app — so
 * this is rate-limited and cached purely as an availability/cost courtesy,
 * same posture as /api/ratings/preview, not as a security control.
 */

import { NextResponse } from "next/server";
import {
  countPuzzleRushEntries,
  getPuzzleRushLeaderboard,
  RUSH_LEADERBOARD_MODES,
  type RushMode,
} from "@/lib/server/puzzleRushLeaderboard";
import { withSeedEntries } from "@/lib/server/puzzleRushSeedEntries";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
import { logger } from "@/lib/logging";

export const runtime = "nodejs";

const log = logger.child({ module: "leaderboards/puzzle-rush" });

const RATE_LIMIT = { windowMs: 60_000, max: 30 };
// Short enough that a board someone else just topped feels live, long enough
// to absorb the burst of a page full of mode-switching. A player looking at
// their OWN just-set score does not depend on this expiring: the sync
// endpoint answers with the post-write board directly, because this cache is
// per-instance and a re-GET can land on an instance that never saw the write.
const CACHE_TTL_MS = 20_000;

// This response is already cached above, per instance, on purpose. Letting a
// browser or the CDN cache it as well would stack a second, invisible TTL on
// top and strand a viewer on a board minutes older than the one the tab next
// to it is showing.
const NO_STORE = { "Cache-Control": "no-store" };

// Rows returned to the client. The UI renders ten; the rest is headroom so a
// deeper board needs no server change.
const BOARD_LIMIT = 50;

const hits = new Map<string, number[]>();
const cache = new Map<RushMode, { at: number; body: unknown }>();

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return (
    fwd?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"
  );
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
  if (hits.size > 5000) {
    for (const k of Array.from(hits.keys())) {
      const v = hits.get(k) ?? [];
      if (v.every((t: number) => now - t > RATE_LIMIT.windowMs)) hits.delete(k);
    }
  }
  return false;
}

function isRushMode(v: string | null): v is RushMode {
  return v !== null && (RUSH_LEADERBOARD_MODES as string[]).includes(v);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const modeParam = url.searchParams.get("mode");
  const mode: RushMode = isRushMode(modeParam) ? modeParam : "threeMin";

  const cached = cache.get(mode);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.body, { headers: NO_STORE });
  }

  // Checked after the cache so concurrent page views sharing a fresh cache
  // entry never burn a visitor's budget.
  if (rateLimited(clientIp(request))) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute." },
      { status: 429, headers: NO_STORE },
    );
  }

  try {
    const [real, realCount] = await Promise.all([
      getPuzzleRushLeaderboard(mode),
      countPuzzleRushEntries(mode),
    ]);
    // Placeholders while the board is too empty to be worth reading; they
    // vanish on their own once enough real scores exist. Never stored.
    const entries = withSeedEntries(real, mode, realCount, BOARD_LIMIT);
    const body = { mode, entries };
    cache.set(mode, { at: Date.now(), body });
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    log.error("leaderboard read failed", { mode, message: String(err) });
    return NextResponse.json({ error: "Read failed" }, { status: 500 });
  }
}
