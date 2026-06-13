import { NextResponse, after } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getTrackingEnv } from "@/env";
import { trackEvent, hashIp, currentAppVersion } from "@/lib/tracking/track";
import {
  readOrCreateAnonId,
  ANON_COOKIE_NAME,
  anonCookieOptions,
} from "@/lib/tracking/anonId";
import { hasTrackingConsent } from "@/lib/tracking/consent";

/**
 * POST /api/track — client event ingestion (TRK-1).
 *
 * The client SDK (TRK-4) batches interaction events and flushes them here via
 * navigator.sendBeacon (which ignores the response body, so we reply 204). The
 * server attaches identity (uid from the session cookie, anon_id cookie),
 * hashes the IP, and writes to the `events` firehose via after() so the insert
 * finishes after the response without blocking the beacon.
 *
 * Fully inert when TRACKING_ENABLED is off: no write, and no anon_id cookie is
 * set — so a tracking-off (and, in TRK-6, consent-rejected) visitor is never
 * tagged. node runtime so trackEvent can use node:crypto for IP hashing.
 */
export const runtime = "nodejs";

const eventSchema = z.object({
  name: z.string().min(1).max(80),
  surface: z.string().max(200).optional(),
  sessionId: z.string().max(64).optional(),
  requestId: z.string().max(64).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  // Client timestamp — informational for now; server `ts` is authoritative.
  ts: z.string().max(40).optional(),
});

const bodySchema = z.object({
  events: z.array(eventSchema).min(1).max(50),
});

function clientIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip");
}

export async function POST(request: Request) {
  const env = getTrackingEnv();
  // Inert when off: 204 so the beacon is satisfied, but nothing is written or set.
  if (!env.enabled) return new NextResponse(null, { status: 204 });
  // Consent-gated (TRK-6): no consent / GPC signaled → no write, no anon cookie.
  if (!hasTrackingConsent(request)) return new NextResponse(null, { status: 204 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const session = await getSession();
  const { anonId, isNew } = readOrCreateAnonId(request);
  const ipHash = hashIp(clientIp(request), env.ipSalt);
  const userAgent = request.headers.get("user-agent");
  const referrer = request.headers.get("referer");
  const appVersion = currentAppVersion();

  for (const e of parsed.data.events) {
    after(() =>
      trackEvent({
        eventName: e.name,
        uid: session?.uid ?? null,
        anonId,
        sessionId: e.sessionId ?? null,
        isIntern: session?.isIntern ?? false,
        surface: e.surface ?? null,
        requestId: e.requestId ?? null,
        props: e.props ?? {},
        ipHash,
        userAgent,
        referrer,
        appVersion,
      }),
    );
  }

  const res = new NextResponse(null, { status: 204 });
  if (isNew) res.cookies.set(ANON_COOKIE_NAME, anonId, anonCookieOptions());
  return res;
}
