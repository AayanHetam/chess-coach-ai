import { describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import {
  buildHoleReport,
  NoGamesError,
  pool,
  type HoleProgress,
} from '@/lib/scout/buildHoleReport';
import { HOLE_DEFAULTS, type HoleFinderProviders } from '@/lib/scout/holeFinder';
import type { ScoutGame } from '@/types/scout';

let nextId = 0;
function batch(
  moves: string[],
  n: number,
  theyScore: number,
  theirColor: 'white' | 'black'
): ScoutGame[] {
  const out: ScoutGame[] = [];
  const wins = Math.round(n * theyScore);
  const theirWin = theirColor === 'white' ? '1-0' : '0-1';
  const theirLoss = theirColor === 'white' ? '0-1' : '1-0';
  for (let i = 0; i < n; i++) {
    out.push({
      id: `g${nextId++}`,
      platform: 'chess.com',
      moves,
      whiteUsername: theirColor === 'white' ? 'them' : 'other',
      blackUsername: theirColor === 'black' ? 'them' : 'other',
      whiteRating: 1500,
      blackRating: 1500,
      result: (i < wins ? theirWin : theirLoss) as ScoutGame['result'],
      timeClass: 'blitz',
      date: Date.UTC(2026, 0, 1),
    });
  }
  return out;
}

const AS_BLACK = ['e4', 'c6', 'd4', 'd5', 'c4', 'Nf6'];
const AS_WHITE = ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6'];

/** Neutral engine: nothing here may pass on the strength of an engine edge. */
function neutral(): HoleFinderProviders {
  return {
    async evaluate(fen: string) {
      const board = new Chess(fen);
      return { bestMove: board.moves()[0] ?? '', cp: 0 };
    },
  };
}

/**
 * The finder reports the SHALLOWEST line that identifies the weak group, which
 * is the more general statement and the one `screenPositions` keeps when the
 * continuations behind it are forced. So assert the line pins down the planted
 * branch, not that it recites every ply of it.
 */
function identifies(line: string[], planted: string[], sound: string[]) {
  expect(line.length).toBeGreaterThanOrEqual(2);
  expect(planted.slice(0, line.length)).toEqual(line);
  expect(sound.slice(0, line.length)).not.toEqual(line);
}

describe('pool', () => {
  it('runs every item', async () => {
    const seen: number[] = [];
    await pool([1, 2, 3, 4, 5], 2, async n => {
      seen.push(n);
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    await pool(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise(r => setTimeout(r, 1));
      inFlight -= 1;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it('handles an empty list', async () => {
    const work = vi.fn();
    await pool([], 4, work);
    expect(work).not.toHaveBeenCalled();
  });
});

describe('buildHoleReport', () => {
  it('scouts the colour you are NOT playing', async () => {
    // They are weak with Black. Asking to play White must find it; asking to
    // play Black must not, because that scouts their White games instead.
    const games = [
      ...batch(['e4', 'e5', 'Nf3', 'Nc6'], 400, 0.5, 'black'),
      ...batch(AS_BLACK, 120, 0.1, 'black'),
    ];

    const asWhite = await buildHoleReport(games, 'them', 'white', {
      makeProvider: neutral,
      concurrency: 4,
    });
    expect(asWhite!.confirmedWeakness).toBe(true);
    identifies(asWhite!.holes[0].line.map(m => m.san), AS_BLACK, ['e4', 'e5', 'Nf3', 'Nc6']);

    await expect(
      buildHoleReport(games, 'them', 'black', { makeProvider: neutral })
    ).rejects.toBeInstanceOf(NoGamesError);
  });

  it('finds a weakness in their White games when you play Black', async () => {
    const games = [
      ...batch(['d4', 'd5', 'c4', 'e6'], 400, 0.5, 'white'),
      ...batch(AS_WHITE, 120, 0.1, 'white'),
    ];
    const report = await buildHoleReport(games, 'them', 'black', { makeProvider: neutral });
    expect(report!.confirmedWeakness).toBe(true);
    identifies(report!.holes[0].line.map(m => m.san), AS_WHITE, ['d4', 'd5', 'c4', 'e6']);
  });

  it('warms the engine before searching, so the search reads cache', async () => {
    const games = [
      ...batch(['e4', 'e5', 'Nf3', 'Nc6'], 400, 0.5, 'black'),
      ...batch(AS_BLACK, 120, 0.1, 'black'),
    ];

    // Count how many evaluations happen after the warming pass ends.
    let warming = true;
    let afterWarm = 0;
    const provider: HoleFinderProviders = {
      async evaluate(fen) {
        if (!warming) afterWarm += 1;
        return neutral().evaluate(fen);
      },
    };

    const phases: HoleProgress['phase'][] = [];
    await buildHoleReport(games, 'them', 'white', {
      makeProvider: () => provider,
      onProgress: p => {
        if (p.phase === 'ranking') warming = false;
        if (phases[phases.length - 1] !== p.phase) phases.push(p.phase);
      },
    });

    expect(phases).toEqual(['reading', 'evaluating', 'ranking', 'done']);
    // Some cold positions remain by design (the engine's preferred sibling is
    // unknowable in advance), but the bulk must already be warm.
    expect(afterWarm).toBeLessThan(HOLE_DEFAULTS.engineBudget / 2);
  });

  it('reports progress that ends at 1', async () => {
    const games = [
      ...batch(['e4', 'e5', 'Nf3', 'Nc6'], 400, 0.5, 'black'),
      ...batch(AS_BLACK, 120, 0.1, 'black'),
    ];
    const seen: number[] = [];
    await buildHoleReport(games, 'them', 'white', {
      makeProvider: neutral,
      onProgress: p => seen.push(p.fraction),
    });

    expect(seen[0]).toBeLessThan(0.1);
    expect(seen[seen.length - 1]).toBe(1);
    // Monotone — a bar that goes backwards is worse than no bar.
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  });

  it('stops quietly when the run is superseded', async () => {
    const games = [
      ...batch(['e4', 'e5', 'Nf3', 'Nc6'], 400, 0.5, 'black'),
      ...batch(AS_BLACK, 120, 0.1, 'black'),
    ];
    const result = await buildHoleReport(games, 'them', 'white', {
      makeProvider: neutral,
      isStale: () => true,
    });
    expect(result).toBeNull();
  });

  it('survives a provider that has no answers at all', async () => {
    // A dead cloud with no fallback. Every candidate is dropped, and the run
    // must produce an honest empty report rather than throwing.
    const games = [
      ...batch(['e4', 'e5', 'Nf3', 'Nc6'], 400, 0.5, 'black'),
      ...batch(AS_BLACK, 120, 0.1, 'black'),
    ];
    const report = await buildHoleReport(games, 'them', 'white', {
      makeProvider: () => ({ evaluate: async () => null }),
    });

    expect(report).not.toBeNull();
    expect(report!.noHoleFound).toBe(true);
    expect(report!.unavailable).toBeGreaterThan(0);
  });
});
