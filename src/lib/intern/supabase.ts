import type { SupabaseClient } from "@supabase/supabase-js";
import { assertAuthSecrets, getAuthEnv } from "@/env";

/**
 * Server-only Supabase client for the CMIP feedback portal.
 *
 * Uses the service_role key, which bypasses Row-Level Security — never import
 * this module from client code or App Router server components that hydrate
 * to the browser. Same posture as src/lib/server/firebaseAdmin.ts.
 *
 * Lazy + cached: the underlying `createClient` opens no connection at construct
 * time, but caching keeps the in-memory PostgREST URL parser warm.
 */

let cachedClient: SupabaseClient | null = null;

export async function getInternSupabase(): Promise<SupabaseClient> {
  if (cachedClient) return cachedClient;
  assertAuthSecrets({ needsSupabase: true });

  const { url, serviceRoleKey } = getAuthEnv().supabase;
  const { createClient } = await import("@supabase/supabase-js");
  cachedClient = createClient(url!, serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export function __resetInternSupabaseCacheForTests() {
  cachedClient = null;
}
