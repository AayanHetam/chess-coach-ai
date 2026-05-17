import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getInternSupabase } from "@/lib/intern/supabase";

export const runtime = "nodejs";

/**
 * GET /api/intern/submissions/list
 *
 * Returns the logged-in intern's own flag rows, newest first, with content
 * previews truncated to keep the response small. Detail view fetches the
 * full row via /api/intern/submissions/[id].
 *
 * Intern-only. Pagination is fixed at most-recent 100 for v1 — interns
 * unlikely to backscroll further; can add ?limit / ?cursor later if needed.
 */

const LIST_LIMIT = 100;
const PREVIEW_CHARS = 240;

export type SubmissionListItem = {
  id: string;
  flaggedAt: string;
  category: "bad" | "inaccurate" | "incomplete";
  badResponsePreview: string;
  whyWrongPreview: string;
  idealResponsePreview: string;
  gamePgnPreview: string | null;
  hasGame: boolean;
};

function truncate(s: string | null, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!session.isIntern) {
    return NextResponse.json({ error: "Intern-only." }, { status: 403 });
  }

  try {
    const supabase = await getInternSupabase();
    const { data, error } = await supabase
      .from("intern_flags")
      .select(
        "id, flagged_at, flag_category, flagged_message_content, why_wrong, ideal_response, game_pgn"
      )
      .eq("intern_email", session.email.toLowerCase())
      .order("flagged_at", { ascending: false })
      .limit(LIST_LIMIT);

    if (error) {
      console.error("[intern/submissions/list] query failed:", error.message);
      return NextResponse.json({ error: "Could not load submissions." }, { status: 500 });
    }

    const items: SubmissionListItem[] = (data ?? []).map((row) => ({
      id: row.id as string,
      flaggedAt: row.flagged_at as string,
      category: row.flag_category as "bad" | "inaccurate" | "incomplete",
      badResponsePreview: truncate(row.flagged_message_content as string, PREVIEW_CHARS),
      whyWrongPreview: truncate(row.why_wrong as string, PREVIEW_CHARS),
      idealResponsePreview: truncate(row.ideal_response as string, PREVIEW_CHARS),
      gamePgnPreview: row.game_pgn ? truncate(row.game_pgn as string, 80) : null,
      hasGame: row.game_pgn != null,
    }));

    return NextResponse.json({ items, limit: LIST_LIMIT });
  } catch (err) {
    console.error("[intern/submissions/list] unexpected", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
