import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "@/lib/auth/session";
import { getAuthEnv } from "@/env";

/**
 * Server-side guard for admin-only routes (CMIP-1.D `/admin/intern-data/*`).
 *
 * Returns either `{ session }` or `{ response: NextResponse(401|403) }`. Use
 * in route handlers:
 *
 *     const guard = await requireAdmin();
 *     if ("response" in guard) return guard.response;
 *     const { session } = guard;
 *
 * Admin identity: matches the logged-in email (lowercased) against
 * `CMIP_DASHBOARD_ADMIN_EMAIL`. v1 supports one admin; expand to comma-
 * separated list when there's a second human in this role.
 */

export async function requireAdmin(): Promise<
  | { session: SessionPayload }
  | { response: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return {
      response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    };
  }

  const admin = getAuthEnv().cmip.dashboardAdminEmail?.trim().toLowerCase();
  if (!admin) {
    console.error(
      "[requireAdmin] CMIP_DASHBOARD_ADMIN_EMAIL not set — no admin can reach admin routes."
    );
    return {
      response: NextResponse.json({ error: "Admin access not configured." }, { status: 403 }),
    };
  }

  if (session.email.trim().toLowerCase() !== admin) {
    return {
      response: NextResponse.json({ error: "Not authorized." }, { status: 403 }),
    };
  }

  return { session };
}
