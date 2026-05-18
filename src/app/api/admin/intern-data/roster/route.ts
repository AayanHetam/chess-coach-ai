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
 * GET /api/admin/intern-data/roster
 *
 * Returns one row per intern from `intern_allowlist` (auto-discovered — any
 * intern added via add-to-allowlist.mjs appears next page load with zero
 * code changes), joined to aggregated flag stats. Admin-only.
 *
 * Implementation: two queries, group in JS. Cheap at our scale (10 interns
 * × 10/week × 52 weeks ≈ 5,200 rows fits in a single response easily).
 */

export type RosterEntry = {
  email: string;
  cohort: string;
  addedAt: string;
  allTimeFlags: number;
  lastActivityAt: string | null;
  pacing: PacingResult;
};

export type RosterResponse = {
  generatedAt: string;
  programStartMs: number;
  weeklyTarget: number;
  entries: RosterEntry[];
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET() {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  try {
    const supabase = await getInternSupabase();

    const [allowlistRes, flagsRes] = await Promise.all([
      supabase
        .from("intern_allowlist")
        .select("email, cohort, added_at")
        .order("email", { ascending: true }),
      supabase.from("intern_flags").select("intern_email, flagged_at"),
    ]);

    if (allowlistRes.error) {
      console.error("[admin/roster] allowlist query failed:", allowlistRes.error.message);
      return NextResponse.json({ error: "Could not load roster." }, { status: 500 });
    }
    if (flagsRes.error) {
      console.error("[admin/roster] flags query failed:", flagsRes.error.message);
      return NextResponse.json({ error: "Could not load roster." }, { status: 500 });
    }

    const nowMs = Date.now();
    const thisWeekStart = getPTWeekStart(nowMs);

    // Bucket flags by (email, ptWeekStart). Track latest activity per email.
    const buckets = new Map<string, Map<number, number>>();
    const lastActivity = new Map<string, number>();

    for (const row of flagsRes.data ?? []) {
      const email = (row.intern_email as string).toLowerCase();
      const ms = Date.parse(row.flagged_at as string);
      if (Number.isNaN(ms)) continue;
      const wkStart = getPTWeekStart(ms);

      let weekMap = buckets.get(email);
      if (!weekMap) {
        weekMap = new Map();
        buckets.set(email, weekMap);
      }
      weekMap.set(wkStart, (weekMap.get(wkStart) ?? 0) + 1);

      const prev = lastActivity.get(email) ?? 0;
      if (ms > prev) lastActivity.set(email, ms);
    }

    const entries: RosterEntry[] = (allowlistRes.data ?? []).map((row) => {
      const email = (row.email as string).toLowerCase();
      const weekMap = buckets.get(email) ?? new Map<number, number>();
      const submittedThisWeek = weekMap.get(thisWeekStart) ?? 0;

      // Streak: walk back from the most-recent completed week.
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
        submittedThisWeek,
        streakWeeks: streak,
        nowMs,
      });

      let allTime = 0;
      weekMap.forEach((n) => (allTime += n));

      const lastMs = lastActivity.get(email);
      return {
        email: row.email as string,
        cohort: row.cohort as string,
        addedAt: row.added_at as string,
        allTimeFlags: allTime,
        lastActivityAt: lastMs ? new Date(lastMs).toISOString() : null,
        pacing,
      };
    });

    const body: RosterResponse = {
      generatedAt: new Date(nowMs).toISOString(),
      programStartMs: PROGRAM_START_MS,
      weeklyTarget: WEEKLY_TARGET,
      entries,
    };

    return NextResponse.json(body);
  } catch (err) {
    console.error("[admin/roster] unexpected", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
