// Mastery has to survive being put down.
//
// The founder's ask was that this is "very easy to pause and return to even on
// a day-to-day basis", and the two things that decide whether it is are here:
// mastery has no TTL, and a write that fails says so instead of looking like a
// chapter nobody studied.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankRecord, gradeAsk, type ProbeRecord, type Records } from '../chapterRound';
import { chapterKey, clearChapter, loadChapter, mergeChapters, writeChapter } from '../chapterProgress';

const ACCOUNT = 'Aayan';
const COURSE = 'w-london';
const NOW = 1_700_000_000_000;

let store: Record<string, string>;
let full = false;

beforeEach(() => {
  store = {};
  full = false;
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        if (full) throw new Error('QuotaExceededError');
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

const answered = (key: string, at: number): ProbeRecord =>
  gradeAsk(blankRecord(key), { right: true, round: 1, at });

describe('a chapter survives being put down', () => {
  it('comes back exactly as it was left', () => {
    const records: Records = { a: answered('a', NOW) };
    expect(writeChapter(ACCOUNT, COURSE, 0, records, NOW)).toBe(true);
    expect(loadChapter(ACCOUNT, COURSE, 0)).toEqual(records);
  });

  it('does not expire', () => {
    // THE POINT. trainerProgress drops a session after three days, which is
    // right for an in-flight drill and wrong for knowing an opening. Six months
    // later the chapter still knows.
    writeChapter(ACCOUNT, COURSE, 0, { a: answered('a', NOW) }, NOW - 180 * 24 * 60 * 60 * 1000);
    expect(Object.keys(loadChapter(ACCOUNT, COURSE, 0))).toEqual(['a']);
  });

  it('keeps chapters and courses apart', () => {
    writeChapter(ACCOUNT, COURSE, 0, { a: answered('a', NOW) }, NOW);
    writeChapter(ACCOUNT, COURSE, 1, { b: answered('b', NOW) }, NOW);
    writeChapter(ACCOUNT, 'b-caro', 0, { c: answered('c', NOW) }, NOW);
    expect(Object.keys(loadChapter(ACCOUNT, COURSE, 0))).toEqual(['a']);
    expect(Object.keys(loadChapter(ACCOUNT, COURSE, 1))).toEqual(['b']);
    expect(Object.keys(loadChapter(ACCOUNT, 'b-caro', 0))).toEqual(['c']);
  });

  it('cannot collide with a paused repair', () => {
    // cm.trainer.v1 holds ONE session for the whole app. A chapter landing in
    // it would discard a half-finished repair of a measured hole.
    expect(chapterKey(ACCOUNT, COURSE, 0).startsWith('cm.course.v1.')).toBe(true);
    expect(chapterKey(ACCOUNT, COURSE, 0)).not.toContain('cm.trainer.v1');
  });

  it('is one account at a time', () => {
    writeChapter('aayan', COURSE, 0, { a: answered('a', NOW) }, NOW);
    expect(loadChapter('someone-else', COURSE, 0)).toEqual({});
  });
});

describe('a failed write says so', () => {
  it('returns false rather than pretending', () => {
    // An unsaved chapter is pixel-identical to an unstudied one. On this origin
    // savedEvalsAtom grows without eviction through an unguarded setItem, so a
    // full origin is a real state, not a hypothetical.
    full = true;
    expect(writeChapter(ACCOUNT, COURSE, 0, { a: answered('a', NOW) }, NOW)).toBe(false);
  });

  it('does not throw out of the round', () => {
    // THE ZERO: exceptions escaping the store is zero, in every failure mode.
    full = true;
    expect(() => writeChapter(ACCOUNT, COURSE, 0, {}, NOW)).not.toThrow();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('denied');
        },
        removeItem: () => {
          throw new Error('denied');
        },
      },
    });
    expect(() => loadChapter(ACCOUNT, COURSE, 0)).not.toThrow();
    expect(loadChapter(ACCOUNT, COURSE, 0)).toEqual({});
    expect(() => clearChapter(ACCOUNT, COURSE, 0)).not.toThrow();
  });

  it('reports nothing on a server render', () => {
    vi.stubGlobal('window', undefined);
    expect(loadChapter(ACCOUNT, COURSE, 0)).toEqual({});
    expect(writeChapter(ACCOUNT, COURSE, 0, {}, NOW)).toBe(false);
  });
});

