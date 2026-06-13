import { randomUUID } from "node:crypto";

/**
 * Anonymous visitor id (TRK-1). Lets us keep a coherent journey for
 * logged-out users so the pre-signup funnel isn't lost. On sign-in, later
 * PRs stamp an `anon_id → uid` stitch event so journeys join across the
 * boundary.
 *
 * httpOnly so it can't be read/altered by client JS (it's a tracking key,
 * not something the UI needs). Set ONLY when tracking is enabled and (in
 * TRK-6) consent is granted — the /api/track route gates on both, so a
 * tracking-off or consent-rejected visitor never receives this cookie.
 */
export const ANON_COOKIE_NAME = "cm_anon";
const ANON_MAX_AGE_SECONDS = 365 * 24 * 60 * 60; // 1 year

export function anonCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: ANON_MAX_AGE_SECONDS,
  };
}

/** Parse the anon id out of a request's Cookie header. */
export function readAnonIdFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${ANON_COOKIE_NAME}=([^;]+)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function generateAnonId(): string {
  return `anon_${randomUUID()}`;
}

/**
 * Return the existing anon id, or a freshly minted one with `isNew: true`
 * so the caller knows to set the cookie on the response.
 */
export function readOrCreateAnonId(request: Request): {
  anonId: string;
  isNew: boolean;
} {
  const existing = readAnonIdFromRequest(request);
  if (existing) return { anonId: existing, isNew: false };
  return { anonId: generateAnonId(), isNew: true };
}
