// A paused chapter and a paused repair are different things.
//
// Two defects, both latent only because nothing constructed a study session:
//
//   sessionKey() gave 'study' the same empty suffix as 'repair', so the two
//   shared one localStorage slot and opening a chapter would have discarded a
//   half-finished repair of a line measured off the player's own games.
//
//   loadSession() re-derived the mode as `state.mode === 'review' ? 'review' :
//   'repair'`, which was correct when there were two modes and silently
//   downgrades the third. A resumed chapter would come back as a CONFRONT —
//   "play the move you always play" — for a course move the player has never
//   been shown.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, loadSession, saveSession } from '../trainerProgress';
import { createSession, type TrainerLine } from '../trainerSession';

const ACCOUNT = 'aayan';
const NOW = 1_700_000_000_000;

const STUDY: TrainerLine = {
  moves: ['e4', 'c6', 'd4', 'd5', 'Nc3'],
  color: 'white',
  target: { san: 'Nc3', source: 'engine' },
};
const REPAIR: TrainerLine = {
  moves: ['d4', 'd5', 'Bf4'],
  color: 'white',
  target: { san: 'Bf4', source: 'masters' },
};

// The module reads window.localStorage, so the suite stubs `window` the same
// way trainerProgress.test.ts does rather than reaching for a real one.
let store: Record<string, string> = {};
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

describe('a study session survives being paused', () => {
  it('comes back as a study session, not as a repair', () => {
    // The whole point. Resuming as 'repair' would open on CONFRONT and accuse
    // the player of a habit they were never measured to have.
    saveSession(ACCOUNT, STUDY, createSession(STUDY, 'study'), NOW);
    const back = loadSession(ACCOUNT, STUDY, NOW, 'study');
    expect(back?.mode).toBe('study');
    expect(back?.act).toBe('probe');
  });

  it('does not evict a paused repair, and is not evicted by one', () => {
    // The zero-by-definition assertion: after saving both, the number of
    // sessions that came back missing or wrong is zero. One shared slot makes
    // that impossible by construction.
    saveSession(ACCOUNT, REPAIR, createSession(REPAIR, 'repair'), NOW);
    saveSession(ACCOUNT, STUDY, createSession(STUDY, 'study'), NOW);

    const repair = loadSession(ACCOUNT, REPAIR, NOW, 'repair');
    const study = loadSession(ACCOUNT, STUDY, NOW, 'study');
    expect(repair?.mode).toBe('repair');
    expect(repair?.act).toBe('confront');
    expect(study?.mode).toBe('study');
    expect(study?.act).toBe('probe');
  });

  it('keeps them in separate keys', () => {
    saveSession(ACCOUNT, REPAIR, createSession(REPAIR, 'repair'), NOW);
    saveSession(ACCOUNT, STUDY, createSession(STUDY, 'study'), NOW);
    const keys = Object.keys(store).filter(k => k.includes('.session'));
    expect(new Set(keys).size).toBe(2);
  });

  it('clearing a chapter leaves the repair alone', () => {
    saveSession(ACCOUNT, REPAIR, createSession(REPAIR, 'repair'), NOW);
    saveSession(ACCOUNT, STUDY, createSession(STUDY, 'study'), NOW);
    clearSession(ACCOUNT, 'study');
    expect(loadSession(ACCOUNT, STUDY, NOW, 'study')).toBeNull();
    expect(loadSession(ACCOUNT, REPAIR, NOW, 'repair')?.act).toBe('confront');
  });

  it('still refuses a stored mode it does not recognise', () => {
    // The normaliser exists because a stored string is just a string, and
    // widening it to admit 'study' must not widen it to admit anything. Written
    // into the slot directly, because saveSession derives the key FROM the mode
    // and a corrupt mode would therefore never reach the study slot at all.
    saveSession(ACCOUNT, STUDY, createSession(STUDY, 'study'), NOW);
    const studyKey = Object.keys(store).find(k => k.endsWith('.study:' + ACCOUNT))!;
    expect(studyKey).toBeDefined();
    const saved = JSON.parse(store[studyKey]);
    store[studyKey] = JSON.stringify({ ...saved, state: { ...saved.state, mode: 'wat' } });

    expect(loadSession(ACCOUNT, STUDY, NOW, 'study')?.mode).toBe('repair');
  });
});
