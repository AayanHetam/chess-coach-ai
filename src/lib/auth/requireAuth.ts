import { NextResponse } from "next/server";
import { getAuthEnv } from "@/env";
import {
  AuthError,
  verifyFirebaseToken,
  type VerifiedUser,
} from "./verifyFirebaseToken";

export type AuthResult =
  | { ok: true; user: VerifiedUser | null }
  | { ok: false; response: NextResponse };

/**
 * Gate a route handler. Behavior:
 * - AUTH_ENFORCED=false (default): pass through. Returns user=null so
 *   call sites can treat anonymous requests the same as today.
 * - AUTH_ENFORCED=true + valid Bearer token: returns the verified user.
 * - AUTH_ENFORCED=true + missing/invalid token: 401.
 * - AUTH_ENFORCED=true + Firebase Admin creds missing: 503 + loud server log.
 */
export async function requireAuth(request: Request): Promise<AuthResult> {
  if (!getAuthEnv().enforced) {
    return { ok: true, user: null };
  }

  try {
    const user = await verifyFirebaseToken(request.headers.get("authorization"));
    return { ok: true, user };
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === "misconfigured") {
        // eslint-disable-next-line no-console -- production diagnostic; alerts ops without a logger dep
        console.error(
          "[auth] AUTH_ENFORCED=true but Firebase Admin is misconfigured; refusing request"
        );
        return {
          ok: false,
          response: NextResponse.json(
            { error: "Authentication service unavailable" },
            { status: 503 }
          ),
        };
      }
      return {
        ok: false,
        response: NextResponse.json(
          { error: err.message, code: err.code },
          { status: 401 }
        ),
      };
    }
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unknown auth error" },
        { status: 401 }
      ),
    };
  }
}
