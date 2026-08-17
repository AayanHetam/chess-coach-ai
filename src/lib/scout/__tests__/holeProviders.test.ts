import { describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import {
  cpForSideToMove,
  createCloudProvider,
  uciToSan,
} from '@/lib/scout/holeProviders';
import type { PositionEval as LineSource } from '@/types/eval';

const START = new Chess().fen();
const AFTER_E4 = (() => {
  const b = new Chess();
  b.move('e4');
  return b.fen();
})();

const cloud = (lines: Array<{ cp?: number; mate?: number; depth: number; pv: string[] }>): LineSource => ({
  bestMove: lines[0]?.pv[0] ?? '',
  lines: lines.map((l, i) => ({ ...l, multiPv: i + 1 })),
  source: 'cloud',
});

describe('cpForSideToMove', () => {
  it('leaves a White-to-move score alone', () => {
    expect(cpForSideToMove(START, { cp: 30 })).toBe(30);
  });

  it('negates for Black to move', () => {
    // +30 White-relative means Black, to move, is 30 down.
    expect(cpForSideToMove(AFTER_E4, { cp: 30 })).toBe(-30);
  });

  it('is not symmetric — the whole point is that the sign depends on the turn', () => {
    // Guards the inversion that would otherwise pass every other test here.
    expect(cpForSideToMove(START, { cp: 45 })).not.toBe(cpForSideToMove(AFTER_E4, { cp: 45 }));
  });

  it('folds mate into a decisive centipawn score, shorter mates first', () => {
    const m1 = cpForSideToMove(START, { mate: 1 })!;
    const m5 = cpForSideToMove(START, { mate: 5 })!;
    expect(m1).toBeGreaterThan(m5);
    expect(m5).toBeGreaterThan(cpForSideToMove(START, { cp: 2000 })!);
  });

  it('flips a mate for the side not to move', () => {
    // White mates in 2; Black is to move, so from Black's view this is lost.
    expect(cpForSideToMove(AFTER_E4, { mate: 2 })!).toBeLessThan(-1000);
  });

  it('returns null when there is no score at all', () => {
    expect(cpForSideToMove(START, undefined)).toBeNull();
    expect(cpForSideToMove(START, {})).toBeNull();
  });
});

describe('uciToSan', () => {
  it('converts a legal move', () => {
    expect(uciToSan(START, 'e2e4')).toBe('e4');
    expect(uciToSan(START, 'g1f3')).toBe('Nf3');
  });

  it('handles promotion', () => {
    // The promoted queen gives check from a8, so the SAN carries the '+'.
    const fen = '8/P7/8/8/8/8/8/K6k w - - 0 1';
    expect(uciToSan(fen, 'a7a8q')).toBe('a8=Q+');
  });

  it('returns empty rather than throwing on an illegal or absent move', () => {
    expect(uciToSan(START, 'e2e5')).toBe('');
    expect(uciToSan(START, undefined)).toBe('');
    expect(uciToSan(START, 'xx')).toBe('');
  });
});

describe('createCloudProvider', () => {
  it('uses a deep cloud answer and reports it from the mover’s side', async () => {
    const fetchEval = vi.fn().mockResolvedValue(cloud([{ cp: 30, depth: 50, pv: ['e7e5'] }]));
    const provider = createCloudProvider({ fetchEval });

    const result = await provider.evaluate(AFTER_E4);
    expect(result).toEqual({ cp: -30, bestMove: 'e5' });
    expect(provider.stats().hits).toBe(1);
  });

  it('treats a shallow cloud answer as a miss', async () => {
    const fetchEval = vi.fn().mockResolvedValue(cloud([{ cp: 30, depth: 8, pv: ['e7e5'] }]));
    const provider = createCloudProvider({ fetchEval, minDepth: 20 });

    expect(await provider.evaluate(AFTER_E4)).toBeNull();
    expect(provider.stats().misses).toBe(1);
  });

  it('treats an empty cloud response as a miss', async () => {
    const fetchEval = vi.fn().mockResolvedValue(cloud([]));
    const provider = createCloudProvider({ fetchEval });
    expect(await provider.evaluate(AFTER_E4)).toBeNull();
  });

  it('falls back when the cloud misses', async () => {
    const fetchEval = vi.fn().mockResolvedValue(cloud([]));
    const fallback = vi.fn().mockResolvedValue({ cp: -12, bestMove: 'e5' });
    const provider = createCloudProvider({ fetchEval, fallback });

    expect(await provider.evaluate(AFTER_E4)).toEqual({ cp: -12, bestMove: 'e5' });
    expect(provider.stats()).toMatchObject({ misses: 1, fallbacks: 1 });
  });

  it('fails closed when the cloud throws and there is no fallback', async () => {
    const fetchEval = vi.fn().mockRejectedValue(new Error('offline'));
    const provider = createCloudProvider({ fetchEval });
    expect(await provider.evaluate(AFTER_E4)).toBeNull();
  });

  it('memoises across transpositions, ignoring move counters', async () => {
    const fetchEval = vi.fn().mockResolvedValue(cloud([{ cp: 20, depth: 40, pv: ['e7e5'] }]));
    const provider = createCloudProvider({ fetchEval });

    // Same position, different halfmove/fullmove counters.
    const a = AFTER_E4;
    const b = AFTER_E4.replace(/ \d+ \d+$/, ' 7 21');
    await provider.evaluate(a);
    await provider.evaluate(b);

    expect(fetchEval).toHaveBeenCalledTimes(1);
  });

  it('caches a miss so a dead cloud is not asked twice for the same position', async () => {
    const fetchEval = vi.fn().mockResolvedValue(cloud([]));
    const provider = createCloudProvider({ fetchEval });

    await provider.evaluate(AFTER_E4);
    await provider.evaluate(AFTER_E4);
    expect(fetchEval).toHaveBeenCalledTimes(1);
  });
});
