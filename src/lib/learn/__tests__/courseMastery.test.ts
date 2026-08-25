// Progress that can exceed its own denominator is not progress, it is a bug
// with a bar drawn round it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { masteryOf, nextChapter, readCourseMastery } from '@/lib/learn/courseMastery';
import { chapterKey } from '@/lib/learn/chapterProgress';
import type { Correctness, ProbeRecord, Records } from '@/lib/learn/chapterRound';

const record = (key: string, correctness: Correctness): ProbeRecord => ({
  key,
  correctness,
  asks: 1,
  misses: correctness === -1 ? 1 : 0,
  hinted: false,
  lastRound: 1,
  at: 1_700_000_000_000,
});

const records = (...spec: Array<[string, Correctness]>): Records =>
  Object.fromEntries(spec.map(([key, c]) => [key, record(key, c)]));

describe('masteryOf', () => {
  it('separates known from learning, and calls the rest unseen', () => {
    const m = masteryOf(records(['a', 2], ['b', 1], ['c', -1]), 10);
    expect(m).toEqual({ known: 1, learning: 2, unseen: 7, total: 10 });
  });

  // ── Zero by definition ─────────────────────────────────────────────────────
  it('reports a chapter nobody has answered as entirely unseen', () => {
    expect(masteryOf({}, 12)).toEqual({ known: 0, learning: 0, unseen: 12, total: 12 });
  });

  it('never reports more progress than the chapter holds', () => {
    // A player who drops a band keeps records the shallower view no longer
    // contains. Those answers are real; they are not progress through THIS view.
    const m = masteryOf(records(['a', 2], ['b', 2], ['c', 2], ['d', -1]), 2);
    expect(m.known).toBe(2);
    expect(m.learning).toBe(0);
    expect(m.unseen).toBe(0);
    // The control: with room for them, the same records count in full.
    expect(masteryOf(records(['a', 2], ['b', 2], ['c', 2], ['d', -1]), 9)).toEqual({
      known: 3,
      learning: 1,
      unseen: 5,
      total: 9,
    });
  });

  it('does not let a never-asked record count as anything', () => {
    expect(masteryOf(records(['a', 0], ['b', 0]), 4)).toEqual({
      known: 0,
      learning: 0,
      unseen: 4,
      total: 4,
    });
  });
});

describe('readCourseMastery', () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
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
  });
  afterEach(() => vi.unstubAllGlobals());

  it('adds up every chapter it was given', () => {
    window.localStorage.setItem(
      chapterKey('uid', 'w-london', 0),
      JSON.stringify({ v: 1, courseId: 'w-london', chapter: 0, records: records(['a', 2], ['b', 2]), updatedAt: 1 })
    );
    window.localStorage.setItem(
      chapterKey('uid', 'w-london', 1),
      JSON.stringify({ v: 1, courseId: 'w-london', chapter: 1, records: records(['c', -1]), updatedAt: 1 })
    );
    const m = readCourseMastery('uid', 'w-london', [
      { i: 0, asked: 5 },
      { i: 1, asked: 4 },
      { i: 2, asked: 3 },
    ]);
    expect(m.known).toBe(2);
    expect(m.learning).toBe(1);
    expect(m.total).toBe(12);
    expect(m.started).toBe(2);
    expect(m.byChapter.get(2)).toEqual({ known: 0, learning: 0, unseen: 3, total: 3 });
  });

  it('reads nothing for a signed-out reader, whatever is on the origin', () => {
    window.localStorage.setItem(
      chapterKey('uid', 'w-london', 0),
      JSON.stringify({ v: 1, courseId: 'w-london', chapter: 0, records: records(['a', 2]), updatedAt: 1 })
    );
    const m = readCourseMastery('', 'w-london', [{ i: 0, asked: 5 }]);
    expect(m.known).toBe(0);
    expect(m.started).toBe(0);
  });

  it('does not read another account’s work', () => {
    window.localStorage.setItem(
      chapterKey('someone-else', 'w-london', 0),
      JSON.stringify({ v: 1, courseId: 'w-london', chapter: 0, records: records(['a', 2]), updatedAt: 1 })
    );
    expect(readCourseMastery('uid', 'w-london', [{ i: 0, asked: 5 }]).known).toBe(0);
  });
});

describe('nextChapter', () => {
  const chapters = [
    { i: 0, asked: 3 },
    { i: 1, asked: 4 },
    { i: 2, asked: 2 },
  ];

  it('is the first chapter with anything left, in share order', () => {
    const mastery = readCourseMastery('', 'x', chapters);
    mastery.byChapter.set(0, { known: 3, learning: 0, unseen: 0, total: 3 });
    expect(nextChapter(chapters, mastery)).toBe(1);
  });

  it('is null when every chapter is known, so the screen can say so', () => {
    const mastery = readCourseMastery('', 'x', chapters);
    for (const c of chapters) {
      mastery.byChapter.set(c.i, { known: c.asked, learning: 0, unseen: 0, total: c.asked });
    }
    expect(nextChapter(chapters, mastery)).toBeNull();
  });

  it('skips a chapter that asks nothing rather than sending them to an empty session', () => {
    const empty = [{ i: 0, asked: 0 }, { i: 1, asked: 2 }];
    expect(nextChapter(empty, readCourseMastery('', 'x', empty))).toBe(1);
  });
});
