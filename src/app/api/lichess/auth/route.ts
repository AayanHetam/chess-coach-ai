/**
 * Lichess OAuth Initialization Endpoint
 * Generates PKCE and redirects user to Lichess authorization
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildAuthUrl, buildOAuthConfig, generatePKCE } from '@/lib/lichess-oauth';

export async function GET(request: NextRequest) {
  try {
    // Generate PKCE challenge
    const { codeVerifier, codeChallenge } = await generatePKCE();

    // Generate random state for CSRF protection
    const state = crypto.randomUUID();

    // OAuth configuration (clientId + redirectUri + scopes).
    // Passing request.nextUrl.origin lets us fall back gracefully when
    // NEXT_PUBLIC_APP_URL isn't set (e.g., on preview deployments).
    const config = buildOAuthConfig(request.nextUrl.origin);

    // Build authorization URL
    const authUrl = buildAuthUrl(config, codeChallenge, state);

    // Create response with redirect
    const response = NextResponse.redirect(authUrl);

    // Store PKCE and state in secure, httpOnly cookies
    response.cookies.set('lichess_code_verifier', codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    response.cookies.set('lichess_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('OAuth initialization error:', error);
    return NextResponse.json(
      { error: 'Failed to initialize OAuth flow' },
      { status: 500 }
    );
  }
}
