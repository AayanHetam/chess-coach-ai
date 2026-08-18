import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  isPawnBreak,
  masterIdeas,
  motifsOf,
  principalLine,
  scoreForSideToMove,
  MASTER_IDEAS_DEFAULTS,
  type MasterLookup,
  type MasterMoveStat,
} from '@/lib/master/ideas';

const key = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
const fenAfter = (moves: string[]) => {
  const b = new Chess();
  for (const m of moves) b.move(m);
  return b.fen();
};

/** A corpus fixture keyed the way the real one is. */
function corpus(entries: Record<string, Array<[string, number, number, number]>>): MasterLookup {
  return (fen: string) => {
    const rows = entries[key(fen)];
    if (!rows) return null;
    const moves: MasterMoveStat[] = rows.map(([san, count, white, draws]) => ({
      san,
      count,
      white,
      draws,
      black: count - white - draws,
    }));
    return { moves };
  };
}

describe('scoreForSideToMove', () => {
  const white = fenAfter([]);
  const black = fenAfter(['e4']);

  it('reports White’s score when White is to move', () => {
    expect(scoreForSideToMove(white, { count: 100, white: 50, draws: 20 })).toBeCloseTo(0.6, 6);
  });

  it('flips it when Black is to move', () => {
    // The same 60% for White is 40% for the player about to move.
    expect(scoreForSideToMove(black, { count: 100, white: 50, draws: 20 })).toBeCloseTo(0.4, 6);
  });

  it('is even with no games', () => {
    expect(scoreForSideToMove(white, { count: 0, white: 0, draws: 0 })).toBe(0.5);
  });
});

describe('isPawnBreak', () => {
  it('counts an advance that makes contact with an enemy pawn', () => {
    // 1.d4 d5 2.c4 — the Queen's Gambit break: c4 and d5 attack each other.
    const board = new Chess(fenAfter(['d4', 'd5']));
    expect(isPawnBreak(board, 'c4')).toBe(true);
  });

  it('does not count a space-gaining advance that only hits a piece', () => {
    // 1.e4 c5 2.c3 Nf6 3.e5 attacks a KNIGHT. It is a good move and a familiar
    // one, and it is not a pawn break — no enemy pawn can meet it.
    const board = new Chess(fenAfter(['e4', 'c5', 'c3', 'Nf6']));
    expect(isPawnBreak(board, 'e5')).toBe(false);
  });

  it('does not count a quiet advance', () => {
    const board = new Chess(fenAfter(['e4', 'e5']));
    expect(isPawnBreak(board, 'a3')).toBe(false);
  });

  it('does not count a capture', () => {
    // A recapture is an exchange. Counting captures made every one read as a
    // break and buried the real ones.
    const board = new Chess(fenAfter(['e4', 'd5']));
    expect(isPawnBreak(board, 'exd5')).toBe(false);
  });

  it('does not count a piece move', () => {
    const board = new Chess();
    expect(isPawnBreak(board, 'Nf3')).toBe(false);
  });

  it('is false for a move that is not legal here', () => {
    expect(isPawnBreak(new Chess(), 'Qh5')).toBe(false);
  });
});

describe('principalLine', () => {
  const ALAPIN = fenAfter(['e4', 'c5', 'c3']);

  it('follows the most popular move at each step', () => {
    const lookup = corpus({
      [key(ALAPIN)]: [['Nf6', 100, 47, 13], ['d5', 80, 46, 12]],
      [key(fenAfter(['e4', 'c5', 'c3', 'Nf6']))]: [['e5', 90, 48, 13]],
      [key(fenAfter(['e4', 'c5', 'c3', 'Nf6', 'e5']))]: [['Nd5', 85, 48, 13]],
    });
    const line = principalLine(ALAPIN, lookup);
    expect(line.moves).toEqual(['Nf6', 'e5', 'Nd5']);
  });

  it('reports the games reaching the end, not the multiplied share', () => {
    // Eight plies of ordinary theory multiply out to a couple of percent, which
    // reads as a failing grade for a line a thousand masters played.
    const lookup = corpus({
      [key(ALAPIN)]: [['Nf6', 100, 47, 13], ['d5', 100, 46, 12]],
      [key(fenAfter(['e4', 'c5', 'c3', 'Nf6']))]: [['e5', 60, 30, 8]],
    });
    const line = principalLine(ALAPIN, lookup);
    expect(line.games).toBe(60);
    expect(line.share).toBeCloseTo(0.5 * 1, 6);
  });

  it('stops where the corpus thins out rather than following one game', () => {
    const lookup = corpus({
      [key(ALAPIN)]: [['Nf6', 100, 47, 13]],
      [key(fenAfter(['e4', 'c5', 'c3', 'Nf6']))]: [['e5', 3, 1, 1]],
    });
    expect(principalLine(ALAPIN, lookup).moves).toEqual(['Nf6']);
  });

  it('stops at a position the corpus has never seen', () => {
    expect(principalLine(ALAPIN, corpus({})).moves).toEqual([]);
  });
});

