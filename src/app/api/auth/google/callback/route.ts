import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { assertAuthSecrets, getAuthEnv } from "@/env";
import {
  clearOAuthStateCookie,
  readOAuthStateFromRequest,
} from "@/lib/auth/oauthState";
import { setPendingSignupCookie } from "@/lib/auth/pendingSignup";
import { setSessionCookieOnResponse } from "@/lib/auth/session";
import {
  createUser,
  getUserByEmail,
  getUserByGoogleId,
  updateLastLoginAt,
  updateUser,
} from "@/lib/server/users";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
import { isAllowlistedIntern } from "@/lib/intern/allowlist";
import { isDashboardAdminEmail } from "@/lib/auth/isAdmin";

export const runtime = "nodejs";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * Build an error redirect that **preserves the user's original page**
 * (returnTo from the state cookie when available) instead of always
 * dumping them on the landing page. Previously every OAuth failure
 * dropped users on `/?oauth_error=...` regardless of where they
 * initiated sign-in from — confusing and forced them to re-navigate.
 *
 * `safeReturnTo` here mirrors `sanitizeReturnTo` in start/route.ts:
 * only accept same-origin paths, reject protocol-relative or absolute
 * URLs that could redirect off-host.
 */
function safeReturnTo(raw: string | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw.length > 2048) return "/";
  return raw;
}

