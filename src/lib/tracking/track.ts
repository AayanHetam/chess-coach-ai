import { createHash } from "node:crypto";
import { getTrackingEnv } from "@/env";
import { logger } from "@/lib/logging";
import { getTrackingSupabase } from "./supabase";

/**
 * Server-side event emitter for the tracking firehose (TRK-1).
 *
 * Two hard rules, both load-bearing:
 *  1. **Never break a user request.** Every write is gated on TRACKING_ENABLED
 *     and wrapped so it can neither throw nor reject into the caller. A tracking
 *     outage must be invisible to the product.
 *  2. **Fire-and-forget, but actually finish.** On Vercel serverless an
 *     un-awaited promise can be frozen the moment the response flushes. Callers
 *     inside a request (e.g. the /api/track route) should wrap trackEvent in
 *     `after()` from "next/server" so the runtime keeps the worker alive until
 *     the insert completes. trackEvent itself just returns the promise.
 */

const log = logger.child({ module: "tracking" });

export interface TrackEventInput {
  /** e.g. "puzzle.attempt" | "analysis.started" | "chat.message" | "page.view" */
  eventName: string;
  uid?: string | null;
  anonId?: string | null;
  sessionId?: string | null;
  isIntern?: boolean;
  surface?: string | null;
  requestId?: string | null;
  props?: Record<string, unknown>;
  /** Pre-hashed; raw IPs must never reach here. Use hashIp(). */
  ipHash?: string | null;
  userAgent?: string | null;
  referrer?: string | null;
  appVersion?: string | null;
}

/**
 * SHA-256(salt:ip) → hex, or null if either input is missing. We never store
 * raw IPs; a missing salt means we skip the hash entirely rather than emit a
 * weak unsalted digest.
 */
export function hashIp(
  ip: string | null | undefined,
  salt: string | null | undefined,
): string | null {
  if (!ip || !salt) return null;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** Build id for correlating events to a deploy. Vercel injects the git SHA.
 *  `|| null` so an empty-string env var counts as unset, not a blank version. */
export function currentAppVersion(): string | null {
  return process.env.VERCEL_GIT_COMMIT_SHA || null;
}

/**
 * Insert one row into `events`. No-ops when TRACKING_ENABLED is off. Never
 * throws — DB / config failures are swallowed and warn-logged.
 */
export async function trackEvent(evt: TrackEventInput): Promise<void> {
  if (!getTrackingEnv().enabled) return;
  try {
    const supabase = await getTrackingSupabase();
    const { error } = await supabase.from("events").insert({
      event_name: evt.eventName,
      uid: evt.uid ?? null,
      anon_id: evt.anonId ?? null,
      session_id: evt.sessionId ?? null,
      is_intern: evt.isIntern ?? false,
      surface: evt.surface ?? null,
      request_id: evt.requestId ?? null,
      props: evt.props ?? {},
      ip_hash: evt.ipHash ?? null,
      user_agent: evt.userAgent ?? null,
      referrer: evt.referrer ?? null,
      app_version: evt.appVersion ?? currentAppVersion(),
    });
    if (error) {
      log.warn("trackEvent insert failed", {
        eventName: evt.eventName,
        error: error.message,
      });
    }
  } catch (err) {
    log.warn("trackEvent threw (swallowed — tracking must not break requests)", {
      eventName: evt.eventName,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
