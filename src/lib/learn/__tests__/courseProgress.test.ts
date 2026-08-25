// One scan of the keyspace, answering two questions about every course.
//
// The second question is new and it is the point: cards are earned per chapter
// and used to be visible only on that chapter's own hub, so a review earned on
// Monday was invisible on every screen a player actually opens. An earned
// review nobody can find is a review that does not exist.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readCourseProgress } from '@/lib/learn/courseProgress';
import { chapterKey } from '@/lib/learn/chapterProgress';
import { blankRecord, type ProbeRecord } from '@/lib/learn/chapterRound';

const ACCOUNT = 'uid';
const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

let store: Record<string, string>;

beforeEach(() => {
  store = {};
  vi.stubGlobal('window', {
    localStorage: {
      get length() {
        return Object.keys(store).length;
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
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

const known = (key: string): ProbeRecord => ({ ...blankRecord(key), correctness: 2, asks: 1, at: 1 });

const owed = (key: string, dueAt: number): ProbeRecord => ({
  ...blankRecord(key),
  correctness: 2,
  asks: 2,
  misses: 1,
  at: 1,
  ease: 2.5,
  interval: 6,
  dueAt,
});

function seed(courseId: string, chapter: number, records: ProbeRecord[], updatedAt = 1) {
  store[chapterKey(ACCOUNT, courseId, chapter)] = JSON.stringify({
    v: 1,
    courseId,
    chapter,
    records: Object.fromEntries(records.map(r => [r.key, r])),
    updatedAt,
  });
}

describe('readCourseProgress', () => {
  it('counts chapters started and the cards owed across them', () => {
    seed('w-london', 0, [known('a'), owed('b', NOW - DAY)], 500);
    seed('w-london', 3, [owed('c', NOW - DAY), owed('d', NOW - 2 * DAY)], 900);
    seed('b-caro', 0, [known('e')], 100);

    const out = readCourseProgress(ACCOUNT, NOW);
    expect(out.get('w-london')).toEqual({
      started: 2,
      at: 900,
      due: 3,
      nextAt: NOW - 2 * DAY,
    });
    expect(out.get('b-caro')).toEqual({ started: 1, at: 100, due: 0, nextAt: null });
  });

  // ── Zero by definition ─────────────────────────────────────────────────────
  it('owes nothing for a course nobody has got wrong', () => {
    seed('w-london', 0, [known('a'), known('b')]);
    expect(readCourseProgress(ACCOUNT, NOW).get('w-london')!.due).toBe(0);
  });

  it('counts nothing due without a clock, rather than everything', () => {
    seed('w-london', 0, [owed('a', NOW - DAY)]);
    expect(readCourseProgress(ACCOUNT).get('w-london')!.due).toBe(0);
    // The control: the same store, with a clock.
    expect(readCourseProgress(ACCOUNT, NOW).get('w-london')!.due).toBe(1);
  });

  it('does not count a card whose date has not come', () => {
    seed('w-london', 0, [owed('a', NOW + DAY)]);
    const found = readCourseProgress(ACCOUNT, NOW).get('w-london')!;
    expect(found.due).toBe(0);
    // It is still scheduled, and the screen may say when.
    expect(found.nextAt).toBe(NOW + DAY);
  });

  it('drops half a card rather than counting it', () => {
    // `dueAt` is arithmetic: a stored NaN compares false against every clock,
    // so the decision would be permanently not-due with nothing to see. The
    // record is dropped, not silently kept.
    const broken = { ...owed('a', NOW - DAY), ease: Number.NaN };
    seed('w-london', 0, [broken, owed('b', NOW - DAY)]);
    const found = readCourseProgress(ACCOUNT, NOW).get('w-london')!;
    expect(found.due).toBe(1);
  });

  it('reads nothing for another account', () => {
    seed('w-london', 0, [owed('a', NOW - DAY)]);
    expect(readCourseProgress('someone-else', NOW).size).toBe(0);
  });

  it('ignores a chapter that was opened and never answered', () => {
    seed('w-london', 0, []);
    expect(readCourseProgress(ACCOUNT, NOW).size).toBe(0);
  });
});