function errorRedirect(
  baseUrl: string,
  code: string,
  returnTo?: string
): NextResponse {
  const url = new URL(safeReturnTo(returnTo), baseUrl);
  url.searchParams.set("oauth_error", code);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  let env;
  try {
    assertAuthSecrets({ needsSession: true, needsAdmin: true, needsGoogle: true });
    env = getAuthEnv();
  } catch (err) {
    console.error("[auth/google/callback] missing config", err);
    return new NextResponse("Google sign-in is not configured", { status: 503 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const userDeniedError = url.searchParams.get("error");

  // Read the state cookie eagerly so error paths can preserve returnTo.
  // The cookie payload is JWT-verified inside readOAuthStateFromRequest —
  // a null result here means missing or tampered, not an exploit hole.
  const stateCookie = await readOAuthStateFromRequest(request);
  const returnTo = stateCookie?.returnTo;

  // User clicked "cancel" on Google's consent screen.
  if (userDeniedError) {
    const response = errorRedirect(env.appBaseUrl, userDeniedError, returnTo);
    clearOAuthStateCookie(response);
    return response;
  }

  if (!code || !stateParam) {
    const response = errorRedirect(env.appBaseUrl, "missing_params", returnTo);
    clearOAuthStateCookie(response);
    return response;
  }

  if (!stateCookie || stateCookie.state !== stateParam) {
    console.warn("[auth/google/callback] state mismatch");
    const response = errorRedirect(env.appBaseUrl, "state_mismatch", returnTo);
    clearOAuthStateCookie(response);
    return response;
  }

  // Exchange auth code for tokens (server-to-server; not blocked by school WiFi).
  let idToken: string;
  try {
    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.google.clientId!,
        client_secret: env.google.clientSecret!,
        redirect_uri: `${env.appBaseUrl}/api/auth/google/callback`,
        grant_type: "authorization_code",
        code_verifier: stateCookie.codeVerifier,
      }),
    });
    if (!tokenRes.ok) {
      console.error("[auth/google/callback] token exchange failed", await tokenRes.text());
      const response = errorRedirect(env.appBaseUrl, "token_exchange_failed", returnTo);
      clearOAuthStateCookie(response);
      return response;
    }
    const tokens = (await tokenRes.json()) as { id_token?: string };
    if (!tokens.id_token) {
      const response = errorRedirect(env.appBaseUrl, "no_id_token", returnTo);
      clearOAuthStateCookie(response);
      return response;
    }
    idToken = tokens.id_token;
  } catch (err) {
    console.error("[auth/google/callback] token exchange threw", err);
    const response = errorRedirect(env.appBaseUrl, "token_exchange_failed", returnTo);
    clearOAuthStateCookie(response);
    return response;
  }

  // Verify the ID token's signature against Google's JWKS.
  let payload;
  try {
    const client = new OAuth2Client(env.google.clientId);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.google.clientId,
    });
    payload = ticket.getPayload();
  } catch (err) {
    console.error("[auth/google/callback] verifyIdToken failed", err);
    const response = errorRedirect(env.appBaseUrl, "verify_failed", returnTo);
    clearOAuthStateCookie(response);
    return response;
  }

  if (!payload || !payload.sub || !payload.email) {
    const response = errorRedirect(env.appBaseUrl, "missing_claims", returnTo);
    clearOAuthStateCookie(response);
    return response;
  }

  // Refuse unverified-email logins to prevent account-takeover via shadow accounts.
  if (payload.email_verified === false) {
    const response = errorRedirect(env.appBaseUrl, "email_unverified", returnTo);
    clearOAuthStateCookie(response);
    return response;
  }

  const googleId = payload.sub;
  const email = payload.email.toLowerCase();
  const displayName = typeof payload.name === "string" ? payload.name : undefined;
  const photoURL = typeof payload.picture === "string" ? payload.picture : undefined;

  try {
    let user = await getUserByGoogleId(googleId);

    if (!user) {
      // Account-link by email: existing user (password account or pre-migration
      // Firebase user) signs in via Google for the first time.
      const existing = await getUserByEmail(email);
      if (existing) {
        await updateUser(existing.uid, {
          googleId,
          emailVerified: true,
          ...(displayName && !existing.displayName ? { displayName } : {}),
          ...(photoURL && !existing.photoURL ? { photoURL } : {}),
        });
        user = { ...existing, googleId, emailVerified: true };
      } else if (stateCookie.ageAffirmed) {
        // Brand-new user who already passed the DOB age gate in the signup
        // dialog before starting OAuth (flag rode in the signed state cookie).
        user = await createUser({
          email,
          googleId,
          displayName,
          photoURL,
          emailVerified: true,
          ageAffirmed: true,
        });
      } else {
        // Brand-new user with no age affirmation (e.g. "Continue with
        // Google" from the sign-in tab). COPPA: do NOT create the account
        // yet — park the verified profile in a short-lived signed cookie
        // and route through the neutral DOB gate at /auth/age.
        // /api/auth/google/complete finishes account creation on 13+.
        const target = new URL("/auth/age", env.appBaseUrl);
        if (stateCookie.returnTo) {
          target.searchParams.set("returnTo", safeReturnTo(stateCookie.returnTo));
        }
        const response = NextResponse.redirect(target);
        await setPendingSignupCookie(response, {
          googleId,
          email,
          displayName,
          photoURL,
          returnTo: stateCookie.returnTo,
        });
        clearOAuthStateCookie(response);
        return response;
      }
    }

    await updateLastLoginAt(user.uid);

    // Stamp CMIP intern allowlist membership + admin status into the session
    // at sign-in time. Allowlist failures fall closed to false; admin check
    // is a pure email comparison.
    const isIntern = await isAllowlistedIntern(user.email);
    const isAdmin = isDashboardAdminEmail(user.email);

    const target = new URL(stateCookie.returnTo ?? "/", env.appBaseUrl);
    const response = NextResponse.redirect(target);
    await setSessionCookieOnResponse(response, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.photoURL,
      isIntern,
      isAdmin,
    });
    clearOAuthStateCookie(response);
    return response;
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[auth/google/callback]", err);
      const response = errorRedirect(env.appBaseUrl, "admin_unavailable", returnTo);
      clearOAuthStateCookie(response);
      return response;
    }
    console.error("[auth/google/callback] unexpected", err);
    const response = errorRedirect(env.appBaseUrl, "unknown", returnTo);
    clearOAuthStateCookie(response);
    return response;
  }
}
