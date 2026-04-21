/**
 * Lichess OAuth Disconnect Endpoint
 *
 * Best-effort revokes the access token on Lichess, then clears our two
 * session cookies. We never fail this request on a 5xx from Lichess —
 * from the user's perspective, disconnecting should always "work" (i.e.,
 * remove their local session) even if the remote revoke call flakes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { revokeToken } from '@/lib/lichess-oauth';

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get('lichess_access_token')?.value;

  // Fire-and-forget revoke. We don't await success because the cookie
  // cleanup below is what actually ends the local session.
  if (accessToken) {
    try {
      await revokeToken(accessToken);
    } catch (err) {
      // Log but swallow — see function comment above.
      console.warn('lichess revoke failed (clearing local session anyway):', err);
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete('lichess_access_token');
  response.cookies.delete('lichess_user');
  return response;
}
