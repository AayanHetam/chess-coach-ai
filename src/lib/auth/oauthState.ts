import { SignJWT, jwtVerify } from "jose";
import { randomBytes, createHash } from "crypto";
import type { NextResponse } from "next/server";

/**
 * Short-lived signed cookie that carries OAuth state + PKCE verifier
 * across the redirect to Google and back. Reuses SESSION_SECRET for
 * signing — a separate secret would be belt-and-suspenders, but the
 * payload only lives 10 minutes and the cookie is httpOnly anyway.
 */

const COOKIE_NAME = "cm_oauth_state";
const TTL_SECONDS = 600;

export type OAuthStatePayload = {
  state: string;
  codeVerifier: string;
  returnTo?: string;
};

let cachedKey: Uint8Array | null = null;
function getKey(): Uint8Array {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET is missing or too short.");
  }
  cachedKey = new TextEncoder().encode(secret);
  return cachedKey;
}

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function generateState(): string {
  return randomBytes(16).toString("base64url");
}

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export async function setOAuthStateCookie(
  response: NextResponse,
  payload: OAuthStatePayload
): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getKey());
  response.cookies.set(COOKIE_NAME, token, cookieOptions(TTL_SECONDS));
}

export async function readOAuthStateFromRequest(
  request: Request
): Promise<OAuthStatePayload | null> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  try {
    const { payload } = await jwtVerify(decodeURIComponent(match[1]), getKey(), {
      algorithms: ["HS256"],
    });
    if (
      typeof payload.state !== "string" ||
      typeof payload.codeVerifier !== "string"
    ) {
      return null;
    }
    return {
      state: payload.state,
      codeVerifier: payload.codeVerifier,
      returnTo: typeof payload.returnTo === "string" ? payload.returnTo : undefined,
    };
  } catch {
    return null;
  }
}

export function clearOAuthStateCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, "", cookieOptions(0));
}
