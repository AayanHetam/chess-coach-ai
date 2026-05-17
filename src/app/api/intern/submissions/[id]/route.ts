import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getInternSupabase } from "@/lib/intern/supabase";

export const runtime = "nodejs";

/**
 * GET /api/intern/submissions/[id]
 *
 * Single submission detail. Intern-only AND scoped to the logged-in intern
 * (returns 404 if the row belongs to a different intern, to avoid leaking
 * the existence of other interns' rows via 403 vs 404 differentiation).
 */

export type SubmissionDetail = {
  id: string;
  flaggedAt: string;
  category: "bad" | "inaccurate" | "incomplete";
  badResponse: string;
  whyWrong: string;
  idealResponse: string;
  chatHistory: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  flaggedMessageIndex: number;
  gamePgn: string | null;
  fenAtFlag: string | null;
  promptVersion: string;
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!session.isIntern) {
    return NextResponse.json({ error: "Intern-only." }, { status: 403 });
  }

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const supabase = await getInternSupabase();
    const { data, error } = await supabase
      .from("intern_flags")
      .select(
        "id, flagged_at, flag_category, flagged_message_content, flagged_message_index, why_wrong, ideal_response, chat_history, game_pgn, fen_at_flag, prompt_version, intern_email"
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[intern/submissions/[id]] query failed:", error.message);
      return NextResponse.json({ error: "Could not load submission." }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    // Privacy: only the owning intern can read their submission. Return 404
    // rather than 403 so we don't reveal the row's existence to other interns.
    if ((data.intern_email as string).toLowerCase() !== session.email.toLowerCase()) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const detail: SubmissionDetail = {
      id: data.id as string,
      flaggedAt: data.flagged_at as string,
      category: data.flag_category as "bad" | "inaccurate" | "incomplete",
      badResponse: data.flagged_message_content as string,
      whyWrong: data.why_wrong as string,
      idealResponse: data.ideal_response as string,
      chatHistory: data.chat_history as SubmissionDetail["chatHistory"],
      flaggedMessageIndex: data.flagged_message_index as number,
      gamePgn: (data.game_pgn as string) ?? null,
      fenAtFlag: (data.fen_at_flag as string) ?? null,
      promptVersion: data.prompt_version as string,
    };

    return NextResponse.json(detail);
  } catch (err) {
    console.error("[intern/submissions/[id]] unexpected", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
