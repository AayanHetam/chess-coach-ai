// One-off verification: confirms the intern_allowlist table exists and has rows.
// Run after pasting supabase/migrations/*.sql + supabase/seed.sql into the
// Supabase dashboard SQL editor.
//
// Usage: node scripts/intern/verify-allowlist.mjs

import { config as dotenvConfig } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Next.js loads .env.local automatically at runtime; this one-off script doesn't.
dotenvConfig({ path: ".env.local" });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

const { data, error } = await supabase
  .from("intern_allowlist")
  .select("email, cohort, added_at")
  .order("added_at", { ascending: true });

if (error) {
  console.error("Query failed:", error.message);
  console.error("\nLikely cause: migration not yet applied.");
  console.error("Paste supabase/migrations/20260517103800_intern_allowlist.sql");
  console.error("+ supabase/seed.sql into your Supabase dashboard's SQL Editor,");
  console.error("then re-run this script.");
  process.exit(1);
}

console.log(`intern_allowlist OK — ${data?.length ?? 0} rows:`);
for (const row of data ?? []) {
  console.log(`  - ${row.email}  (${row.cohort}, added ${row.added_at})`);
}
process.exit(0);
