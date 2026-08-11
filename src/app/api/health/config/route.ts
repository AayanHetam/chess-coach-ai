import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/health/config — presence check for every env var the product
 * needs to function. Names only, never values.
 *
 * Exists because env drift caused two multi-week outages that nothing
 * detected (SUPABASE_* absent → signup dead 2026-05-17→08-10; TRACKING_*
 * absent → pipeline dead). The heartbeat workflow curls this after every
 * deploy window; 503 + the missing names makes drift loud instead of silent.
 *
 * Listing names is not a secret leak — the required-var names are public in
 * the repo already; only presence/absence is revealed.
 */

const REQUIRED = [
  // Auth core — absence = nobody can sign up or in
  "SESSION_SECRET",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "NEXT_PUBLIC_APP_URL",
  // Coach — absence = no AI analysis
  "ANTHROPIC_API_KEY",
  // Intern portal allowlist (fails closed but should be present)
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  // Password-reset email delivery
  "RESEND_API_KEY",
] as const;

export async function GET() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  return NextResponse.json(
    {
      ok: missing.length === 0,
      missing,
      checked: REQUIRED.length,
      checkedAt: new Date().toISOString(),
    },
    { status: missing.length === 0 ? 200 : 503 }
  );
}