describe('corrupt storage costs a decision, not a month', () => {
  it('drops a bad record and keeps the rest', () => {
    store[chapterKey(ACCOUNT, COURSE, 0)] = JSON.stringify({
      v: 1,
      courseId: COURSE,
      chapter: 0,
      updatedAt: NOW,
      records: {
        good: answered('good', NOW),
        // misses missing: `undefined + 1` is NaN, which persists silently and
        // makes every later comparison false.
        bad: { key: 'bad', correctness: 1, asks: 2, hinted: false, lastRound: 1, at: NOW },
        mismatched: answered('somethingElse', NOW),
        nonsense: 7,
      },
    });
    expect(Object.keys(loadChapter(ACCOUNT, COURSE, 0))).toEqual(['good']);
  });

  it('refuses junk, an old version, and a wrong shape', () => {
    const key = chapterKey(ACCOUNT, COURSE, 0);
    store[key] = 'not json';
    expect(loadChapter(ACCOUNT, COURSE, 0)).toEqual({});
    store[key] = JSON.stringify({ v: 0, records: { a: answered('a', NOW) } });
    expect(loadChapter(ACCOUNT, COURSE, 0)).toEqual({});
    store[key] = JSON.stringify({ v: 1, records: 'nope' });
    expect(loadChapter(ACCOUNT, COURSE, 0)).toEqual({});
  });

  it('rejects a correctness value that is not one of the four', () => {
    store[chapterKey(ACCOUNT, COURSE, 0)] = JSON.stringify({
      v: 1,
      records: { a: { ...answered('a', NOW), correctness: 5 } },
    });
    expect(loadChapter(ACCOUNT, COURSE, 0)).toEqual({});
  });
});

