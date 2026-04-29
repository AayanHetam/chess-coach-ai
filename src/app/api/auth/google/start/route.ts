import { NextResponse } from "next/server";
import { assertAuthSecrets, getAuthEnv } from "@/env";
import {
  generatePkcePair,
  generateState,
  setOAuthStateCookie,
} from "@/lib/auth/oauthState";

export const runtime = "nodejs";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

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
  const returnTo = url.searchParams.get("returnTo") ?? "/";

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
    returnTo: returnTo.startsWith("/") ? returnTo : "/",
  });
  return response;
}
