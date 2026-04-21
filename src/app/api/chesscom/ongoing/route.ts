/**
 * Chess.com ongoing-games proxy.
 *
 * Chess.com's Published Data API is read-only (no OAuth for playing), so
 * this route only *fetches* the authenticated player's ongoing daily games
 * on their behalf. The UI then links them out to chess.com to make moves.
 *
 * Ref: https://www.chess.com/news/view/published-data-api
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface ChessComGame {
  url: string;
  move_by?: number;
  pgn?: string;
  time_control?: string;
  last_activity?: number;
  rated?: boolean;
  turn?: 'white' | 'black';
  fen?: string;
  start_time?: number;
  time_class?: string;
  rules?: string;
  white: string;
  black: string;
}

/** Normalize the "https://api.chess.com/pub/player/foo" URL into just "foo". */
function usernameFromUrl(u: string): string {
  const m = u.match(/\/player\/([^/]+)/i);
  return m ? m[1] : u;
}

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get('username')?.trim();
  if (!username) {
    return NextResponse.json({ error: 'username query param required' }, { status: 400 });
  }
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(username)) {
    return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
  }

  try {
    // Hit both endpoints in parallel: "all ongoing" + "to-move subset".
    const [ongoingRes, toMoveRes] = await Promise.all([
      fetch(`https://api.chess.com/pub/player/${username}/games`, {
        // Chess.com's API requires a realistic UA; their gateway silently 403s
        // default fetch UAs. Anything browser-ish works.
        headers: { 'User-Agent': 'ChessMasti/1.0 (+https://chessmasti.com)' },
        // 60s cache is plenty — daily games don't move often.
        next: { revalidate: 60 },
      }),
      fetch(`https://api.chess.com/pub/player/${username}/games/to-move`, {
        headers: { 'User-Agent': 'ChessMasti/1.0 (+https://chessmasti.com)' },
        next: { revalidate: 30 },
      }),
    ]);

    if (ongoingRes.status === 404) {
      return NextResponse.json({ error: 'Chess.com user not found' }, { status: 404 });
    }
    if (!ongoingRes.ok) {
      return NextResponse.json(
        { error: `Chess.com API error (${ongoingRes.status})` },
        { status: 502 }
      );
    }

    const ongoingData = await ongoingRes.json();
    const toMoveData = toMoveRes.ok ? await toMoveRes.json() : { games: [] };

    const toMoveUrls = new Set<string>(
      (toMoveData.games as ChessComGame[] | undefined)?.map((g) => g.url) ?? []
    );

    const games = ((ongoingData.games as ChessComGame[] | undefined) ?? []).map((g) => ({
      url: g.url,
      fen: g.fen,
      pgn: g.pgn,
      timeControl: g.time_control,
      timeClass: g.time_class,
      rated: !!g.rated,
      turn: g.turn ?? null,
      moveBy: g.move_by ?? null,
      lastActivity: g.last_activity ?? null,
      startTime: g.start_time ?? null,
      whiteUsername: usernameFromUrl(g.white),
      blackUsername: usernameFromUrl(g.black),
      yourTurn: toMoveUrls.has(g.url),
    }));

    // Sort: your-turn first, then by move_by ascending (most urgent first).
    games.sort((a, b) => {
      if (a.yourTurn !== b.yourTurn) return a.yourTurn ? -1 : 1;
      const am = a.moveBy ?? Number.MAX_SAFE_INTEGER;
      const bm = b.moveBy ?? Number.MAX_SAFE_INTEGER;
      return am - bm;
    });

    return NextResponse.json({ username, total: games.length, games });
  } catch (err) {
    console.error('chess.com ongoing fetch failed:', err);
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to fetch Chess.com games' },
      { status: 500 }
    );
  }
}
