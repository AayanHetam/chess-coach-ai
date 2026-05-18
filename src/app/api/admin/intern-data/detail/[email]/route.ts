import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getInternSupabase } from "@/lib/intern/supabase";
import {
  computePacing,
  getPTWeekStart,
  PROGRAM_START_MS,
  WEEKLY_TARGET,
  type PacingResult,
} from "@/lib/intern/pacing";

export const runtime = "nodejs";

/**
 * GET /api/admin/intern-data/detail/[email]
 *
 * Admin-only. One intern's full picture: pacing, last-8-weeks bucket counts
 * (for a chart), recent submissions (most recent 50 with previews).
 */

export type AdminInternDetail = {
  email: string;
  cohort: string;
  pacing: PacingResult;
  weekBuckets: Array<{ weekStartMs: number; count: number }>;
  recentSubmissions: Array<{
    id: string;
    flaggedAt: string;
    category: "bad" | "inaccurate" | "incomplete";
    badResponsePreview: string;
    whyWrongPreview: string;
    idealResponsePreview: string;
  }>;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKS_BACK = 8;
const PREVIEW_CHARS = 200;
const RECENT_LIMIT = 50;

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export async function GET(_request: Request, { params }: { params: Promise<{ email: string }> }) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  const { email: emailParam } = await params;
  const email = decodeURIComponent(emailParam).trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }

  try {
    const supabase = await getInternSupabase();

    const [allowlistRes, flagsRes, recentRes] = await Promise.all([
      supabase
        .from("intern_allowlist")
        .select("email, cohort")
        .eq("email", email)
        .maybeSingle(),
      supabase.from("intern_flags").select("flagged_at").eq("intern_email", email),
      supabase
        .from("intern_flags")
        .select(
          "id, flagged_at, flag_category, flagged_message_content, why_wrong, ideal_response"
        )
        .eq("intern_email", email)
        .order("flagged_at", { ascending: false })
        .limit(RECENT_LIMIT),
    ]);

    if (allowlistRes.error) {
      console.error("[admin/detail] allowlist query failed:", allowlistRes.error.message);
      return NextResponse.json({ error: "Could not load detail." }, { status: 500 });
    }
    if (!allowlistRes.data) {
      return NextResponse.json({ error: "Intern not found." }, { status: 404 });
    }
    if (flagsRes.error || recentRes.error) {
      console.error("[admin/detail] flag queries failed");
      return NextResponse.json({ error: "Could not load detail." }, { status: 500 });
    }

    const nowMs = Date.now();
    const thisWeekStart = getPTWeekStart(nowMs);

    // Bucket all flags by PT week.
    const weekMap = new Map<number, number>();
    for (const row of flagsRes.data ?? []) {
      const ms = Date.parse(row.flagged_at as string);
      if (Number.isNaN(ms)) continue;
      const wkStart = getPTWeekStart(ms);
      weekMap.set(wkStart, (weekMap.get(wkStart) ?? 0) + 1);
    }

    // Streak.
    let streak = 0;
    let cursor = thisWeekStart - WEEK_MS;
    while (cursor >= PROGRAM_START_MS) {
      if ((weekMap.get(cursor) ?? 0) >= WEEKLY_TARGET) {
        streak++;
        cursor -= WEEK_MS;
      } else {
        break;
      }
    }

    const pacing = computePacing({
      submittedThisWeek: weekMap.get(thisWeekStart) ?? 0,
      streakWeeks: streak,
      nowMs,
    });

    // Last-N-weeks buckets, oldest → newest.
    const weekBuckets: AdminInternDetail["weekBuckets"] = [];
    for (let i = WEEKS_BACK - 1; i >= 0; i--) {
      const wkStart = thisWeekStart - i * WEEK_MS;
      weekBuckets.push({ weekStartMs: wkStart, count: weekMap.get(wkStart) ?? 0 });
    }

    const recentSubmissions: AdminInternDetail["recentSubmissions"] = (recentRes.data ?? []).map(
      (row) => ({
        id: row.id as string,
        flaggedAt: row.flagged_at as string,
        category: row.flag_category as "bad" | "inaccurate" | "incomplete",
        badResponsePreview: truncate(row.flagged_message_content as string, PREVIEW_CHARS),
        whyWrongPreview: truncate(row.why_wrong as string, PREVIEW_CHARS),
        idealResponsePreview: truncate(row.ideal_response as string, PREVIEW_CHARS),
      })
    );

    const detail: AdminInternDetail = {
      email: allowlistRes.data.email as string,
      cohort: allowlistRes.data.cohort as string,
      pacing,
      weekBuckets,
      recentSubmissions,
    };

    return NextResponse.json(detail);
  } catch (err) {
    console.error("[admin/detail] unexpected", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
