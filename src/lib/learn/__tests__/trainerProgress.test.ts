// Pausing has to be free, and resuming has to be right.
//
// Every case below is one where resuming would be WORSE than starting again:
// a different line, a stale session nobody remembers, a finished one with
// nothing left to do, another account's progress. Getting any of them wrong
// drops a player onto a board mid-line with an unexplained streak, and the
// first thing they do is get it wrong.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_TTL_MS,
  clearSession,
  describeProgress,
  isRepaired,
  lineKeyOf,
  loadRepaired,
  loadSession,
  markRepaired,
  saveSession,
} from '@/lib/learn/trainerProgress';
import { createSession, startRun, type TrainerLine } from '@/lib/learn/trainerSession';

const LINE: TrainerLine = {
  moves: ['e4', 'c5', 'c3'],
  color: 'white',
  target: { san: 'Nf3', source: 'engine' },
};
const OTHER: TrainerLine = { moves: ['d4', 'Nf6'], color: 'black' };
const ME = 'chess.com:lazer_wizard';

function fakeStorage(broken = false) {
  const store: Record<string, string> = {};
  return {
    localStorage: {
      getItem: (k: string) => {
        if (broken) throw new Error('denied');
        return store[k] ?? null;
      },
      setItem: (k: string, v: string) => {
        if (broken) throw new Error('quota');
        store[k] = v;
      },
      removeItem: (k: string) => {
        if (broken) throw new Error('denied');
        delete store[k];
      },
    },
    __store: store,
  };
}

beforeEach(() => vi.stubGlobal('window', fakeStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('lineKeyOf', () => {
  it('separates the same moves played from the other side', () => {
    expect(lineKeyOf({ moves: ['e4'], color: 'white' })).not.toBe(
      lineKeyOf({ moves: ['e4'], color: 'black' })
    );
  });

  it('ignores the target, which can arrive after the session starts', () => {
    // The master lookup lands late. If it changed the key, a session already in
    // progress would be orphaned by its own coaching.
    const { moves, color } = LINE;
    expect(lineKeyOf(LINE)).toBe(lineKeyOf({ moves, color }));
  });
});

describe('save and resume', () => {
  it('round-trips a session in progress', () => {
    const state = { ...startRun(LINE), streak: 2, runs: 4 };
    saveSession(ME, LINE, state, 1_000);
    const back = loadSession(ME, LINE, 1_000);
    expect(back?.streak).toBe(2);
    expect(back?.runs).toBe(4);
    expect(back?.fen).toBe(state.fen);
  });

  it('refuses a session saved against a different line', () => {
    saveSession(ME, LINE, createSession(LINE), 1_000);
    expect(loadSession(ME, OTHER, 1_000)).toBeNull();
  });

  it('refuses another account progress', () => {
    saveSession(ME, LINE, createSession(LINE), 1_000);
    expect(loadSession('lichess:someone_else', LINE, 1_000)).toBeNull();
  });

  it('expires', () => {
    saveSession(ME, LINE, createSession(LINE), 0);
    expect(loadSession(ME, LINE, SESSION_TTL_MS - 1)).not.toBeNull();
    // Resuming into a drill nobody remembers starting is worse than a restart.
    expect(loadSession(ME, LINE, SESSION_TTL_MS + 1)).toBeNull();
  });

  it('never resumes a finished session', () => {
    // There is nothing left to do in it, and landing on a completion screen
    // reads as the trainer being stuck.
    const done = { ...startRun(LINE), act: 'done' as const, streak: 3 };
    saveSession(ME, LINE, done, 1_000);
    expect(loadSession(ME, LINE, 1_000)).toBeNull();
  });

  it('treats an unreadable entry as no session rather than throwing', () => {
    const w = fakeStorage();
    w.__store['cm.trainer.v1.session:chess.com:lazer_wizard'] = '{not json';
    vi.stubGlobal('window', w);
    // A throw here happens on mount and takes the whole trainer down.
    expect(() => loadSession(ME, LINE, 1_000)).not.toThrow();
    expect(loadSession(ME, LINE, 1_000)).toBeNull();
  });

  it('rejects a payload of the wrong shape', () => {
    const w = fakeStorage();
    w.__store['cm.trainer.v1.session:chess.com:lazer_wizard'] = JSON.stringify({
      v: 1,
      lineKey: lineKeyOf(LINE),
      savedAt: 1_000,
      state: { act: 'drill' }, // no fen
    });
    vi.stubGlobal('window', w);
    expect(loadSession(ME, LINE, 1_000)).toBeNull();
  });

  it('clears', () => {
    saveSession(ME, LINE, createSession(LINE), 1_000);
    clearSession(ME);
    expect(loadSession(ME, LINE, 1_000)).toBeNull();
  });

  it('survives storage being unavailable in both directions', () => {
    vi.stubGlobal('window', fakeStorage(true));
    expect(() => saveSession(ME, LINE, createSession(LINE), 1_000)).not.toThrow();
    expect(loadSession(ME, LINE, 1_000)).toBeNull();
    expect(() => clearSession(ME)).not.toThrow();
  });

  it('is inert on the server', () => {
    vi.stubGlobal('window', undefined);
    expect(loadSession(ME, LINE, 1_000)).toBeNull();
    expect(() => saveSession(ME, LINE, createSession(LINE), 1_000)).not.toThrow();
  });
});

describe('repaired lines', () => {
  it('records one, newest first', () => {
    markRepaired(ME, LINE, '1.e4 c5 2.c3', 4, 1_000);
    markRepaired(ME, OTHER, '1.d4 Nf6', 3, 2_000);
    expect(loadRepaired(ME).map(r => r.label)).toEqual(['1.d4 Nf6', '1.e4 c5 2.c3']);
  });

  it('updates rather than stacking when the same line is repaired again', () => {
    markRepaired(ME, LINE, '1.e4 c5 2.c3', 5, 1_000);
    markRepaired(ME, LINE, '1.e4 c5 2.c3', 3, 9_000);
    const all = loadRepaired(ME);
    // A picture of the repertoire, not a log of attempts.
    expect(all).toHaveLength(1);
    expect(all[0].runs).toBe(3);
    expect(all[0].at).toBe(9_000);
  });

  it('answers whether a line is already repaired', () => {
    expect(isRepaired(ME, LINE)).toBe(false);
    markRepaired(ME, LINE, '1.e4 c5 2.c3', 3, 1_000);
    expect(isRepaired(ME, LINE)).toBe(true);
    expect(isRepaired(ME, OTHER)).toBe(false);
  });

  it('keeps accounts apart', () => {
    markRepaired(ME, LINE, '1.e4 c5 2.c3', 3, 1_000);
    expect(isRepaired('lichess:someone_else', LINE)).toBe(false);
  });

  it('ignores a corrupt list instead of losing the trainer', () => {
    const w = fakeStorage();
    w.__store['cm.trainer.v1.repaired:chess.com:lazer_wizard'] = '{"not":"an array"}';
    vi.stubGlobal('window', w);
    expect(loadRepaired(ME)).toEqual([]);
  });
});

describe('describeProgress', () => {
  it('says where they were in words, not in a percentage', () => {
    expect(describeProgress({ ...startRun(LINE), act: 'learn' })).toMatch(/played your move/i);
    expect(describeProgress(startRun(LINE))).toMatch(/drilling the line/i);
    expect(describeProgress({ ...startRun(LINE), streak: 1 })).toMatch(/1 clean run/);
    expect(describeProgress({ ...startRun(LINE), streak: 2 })).toMatch(/2 clean runs/);
  });
});
