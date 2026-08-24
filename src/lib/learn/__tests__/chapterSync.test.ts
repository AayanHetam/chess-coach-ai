// Syncing must never cost a player something they already had.
//
// The rule the whole module is built on: the LOCAL copy is the fast path and
// the safe one. A failed sync is invisible and harmless; the only failure worth
// telling a player about is the local write, which the screen surfaces.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankRecord, gradeAsk, type ProbeRecord, type Records } from '../chapterRound';
import { loadChapter, writeChapter } from '../chapterProgress';
import { pullChapter, pushChapter } from '../chapterSync';

const TARGET = { account: 'aayan', courseId: 'w-london', chapter: 0 };

let store: Record<string, string>;
const fetchMock = vi.fn();

const answered = (key: string, at: number, right = true): ProbeRecord =>
  gradeAsk(blankRecord(key), { right, round: 1, at });

const ok = (records: Records) => ({ ok: true, json: async () => ({ records }) });

beforeEach(() => {
  store = {};
  fetchMock.mockReset();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    },
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('pullChapter', () => {
  it('brings back work done on another device', () => {
    writeChapter(TARGET.account, TARGET.courseId, 0, { a: answered('a', 1_000) }, 1_000);
    fetchMock.mockResolvedValue(ok({ b: answered('b', 2_000) }));

    return pullChapter(TARGET).then(merged => {
      expect(Object.keys(merged!).sort()).toEqual(['a', 'b']);
      // And it is on this device now, without a second round trip.
      expect(Object.keys(loadChapter(TARGET.account, TARGET.courseId, 0)).sort()).toEqual(['a', 'b']);
    });
  });

  it('does not let a stale account copy un-know a decision', () => {
    // Known on the phone this morning, and the account still has last month's
    // miss. The recent answer wins, both ways round.
    writeChapter(TARGET.account, TARGET.courseId, 0, { a: answered('a', 9_000) }, 9_000);
    fetchMock.mockResolvedValue(ok({ a: answered('a', 1_000, false) }));

    return pullChapter(TARGET).then(merged => {
      expect(merged!.a.correctness).toBe(2);
    });
  });

  it('costs nothing when the network is gone', async () => {
    // THE ZERO: the number of decisions lost to a failed sync is zero, for
    // every failure shape.
    writeChapter(TARGET.account, TARGET.courseId, 0, { a: answered('a', 1_000) }, 1_000);
    const before = loadChapter(TARGET.account, TARGET.courseId, 0);

    for (const failure of [
      () => Promise.reject(new Error('offline')),
      () => Promise.resolve({ ok: false, json: async () => ({}) }),
      () => Promise.resolve({ ok: true, json: async () => { throw new Error('bad json'); } }),
      () => Promise.resolve({ ok: true, json: async () => ({}) }),
    ]) {
      fetchMock.mockImplementation(failure as never);
      await expect(pullChapter(TARGET)).resolves.toBeNull();
      expect(loadChapter(TARGET.account, TARGET.courseId, 0)).toEqual(before);
    }
  });

  it('refuses records the account sent in the wrong shape', async () => {
    writeChapter(TARGET.account, TARGET.courseId, 0, { a: answered('a', 1_000) }, 1_000);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ records: { bad: { key: 'bad', correctness: 99 } } }),
    });
    // Nothing valid came back, so nothing changed.
    await expect(pullChapter(TARGET)).resolves.toBeNull();
    expect(Object.keys(loadChapter(TARGET.account, TARGET.courseId, 0))).toEqual(['a']);
  });
});

describe('pushChapter', () => {
  it('saves the union the server returns', async () => {
    fetchMock.mockResolvedValue(ok({ a: answered('a', 1_000), b: answered('b', 2_000) }));
    const merged = await pushChapter(TARGET, { a: answered('a', 1_000) });
    expect(Object.keys(merged!).sort()).toEqual(['a', 'b']);
    expect(Object.keys(loadChapter(TARGET.account, TARGET.courseId, 0)).sort()).toEqual(['a', 'b']);
  });

  it('sends the chapter it was asked to send', async () => {
    fetchMock.mockResolvedValue(ok({}));
    await pushChapter({ ...TARGET, chapter: 3 }, { a: answered('a', 1) });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toMatchObject({ courseId: 'w-london', chapter: 3 });
  });

  it('leaves the local copy alone when the push fails', async () => {
    writeChapter(TARGET.account, TARGET.courseId, 0, { a: answered('a', 1_000) }, 1_000);
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(pushChapter(TARGET, { a: answered('a', 1_000) })).resolves.toBeNull();
    expect(Object.keys(loadChapter(TARGET.account, TARGET.courseId, 0))).toEqual(['a']);
  });

  it('never throws, whatever the server does', async () => {
    for (const failure of [
      () => Promise.reject(new Error('offline')),
      () => Promise.resolve({ ok: false, json: async () => ({ error: 'nope' }) }),
      () => Promise.resolve({ ok: true, json: async () => null }),
    ]) {
      fetchMock.mockImplementation(failure as never);
      await expect(pushChapter(TARGET, {})).resolves.toBeNull();
    }
  });
});
