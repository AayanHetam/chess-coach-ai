import { SignJWT, jwtVerify } from "jose";
import type { NextResponse } from "next/server";

/**
 * Short-lived signed cookie carrying a *verified* Google identity across the
 * /auth/age interstitial (COPPA age gate) for brand-new accounts.
 *
 * The OAuth callback verifies the ID token against Google's JWKS, then — when
 * the user has no account yet and no client-side age affirmation — parks the
 * profile here instead of creating the account. /api/auth/google/complete
 * consumes it after the DOB gate resolves. No account exists until then, so
 * declining the gate leaves zero stored personal data.
 *
 * Same signing posture as oauthState.ts: HS256 with SESSION_SECRET, httpOnly,
 * 10-minute TTL.
 */

const COOKIE_NAME = "cm_pending_google";
const TTL_SECONDS = 600;

export type PendingGoogleSignup = {
  googleId: string;
  email: string;
  displayName?: string;
  photoURL?: string;
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

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export async function setPendingSignupCookie(
  response: NextResponse,
  payload: PendingGoogleSignup
): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getKey());
  response.cookies.set(COOKIE_NAME, token, cookieOptions(TTL_SECONDS));
}

export async function readPendingSignupFromRequest(
  request: Request
): Promise<PendingGoogleSignup | null> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  try {
    const { payload } = await jwtVerify(decodeURIComponent(match[1]), getKey(), {
      algorithms: ["HS256"],
    });
    if (typeof payload.googleId !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return {
      googleId: payload.googleId,
      email: payload.email,
      displayName:
        typeof payload.displayName === "string" ? payload.displayName : undefined,
      photoURL:
        typeof payload.photoURL === "string" ? payload.photoURL : undefined,
      returnTo: typeof payload.returnTo === "string" ? payload.returnTo : undefined,
    };
  } catch {
    return null;
  }
}

export function clearPendingSignupCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, "", cookieOptions(0));
}

/** Test-only seam — clears the memoized signing key. */
export function __resetPendingSignupKeyForTests(): void {
  cachedKey = null;
}
