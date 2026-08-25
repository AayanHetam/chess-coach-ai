// Progress belongs to an account, or it belongs nowhere.
//
// A route that quietly accepted an unauthenticated write would be a place to
// store arbitrary JSON under a guessed id, and the courseId becomes part of a
// Firestore document path.
//
// Lives here rather than beside the route because anything under src/pages/api
// is an API route to Next, and a test file has no default export. tsc and
// vitest are both happy with it there; npm run build is not.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/course-progress';
import { blankRecord, gradeAsk } from '../chapterRound';

const readChapter = vi.fn();
const mergeChapter = vi.fn();
const getSessionFromCookieHeader = vi.fn();

vi.mock('@/lib/server/courseProgress', () => ({
  readChapter: (...a: unknown[]) => readChapter(...a),
  mergeChapter: (...a: unknown[]) => mergeChapter(...a),
}));
vi.mock('@/lib/auth/session', () => ({
  getSessionFromCookieHeader: (h: unknown) => getSessionFromCookieHeader(h),
}));

const record = gradeAsk(blankRecord('k'), { right: true, round: 1, at: 1_000 });

function call(
  method: string,
  opts: { query?: Record<string, string>; body?: unknown; cookie?: string } = {}
) {
  const json = vi.fn();
  const status: ReturnType<typeof vi.fn> = vi.fn(() => res);
  const setHeader = vi.fn();
  const req = {
    method,
    query: opts.query ?? {},
    body: opts.body,
    headers: { cookie: opts.cookie },
  } as unknown as NextApiRequest;
  const res = { status, json, setHeader } as unknown as NextApiResponse;
  return handler(req, res).then(() => ({
    // The LAST status wins, which is what a real response object reports.
    code: status.mock.calls.at(-1)?.[0] as number | undefined,
    body: json.mock.calls[0]?.[0] as Record<string, unknown>,
    headers: Object.fromEntries(setHeader.mock.calls),
  }));
}

beforeEach(() => {
  readChapter.mockReset();
  mergeChapter.mockReset();
  getSessionFromCookieHeader.mockReset();
  getSessionFromCookieHeader.mockResolvedValue({ uid: 'u1' });
});

describe('auth', () => {
  it('refuses anyone it cannot identify', async () => {
    getSessionFromCookieHeader.mockResolvedValue(null);
    expect((await call('GET', { query: { courseId: 'w-london', chapter: '0' } })).code).toBe(401);
    expect((await call('PUT', { body: { courseId: 'w-london', chapter: 0, records: {} } })).code).toBe(401);
    // THE ZERO: the number of times the store was touched without a session.
    expect(readChapter).not.toHaveBeenCalled();
    expect(mergeChapter).not.toHaveBeenCalled();
  });

  it('reads and writes only the caller own account', async () => {
    getSessionFromCookieHeader.mockResolvedValue({ uid: 'someone' });
    readChapter.mockResolvedValue({});
    await call('GET', { query: { courseId: 'w-london', chapter: '2' }, cookie: 'cm_session=x' });
    expect(readChapter).toHaveBeenCalledWith('someone', 'w-london', 2);
  });
});

describe('input', () => {
  it('rejects a course id that is not one', async () => {
    // The id becomes part of a document path.
    for (const courseId of ['../../users', 'w london', '', 'A'.repeat(50), 'UPPER']) {
      const res = await call('GET', { query: { courseId, chapter: '0' }, cookie: 'c' });
      expect(res.code).toBe(400);
    }
    expect(readChapter).not.toHaveBeenCalled();
  });

  it('rejects a chapter that is not a small whole number', async () => {
    for (const chapter of ['-1', '1.5', 'x', '100', '']) {
      expect((await call('GET', { query: { courseId: 'w-london', chapter }, cookie: 'c' })).code).toBe(400);
    }
    expect(readChapter).not.toHaveBeenCalled();
  });

  it('accepts only GET and PUT', async () => {
    for (const method of ['POST', 'DELETE', 'PATCH']) {
      expect((await call(method, { cookie: 'c' })).code).toBe(405);
    }
  });

  it('does not fall over on a missing body', async () => {
    expect((await call('PUT', { cookie: 'c' })).code).toBe(400);
  });
});

describe('behaviour', () => {
  it('returns what the account knows', async () => {
    readChapter.mockResolvedValue({ k: record });
    const res = await call('GET', { query: { courseId: 'w-london', chapter: '0' }, cookie: 'c' });
    expect(res.code).toBe(200);
    expect(res.body.records).toEqual({ k: record });
  });

  it('merges rather than overwrites, and hands back the union', async () => {
    mergeChapter.mockResolvedValue({ k: record, other: record });
    const res = await call('PUT', {
      body: { courseId: 'w-london', chapter: 0, records: { k: record } },
      cookie: 'c',
    });
    expect(res.code).toBe(200);
    expect(Object.keys(res.body.records as object).sort()).toEqual(['k', 'other']);
  });

  it('drops records that arrive in the wrong shape before they reach the store', async () => {
    mergeChapter.mockResolvedValue({});
    await call('PUT', {
      body: { courseId: 'w-london', chapter: 0, records: { junk: { key: 'junk', correctness: 42 } } },
      cookie: 'c',
    });
    expect(mergeChapter).toHaveBeenCalledWith('u1', 'w-london', 0, {}, expect.any(Number));
  });

  it('never puts progress in a shared cache', async () => {
    readChapter.mockResolvedValue({});
    const res = await call('GET', { query: { courseId: 'w-london', chapter: '0' }, cookie: 'c' });
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });

  it('says the sync is unavailable rather than failing the screen', async () => {
    // A sync that did not happen broke nothing: the local copy is untouched and
    // the round keeps working. That is a 503, not a 500.
    readChapter.mockRejectedValue(new Error('firestore timeout'));
    expect((await call('GET', { query: { courseId: 'w-london', chapter: '0' }, cookie: 'c' })).code).toBe(503);
    mergeChapter.mockRejectedValue(new Error('firestore timeout'));
    expect((await call('PUT', { body: { courseId: 'w-london', chapter: 0, records: {} }, cookie: 'c' })).code).toBe(503);
  });
});
