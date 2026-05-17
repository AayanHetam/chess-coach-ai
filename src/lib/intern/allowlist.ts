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

export async function isAllowlistedIntern(email: string): Promise<boolean> {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();

  const cached = cache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const supabase = await getInternSupabase();
  const { data, error } = await supabase
    .from("intern_allowlist")
    .select("email")
    .eq("email", normalized)
    .maybeSingle();

  if (error) {
    // Don't grant intern access on a transient DB error — fail closed.
    // Log so it surfaces in Vercel runtime logs; do not cache the failure.
    console.error("[intern.allowlist] lookup failed:", error.message);
    return false;
  }

  const value = data !== null;
  cache.set(normalized, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

export function __resetAllowlistCacheForTests() {
  cache.clear();
}
