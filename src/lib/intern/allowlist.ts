import { getInternSupabase } from "./supabase";

/**
 * Allowlist check for the CMIP intern role.
 *
 * Used at session-creation time only (Google OAuth callback + email/password
 * signin), not on every request. Result is stamped into the `cm_session`
 * JWT claim, so flipping a user's allowlist status takes effect on their
 * next sign-in.
 *
 * Caching: 5-min TTL in-memory, per Node process. Acceptable because
 * (a) the allowlist changes ~weekly, (b) cache miss is one indexed PK
 * lookup on a 3-row table, and (c) per-process is fine on Vercel — each
 * cold start re-reads fresh.
 */

type CacheEntry = { value: boolean; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

export async function isAllowlistedIntern(
  email: string | undefined
): Promise<boolean> {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();

  const cached = cache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  // Fail closed on ANY failure — including a throw from getInternSupabase()
  // when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are unset. This runs inside
  // signup/signin/OAuth-callback session creation: an intern-portal nicety
  // must never be able to fail core sign-in (it bricked new-user creation
  // when the throw escaped to the routes' generic 500 handlers).
  try {
    const supabase = await getInternSupabase();
    const { data, error } = await supabase
      .from("intern_allowlist")
      .select("email")
      .eq("email", normalized)
      .maybeSingle();

    if (error) {
      // Log so it surfaces in Vercel runtime logs; do not cache the failure.
      console.error("[intern.allowlist] lookup failed:", error.message);
      return false;
    }

    const value = data !== null;
    cache.set(normalized, { value, expiresAt: Date.now() + TTL_MS });
    return value;
  } catch (err) {
    console.error(
      "[intern.allowlist] unavailable, treating as non-intern:",
      err instanceof Error ? err.message : err
    );
    return false;
  }
}

export function __resetAllowlistCacheForTests() {
  cache.clear();
}

/**
 * The email an intern route should key its Supabase rows on.
 *
 * `isIntern` is only stamped after `isAllowlistedIntern(email)` returns true,
 * so a session carrying it always has an address — but the TYPE cannot know
 * that, and four routes were reaching straight for `session.email`. Returning
 * null here (rather than asserting) means an email-less session is refused
 * instead of writing `undefined.toLowerCase()` at runtime.
 */
export function internEmailFor(session: {
  email?: string;
  isIntern?: boolean;
}): string | null {
  if (!session.isIntern) return null;
  const email = session.email?.trim().toLowerCase();
  return email ? email : null;
}
