import { NextRequest, NextResponse } from 'next/server';
import { ScoutGame, Termination, TimeClass } from '@/types/scout';
import { scoutSchema, validateRequest } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

/** Maximum plies we keep per game — tree only reads up to 25 anyway. */
const SCOUT_MAX_PLY = 30;

/** In-memory LRU cache for scout responses (Node runtime only; survives within a single serverless container). */
type CachedResponse = {
  payload: ScoutResponsePayload;
  expiresAt: number;
};
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_MAX_ENTRIES = 32;
const scoutCache = new Map<string, CachedResponse>();

function cacheKey(username: string, platform: string, months: number): string {
  return `${platform}|${username.toLowerCase()}|${months}`;
}

function readCache(key: string): ScoutResponsePayload | null {
  const entry = scoutCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    scoutCache.delete(key);
    return null;
  }
  // LRU refresh
  scoutCache.delete(key);
  scoutCache.set(key, entry);
  return entry.payload;
}

function writeCache(key: string, payload: ScoutResponsePayload): void {
  scoutCache.set(key, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
  if (scoutCache.size > CACHE_MAX_ENTRIES) {
    const oldest = scoutCache.keys().next().value;
    if (oldest) scoutCache.delete(oldest);
  }
}

type ScoutResponsePayload = {
  username: string;
  platform: 'chess.com' | 'lichess';
  games: ScoutGame[];
  totalGames: number;
  dateRange: { from: number; to: number };
  cached?: boolean;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const parsed = validateRequest(scoutSchema, body);
    if (!parsed.success) return parsed.response;
    const { username, platform, months } = parsed.data;

    const key = cacheKey(username, platform, months);
    const cached = readCache(key);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    const games: ScoutGame[] =
      platform === 'chess.com'
        ? await fetchChessComGames(username, months)
        : await fetchLichessGames(username, months);

    const payload: ScoutResponsePayload = {
      username,
      platform,
      games,
      totalGames: games.length,
      dateRange: {
        from: games.length > 0 ? Math.min(...games.map(g => g.date)) : Date.now(),
        to: games.length > 0 ? Math.max(...games.map(g => g.date)) : Date.now(),
      },
    };

    writeCache(key, payload);
    return NextResponse.json(payload);
  } catch (error: any) {
    console.error('Scout API error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch games' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PGN → SAN moves (fast path)
//
// Chess.com / Lichess PGN bodies are well-formed, so we extract the move list
// with a simple tokenizer instead of invoking chess.js loadPgn() on thousands
// of games. We strip headers, comments, NAGs, variations, move numbers and
// result tokens, then cap to SCOUT_MAX_PLY.
// ─────────────────────────────────────────────────────────────────────────────

const RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

/**
 * Returns the first `maxPly` SAN moves *and* the total number of plies played
 * (pre-truncation) so downstream code can reason about game length.
 */
function extractMovesFromPgn(
  pgn: string,
  maxPly: number = SCOUT_MAX_PLY
): { moves: string[]; totalPly: number } {
  if (!pgn) return { moves: [], totalPly: 0 };

  // Strip header tag section.
  let body = pgn;
  const firstBlank = pgn.indexOf('\n\n');
  if (firstBlank !== -1) body = pgn.slice(firstBlank + 2);

  // Remove comments { ... } and ring-0 variations ( ... ) and NAGs ($n).
  body = body
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ');

  // Strip parenthesised variations (possibly nested).
  let depth = 0;
  let cleaned = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { if (depth > 0) depth--; continue; }
    if (depth === 0) cleaned += ch;
  }

  const moves: string[] = [];
  let totalPly = 0;
  const tokens = cleaned.split(/\s+/);
  for (const raw of tokens) {
    if (!raw) continue;
    if (RESULT_TOKENS.has(raw)) break;
    // Move-number tokens: "1.", "1...", "12.", "12..."
    if (/^\d+\.+$/.test(raw)) continue;
    // Move-number fused with move, e.g. "1.e4" — split.
    const fused = raw.match(/^(\d+\.+)(.+)$/);
    if (fused) {
      const tail = fused[2];
      if (tail && !RESULT_TOKENS.has(tail)) {
        totalPly++;
        if (moves.length < maxPly) moves.push(tail);
      }
      continue;
    }
    totalPly++;
    if (moves.length < maxPly) moves.push(raw);
  }

  return { moves, totalPly };
}

/** Map Chess.com time_class to our TimeClass. */
function normalizeTimeClass(raw: string | undefined): TimeClass {
  if (!raw) return 'unknown';
  const v = raw.toLowerCase();
  if (v === 'bullet' || v === 'blitz' || v === 'rapid' || v === 'classical' || v === 'daily' || v === 'correspondence') {
    return v as TimeClass;
  }
  // Lichess uses "ultrabullet" → bucket into bullet.
  if (v === 'ultrabullet') return 'bullet';
  return 'unknown';
}

/** Map Chess.com "result" per-side-string to our Termination. */
function chessComTermination(winSide: any, loseSide: any): Termination {
  const loser = loseSide?.result as string | undefined;
  if (!loser) return 'unknown';
  switch (loser) {
    case 'checkmated': return 'checkmate';
    case 'resigned': return 'resign';
    case 'timeout': return 'timeout';
    case 'abandoned': return 'abandoned';
    case 'stalemate': return 'stalemate';
    case 'repetition': return 'repetition';
    case '50move': return '50move';
    case 'agreed': return 'agreed';
    case 'insufficient': return 'insufficient';
    case 'timevsinsufficient': return 'timevsinsufficient';
    default:
      // winSide may also yield a termination for draw-variants, but Chess.com
      // generally mirrors them; fall through.
      return 'unknown';
  }
}

/** Map Lichess game.status to our Termination. */
function lichessTermination(status: string | undefined): Termination {
  switch (status) {
    case 'mate': return 'checkmate';
    case 'resign': return 'resign';
    case 'timeout':
    case 'outoftime': return 'timeout';
    case 'stalemate': return 'stalemate';
    case 'draw': return 'agreed';
    case 'variantEnd': return 'unknown';
    case 'cheat':
    case 'noStart':
    case 'aborted': return 'abandoned';
    default: return 'unknown';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chess.com
// ─────────────────────────────────────────────────────────────────────────────

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

  // Fetch all archives in parallel (Chess.com tolerates this for archive reads).
  // For very long histories we still cap concurrency to avoid hammering.
  const concurrency = Math.min(12, recentArchives.length) || 1;
  const rawArchives: any[][] = new Array(recentArchives.length).fill(null).map(() => []);
  let cursor = 0;

  await Promise.all(
    new Array(concurrency).fill(0).map(async () => {
      while (true) {
        const i = cursor++;
        if (i >= recentArchives.length) return;
        try {
          const res = await fetch(recentArchives[i], {
            headers: { 'User-Agent': 'ChessCoachAI/1.0' },
          });
          if (!res.ok) continue;
          const data = await res.json();
          rawArchives[i] = data.games || [];
        } catch {
          /* swallow per-archive failures */
        }
      }
    })
  );

  const games: ScoutGame[] = [];
  for (const archiveGames of rawArchives) {
    for (const game of archiveGames) {
      const g = normalizeChessComGame(game);
      if (g) games.push(g);
    }
  }
  return games;
}

function normalizeChessComGame(game: any): ScoutGame | null {
  let result: ScoutGame['result'] = '*';
  let termination: Termination = 'unknown';

  if (game.white?.result === 'win') {
    result = '1-0';
    termination = chessComTermination(game.white, game.black);
  } else if (game.black?.result === 'win') {
    result = '0-1';
    termination = chessComTermination(game.black, game.white);
  } else if (
    ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'].includes(
      game.white?.result
    )
  ) {
    result = '1/2-1/2';
    // For a draw the white-side result carries the reason.
    const r = game.white?.result;
    termination =
      r === 'agreed' ? 'agreed'
      : r === 'repetition' ? 'repetition'
      : r === 'stalemate' ? 'stalemate'
      : r === 'insufficient' ? 'insufficient'
      : r === '50move' ? '50move'
      : r === 'timevsinsufficient' ? 'timevsinsufficient'
      : 'unknown';
  }

  const { moves, totalPly } = extractMovesFromPgn(game.pgn || '');
  if (moves.length === 0) return null;

  return {
    id: game.uuid || game.url || String(game.end_time),
    platform: 'chess.com',
    moves,
    numMoves: totalPly,
    whiteUsername: game.white?.username || '',
    blackUsername: game.black?.username || '',
    whiteRating: game.white?.rating,
    blackRating: game.black?.rating,
    result,
    timeControl: game.time_control || game.time_class || '',
    timeClass: normalizeTimeClass(game.time_class),
    termination,
    date: (game.end_time || 0) * 1000,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lichess
// ─────────────────────────────────────────────────────────────────────────────

async function fetchLichessGames(username: string, months: number): Promise<ScoutGame[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  // Leanest possible response: just the SAN move string, no PGN/tags/clocks/evals/opening.
  const url =
    `https://lichess.org/api/games/user/${encodeURIComponent(username)}` +
    `?since=${since.getTime()}` +
    `&moves=true&pgnInJson=false&tags=false&clocks=false&evals=false&opening=false&literate=false` +
    `&sort=dateDesc&max=2000`;

  const res = await fetch(url, { headers: { Accept: 'application/x-ndjson' } });

  if (!res.ok) {
    throw new Error(`Lichess user "${username}" not found`);
  }

  const rawData = await res.text();
  const games: ScoutGame[] = [];
  for (const line of rawData.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const g = normalizeLichessGame(JSON.parse(trimmed));
      if (g) games.push(g);
    } catch {
      /* skip malformed line */
    }
  }
  return games;
}

function normalizeLichessGame(game: any): ScoutGame | null {
  let result: ScoutGame['result'] = '*';

  if (game.winner === 'white') result = '1-0';
  else if (game.winner === 'black') result = '0-1';
  else if (game.status === 'draw' || game.status === 'stalemate') {
    result = '1/2-1/2';
  } else if (!game.winner && game.status !== 'started' && game.status !== 'created') {
    result = '1/2-1/2';
  }

  // `moves` is a space-separated SAN string when requested with moves=true.
  const movesStr: string = typeof game.moves === 'string' ? game.moves : '';
  const allMoves = movesStr ? movesStr.split(/\s+/).filter(Boolean) : [];
  if (allMoves.length === 0) return null;
  const moves = allMoves.slice(0, SCOUT_MAX_PLY);

  return {
    id: game.id || '',
    platform: 'lichess',
    moves,
    numMoves: allMoves.length,
    whiteUsername: game.players?.white?.user?.name || game.players?.white?.user?.id || '',
    blackUsername: game.players?.black?.user?.name || game.players?.black?.user?.id || '',
    whiteRating: game.players?.white?.rating,
    blackRating: game.players?.black?.rating,
    result,
    timeControl: game.speed || '',
    timeClass: normalizeTimeClass(game.speed),
    termination: lichessTermination(game.status),
    date: game.lastMoveAt || game.createdAt || 0,
  };
}
