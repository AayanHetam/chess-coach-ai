import { describe, expect, it } from 'vitest';
import { positionsToAsk } from '@/lib/master/useMasterIdeas';
import type { Hole } from '@/lib/scout/holeFinder';
import type { PreparedLine, PreparedMove } from '@/lib/scout/preparedLine';

const move = (san: string, side: 'you' | 'them', fen: string): PreparedMove => ({
  san,
  side,
  fen,
  from: 20,
});

const line = (moves: PreparedMove[]): PreparedLine => ({
  moves,
  probability: 0.5,
  end: 'thin',
});

const hole = (fen: string, prepared: PreparedLine[]): Hole =>
  ({
    line: [{ san: 'c3', side: 'you', games: 10 }],
    fen,
    kind: 'results',
    tier: 'confirmed',
    games: 40,
    neff: 40,
    score: 0.3,
    shrunkScore: 0.35,
    baseline: 0.5,
    scoreUpper: 0.4,
    concessionCp: 0,
    reach: 0.5,
    confirmedEdge: 0.1,
    edge: 0.15,
    benefit: 0.07,
    prepared,
  }) as Hole;

describe('positionsToAsk', () => {
  it('asks about the position where you first have a choice', () => {
    const asked = positionsToAsk([
      hole('HOLE', [line([move('Nf6', 'them', 'HOLE'), move('e5', 'you', 'AFTER_NF6')])]),
    ]);
    expect(asked).toContainEqual({ fen: 'AFTER_NF6', yourMove: 'e5' });
  });

  it('asks once per position even when lines transpose', () => {
    const asked = positionsToAsk([
      hole('HOLE', [
        line([move('Nf6', 'them', 'HOLE'), move('e5', 'you', 'SAME')]),
        line([move('Nc6', 'them', 'HOLE'), move('d4', 'you', 'SAME')]),
      ]),
    ]);
    expect(asked.filter(a => a.fen === 'SAME')).toHaveLength(1);
  });

  it('still asks about a hole with no continuation at all', () => {
    const asked = positionsToAsk([hole('LONELY', [])]);
    expect(asked).toContainEqual({ fen: 'LONELY' });
  });

  it('does not ask about their replies — there is no move of ours to judge', () => {
    const asked = positionsToAsk([
      hole('HOLE', [line([move('Nf6', 'them', 'HOLE'), move('e5', 'you', 'AFTER_NF6')])]),
    ]);
    expect(asked.some(a => a.yourMove === 'Nf6')).toBe(false);
  });

  it('handles an empty report', () => {
    expect(positionsToAsk([])).toEqual([]);
  });
});
