import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getInternSupabase } from "@/lib/intern/supabase";

export const runtime = "nodejs";

/**
 * GET /api/admin/intern-data/export[?include_attribution=1]
 *
 * Streams all intern_flags rows as JSONL (newline-delimited JSON). Default
 * omits intern_email so downstream eval consumers (Mastermind synthetic-
 * tester, few-shot loaders) work on the (bad, ideal) pair without
 * attribution. Pass ?include_attribution=1 for legitimate auditing.
 *
 * Schema version 1.0.0 — bump major on any breaking change.
 */

const SCHEMA_VERSION = "1.0.0";

type ExportRow = {
  schema_version: string;
  submission_id: string;
  submitted_at: string;
  context: {
    chat_history: Array<{ role: string; content: string }>;
    game_pgn: string | null;
    fen_at_flag: string | null;
  };
  bad_response: {
    content: string;
    tier: string | null;
    prompt_version: string;
  };
  ideal_response: string;
  flag_metadata: {
    category: "bad" | "inaccurate" | "incomplete";
    why_wrong: string;
  };
  intern_email?: string;
};

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  const url = new URL(request.url);
  const includeAttribution = url.searchParams.get("include_attribution") === "1";

  const supabase = await getInternSupabase();
  const { data, error } = await supabase
    .from("intern_flags")
    .select(
      "id, flagged_at, flag_category, flagged_message_content, flagged_message_tier, prompt_version, chat_history, game_pgn, fen_at_flag, why_wrong, ideal_response, intern_email"
    )
    .order("flagged_at", { ascending: true });

  if (error) {
    console.error("[admin/export] query failed:", error.message);
    return new Response(JSON.stringify({ error: "Could not export." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const lines = (data ?? []).map((row) => {
    const out: ExportRow = {
      schema_version: SCHEMA_VERSION,
      submission_id: row.id as string,
      submitted_at: row.flagged_at as string,
      context: {
        chat_history: row.chat_history as ExportRow["context"]["chat_history"],
        game_pgn: (row.game_pgn as string) ?? null,
        fen_at_flag: (row.fen_at_flag as string) ?? null,
      },
      bad_response: {
        content: row.flagged_message_content as string,
        tier: (row.flagged_message_tier as string) ?? null,
        prompt_version: row.prompt_version as string,
      },
      ideal_response: row.ideal_response as string,
      flag_metadata: {
        category: row.flag_category as ExportRow["flag_metadata"]["category"],
        why_wrong: row.why_wrong as string,
      },
    };
    if (includeAttribution) out.intern_email = row.intern_email as string;
    return JSON.stringify(out);
  });

  const body = lines.join("\n") + (lines.length ? "\n" : "");
  const filenameStem = `cmip-submissions-${new Date().toISOString().slice(0, 10)}`;
  const filename = includeAttribution
    ? `${filenameStem}-with-attribution.jsonl`
    : `${filenameStem}.jsonl`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
