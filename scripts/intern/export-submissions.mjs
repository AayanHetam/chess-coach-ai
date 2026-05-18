// CLI export of intern_flags as JSONL.
//
// Usage:
//   node scripts/intern/export-submissions.mjs > submissions.jsonl
//   node scripts/intern/export-submissions.mjs --with-attribution > submissions.jsonl
//
// Wraps the same logic as GET /api/admin/intern-data/export but works
// without a running dev server (talks directly to Supabase via the
// service role key). Useful for ops-side exports.

import { config as dotenvConfig } from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenvConfig({ path: ".env.local" });

const SCHEMA_VERSION = "1.0.0";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const includeAttribution = process.argv.includes("--with-attribution");

const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

const { data, error } = await supabase
  .from("intern_flags")
  .select(
    "id, flagged_at, flag_category, flagged_message_content, flagged_message_tier, prompt_version, chat_history, game_pgn, fen_at_flag, why_wrong, ideal_response, intern_email"
  )
  .order("flagged_at", { ascending: true });

if (error) {
  console.error("Export failed:", error.message);
  process.exit(1);
}

for (const row of data ?? []) {
  const out = {
    schema_version: SCHEMA_VERSION,
    submission_id: row.id,
    submitted_at: row.flagged_at,
    context: {
      chat_history: row.chat_history,
      game_pgn: row.game_pgn ?? null,
      fen_at_flag: row.fen_at_flag ?? null,
    },
    bad_response: {
      content: row.flagged_message_content,
      tier: row.flagged_message_tier ?? null,
      prompt_version: row.prompt_version,
    },
    ideal_response: row.ideal_response,
    flag_metadata: {
      category: row.flag_category,
      why_wrong: row.why_wrong,
    },
  };
  if (includeAttribution) out.intern_email = row.intern_email;
  process.stdout.write(JSON.stringify(out) + "\n");
}

process.stderr.write(`Exported ${data?.length ?? 0} rows.\n`);
