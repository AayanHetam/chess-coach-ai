import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  buildPreparedLine,
  buildPreparedLines,
  replyDistribution,
  PREPARED_DEFAULTS,
} from '@/lib/scout/preparedLine';
import { buildPositionIndex, positionKey } from '@/lib/scout/positionStats';
import type { HoleFinderProviders } from '@/lib/scout/holeFinder';
import type { ScoutGame } from '@/types/scout';

let nextId = 0;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 0, 1);

function batch(moves: string[], n: number, ageDays = 0): ScoutGame[] {
  return Array.from({ length: n }, () => ({
    id: `g${nextId++}`,
    platform: 'chess.com' as const,
    moves,
    whiteUsername: 'other',
    blackUsername: 'them',
    whiteRating: 1500,
    blackRating: 1500,
    result: '1-0' as ScoutGame['result'],
    timeClass: 'blitz' as ScoutGame['timeClass'],
    date: NOW - ageDays * DAY,
  }));
}

const fenAfter = (moves: string[]) => {
  const b = new Chess();
  for (const m of moves) b.move(m);
  return b.fen();
};

/** An engine that always plays a named move in a named position, else the first legal one. */
function scripted(script: Record<string, string>): HoleFinderProviders {
  return {
    async evaluate(fen: string) {
      const key = positionKey(fen);
      const board = new Chess(fen);
      return { bestMove: script[key] ?? board.moves()[0] ?? '', cp: 0 };
    },
  };
}

describe('replyDistribution', () => {
  it('is empty for a position nobody reached', () => {
    const index = buildPositionIndex(batch(['e4', 'c5'], 10), 'them', 'black');
    expect(replyDistribution(index.positions.get('nonsense'))).toEqual([]);
  });

  it('ranks their replies by recency-weighted share', () => {
    const index = buildPositionIndex(
      [...batch(['e4', 'c5', 'c3', 'Nf6'], 30), ...batch(['e4', 'c5', 'c3', 'd6'], 10)],
      'them',
      'black'
    );
    const dist = replyDistribution(index.positions.get(positionKey(fenAfter(['e4', 'c5', 'c3']))));

    expect(dist.map(d => d.san)).toEqual(['Nf6', 'd6']);
    expect(dist[0].probability).toBeCloseTo(0.75, 6);
  });

  it('weights a recent switch above an abandoned habit', () => {
    // They played d6 for years and switched to Nf6 this season. Raw counts say
    // d6; recency says Nf6, and recency is what they will actually play.
    const index = buildPositionIndex(
      [
        ...batch(['e4', 'c5', 'c3', 'd6'], 60, 1095),
        ...batch(['e4', 'c5', 'c3', 'Nf6'], 30, 0),
      ],
      'them',
      'black'
    );
    const dist = replyDistribution(index.positions.get(positionKey(fenAfter(['e4', 'c5', 'c3']))));
    expect(dist[0].san).toBe('Nf6');
  });

  it('pools a reply across the move orders that reach the position', () => {
    const index = buildPositionIndex(
      [...batch(['e4', 'c5', 'Nf3', 'd6'], 20), ...batch(['Nf3', 'c5', 'e4', 'd6'], 20)],
      'them',
      'black'
    );
    const dist = replyDistribution(index.positions.get(positionKey(fenAfter(['e4', 'c5', 'Nf3']))));
    expect(dist[0].san).toBe('d6');
    expect(dist[0].games).toBe(40);
  });
});

