import { getAuthEnv } from "@/env";

/**
 * Pure email check. Used at sign-in time (to stamp the JWT claim) AND on
 * every admin-only request (via requireAdmin) so an env change takes effect
 * without re-signin on the server side.
 */
export function isDashboardAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  const admin = getAuthEnv().cmip.dashboardAdminEmail?.trim().toLowerCase();
  if (!admin) return false;
  return email.trim().toLowerCase() === admin;
}
