import { NextResponse } from "next/server";
import { assertAuthSecrets, getAuthEnv } from "@/env";
import {
  generatePkcePair,
  generateState,
  setOAuthStateCookie,
} from "@/lib/auth/oauthState";

export const runtime = "nodejs";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

// Accept only same-origin paths as returnTo. Bare `startsWith("/")` would
// allow `//evil.com/path` (technically a protocol-relative URL) which the
// callback's `new URL(returnTo, baseUrl)` would resolve to evil.com — an
// open-redirect hole. Reject any path that starts with two slashes or
// a backslash, plus the usual non-path inputs.
function sanitizeReturnTo(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  // Cap length so an absurdly long returnTo can't bloat the OAuth state
  // cookie. 2048 is generous for any legitimate same-origin path.
  if (raw.length > 2048) return "/";
  return raw;
}

export async function GET(request: Request) {
  try {
    assertAuthSecrets({ needsSession: true, needsGoogle: true });
  } catch (err) {
    console.error("[auth/google/start]", err);
    return NextResponse.json(
      { error: "Google sign-in is not configured" },
      { status: 503 }
    );
  }

  const env = getAuthEnv();
  const url = new URL(request.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));
  // Set by the signup dialog after the user confirms the 13+ checkbox;
  // carried in the signed state cookie so the callback can skip the
  // /auth/age interstitial for brand-new accounts.
  const ageAffirmed = url.searchParams.get("ageAffirmed") === "1";

  const state = generateState();
  const { verifier, challenge } = generatePkcePair();

  const params = new URLSearchParams({
    client_id: env.google.clientId!,
    redirect_uri: `${env.appBaseUrl}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    include_granted_scopes: "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const response = NextResponse.redirect(`${GOOGLE_AUTH_ENDPOINT}?${params}`);
  await setOAuthStateCookie(response, {
    state,
    codeVerifier: verifier,
    returnTo,
    ageAffirmed,
  });
  return response;
}
