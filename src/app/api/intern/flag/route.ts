import { internEmailFor } from "@/lib/intern/allowlist";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getSession } from "@/lib/auth/session";
import { getInternSupabase } from "@/lib/intern/supabase";
import { captureFlagContext } from "@/lib/intern/captureContext";

export const runtime = "nodejs";

/**
 * POST /api/intern/flag
 *
 * Captures a "this assistant response was bad" event from an intern's
 * dogfooding session. Intern-only — non-intern sessions get 403.
 *
 * Body shape: see flagSchema. The browser sends the full chat history
 * because follow-up chat messages are not server-cached (only the initial
 * analysis context is). The server reads game state (PGN, FEN) from the
 * cached AnalysisContext via contextId when present.
 */

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(50_000),
});

const flagSchema = z.object({
  contextId: z.string().min(1).max(64).nullable(),
  chatHistory: z.array(messageSchema).min(1).max(200),
  flaggedMessageIndex: z.number().int().min(0).max(199),
  flagCategory: z.enum(["bad", "inaccurate", "incomplete"]),
  whyWrong: z
    .string()
    .min(30, "Explain in at least 30 characters why the analysis is wrong.")
    .max(5_000),
  idealResponse: z
    .string()
    .min(50, "The ideal response must be at least 50 characters.")
    .max(20_000),
});

export async function POST(request: Request) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let input: z.infer<typeof flagSchema>;
  try {
    input = flagSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid flag payload.", issues: err.issues },
        { status: 400 }
      );
    }
    throw err;
  }

  const captured = captureFlagContext({
    contextId: input.contextId,
    chatHistory: input.chatHistory,
    flaggedMessageIndex: input.flaggedMessageIndex,
  });
  if (!captured.ok) {
    return NextResponse.json({ error: captured.error }, { status: 400 });
  }

  try {
    const supabase = await getInternSupabase();
    const { data, error } = await supabase
      .from("intern_flags")
      .insert({
        intern_email: internEmail,
        intern_uid: session.uid,
        chat_session_id: captured.chatSessionId,
        flagged_message_id: captured.flaggedMessageId,
        flagged_message_content: captured.flaggedMessageContent,
        flagged_message_index: captured.flaggedMessageIndex,
        prompt_version: captured.promptVersion,
        chat_history: captured.chatHistory,
        game_pgn: captured.gamePgn,
        fen_at_flag: captured.fenAtFlag,
        flag_category: input.flagCategory,
        why_wrong: input.whyWrong.trim(),
        ideal_response: input.idealResponse.trim(),
      })
      .select("id")
      .single();

    if (error) {
      console.error("[intern/flag] insert failed:", error.message);
      // If the intern's email is somehow not in intern_allowlist (race with
      // an allowlist removal between sign-in and flag), the FK throws.
      if (error.code === "23503") {
        return NextResponse.json(
          { error: "Intern access has been revoked. Sign in again." },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: "Could not capture flag. Try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, flagId: data?.id }, { status: 201 });
  } catch (err) {
    console.error("[intern/flag] unexpected", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