describe('mergeChapters', () => {
  const laptop = (c: number, at: number): ProbeRecord => ({
    ...blankRecord('x'),
    correctness: c as ProbeRecord['correctness'],
    at,
    asks: 3,
  });

  it('takes the more recent answer, so a player is allowed to forget', () => {
    // Known in March, missed in June. The June answer is the truth, and a merge
    // that kept "known" would delete the only evidence a schedule runs on.
    const march = { x: laptop(2, 1_000) };
    const june = { x: laptop(-1, 2_000) };
    expect(mergeChapters(march, june).x.correctness).toBe(-1);
    expect(mergeChapters(june, march).x.correctness).toBe(-1);
  });

  it('does not let a miss be erased by a device that never asked', () => {
    // Math.max would give 0 here, because the values are 2, 1, -1, 0 and max of
    // -1 and 0 is 0. That silently turns "they got this wrong" into "we have
    // never asked", which is the more flattering answer and the false one.
    const missed = { x: { ...blankRecord('x'), correctness: -1 as const, at: 2_000, misses: 1 } };
    const untouched = { x: { ...blankRecord('x'), correctness: 0 as const, at: 1_000 } };
    expect(mergeChapters(untouched, missed).x.correctness).toBe(-1);
    expect(mergeChapters(missed, untouched).x.correctness).toBe(-1);
  });

  it('keeps every count at the larger of the two', () => {
    const a = { x: { ...blankRecord('x'), asks: 5, misses: 2, lastRound: 3, at: 1_000 } };
    const b = { x: { ...blankRecord('x'), asks: 2, misses: 4, lastRound: 7, at: 2_000 } };
    const merged = mergeChapters(a, b).x;
    expect(merged.asks).toBe(5);
    expect(merged.misses).toBe(4);
    expect(merged.lastRound).toBe(7);
  });

  it('remembers a hint taken on either device', () => {
    // THE ZERO: the number of ways a sync can turn "was shown" into "known" is
    // zero, whichever side the hint happened on and whichever order they merge.
    const shown = { x: { ...blankRecord('x'), hinted: true, at: 1_000 } };
    const clean = { x: { ...blankRecord('x'), hinted: false, at: 9_000 } };
    expect(mergeChapters(shown, clean).x.hinted).toBe(true);
    expect(mergeChapters(clean, shown).x.hinted).toBe(true);
  });

  it('keeps decisions only one side has ever seen', () => {
    const a = { p: answered('p', 1_000) };
    const b = { q: answered('q', 2_000) };
    expect(Object.keys(mergeChapters(a, b)).sort()).toEqual(['p', 'q']);
  });

  it('is the identity against nothing', () => {
    const a = { p: answered('p', 1_000) };
    expect(mergeChapters(a, {})).toEqual(a);
    expect(mergeChapters({}, a)).toEqual(a);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE CARD, ACROSS A STORE AND ACROSS DEVICES
//
// The card fields landed after records were already on people's devices, so
// absence has to stay valid. What must not be valid is HALF a card: `dueAt` is
// the single test for "this owes a review", and a stored NaN compares false
// against every clock — a decision permanently not-due with nothing to see.
// ─────────────────────────────────────────────────────────────────────────────

describe('records written before the review layer existed', () => {
  const legacy = (key: string): ProbeRecord =>
    ({ key, correctness: 2, asks: 1, misses: 0, hinted: false, lastRound: 1, at: NOW }) as ProbeRecord;

  it('load unchanged, with no card', () => {
    expect(writeChapter(ACCOUNT, COURSE, 0, { a: legacy('a') }, NOW)).toBe(true);
    const back = loadChapter(ACCOUNT, COURSE, 0);
    expect(back.a).toEqual(legacy('a'));
    expect(back.a.dueAt).toBeUndefined();
  });

  it('keep a whole card and drop a broken one', () => {
    const whole = { ...legacy('a'), ease: 2.5, interval: 6, dueAt: NOW + 1 };
    const half = { ...legacy('b'), dueAt: NOW + 1 };
    const nan = { ...legacy('c'), ease: Number.NaN, interval: 6, dueAt: NOW + 1 };
    writeChapter(ACCOUNT, COURSE, 1, { a: whole, b: half, c: nan } as Records, NOW);
    const back = loadChapter(ACCOUNT, COURSE, 1);
    expect(Object.keys(back)).toEqual(['a']);
    expect(back.a.dueAt).toBe(NOW + 1);
  });
});

describe('merging a card', () => {
  const card = (key: string, at: number, dueAt: number): ProbeRecord => ({
    key,
    correctness: 2,
    asks: 2,
    misses: 1,
    hinted: false,
    lastRound: 2,
    at,
    ease: 2.5,
    interval: 6,
    dueAt,
  });

  it('survives a device that never saw the miss', () => {
    // Taking the newer record wholesale would delete the evidence. A card
    // exists because something went wrong somewhere, exactly like `hinted`.
    const laptop = { a: card('a', NOW, NOW + 6 * 86_400_000) };
    const phone = {
      a: { key: 'a', correctness: 2, asks: 1, misses: 0, hinted: false, lastRound: 1, at: NOW + 1000 } as ProbeRecord,
    };
    const merged = mergeChapters(laptop, phone);
    expect(merged.a.dueAt).toBe(NOW + 6 * 86_400_000);
  });

  it('takes the EARLIER date, because being asked late is the failure', () => {
    const soon = { a: card('a', NOW, NOW + 86_400_000) };
    const later = { a: card('a', NOW + 5000, NOW + 30 * 86_400_000) };
    expect(mergeChapters(soon, later).a.dueAt).toBe(NOW + 86_400_000);
    expect(mergeChapters(later, soon).a.dueAt).toBe(NOW + 86_400_000);
  });

  it('keeps the ease and interval that belong to the date it kept', () => {
    const soon = { a: { ...card('a', NOW, NOW + 86_400_000), ease: 1.9, interval: 1 } };
    const later = { a: { ...card('a', NOW + 5000, NOW + 30 * 86_400_000), ease: 2.8, interval: 30 } };
    const merged = mergeChapters(soon, later).a;
    expect(merged.ease).toBe(1.9);
    expect(merged.interval).toBe(1);
  });

  // ── Zero by definition ─────────────────────────────────────────────────────
  it('produces no card when neither side has one', () => {
    const a = { a: { key: 'a', correctness: 2, asks: 1, misses: 0, hinted: false, lastRound: 1, at: NOW } as ProbeRecord };
    expect(mergeChapters(a, a).a.dueAt).toBeUndefined();
  });
});
