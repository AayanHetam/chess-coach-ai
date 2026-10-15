/**
 * Chess.com recent-games proxy, for the Chess.com tab on /play.
 *
 * That tab used to show ongoing DAILY games only, which almost nobody has: a
 * player who plays blitz and rapid typed their name, read "0 ongoing" and had
 * nowhere to go. This route returns the player's latest finished games of
 * every time control so each one can be opened on the analysis board.
 *
 * Server-side for the same reasons as `ongoing`: Chess.com 403s default fetch
 * user agents, and school networks that filter chess.com still reach us.
 *
 * It also says whether the account has ever played (`everPlayed`) and when it
 * was last online, so an empty list can say why it is empty. The name typed
 * in the report that prompted this belongs to a real account that was last
 * online in 2008 and never played a game.
 *
 * Ref: https://www.chess.com/news/view/published-data-api
 */

import { NextRequest, NextResponse } from 'next/server';
import type { ChessComGame } from '@/types/chessCom';
import { mergeRecentGames, normalizeChessComGame } from '@/lib/performance/recentGames';

export const runtime = 'nodejs';

const HEADERS = { 'User-Agent': 'ChessMasti/1.0 (+https://chessmasti.com)' };

/** Rows returned. One screen of a list, not the whole history. */
const LIMIT = 20;
/** Monthly archives read, newest first, before settling for fewer rows. */
const MAX_MONTHS = 3;

/** Archive URLs come from Chess.com, but they are fetched by us, so pin them. */
const ARCHIVE_URL_RE = /^https:\/\/api\.chess\.com\/pub\/player\/[^/]+\/games\/\d{4}\/\d{2}$/;

/** The archive's game with the fields this route reads that the shared type omits. */
type ArchiveGame = ChessComGame & { rules?: string };

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get('username')?.trim();
  if (!username) {
    return NextResponse.json({ error: 'username query param required' }, { status: 400 });
  }
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(username)) {
    return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
  }
  const player = username.toLowerCase();

  try {
    const [profileRes, archivesRes] = await Promise.all([
      fetch(`https://api.chess.com/pub/player/${player}`, {
        headers: HEADERS,
        next: { revalidate: 300 },
      }),
      fetch(`https://api.chess.com/pub/player/${player}/games/archives`, {
        headers: HEADERS,
        next: { revalidate: 120 },
      }),
    ]);

    if (profileRes.status === 404 || archivesRes.status === 404) {
      return NextResponse.json({ error: 'Chess.com user not found' }, { status: 404 });
    }
    if (!profileRes.ok || !archivesRes.ok) {
      const status = profileRes.ok ? archivesRes.status : profileRes.status;
      return NextResponse.json({ error: `Chess.com API error (${status})` }, { status: 502 });
    }

    const profile = await profileRes.json();
    const archivesBody = await archivesRes.json();
    const archives = ((archivesBody?.archives as unknown[] | undefined) ?? []).filter(
      (u): u is string => typeof u === 'string' && ARCHIVE_URL_RE.test(u)
    );

    // Newest month first, stopping once there are enough rows. A month that
    // fails to load is skipped rather than failing the whole list.
    const games: ArchiveGame[] = [];
    for (const url of archives.slice(-MAX_MONTHS).reverse()) {
      const res = await fetch(url, { headers: HEADERS, next: { revalidate: 120 } });
      if (!res.ok) continue;
      const month = await res.json();
      games.push(...((month?.games as ArchiveGame[] | undefined) ?? []));
      if (games.length >= LIMIT) break;
    }

    // Standard chess only: Chess960, odds and the other variants start from a
    // position the analysis board does not set up.
    const recent = mergeRecentGames(
      games
        .filter((g) => (g.rules ?? 'chess') === 'chess')
        .map((g) => normalizeChessComGame(g, username)),
      LIMIT
    );

    return NextResponse.json({
      username,
      everPlayed: archives.length > 0,
      lastOnline: typeof profile?.last_online === 'number' ? profile.last_online * 1000 : null,
      games: recent,
    });
  } catch (err) {
    console.error('chess.com recent fetch failed:', err);
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to fetch Chess.com games' },
      { status: 500 }
    );
  }
}