describe('buildPreparedLine', () => {
  const ALAPIN = ['e4', 'c5', 'c3'];

  it('follows their forced replies and your engine moves', async () => {
    const games = batch(['e4', 'c5', 'c3', 'Nf6', 'e5', 'Nd5', 'd4', 'cxd4'], 25);
    const index = buildPositionIndex(games, 'them', 'black');
    const engine = scripted({
      [positionKey(fenAfter(['e4', 'c5', 'c3', 'Nf6']))]: 'e5',
      [positionKey(fenAfter(['e4', 'c5', 'c3', 'Nf6', 'e5', 'Nd5']))]: 'd4',
    });

    const line = await buildPreparedLine(fenAfter(ALAPIN), 'white', index, engine);
    expect(line.moves.map(m => m.san).slice(0, 5)).toEqual(['Nf6', 'e5', 'Nd5', 'd4', 'cxd4']);
    expect(line.moves[0].side).toBe('them');
    expect(line.moves[1].side).toBe('you');
    expect(line.moves[2].probability).toBeCloseTo(1, 6);
  });

  it('stops where they leave known ground, and says which move did it', async () => {
    // They have met e5 twenty-five times and g3 never.
    const games = batch(['e4', 'c5', 'c3', 'Nf6', 'e5', 'Nd5'], 25);
    const index = buildPositionIndex(games, 'them', 'black');
    const engine = scripted({
      [positionKey(fenAfter(['e4', 'c5', 'c3', 'Nf6']))]: 'g3',
    });

    const line = await buildPreparedLine(fenAfter(ALAPIN), 'white', index, engine);
    expect(line.end).toBe('novelty');
    expect(line.noveltyIndex).toBe(1);
    expect(line.moves[line.noveltyIndex!].san).toBe('g3');
    expect(line.moves[line.noveltyIndex!].timesFaced).toBe(0);
    // Nothing may follow it: their history cannot answer a move they never saw.
    expect(line.moves).toHaveLength(2);
  });

  it('treats a move they have barely met as unfamiliar, not as known', async () => {
    // 2 of 25 is not "they know this" — it is a move they will not have seen in
    // nine games out of ten. Requiring a literal zero walks past the moment.
    const games = [
      ...batch(['e4', 'c5', 'c3', 'Nf6', 'e5', 'Nd5'], 23),
      ...batch(['e4', 'c5', 'c3', 'Nf6', 'g3', 'd5'], 2),
    ];
    const index = buildPositionIndex(games, 'them', 'black');
    const engine = scripted({ [positionKey(fenAfter(['e4', 'c5', 'c3', 'Nf6']))]: 'g3' });

    const line = await buildPreparedLine(fenAfter(ALAPIN), 'white', index, engine);
    expect(line.end).toBe('novelty');
    expect(line.moves[line.noveltyIndex!].timesFaced).toBe(2);
  });

  it('does not call a well-known move a novelty', async () => {
    // The control for the two tests above.
    const games = batch(['e4', 'c5', 'c3', 'Nf6', 'e5', 'Nd5', 'd4', 'cxd4'], 25);
    const index = buildPositionIndex(games, 'them', 'black');
    const engine = scripted({
      [positionKey(fenAfter(['e4', 'c5', 'c3', 'Nf6']))]: 'e5',
      [positionKey(fenAfter(['e4', 'c5', 'c3', 'Nf6', 'e5', 'Nd5']))]: 'd4',
    });

    const line = await buildPreparedLine(fenAfter(ALAPIN), 'white', index, engine);
    expect(line.noveltyIndex).toBeUndefined();
    expect(line.end).not.toBe('novelty');
  });

  it('refuses to guess when they are genuinely split', async () => {
    const games = [
      ...batch(['e4', 'c5', 'c3', 'Nf6'], 30),
      ...batch(['e4', 'c5', 'c3', 'Nc6'], 28),
      ...batch(['e4', 'c5', 'c3', 'd6'], 26),
    ];
    const index = buildPositionIndex(games, 'them', 'black');

    const line = await buildPreparedLine(fenAfter(ALAPIN), 'white', index, scripted({}));
    expect(line.end).toBe('unpredictable');
    expect(line.moves).toHaveLength(0);
  });

  it('stops when their games run out rather than inventing a reply', async () => {
    const games = batch(['e4', 'c5', 'c3', 'Nf6'], 3);
    const index = buildPositionIndex(games, 'them', 'black');
    const line = await buildPreparedLine(fenAfter(ALAPIN), 'white', index, scripted({}));
    expect(line.end).toBe('thin');
  });

  it('stops when the engine has no answer', async () => {
    const games = batch(['e4', 'c5', 'c3', 'Nf6', 'e5', 'Nd5'], 25);
    const index = buildPositionIndex(games, 'them', 'black');
    const dead: HoleFinderProviders = { evaluate: async () => null };

    const line = await buildPreparedLine(fenAfter(ALAPIN), 'white', index, dead);
    expect(line.end).toBe('noengine');
    expect(line.moves.map(m => m.san)).toEqual(['Nf6']);
  });

  it('reports what their opponents usually play, and by how much it is worse', async () => {
    const games = batch(['e4', 'c5', 'c3', 'Nf6', 'd3', 'd5'], 25);
    const index = buildPositionIndex(games, 'them', 'black');
    const after = positionKey(fenAfter(['e4', 'c5', 'c3', 'Nf6']));

    // e5 is the engine's move; d3 is what they always face, and is 60cp worse.
    const engine: HoleFinderProviders = {
      async evaluate(fen: string) {
        const key = positionKey(fen);
        if (key === after) return { bestMove: 'e5', cp: 0 };
        if (key === positionKey(fenAfter(['e4', 'c5', 'c3', 'Nf6', 'e5']))) return { bestMove: 'Nd5', cp: -60 };
        if (key === positionKey(fenAfter(['e4', 'c5', 'c3', 'Nf6', 'd3']))) return { bestMove: 'd5', cp: 0 };
        return { bestMove: new Chess(fen).moves()[0] ?? '', cp: 0 };
      },
    };

    const line = await buildPreparedLine(fenAfter(ALAPIN), 'white', index, engine);
    const yours = line.moves.find(m => m.side === 'you')!;
    expect(yours.san).toBe('e5');
    expect(yours.commonReply).toBe('d3');
    expect(yours.gainOverCommon).toBe(60);
  });
});