describe('motifsOf', () => {
  it('names castling and which side did it', () => {
    const motifs = motifsOf(fenAfter(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']), ['O-O'], 'white');
    expect(motifs).toContainEqual({ kind: 'castle', side: 'kingside', by: 'you', san: 'O-O' });
  });

  it('spots a delayed recapture as a trade', () => {
    // The recapture on d4 arrives two moves after the capture. A one-ply
    // lookback finds none of these.
    const motifs = motifsOf(
      fenAfter(['e4', 'c5', 'c3', 'Nf6', 'e5', 'Nd5', 'd4']),
      ['cxd4', 'Nf3', 'Nc6', 'cxd4'],
      'white'
    );
    expect(motifs).toContainEqual({ kind: 'trade', square: 'd4', by: 'you' });
  });

  it('joins a two-step manoeuvre into one journey', () => {
    // Nb1-c3-e2 is one idea, not two disconnected moves.
    const motifs = motifsOf(fenAfter(['e4', 'e5']), ['Nc3', 'Nc6', 'Nce2'], 'white');
    const route = motifs.find(m => m.kind === 'route' && m.by === 'you');
    expect(route).toEqual({ kind: 'route', piece: 'knight', from: 'b1', to: 'e2', by: 'you' });
  });

  it('attributes moves to the right side', () => {
    const motifs = motifsOf(fenAfter(['e4', 'e5']), ['Nf3', 'Nc6'], 'black');
    const mine = motifs.find(m => m.kind === 'route' && m.by === 'you');
    expect(mine).toMatchObject({ from: 'b8', to: 'c6' });
  });

  it('stops cleanly on a move that is not legal', () => {
    expect(() => motifsOf(fenAfter([]), ['Qh5', 'e4'], 'white')).not.toThrow();
  });
});

describe('masterIdeas', () => {
  const ALAPIN = fenAfter(['e4', 'c5', 'c3']);
  const lookup = corpus({
    [key(ALAPIN)]: [
      ['Nf6', 100, 47, 13],
      ['d5', 80, 46, 12],
      ['e6', 30, 14, 3],
      ['a6', 2, 1, 0],
    ],
    [key(fenAfter(['e4', 'c5', 'c3', 'Nf6']))]: [['e5', 90, 48, 13]],
  });

  it('summarises what masters play, most popular first', () => {
    const view = masterIdeas(ALAPIN, lookup, 'white')!;
    expect(view.games).toBe(212);
    expect(view.choices.map(c => c.san)).toEqual(['Nf6', 'd5', 'e6']);
    expect(view.choices[0].share).toBeCloseTo(100 / 212, 6);
  });

  it('drops moves too rare to be worth listing', () => {
    const view = masterIdeas(ALAPIN, lookup, 'white')!;
    expect(view.choices.map(c => c.san)).not.toContain('a6');
  });

  it('scores each choice for the side that plays it', () => {
    // Black is to move here, so a 47%-for-White move scores 40% for them.
    const view = masterIdeas(ALAPIN, lookup, 'white')!;
    const nf6 = view.choices.find(c => c.san === 'Nf6')!;
    expect(nf6.score).toBeCloseTo(1 - (47 + 6.5) / 100, 6);
  });

  it('places your intended move in master practice', () => {
    const view = masterIdeas(ALAPIN, lookup, 'white', 'd5')!;
    expect(view.yourMove).toMatchObject({ san: 'd5', rank: 2, games: 80 });
  });

  it('says plainly when no master has played your move', () => {
    const view = masterIdeas(ALAPIN, lookup, 'white', 'h6')!;
    expect(view.yourMove).toEqual({ san: 'h6', share: 0, games: 0, rank: null });
  });

  it('returns nothing for a position the corpus barely has', () => {
    const thin = corpus({ [key(ALAPIN)]: [['Nf6', 3, 1, 1]] });
    expect(masterIdeas(ALAPIN, thin, 'white')).toBeNull();
  });

  it('returns nothing for a position the corpus has never seen', () => {
    expect(masterIdeas(ALAPIN, corpus({}), 'white')).toBeNull();
  });

  it('carries the line and the plans in it', () => {
    const view = masterIdeas(ALAPIN, lookup, 'white', undefined, {
      ...MASTER_IDEAS_DEFAULTS,
      depth: 4,
    })!;
    expect(view.principal).toEqual(['Nf6', 'e5']);
    expect(view.principalGames).toBe(90);
    // Their knight's journey, attributed to them rather than to you.
    expect(view.motifs).toContainEqual({
      kind: 'route',
      piece: 'knight',
      from: 'g8',
      to: 'f6',
      by: 'them',
    });
  });
});
