// Add a single email to the CMIP intern_allowlist.
//
// Usage: node scripts/intern/add-to-allowlist.mjs <email> [cohort]
// Cohort defaults to 'cmip-2026'. Idempotent (ON CONFLICT DO NOTHING).
//
// Useful for ad-hoc testing (add your own email, sign in, see employee
// chrome) and for onboarding new interns until the admin UI lands in a
// CMIP-1.D follow-up.

import { config as dotenvConfig } from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenvConfig({ path: ".env.local" });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const email = process.argv[2]?.trim().toLowerCase();
const cohort = process.argv[3] ?? "cmip-2026";

if (!email || !email.includes("@")) {
  console.error("Usage: node scripts/intern/add-to-allowlist.mjs <email> [cohort]");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

const { error } = await supabase
  .from("intern_allowlist")
  .upsert({ email, cohort }, { onConflict: "email" });

if (error) {
  console.error("Insert failed:", error.message);
  process.exit(1);
}

console.log(`OK — ${email} added to intern_allowlist (cohort: ${cohort}).`);
console.log("Sign out + sign back in for the JWT claim to refresh.");
