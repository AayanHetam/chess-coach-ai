// A repertoire belongs to an account, or it belongs nowhere.
//
// Lives here rather than beside the route because anything under src/pages/api
// is an API route to Next, and a test file has no default export. tsc and
// vitest are both happy with it there; npm run build is not.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/repertoire-bracket';
import { EMPTY, type BracketState } from '../store';

const readBracket = vi.fn();
const mergeBracket = vi.fn();
const getSessionFromCookieHeader = vi.fn();

vi.mock('@/lib/server/bracketStore', () => ({
  readBracket: (...a: unknown[]) => readBracket(...a),
  mergeBracket: (...a: unknown[]) => mergeBracket(...a),
}));
vi.mock('@/lib/auth/session', () => ({
  getSessionFromCookieHeader: (h: unknown) => getSessionFromCookieHeader(h),
}));

const bracket = (over: Partial<BracketState> = {}): BracketState => ({ ...EMPTY, ...over });

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
  readBracket.mockReset();
  mergeBracket.mockReset();
  getSessionFromCookieHeader.mockReset();
  getSessionFromCookieHeader.mockResolvedValue({ uid: 'u1' });
});

describe('auth', () => {
  it('refuses anyone it cannot identify', async () => {
    getSessionFromCookieHeader.mockResolvedValue(null);
    expect((await call('GET')).code).toBe(401);
    expect((await call('PUT', { body: { bracket: bracket() } })).code).toBe(401);
    // And it must not have touched the store at all.
    expect(readBracket).not.toHaveBeenCalled();
    expect(mergeBracket).not.toHaveBeenCalled();
  });

  it('reads and writes only the caller’s own uid', async () => {
    readBracket.mockResolvedValue(bracket());
    mergeBracket.mockResolvedValue(bracket());
    await call('GET');
    await call('PUT', { body: { bracket: bracket() } });
    expect(readBracket.mock.calls[0][0]).toBe('u1');
    expect(mergeBracket.mock.calls[0][0]).toBe('u1');
  });

  it('allows only GET and PUT', async () => {
    expect((await call('POST', { body: {} })).code).toBe(405);
    expect((await call('DELETE')).code).toBe(405);
  });
});

describe('the response', () => {
  it('is never cached anywhere shared', async () => {
    readBracket.mockResolvedValue(bracket());
    const res = await call('GET');
    // A repertoire served from a shared cache is somebody else's repertoire.
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });

  it('returns what the merge decided, not what the client sent', async () => {
    // The point of the round trip: a device that has been away gets back
    // everything both copies knew, and adopts it.
    const merged = bracket({ updatedAt: 900 });
    mergeBracket.mockResolvedValue(merged);
    const res = await call('PUT', { body: { bracket: bracket({ updatedAt: 100 }) } });
    expect(res.code).toBe(200);
    expect((res.body.bracket as BracketState).updatedAt).toBe(900);
  });

  it('sanitises what it is handed before storing it', async () => {
    mergeBracket.mockResolvedValue(bracket());
    await call('PUT', { body: { bracket: { v: 1, white: 'not-an-array', locked: 'nope', updatedAt: 5 } } });
    const stored = mergeBracket.mock.calls[0][1] as BracketState;
    expect(stored.white).toEqual([]);
    expect(stored.locked).toEqual({ white: false, black: false });
  });

  it('treats a body with no bracket at all as EMPTY rather than throwing', async () => {
    mergeBracket.mockResolvedValue(bracket());
    expect((await call('PUT', { body: {} })).code).toBe(200);
    expect(mergeBracket.mock.calls[0][1]).toEqual(EMPTY);
  });

  // A sync that fails is a sync that did not happen: the local copy is
  // untouched and the page keeps working, so this is worth retrying (503) and
  // is not an error the caller caused (500).
  it('answers 503 when the store is unavailable, not 500', async () => {
    readBracket.mockRejectedValue(new Error('firestore down'));
    expect((await call('GET')).code).toBe(503);
    mergeBracket.mockRejectedValue(new Error('firestore down'));
    expect((await call('PUT', { body: { bracket: bracket() } })).code).toBe(503);
  });
});
