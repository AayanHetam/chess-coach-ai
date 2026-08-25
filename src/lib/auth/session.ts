import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import {
  COOKIE_NAME,
  SESSION_SECONDS,
  createSessionToken,
  getSessionFromCookieHeader,
  verifySessionToken,
  type SessionPayload,
} from "./sessionToken";

// The token half lives in ./sessionToken and is re-exported here so no caller
// has to know about the split. What stays here is everything that touches the
// App Router's cookie store — which is exactly what a Pages-router page cannot
// import.
export {
  COOKIE_NAME,
  SESSION_SECONDS,
  createSessionToken,
  getSessionFromCookieHeader,
  verifySessionToken,
} from "./sessionToken";
export type { SessionPayload } from "./sessionToken";

export async function getSessionFromRequest(
  request: Request
): Promise<SessionPayload | null> {
  return getSessionFromCookieHeader(request.headers.get("cookie"));
}

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export async function setSessionCookieOnResponse(
  response: NextResponse,
  payload: SessionPayload
): Promise<void> {
  const token = await createSessionToken(payload);
  response.cookies.set(COOKIE_NAME, token, cookieOptions(SESSION_SECONDS));
}

export function clearSessionCookieOnResponse(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, "", cookieOptions(0));
}

/**
 * Sliding refresh: re-issue the session cookie with a fresh full-length window
 * using the already-verified payload. Called from /api/auth/me so an active
 * user's session keeps rolling forward and they never silently get logged out.
 */
export async function refreshSessionCookieOnResponse(
  response: NextResponse,
  session: SessionPayload
): Promise<void> {
  await setSessionCookieOnResponse(response, session);
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await createSessionToken(payload);
  const store = await cookies();
  store.set(COOKIE_NAME, token, cookieOptions(SESSION_SECONDS));
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, "", cookieOptions(0));
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}


/**
 * Helper for route handlers: returns either the session, or a 401
 * NextResponse you should return immediately. Use as:
 *
 *   const guard = await requireSession();
 *   if ("response" in guard) return guard.response;
 *   const session = guard.session;
 */
export async function requireSession(): Promise<
  { session: SessionPayload } | { response: import("next/server").NextResponse }
> {
  const session = await getSession();
  if (session) return { session };
  const { NextResponse } = await import("next/server");
  return {
    response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
  };
}