describe('engine conversation', () => {
  it('never has two evaluations in flight at once', async () => {
    // A provider backed by one engine process is a single conversation: send two
    // `position`/`go` pairs before reading either reply and the answers cross.
    // It surfaced as a move that was illegal in the position it came back for,
    // which then read as "no engine answer" and silently truncated the line —
    // so this asserts the shape of the calls rather than the symptom.
    let inFlight = 0;
    let overlapped = false;

    const oneAtATime: HoleFinderProviders = {
      async evaluate(fen: string) {
        inFlight += 1;
        if (inFlight > 1) overlapped = true;
        await new Promise(r => setTimeout(r, 0));
        inFlight -= 1;
        return { bestMove: new Chess(fen).moves()[0] ?? '', cp: 0 };
      },
    };

    // Their opponents always play something other than the engine's choice, so
    // the centipawn comparison — the call site that had the bug — runs.
    const games = batch(['e4', 'c5', 'c3', 'Nf6', 'd3', 'd5', 'Nf3', 'Nc6'], 25);
    const index = buildPositionIndex(games, 'them', 'black');

    await buildPreparedLines(fenAfter(['e4', 'c5', 'c3']), 'white', index, oneAtATime);
    expect(overlapped).toBe(false);
  });
});

describe('buildPreparedLines', () => {
  const ALAPIN = ['e4', 'c5', 'c3'];

  it('forks into one line per major reply when they are split', async () => {
    const games = [
      ...batch(['e4', 'c5', 'c3', 'Nf6', 'e5', 'Nd5'], 30),
      ...batch(['e4', 'c5', 'c3', 'Nc6', 'd4', 'cxd4'], 28),
      ...batch(['e4', 'c5', 'c3', 'd6', 'd4', 'cxd4'], 26),
    ];
    const index = buildPositionIndex(games, 'them', 'black');

    const lines = await buildPreparedLines(fenAfter(ALAPIN), 'white', index, scripted({}));
    expect(lines.length).toBeGreaterThan(1);
    // Most likely first, and each starts with a different reply of theirs.
    const firsts = lines.map(l => l.moves[0].san);
    expect(new Set(firsts).size).toBe(firsts.length);
    expect(firsts[0]).toBe('Nf6');
  });

  it('never lists the reply a line took among its own alternatives', async () => {
    const games = [
      ...batch(['e4', 'c5', 'c3', 'Nf6', 'e5', 'Nd5'], 30),
      ...batch(['e4', 'c5', 'c3', 'Nc6', 'd4', 'cxd4'], 28),
    ];
    const index = buildPositionIndex(games, 'them', 'black');

    const lines = await buildPreparedLines(fenAfter(ALAPIN), 'white', index, scripted({}));
    for (const line of lines) {
      const first = line.moves[0];
      expect(first.alternatives?.map(a => a.san) ?? []).not.toContain(first.san);
    }
  });

  it('returns a single line when one reply dominates', async () => {
    const games = [
      ...batch(['e4', 'c5', 'c3', 'Nf6', 'e5', 'Nd5'], 90),
      ...batch(['e4', 'c5', 'c3', 'd6', 'd4', 'cxd4'], 10),
    ];
    const index = buildPositionIndex(games, 'them', 'black');

    const lines = await buildPreparedLines(fenAfter(ALAPIN), 'white', index, scripted({}));
    expect(lines).toHaveLength(1);
    expect(lines[0].moves[0].san).toBe('Nf6');
  });

  it('forks again further down instead of stopping at the first split', async () => {
    // Split at ply 1 (Nf6 / Nc6), and the Nf6 branch splits AGAIN at ply 3.
    // Stopping at the first fork leaves that second split unexplored and the
    // line ending on "they split from here" with nothing to learn.
    const games = [
      ...batch(['e4', 'c5', 'c3', 'Nf6', 'e5', 'Nd5', 'd4', 'cxd4'], 30),
      ...batch(['e4', 'c5', 'c3', 'Nf6', 'e5', 'Ng8', 'd4', 'cxd4'], 26),
      ...batch(['e4', 'c5', 'c3', 'Nc6', 'd4', 'cxd4'], 40),
    ];
    const index = buildPositionIndex(games, 'them', 'black');
    const engine = scripted({
      [positionKey(fenAfter(['e4', 'c5', 'c3', 'Nf6']))]: 'e5',
      [positionKey(fenAfter(['e4', 'c5', 'c3', 'Nc6']))]: 'd4',
    });

    const lines = await buildPreparedLines(fenAfter(ALAPIN), 'white', index, engine);

    // Both sides of the SECOND fork have to be present, which is only possible
    // if forking recursed.
    const nf6Lines = lines.filter(l => l.moves[0].san === 'Nf6');
    const seconds = nf6Lines.filter(l => l.moves.length > 2).map(l => l.moves[2].san);
    expect(seconds).toContain('Nd5');
    expect(seconds).toContain('Ng8');
    // And none of them may still be sitting on an unexplored fork.
    expect(nf6Lines.every(l => l.end !== 'unpredictable')).toBe(true);
  });

  it('carries each line’s share of their games', async () => {
    const games = [
      ...batch(['e4', 'c5', 'c3', 'Nf6', 'e5', 'Nd5'], 30),
      ...batch(['e4', 'c5', 'c3', 'Nc6', 'd4', 'cxd4'], 26),
    ];
    const index = buildPositionIndex(games, 'them', 'black');
    const engine = scripted({
      [positionKey(fenAfter(['e4', 'c5', 'c3', 'Nf6']))]: 'e5',
      [positionKey(fenAfter(['e4', 'c5', 'c3', 'Nc6']))]: 'd4',
    });

    const lines = await buildPreparedLines(fenAfter(ALAPIN), 'white', index, engine);
    const nf6 = lines.find(l => l.moves[0].san === 'Nf6')!;
    const nc6 = lines.find(l => l.moves[0].san === 'Nc6')!;

    expect(nf6.probability).toBeCloseTo(30 / 56, 4);
    expect(nc6.probability).toBeCloseTo(26 / 56, 4);
    // Your own moves are choices and must not dilute their share.
    expect(nf6.moves.filter(m => m.side === 'you').length).toBeGreaterThan(0);
  });

  it('spends the budget on the likely branches first', async () => {
    // Five replies, budget for fewer. The rare ones are the ones to drop.
    const games = [
      ...batch(['e4', 'c5', 'c3', 'Nf6'], 40),
      ...batch(['e4', 'c5', 'c3', 'Nc6'], 30),
      ...batch(['e4', 'c5', 'c3', 'd6'], 20),
      ...batch(['e4', 'c5', 'c3', 'e6'], 8),
      ...batch(['e4', 'c5', 'c3', 'g6'], 7),
    ];
    const index = buildPositionIndex(games, 'them', 'black');

    const lines = await buildPreparedLines(fenAfter(ALAPIN), 'white', index, scripted({}), {
      ...PREPARED_DEFAULTS,
      maxLines: 2,
    });
    expect(lines.map(l => l.moves[0].san)).toEqual(['Nf6', 'Nc6']);
  });

  it('caps the number of branches', async () => {
    const games = [
      ...batch(['e4', 'c5', 'c3', 'Nf6'], 20),
      ...batch(['e4', 'c5', 'c3', 'Nc6'], 20),
      ...batch(['e4', 'c5', 'c3', 'd6'], 20),
      ...batch(['e4', 'c5', 'c3', 'e6'], 20),
      ...batch(['e4', 'c5', 'c3', 'g6'], 20),
    ];
    const index = buildPositionIndex(games, 'them', 'black');

    const lines = await buildPreparedLines(fenAfter(ALAPIN), 'white', index, scripted({}));
    expect(lines.length).toBeLessThanOrEqual(PREPARED_DEFAULTS.maxBranch);
  });
});
