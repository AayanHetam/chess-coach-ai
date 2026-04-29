import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

const COOKIE_NAME = "cm_session";
const SESSION_DAYS = 30;
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;

export type SessionPayload = {
  uid: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
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

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ["HS256"] });
    if (typeof payload.uid !== "string" || typeof payload.email !== "string") return null;
    return {
      uid: payload.uid,
      email: payload.email,
      displayName: typeof payload.displayName === "string" ? payload.displayName : undefined,
      avatarUrl: typeof payload.avatarUrl === "string" ? payload.avatarUrl : undefined,
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

export async function getSessionFromRequest(request: Request): Promise<SessionPayload | null> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return verifySessionToken(decodeURIComponent(match[1]));
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
  | { session: SessionPayload }
  | { response: import("next/server").NextResponse }
> {
  const session = await getSession();
  if (session) return { session };
  const { NextResponse } = await import("next/server");
  return {
    response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
  };
}
