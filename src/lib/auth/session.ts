import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

const COOKIE_NAME = "cm_session";
// Long-lived, persistent session for an "it just remembers me" experience.
// /api/auth/me re-issues the cookie on every authenticated load (sliding
// window), so an active user effectively never has to sign in again.
const SESSION_DAYS = 90;
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;

export type SessionPayload = {
  uid: string;
  /**
   * OPTIONAL since signup stopped requiring one. An account can exist with a
   * handle and a password and nothing else, and it gets a session like any
   * other. Anything deriving authority from the email (admin, intern) must
   * treat absence as "no", never as "unset, so allow".
   */
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  // CMIP intern allowlist membership at sign-in time. Stamped by the auth
  // routes after isAllowlistedIntern(email); flipping requires re-signin.
  isIntern?: boolean;
  // CMIP dashboard admin (matches CMIP_DASHBOARD_ADMIN_EMAIL at sign-in).
  // Stamped at session creation for browser-side UI gating. Server-side
  // admin routes additionally re-check via requireAdmin() so an env change
  // takes effect on next request without re-signin.
  isAdmin?: boolean;
};

let cachedKey: Uint8Array | null = null;
function getKey(): Uint8Array {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or too short (need ≥32 chars). " +
        "Generate one with `openssl rand -base64 48`."
    );
  }
  cachedKey = new TextEncoder().encode(secret);
  return cachedKey;
}

export async function createSessionToken(
  payload: SessionPayload
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getKey());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(), {
      algorithms: ["HS256"],
    });
    // uid is the identity; email is not. Rejecting a token for a missing
    // email would have signed out every email-less account at the door, and
    // the failure would have looked like a broken session secret.
    if (typeof payload.uid !== "string") return null;
    return {
      uid: payload.uid,
      email: typeof payload.email === "string" ? payload.email : undefined,
      displayName:
        typeof payload.displayName === "string"
          ? payload.displayName
          : undefined,
      avatarUrl:
        typeof payload.avatarUrl === "string" ? payload.avatarUrl : undefined,
      isIntern: payload.isIntern === true ? true : undefined,
      isAdmin: payload.isAdmin === true ? true : undefined,
    };
  } catch {
    return null;
  }
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
 * The session out of a raw Cookie header.
 *
 * Split out of `getSessionFromRequest` because Pages-router API routes get a
 * `NextApiRequest`, whose `headers.cookie` is a plain string rather than a
 * `Headers` object. Both callers must parse the cookie the same way, and the
 * way to guarantee that is for there to be one parser.
 */
export async function getSessionFromCookieHeader(
  cookieHeader: string | null | undefined
): Promise<SessionPayload | null> {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`)
  );
  if (!match) return null;
  return verifySessionToken(decodeURIComponent(match[1]));
}

export async function getSessionFromRequest(
  request: Request
): Promise<SessionPayload | null> {
  return getSessionFromCookieHeader(request.headers.get("cookie"));
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
