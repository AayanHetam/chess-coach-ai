/**
 * GET /api/ratings/history?window=90
 *
 * Bullet / blitz / rapid trend series for the signed-in user's linked account,
 * for the graphs on /plan.
 *
 * Username comes from the stored profile, never a query param — same reasoning
 * as /api/ratings/lookup: this must not become an open proxy for enumerating
 * arbitrary accounts through our origin.
 *
 * An empty series is a legitimate answer ("you haven't played rapid"), and is
 * reported as such rather than being padded with a flat line at some default.
 */

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getUserById } from "@/lib/server/users";
import { fetchHistoryFor } from "@/lib/rating/fetchRatingHistory";
import { selectHistoryTarget } from "@/lib/rating/historyTarget";
import {
  CHARTED_PERFS,
  buildTrend,
  downsampleDaily,
  type ChartedPerf,
} from "@/lib/rating/ratingHistory";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * A year, deliberately — matched to ARCHIVE_MONTH_CAP so the Chess.com crawl
 * isn't paying for 12 months of archives and then discarding nine of them.
 * A shorter default also renders three empty panels for anyone who has taken a
 * break, which is a large share of the people a coaching product attracts.
 */
const DEFAULT_WINDOW_DAYS = 365;
const MAX_WINDOW_DAYS = 365;

export async function GET(request: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  const user = await getUserById(guard.session.uid);
  if (!user)
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });

  const url = new URL(request.url);
  const requested = Number.parseInt(url.searchParams.get("window") ?? "", 10);
  const windowDays =
    Number.isFinite(requested) && requested > 0
      ? Math.min(requested, MAX_WINDOW_DAYS)
      : DEFAULT_WINDOW_DAYS;

  // One platform per request: crawling both would double the upstream cost for
  // a chart that can only show one scale anyway — Lichess and Chess.com numbers
  // are not comparable on a shared axis.
  //
  // Selection is delegated because getting it wrong is invisible. This used to
  // choose a platform from `platformRatingSource`/`primaryPlatform` and only
  // then look for that platform's username, so a profile whose preference
  // pointed at a site it had no username for reported `no_username` — three
  // trend graphs replaced by an "add your username" prompt for a user who had
  // already added one, on the other site.
  const target = selectHistoryTarget(user);

  if (!target) {
    return NextResponse.json({ status: "no_username", trends: [] });
  }
  const { platform, username } = target;

  const series = await fetchHistoryFor(platform, username);
  if (!series) {
    return NextResponse.json({
      status: "unavailable",
      message: `Couldn't reach ${platform === "lichess" ? "Lichess" : "Chess.com"} just now.`,
      trends: [],
    });
  }

  const since = Date.now() - windowDays * DAY_MS;
  const trends = CHARTED_PERFS.map((perf: ChartedPerf) =>
    buildTrend(perf, downsampleDaily(series[perf], since), platform)
  );

  return NextResponse.json({
    status: "ok",
    platform,
    username,
    windowDays,
    trends,
  });
}
