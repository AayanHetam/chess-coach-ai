/**
 * Account-deletion CLI — the operational half of the /privacy promise
 * ("email us and we'll delete your account and saved games within seven days").
 *
 *   npx tsx scripts/ops/delete-user.ts --email someone@example.com
 *   npx tsx scripts/ops/delete-user.ts --uid abc123 --confirm
 *
 * DRY RUN BY DEFAULT. Without --confirm it only counts and prints; nothing is
 * destroyed. Run it that way first, read the plan, then re-run with --confirm.
 *
 * Needs the same Firebase Admin + Supabase service credentials the server uses
 * (.env.local). Run it from the repo root.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import {
  findUidByEmail,
  planUserDeletion,
  executeUserDeletion,
  UNTOUCHED_SURFACES,
  type DeletionPlan,
} from "../../src/lib/ops/deleteUserData";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function printPlan(plan: DeletionPlan) {
  console.log(`\nuid:     ${plan.uid}`);
  console.log(`email:   ${plan.email ?? "(none on the account doc)"}`);
  console.log(`account: ${plan.accountExists ? "exists" : "NOT FOUND"}`);
  console.log("\nSurfaces:");
  for (const s of plan.surfaces) {
    console.log(`  ${String(s.count).padStart(6)}  ${s.surface}`);
  }
  console.log(`  ${String(plan.totalDocs).padStart(6)}  TOTAL documents`);
}

function printUntouched() {
  console.log("\nNOT deleted by this tool — handle separately if relevant:");
  for (const s of UNTOUCHED_SURFACES) console.log(`  • ${s}`);
}

async function main() {
  const email = arg("email");
  const uidArg = arg("uid");
  const confirm = process.argv.includes("--confirm");

  if (!email && !uidArg) {
    console.error(
      "Usage: npx tsx scripts/ops/delete-user.ts (--email <e> | --uid <u>) [--confirm]",
    );
    process.exit(1);
  }

  const uid = uidArg ?? (await findUidByEmail(email!));
  if (!uid) {
    console.error(`No account found for email: ${email}`);
    console.error(
      "Nothing deleted. If they signed up with a different address, search Firestore `users` by hand before replying to them.",
    );
    process.exit(2);
  }

  if (!confirm) {
    const plan = await planUserDeletion(uid);
    printPlan(plan);
    printUntouched();
    console.log("\nDRY RUN — nothing was deleted.");
    console.log(`Re-run with --confirm to delete:\n  npx tsx scripts/ops/delete-user.ts --uid ${uid} --confirm\n`);
    return;
  }

  console.log(`\nDeleting all data for uid ${uid} …`);
  const result = await executeUserDeletion(uid);

  console.log("\nDeleted:");
  for (const s of result.deleted) {
    console.log(`  ${String(s.count).padStart(6)}  ${s.surface}`);
  }
  if (result.supabase) {
    console.log("\nSupabase (tracking):");
    for (const [table, n] of Object.entries(result.supabase.deleted)) {
      console.log(`  ${String(n).padStart(6)}  ${table}`);
    }
    for (const e of result.supabase.errors) console.log(`  ERROR: ${e}`);
  } else {
    console.log("\nSupabase (tracking): SKIPPED — see errors below.");
  }

  if (result.errors.length > 0) {
    console.log("\nErrors — the deletion is INCOMPLETE, do not report it as done:");
    for (const e of result.errors) console.log(`  • ${e}`);
  }

  printUntouched();
  console.log(
    result.errors.length === 0
      ? "\nDone. Re-run without --confirm to verify the surfaces now read 0.\n"
      : "\nFinished WITH ERRORS — re-run without --confirm to see what remains.\n",
  );
  if (result.errors.length > 0) process.exit(3);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
