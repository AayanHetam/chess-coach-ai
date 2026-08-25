// Session tokens, with no framework coupling.
//
// Split out of session.ts because that module imports `next/headers`, which
// exists only in the App Router: importing it from a PAGES-router page fails
// the build outright ("You're importing a component that needs next/headers").
// API routes under src/pages/api survive it and a page does not, so the split
// is not cosmetic — it is what lets a Pages-router `getServerSideProps` read
// the session at all.
//
// Nothing here touches a cookie store. It parses a header and verifies a JWT.

import { SignJWT, jwtVerify } from "jose";

export const COOKIE_NAME = "cm_session";
// Long-lived, persistent session for an "it just remembers me" experience.
// /api/auth/me re-issues the cookie on every authenticated load (sliding
// window), so an active user effectively never has to sign in again.
const SESSION_DAYS = 90;
export const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;

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
