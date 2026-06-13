import { getTrackingSupabase } from "./supabase";
import { logger } from "@/lib/logging";

/**
 * Delete all tracking data for a user (TRK-5). The GDPR/CCPA right-to-erasure
 * hook — call from the account-deletion flow (once one exists) and from the
 * admin purge endpoint.
 *
 * Deliberately NOT gated on TRACKING_ENABLED: a deletion request must be
 * honored even after tracking has been switched off. Best-effort + logged —
 * returns per-table counts/errors rather than throwing, so a tracking-DB hiccup
 * never blocks the larger account-deletion it's part of.
 */

const log = logger.child({ module: "tracking-purge" });

const UID_TABLES = [
  "events",
  "llm_calls",
  "puzzle_attempts",
  "analysis_sessions",
] as const;

export interface PurgeResult {
  uid: string;
  deleted: Record<string, number | null>;
  errors: string[];
}

export async function purgeUserData(uid: string): Promise<PurgeResult> {
  const result: PurgeResult = { uid, deleted: {}, errors: [] };
  if (!uid) {
    result.errors.push("empty uid");
    return result;
  }
  try {
    const supabase = await getTrackingSupabase();
    for (const table of UID_TABLES) {
      const { error, count } = await supabase
        .from(table)
        .delete({ count: "exact" })
        .eq("uid", uid);
      if (error) {
        result.errors.push(`${table}: ${error.message}`);
        result.deleted[table] = null;
      } else {
        result.deleted[table] = count ?? 0;
      }
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  if (result.errors.length) {
    log.warn("purgeUserData completed with errors", { uid, errors: result.errors });
  } else {
    log.info("purgeUserData ok", { uid, deleted: result.deleted });
  }
  return result;
}
