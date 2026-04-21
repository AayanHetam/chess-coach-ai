/**
 * Abort a Lichess game. Only valid in the very first moves of the game
 * (before each player has moved). Lichess 400s otherwise.
 */

import { NextRequest, NextResponse } from 'next/server';
import { abortGame } from '@/lib/lichess-board';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;
  const accessToken = request.cookies.get('lichess_access_token')?.value;
  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const ok = await abortGame(gameId, accessToken);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'Abort rejected' }, { status: 400 });
}
