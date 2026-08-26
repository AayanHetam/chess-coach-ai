// The band comes from the session, or there is no answer.
//
// Lives here rather than beside the route because anything under src/pages/api
// is an API route to Next, and a test file has no default export.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/book-exit';

const getSessionFromCookieHeader = vi.fn();
const getUserById = vi.fn();
const resolveUserRating = vi.fn();
const loadOpeningBook = vi.fn();

vi.mock('@/lib/auth/sessionToken', () => ({
  getSessionFromCookieHeader: (h: unknown) => getSessionFromCookieHeader(h),
}));
vi.mock('@/lib/server/users', () => ({ getUserById: (u: unknown) => getUserById(u) }));
vi.mock('@/lib/coach/userRating', () => ({ resolveUserRating: (u: unknown) => resolveUserRating(u) }));
vi.mock('@/lib/book/load', () => ({
  loadOpeningBook: (b: unknown) => loadOpeningBook(b),
  BOOK_BANDS: ['new', 'beginner', 'improving', 'club', 'strong'],
}));

const book = {
  meta: {
    band: 'improving',
    bandScale: 'common (chess.com), converted from lichess',
    source: 'Lichess rated blitz and rapid, 2025-11',
    games: 232933,
    maxPly: 14,
    corpusPositions: 99030,
    positions: 23765,
    minGames: 10,
    minShare: 0.02,
    generatedFrom: 'test',
    shares: 'per mille',
  },
  book: { 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': [['e4', 620] as [string, number]] },
};

function call(method: string, body?: unknown) {
  const json = vi.fn();
  const status: ReturnType<typeof vi.fn> = vi.fn(() => res);
  const setHeader = vi.fn();
  const req = { method, query: {}, body, headers: { cookie: 'x' } } as unknown as NextApiRequest;
  const res = { status, json, setHeader } as unknown as NextApiResponse;
  return handler(req, res).then(() => ({
    code: status.mock.calls.at(-1)?.[0] as number | undefined,
    body: json.mock.calls[0]?.[0] as Record<string, unknown>,
    headers: Object.fromEntries(setHeader.mock.calls),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionFromCookieHeader.mockResolvedValue({ uid: 'u1' });
  getUserById.mockResolvedValue({ uid: 'u1' });
  resolveUserRating.mockReturnValue(1400);
  loadOpeningBook.mockReturnValue(book);
});

describe('who gets an answer', () => {
  it('refuses anyone it cannot identify', async () => {
    getSessionFromCookieHeader.mockResolvedValue(null);
    expect((await call('POST', { sans: ['e4'], side: 'white' })).code).toBe(401);
    expect(loadOpeningBook).not.toHaveBeenCalled();
  });

  it('allows only POST', async () => {
    expect((await call('GET')).code).toBe(405);
  });

  it('is never cached anywhere shared', async () => {
    // The band is derived from this reader's rating. A shared cache would hand
    // one player the population another was measured against.
    const res = await call('POST', { sans: ['e4'], side: 'white' });
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });
});

describe('the band is never guessed', () => {
  it('takes the band from the rating, not from the caller', async () => {
    // A client-supplied band would let the screen say "people at your level"
    // over numbers from somebody else's level.
    await call('POST', { sans: ['e4'], side: 'white', band: 'strong' });
    expect(loadOpeningBook.mock.calls[0][0]).toBe('improving');
  });

  it('moves the band when the rating moves', () => {
    // The control for the test above. Without it, a route that ignored the
    // rating as well as the caller would pass.
    resolveUserRating.mockReturnValue(2100);
    return call('POST', { sans: ['e4'], side: 'white' }).then(() => {
      expect(loadOpeningBook.mock.calls[0][0]).toBe('strong');
    });
  });

  it('answers with no band at all when the reader has no rating', async () => {
    // `bandFor(undefined)` returns improving, which is right for a bracket and
    // wrong here: "one player in fifty at your level" would be a measurement
    // of a level nobody measured.
    resolveUserRating.mockReturnValue(null);
    const res = await call('POST', { sans: ['e4'], side: 'white' });
    expect(res.code).toBe(200);
    expect(res.body.band).toBeNull();
    expect(res.body.exit).toBeNull();
    expect(loadOpeningBook).not.toHaveBeenCalled();
  });

  it('answers with no exit rather than another band’s book', async () => {
    // "Players rated 2300+ do not play this" is a different sentence from
    // "players at your level do not play this", and only one is on the screen.
    loadOpeningBook.mockReturnValue(null);
    const res = await call('POST', { sans: ['e4'], side: 'white' });
    expect(res.code).toBe(200);
    expect(res.body.band).toBe('improving');
    expect(res.body.exit).toBeNull();
    expect(res.body.corpus).toBeNull();
  });

  it('says which corpus answered', async () => {
    const res = await call('POST', { sans: ['e4'], side: 'white' });
    expect(res.body.corpus).toMatchObject({ band: 'improving', games: 232933, maxPly: 14 });
  });
});

describe('what it accepts', () => {
  it('refuses a request with no side', async () => {
    expect((await call('POST', { sans: ['e4'] })).code).toBe(400);
  });

  it('refuses a request whose moves are not a list', async () => {
    expect((await call('POST', { sans: 'e4 e5', side: 'white' })).code).toBe(400);
  });

  it('drops non-string entries rather than throwing on them', async () => {
    const res = await call('POST', { sans: ['e4', 42, null, 'e5'], side: 'white' });
    expect(res.code).toBe(200);
  });

  it('answers 503 when the store is unavailable, not 500', async () => {
    getUserById.mockRejectedValue(new Error('firestore down'));
    expect((await call('POST', { sans: ['e4'], side: 'white' })).code).toBe(503);
  });
});
