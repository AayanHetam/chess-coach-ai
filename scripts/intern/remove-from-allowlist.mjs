// Remove an email from intern_allowlist.
//
// Usage: node scripts/intern/remove-from-allowlist.mjs <email>
//
// Takes effect on the intern's next sign-in (the JWT claim is stamped at
// session creation, not on every request).

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
if (!email || !email.includes("@")) {
  console.error("Usage: node scripts/intern/remove-from-allowlist.mjs <email>");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

const { error, count } = await supabase
  .from("intern_allowlist")
  .delete({ count: "exact" })
  .eq("email", email);

if (error) {
  console.error("Delete failed:", error.message);
  process.exit(1);
}

if (count === 0) {
  console.log(`No matching row for ${email} (already absent).`);
} else {
  console.log(`OK — removed ${email} from intern_allowlist.`);
  console.log("Affected user reverts to customer view on next sign-in.");
}
