/**
 * No-op shim. Pre-migration, this returned an `Authorization: Bearer <id>`
 * header from the Firebase Auth client SDK. Now auth flows through a
 * httpOnly session cookie which the browser attaches automatically for
 * same-origin requests, so the header is no longer needed.
 *
 * Kept as a deliberate stub so existing call sites
 * `...(await getAuthHeader())` continue to compile and run unchanged.
 * Safe to delete in Phase 5 cleanup once we sweep the call sites.
 */
export async function getAuthHeader(): Promise<Record<string, string>> {
  return {};
}
