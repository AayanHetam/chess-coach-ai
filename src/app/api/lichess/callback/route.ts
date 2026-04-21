/**
 * Lichess OAuth Callback Endpoint
 * Handles authorization code exchange and user session creation
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  buildOAuthConfig,
  exchangeCodeForToken,
  getUserProfile,
} from '@/lib/lichess-oauth';

function appOrigin(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    request.nextUrl.origin
  );
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    const origin = appOrigin(request);

    // Handle OAuth errors
    if (error) {
      return NextResponse.redirect(`${origin}/play?lichess=error&reason=${error}`);
    }

    // Validate required parameters
    if (!code || !state) {
      return NextResponse.redirect(`${origin}/play?lichess=error&reason=missing_params`);
    }

    // Retrieve and validate state (CSRF protection)
    const storedState = request.cookies.get('lichess_state')?.value;
    if (!storedState || storedState !== state) {
      return NextResponse.redirect(`${origin}/play?lichess=error&reason=invalid_state`);
    }

    // Retrieve code verifier
    const codeVerifier = request.cookies.get('lichess_code_verifier')?.value;
    if (!codeVerifier) {
      return NextResponse.redirect(`${origin}/play?lichess=error&reason=missing_verifier`);
    }

    // Use the shared config so /auth and /callback always agree on clientId +
    // redirectUri + scopes. Mismatch here would 400 at Lichess's token endpoint.
    const config = buildOAuthConfig(request.nextUrl.origin);

    // Exchange code for token
    const tokenData = await exchangeCodeForToken(config, code, codeVerifier);

    // Get user profile
    const userProfile = await getUserProfile(tokenData.access_token);

    // Create response — bounce user back to /play with the Lichess tab selected.
    const response = NextResponse.redirect(`${origin}/play?lichess=connected`);

    // Store access token in HTTP-only cookie (not readable from JS — XSS safe).
    response.cookies.set('lichess_access_token', tokenData.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokenData.expires_in || 31536000, // Default 1 year
      path: '/',
    });

    // Store user info in a readable cookie so the client can render the UI
    // immediately after redirect without an extra /me roundtrip.
    response.cookies.set(
      'lichess_user',
      JSON.stringify({
        id: userProfile.id,
        username: userProfile.username,
        title: userProfile.title,
        rating: userProfile.rating,
        ratingPerf: userProfile.ratingPerf,
      }),
      {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: tokenData.expires_in || 31536000,
        path: '/',
      }
    );

    // Clear PKCE cookies
    response.cookies.delete('lichess_code_verifier');
    response.cookies.delete('lichess_state');

    return response;
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(`${appOrigin(request)}/play?lichess=error&reason=auth_failed`);
  }
}
