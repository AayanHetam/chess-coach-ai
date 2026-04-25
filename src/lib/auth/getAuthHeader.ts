import { auth } from "@/lib/firebase";

/**
 * Client-side helper. Returns the Authorization header for the current
 * Firebase user, or an empty object if no user is signed in / Firebase
 * is not configured. Spread into fetch headers:
 *
 *   const headers = { "Content-Type": "application/json", ...(await getAuthHeader()) };
 *
 * Designed to be safe to call regardless of `AUTH_ENFORCED` server state —
 * if the server isn't enforcing, the missing header is ignored.
 */
export async function getAuthHeader(): Promise<Record<string, string>> {
  if (!auth) return {};
  const user = auth.currentUser;
  if (!user) return {};
  try {
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}
