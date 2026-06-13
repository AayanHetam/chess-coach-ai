import type { SupabaseClient } from "@supabase/supabase-js";
import { assertTrackingSecrets, getTrackingEnv } from "@/env";

/**
 * Server-only Supabase client for the tracking / telemetry warehouse (TRK-0).
 *
 * Points at a SEPARATE Supabase project from the CMIP portal — see
 * src/lib/intern/supabase.ts for the CMIP client. Two projects, two key
 * pairs, so the high-volume event firehose (and minors' AI-conversation
 * content) never co-mingles with intern eval data. See TRACKING_PLAN.md.
 *
 * Uses the service_role key, which bypasses Row-Level Security — never import
 * this module from client code or App Router server components that hydrate to
 * the browser. The tracking tables have RLS enabled with NO policies, so only
 * this service-role client can read/write them.
 *
 * Lazy + cached: `createClient` opens no connection at construct time; caching
 * keeps the in-memory PostgREST URL parser warm across requests in a worker.
 */

let cachedClient: SupabaseClient | null = null;

export async function getTrackingSupabase(): Promise<SupabaseClient> {
  if (cachedClient) return cachedClient;
  assertTrackingSecrets();

  const { url, serviceRoleKey } = getTrackingEnv().supabase;
  const { createClient } = await import("@supabase/supabase-js");
  cachedClient = createClient(url!, serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export function __resetTrackingSupabaseCacheForTests() {
  cachedClient = null;
}
