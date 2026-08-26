// What the trap loader refuses.
//
// Separate from traps.test.ts because that file reads the real shipped data and
// this one mocks `fs` for the whole module. Both are needed: the shipped files
// are all correct, so nothing in them can ever exercise a refusal, and a guard
// no test reaches is a guard that can be deleted without anything going red.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const readFileSync = vi.fn();
vi.mock('fs', () => ({ default: { readFileSync: (...a: unknown[]) => readFileSync(...a) } }));

import { loadTraps, resetTrapCache, TRAP_BANDS } from '../traps';

const file = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    meta: {
      band: 'improving',
      bandScale: 'common (chess.com), converted from lichess',
      source: 'test',
      games: 1,
      generatedFrom: 'test',
      signal: 'game results only; no engine was consulted',
      z: 4,
      minEffect: 0.1,
      minMoveGames: 30,
      minShare: 0.03,
      tests: 10,
      expectedFalsePositives: 0.01,
      traps: 0,
      ...over,
    },
    traps: [],
  });

beforeEach(() => {
  resetTrapCache();
  readFileSync.mockReset();
});

it('accepts a file that is the band asked for, on the scale we band on', () => {
  // The control. Without it a loader that returned null unconditionally would
  // pass every refusal test below.
  readFileSync.mockReturnValue(file());
  expect(loadTraps('improving')).not.toBeNull();
});

it('refuses a file whose band is not the band asked for', () => {
  // A mis-copied or mis-shipped file. Every number in it would look completely
  // reasonable while describing a different set of opponents, and the heading
  // above it still says "at your level".
  readFileSync.mockReturnValue(file({ band: 'strong' }));
  expect(loadTraps('improving')).toBeNull();
});

it('refuses a file that will not say which rating scale it was cut on', () => {
  // BANDS floors are chess.com numbers; the dumps carry raw Lichess Elo. A
  // Lichess 1200 is a beginner on the common scale and would be filed under
  // improving, silently.
  for (const scale of [null, '', 'raw lichess']) {
    resetTrapCache();
    readFileSync.mockReturnValue(file({ bandScale: scale }));
    expect(loadTraps('improving'), String(scale)).toBeNull();
  }
});

it('degrades to null rather than throwing on an unreadable file', () => {
  readFileSync.mockImplementation(() => {
    throw new Error('ENOENT');
  });
  expect(() => loadTraps('improving')).not.toThrow();
  expect(loadTraps('improving')).toBeNull();
});

it('does not re-read a file it has already failed on', () => {
  readFileSync.mockImplementation(() => {
    throw new Error('ENOENT');
  });
  loadTraps('improving');
  loadTraps('improving');
  expect(readFileSync).toHaveBeenCalledTimes(1);
});

it('reads a file for every band it lists', () => {
  readFileSync.mockImplementation((p: string) => file({ band: /traps\.(.+)\.json$/.exec(p)?.[1] }));
  for (const band of TRAP_BANDS) expect(loadTraps(band), band).not.toBeNull();
});
