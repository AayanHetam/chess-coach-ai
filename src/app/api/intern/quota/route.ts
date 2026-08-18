import { internEmailFor } from "@/lib/intern/allowlist";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getInternSupabase } from "@/lib/intern/supabase";
import {
  computePacing,
  getPTWeekStart,
  PROGRAM_START_MS,
  WEEKLY_TARGET,
} from "@/lib/intern/pacing";

export const runtime = "nodejs";

/**
 * GET /api/intern/quota
 *
 * Returns the logged-in intern's PacingResult — the data the QuotaWidget
 * renders. Intern-only.
 *
 * Implementation: fetches all of the intern's flagged_at dates, buckets
 * them into PT week-starts in JS, then walks backwards to compute streak.
 * Cheap at our row counts (10 submissions/wk × 50 weeks = 500 rows/intern).
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!session.isIntern) {
    return NextResponse.json({ error: "Intern-only." }, { status: 403 });
  }

  // Interns are keyed by email in Supabase. A session without one cannot
  // be an intern (isIntern is stamped from an allowlist lookup BY email),
  // so this is a refusal rather than a non-null assertion.
  const internEmail = internEmailFor(session);
  if (!internEmail) {
    return NextResponse.json(
      { error: "Intern access required." },
      { status: 403 }
    );
  }

  try {
    const supabase = await getInternSupabase();
    const { data, error } = await supabase
      .from("intern_flags")
      .select("flagged_at")
      .eq("intern_email", internEmail)
      .order("flagged_at", { ascending: false });

    if (error) {
      console.error("[intern/quota] query failed:", error.message);
      return NextResponse.json(
        { error: "Could not load quota." },
        { status: 500 }
      );
    }

    const nowMs = Date.now();
    const thisWeekStart = getPTWeekStart(nowMs);

    // Bucket each submission into its PT week-start.
    const byWeek = new Map<number, number>();
    for (const row of data ?? []) {
      const ms = Date.parse(row.flagged_at as string);
      if (Number.isNaN(ms)) continue;
      const wkStart = getPTWeekStart(ms);
      byWeek.set(wkStart, (byWeek.get(wkStart) ?? 0) + 1);
    }

    const submittedThisWeek = byWeek.get(thisWeekStart) ?? 0;

    // Streak: walk backwards from the most-recent fully-completed week.
    // A week counts toward the streak iff its submission count ≥ target AND
    // it's on or after PROGRAM_START_MS. The current (in-progress) week is
    // excluded from streak calculation — it isn't yet "completed."
    let streakWeeks = 0;
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    let cursor = thisWeekStart - WEEK_MS;
    while (cursor >= PROGRAM_START_MS) {
      const count = byWeek.get(cursor) ?? 0;
      if (count >= WEEKLY_TARGET) {
        streakWeeks++;
        cursor -= WEEK_MS;
      } else {
        break;
      }
    }

    const pacing = computePacing({
      submittedThisWeek,
      streakWeeks,
      nowMs,
    });

    return NextResponse.json(pacing);
  } catch (err) {
    console.error("[intern/quota] unexpected", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
