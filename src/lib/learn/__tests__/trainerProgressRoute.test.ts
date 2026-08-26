// What a player has learnt belongs to their account, or to nobody.
//
// Lives here rather than beside the route because anything under src/pages/api
// is an API route to Next, and a test file has no default export. tsc and
// vitest are both happy with it there; npm run build is not.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/trainer-progress';
import type { TrainerProgress } from '@/lib/server/trainerStore';
import type { ReviewCard } from '../reviewSchedule';

const readTrainerProgress = vi.fn();
const mergeTrainerProgress = vi.fn();
const getSessionFromCookieHeader = vi.fn();

vi.mock('@/lib/server/trainerStore', () => ({
  readTrainerProgress: (...a: unknown[]) => readTrainerProgress(...a),
  mergeTrainerProgress: (...a: unknown[]) => mergeTrainerProgress(...a),
}));
vi.mock('@/lib/auth/session', () => ({
  getSessionFromCookieHeader: (h: unknown) => getSessionFromCookieHeader(h),
}));

const card = (lineKey: string, over: Partial<ReviewCard> = {}): ReviewCard => ({
  lineKey,
  line: { moves: ['e4', 'c5'], color: 'white' },
  label: lineKey,
  easeFactor: 2.5,
  interval: 6,
  attempts: 1,
  nextReview: 100,
  lastReviewed: 0,
  lapses: 0,
  ...over,
});

const progress = (over: Partial<TrainerProgress> = {}): TrainerProgress => ({
  cards: [],
  repaired: [],
  ...over,
});

function call(method: string, opts: { body?: unknown; cookie?: string } = {}) {
  const json = vi.fn();
  const status: ReturnType<typeof vi.fn> = vi.fn(() => res);
  const setHeader = vi.fn();
  const req = { method, query: {}, body: opts.body, headers: { cookie: opts.cookie } } as unknown as NextApiRequest;
  const res = { status, json, setHeader } as unknown as NextApiResponse;
  return handler(req, res).then(() => ({
    code: status.mock.calls.at(-1)?.[0] as number | undefined,
    body: json.mock.calls[0]?.[0] as Record<string, unknown>,
    headers: Object.fromEntries(setHeader.mock.calls),
  }));
}

beforeEach(() => {
  readTrainerProgress.mockReset();
  mergeTrainerProgress.mockReset();
  getSessionFromCookieHeader.mockReset();
  getSessionFromCookieHeader.mockResolvedValue({ uid: 'u1' });
});

describe('auth', () => {
  it('refuses anyone it cannot identify', async () => {
    getSessionFromCookieHeader.mockResolvedValue(null);
    expect((await call('GET')).code).toBe(401);
    expect((await call('PUT', { body: { progress: progress() } })).code).toBe(401);
    // And it must not have touched the store at all.
    expect(readTrainerProgress).not.toHaveBeenCalled();
    expect(mergeTrainerProgress).not.toHaveBeenCalled();
  });

  it('reads and writes only the caller’s own uid', async () => {
    readTrainerProgress.mockResolvedValue(progress());
    mergeTrainerProgress.mockResolvedValue(progress());
    await call('GET');
    await call('PUT', { body: { progress: progress() } });
    expect(readTrainerProgress.mock.calls[0][0]).toBe('u1');
    expect(mergeTrainerProgress.mock.calls[0][0]).toBe('u1');
  });

  it('allows only GET and PUT', async () => {
    expect((await call('POST', { body: {} })).code).toBe(405);
    expect((await call('DELETE')).code).toBe(405);
  });
});

describe('the response', () => {
  it('is never cached anywhere shared', async () => {
    readTrainerProgress.mockResolvedValue(progress());
    const res = await call('GET');
    // A schedule served from a shared cache is somebody else's schedule.
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });

  it('returns what the merge decided, not what the client sent', async () => {
    // The point of the round trip: a device that has been away gets back
    // everything both copies knew, and adopts it.
    mergeTrainerProgress.mockResolvedValue(progress({ cards: [card('a'), card('b')] }));
    const res = await call('PUT', { body: { progress: progress({ cards: [card('a')] }) } });
    expect(res.code).toBe(200);
    expect((res.body.progress as TrainerProgress).cards).toHaveLength(2);
  });

  it('sanitises what it is handed before storing it', async () => {
    mergeTrainerProgress.mockResolvedValue(progress());
    await call('PUT', {
      body: {
        progress: {
          cards: [card('ok'), { ...card('empty'), line: { moves: [], color: 'white' } }],
          repaired: 'not-an-array',
        },
      },
    });
    const stored = mergeTrainerProgress.mock.calls[0][1] as TrainerProgress;
    // A card with no moves would render a board the player cannot complete or
    // escape, and it must not get as far as the document.
    expect(stored.cards.map(c => c.lineKey)).toEqual(['ok']);
    expect(stored.repaired).toEqual([]);
  });

  it('treats a body with no progress at all as empty rather than throwing', async () => {
    mergeTrainerProgress.mockResolvedValue(progress());
    expect((await call('PUT', { body: {} })).code).toBe(200);
    expect(mergeTrainerProgress.mock.calls[0][1]).toEqual({ cards: [], repaired: [] });
  });

  // A sync that fails is a sync that did not happen: the local copy is
  // untouched and the page keeps working, so this is worth retrying (503) and
  // is not an error the caller caused (500).
  it('answers 503 when the store is unavailable, not 500', async () => {
    readTrainerProgress.mockRejectedValue(new Error('firestore down'));
    expect((await call('GET')).code).toBe(503);
    mergeTrainerProgress.mockRejectedValue(new Error('firestore down'));
    expect((await call('PUT', { body: { progress: progress() } })).code).toBe(503);
  });
});
