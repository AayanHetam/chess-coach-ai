// A hint is words about a move we already hold. The two things that could be
// quietly wrong: a rung that says something untrue about the position, and a
// ladder that reaches for an engine.

import { describe, expect, it } from 'vitest';
import { hintAt, hintLadder } from '@/lib/learn/hint';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('hintLadder', () => {
  it('narrows: which piece, which one of them, then the move', () => {
    const ladder = hintLadder(START, 'Nf3');
    expect(ladder.map(h => h.text)).toEqual([
      'A knight moves.',
      'The knight on g1.',
      'g1 to f3.',
    ]);
    // The board lights nothing on the first rung: it is the rung that has not
    // said which piece yet.
    expect(ladder[0].squares).toEqual([]);
    expect(ladder[1].squares).toEqual(['g1']);
    expect(ladder[2].squares).toEqual(['g1', 'f3']);
  });

  it('says a capture is a capture, because that is what a player is looking for', () => {
    const board = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    expect(hintLadder(board, 'exd5')[0].text).toBe('A pawn takes something.');
    // The control: the same pawn, not capturing.
    expect(hintLadder(board, 'e5')[0].text).toBe('A pawn moves.');
  });

  it('treats castling as one gesture with two answers, so it has two rungs', () => {
    const fen = 'rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1';
    const ladder = hintLadder(fen, 'O-O');
    expect(ladder).toHaveLength(2);
    expect(ladder[1].text).toBe('Castle short.');
    // Naming the rook would be a lie about the piece that is moving.
    expect(ladder.some(h => h.text.includes('rook'))).toBe(false);
  });

  // ── Zero by definition ─────────────────────────────────────────────────────
  it('has nothing to say about a move that cannot be played', () => {
    // A corrupt course is not something to hint about, and inventing a rung
    // would put a move on the screen that does not exist.
    expect(hintLadder(START, 'Qz9')).toEqual([]);
    expect(hintLadder(START, 'Nf6')).toEqual([]);
    expect(hintLadder('not a fen', 'Nf3')).toEqual([]);
  });

  it('imports no engine', async () => {
    // The guarantee is structural, so it is asserted structurally: this module
    // may reach chess.js and nothing else. An engine in here would make the
    // hint assistance rather than teaching.
    const source = await import('node:fs').then(fs =>
      fs.readFileSync('src/lib/learn/hint.ts', 'utf8')
    );
    const imports = Array.from(source.matchAll(/^import .*from '([^']+)'/gm)).map(m => m[1]);
    expect(imports).toEqual(['chess.js']);
  });
});

describe('hintAt', () => {
  const ladder = hintLadder(START, 'Nf3');

  it('is nothing before the first press', () => {
    expect(hintAt(ladder, 0)).toBeNull();
    expect(hintAt([], 3)).toBeNull();
  });

  it('walks the ladder, then stays on the answer', () => {
    expect(hintAt(ladder, 1)?.text).toBe('A knight moves.');
    expect(hintAt(ladder, 3)?.text).toBe('g1 to f3.');
    // Pressing again on the last rung is asking for more, and there is no
    // more. Showing the answer again is the honest response.
    expect(hintAt(ladder, 9)?.text).toBe('g1 to f3.');
  });
});
