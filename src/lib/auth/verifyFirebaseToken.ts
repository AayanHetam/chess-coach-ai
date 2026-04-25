import { getAuthEnv } from "@/env";

/**
 * Server-side Firebase ID token verification. Lazy-initializes firebase-admin
 * on first call so that `next build`'s page-collection step doesn't crash
 * when build-time env is missing creds.
 *
 * Returns the verified user when the token is valid.
 * Throws AuthError otherwise — callers should map to 401 / 503.
 */

export type VerifiedUser = { uid: string; email: string | null };

export class AuthError extends Error {
  constructor(
    public code: "missing_token" | "invalid_token" | "misconfigured",
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}

let cachedAuth: import("firebase-admin/auth").Auth | null = null;

async function getAdminAuth(): Promise<import("firebase-admin/auth").Auth> {
  if (cachedAuth) return cachedAuth;

  const { projectId, clientEmail, privateKey } = getAuthEnv().firebase;
  if (!projectId || !clientEmail || !privateKey) {
    throw new AuthError(
      "misconfigured",
      "Firebase Admin credentials are not set. Configure FIREBASE_PROJECT_ID, " +
        "FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in your hosting environment."
    );
  }

  const { initializeApp, getApps, cert } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  cachedAuth = getAuth(app);
  return cachedAuth;
}

export async function verifyFirebaseToken(
  authorizationHeader: string | null
): Promise<VerifiedUser> {
  if (!authorizationHeader) {
    throw new AuthError("missing_token", "Authorization header is required");
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader);
  if (!match) {
    throw new AuthError(
      "missing_token",
      "Authorization header must be 'Bearer <idToken>'"
    );
  }
  const idToken = match[1];

  const adminAuth = await getAdminAuth();
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch (err) {
    throw new AuthError(
      "invalid_token",
      err instanceof Error ? err.message : "Token verification failed"
    );
  }
}

// Test seam — only used by unit tests to reset the cached Admin SDK instance.
export function __resetAuthCacheForTests() {
  cachedAuth = null;
}
