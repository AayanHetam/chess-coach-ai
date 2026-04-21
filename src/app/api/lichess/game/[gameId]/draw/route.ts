/**
 * Offer or accept a draw in a Lichess game.
 *
 * POST /draw/yes is the same endpoint for both offering and accepting
 * (Lichess resolves the semantics server-side based on game state).
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleDrawOffer } from '@/lib/lichess-board';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;
  const accessToken = request.cookies.get('lichess_access_token')?.value;
  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const ok = await handleDrawOffer(gameId, true, accessToken);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'Draw action rejected' }, { status: 400 });
}
