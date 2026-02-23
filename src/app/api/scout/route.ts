import { NextRequest, NextResponse } from 'next/server';
import { ScoutGame, Platform } from '@/types/scout';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, platform, months = 12 } = body as {
      username: string;
      platform: Platform;
      months?: number;
    };

    if (!username || !platform) {
      return NextResponse.json(
        { error: 'Username and platform are required' },
        { status: 400 }
      );
    }

    let games: ScoutGame[];

    if (platform === 'chess.com') {
      games = await fetchChessComGames(username, months);
    } else {
      games = await fetchLichessGames(username, months);
    }

    return NextResponse.json({
      username,
      platform,
      games,
      totalGames: games.length,
      dateRange: {
        from: games.length > 0 ? Math.min(...games.map(g => g.date)) : Date.now(),
        to: games.length > 0 ? Math.max(...games.map(g => g.date)) : Date.now(),
      },
    });
  } catch (error: any) {
    console.error('Scout API error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch games' },
      { status: 500 }
    );
  }
}

async function fetchChessComGames(username: string, months: number): Promise<ScoutGame[]> {
  const encodedUsername = encodeURIComponent(username.trim().toLowerCase());

  const archivesRes = await fetch(
    `https://api.chess.com/pub/player/${encodedUsername}/games/archives`,
    { headers: { 'User-Agent': 'ChessCoachAI/1.0' } }
  );

  if (!archivesRes.ok) {
    throw new Error(`Chess.com user "${username}" not found`);
  }

  const archivesData = await archivesRes.json();
  const archives: string[] = archivesData.archives || [];

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);
  const cutoffYear = cutoffDate.getFullYear();
  const cutoffMonth = cutoffDate.getMonth() + 1;

  const recentArchives = archives.filter(url => {
    const parts = url.split('/');
    const year = parseInt(parts[parts.length - 2]);
    const month = parseInt(parts[parts.length - 1]);
    return year > cutoffYear || (year === cutoffYear && month >= cutoffMonth);
  });

  const games: ScoutGame[] = [];
  const batchSize = 4;

  for (let i = 0; i < recentArchives.length; i += batchSize) {
    const batch = recentArchives.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async url => {
        try {
          const res = await fetch(url, {
            headers: { 'User-Agent': 'ChessCoachAI/1.0' },
          });
          if (!res.ok) return [];
          const data = await res.json();
          return data.games || [];
        } catch {
          return [];
        }
      })
    );

    for (const archiveGames of results) {
      for (const game of archiveGames) {
        games.push(normalizeChessComGame(game));
      }
    }
  }

  return games;
}

function normalizeChessComGame(game: any): ScoutGame {
  let result: ScoutGame['result'] = '*';

  if (game.white?.result === 'win') result = '1-0';
  else if (game.black?.result === 'win') result = '0-1';
  else if (
    ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'].includes(
      game.white?.result
    )
  ) {
    result = '1/2-1/2';
  }

  return {
    id: game.uuid || game.url || String(game.end_time),
    platform: 'chess.com',
    pgn: game.pgn || '',
    whiteUsername: game.white?.username || '',
    blackUsername: game.black?.username || '',
    whiteRating: game.white?.rating,
    blackRating: game.black?.rating,
    result,
    timeControl: game.time_class || '',
    date: (game.end_time || 0) * 1000,
  };
}

async function fetchLichessGames(username: string, months: number): Promise<ScoutGame[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const res = await fetch(
    `https://lichess.org/api/games/user/${encodeURIComponent(username)}?since=${since.getTime()}&pgnInJson=true&sort=dateDesc&max=2000`,
    {
      headers: {
        Accept: 'application/x-ndjson',
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Lichess user "${username}" not found`);
  }

  const rawData = await res.text();
  const games: ScoutGame[] = rawData
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => {
      try {
        const game = JSON.parse(line);
        return normalizeLichessGame(game);
      } catch {
        return null;
      }
    })
    .filter((g): g is ScoutGame => g !== null);

  return games;
}

function normalizeLichessGame(game: any): ScoutGame {
  let result: ScoutGame['result'] = '*';

  if (game.winner === 'white') result = '1-0';
  else if (game.winner === 'black') result = '0-1';
  else if (game.status === 'draw' || game.status === 'stalemate') {
    result = '1/2-1/2';
  } else if (!game.winner && game.status !== 'started' && game.status !== 'created') {
    result = '1/2-1/2';
  }

  return {
    id: game.id || '',
    platform: 'lichess',
    pgn: game.pgn || '',
    whiteUsername: game.players?.white?.user?.name || game.players?.white?.user?.id || '',
    blackUsername: game.players?.black?.user?.name || game.players?.black?.user?.id || '',
    whiteRating: game.players?.white?.rating,
    blackRating: game.players?.black?.rating,
    result,
    timeControl: game.speed || '',
    date: game.lastMoveAt || game.createdAt || 0,
  };
}
