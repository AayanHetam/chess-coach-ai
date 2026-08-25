// A hint, built from the move we already hold.
//
// ─────────────────────────────────────────────────────────────────────────────
// NO ENGINE, AND THE IMPORT GRAPH IS THE GUARANTEE
//
// The only input is the course's own SAN and the position it is played in.
// chess.js resolves which piece that is and where it stands; nothing is
// analysed, nothing is asked of a server, and nothing is generated. A hint that
// reached for an engine would be a different product — assistance — and the one
// thing that keeps this on the right side of that line is that it cannot: this
// module imports chess.js and nothing else.
//
// A HINT COSTS THE ROUND. `gradeAsk` lands a hinted answer on -1 whatever they
// then play, so `known` can never come to mean `was shown`. That is the half
// that stops the ladder being free, and it lives there rather than here because
// this module only writes words.
//
// THREE RUNGS, and the shape is not arbitrary. Each one narrows the search by
// about an order of magnitude — which piece type, then which piece, then the
// move — so a player can stop at the rung that was enough. A single "here is
// the answer" button is not a hint, it is a reveal, and a two-rung ladder that
// jumps from "a knight" to "Nf3-e5" wastes the useful middle.
// ─────────────────────────────────────────────────────────────────────────────

import { Chess } from 'chess.js';

const PIECES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export interface Hint {
  /** What the rung says. */
  text: string;
  /** Squares to light on the board, or empty when the rung is words only. */
  squares: string[];
}

/**
 * The ladder for one decision, most general first.
 *
 * Empty when the move cannot be played in the position — a corrupt course is
 * not something to hint about, and the trainer must show nothing rather than
 * invent a rung. Never longer than three.
 */
export function hintLadder(fen: string, san: string): Hint[] {
  let move: { from: string; to: string; piece: string; captured?: string; san: string } | null =
    null;
  try {
    const board = new Chess(fen);
    const played = board.move(san);
    move = played
      ? {
          from: played.from,
          to: played.to,
          piece: played.piece,
          captured: played.captured,
          san: played.san,
        }
      : null;
  } catch {
    move = null;
  }
  if (!move) return [];

  // Castling is one gesture and naming the rook would be a lie about the piece
  // that is moving. It also has only two possible answers, so the middle rung
  // has nothing left to narrow.
  if (move.san === 'O-O' || move.san === 'O-O-O') {
    return [
      { text: 'The king moves to safety.', squares: [move.from] },
      { text: move.san === 'O-O' ? 'Castle short.' : 'Castle long.', squares: [move.from, move.to] },
    ];
  }

  const name = PIECES[move.piece] ?? 'piece';
  const first = move.captured
    ? `A ${name} takes something.`
    : `A ${name} moves.`;

  return [
    { text: first, squares: [] },
    { text: `The ${name} on ${move.from}.`, squares: [move.from] },
    { text: `${move.from} to ${move.to}.`, squares: [move.from, move.to] },
  ];
}

/**
 * The rung to show for a number of hints taken.
 *
 * Clamped at the last rung rather than running off the end: pressing hint again
 * on the final rung is a player asking for more, and there is no more, so the
 * honest answer is to keep showing the answer.
 */
export function hintAt(ladder: Hint[], taken: number): Hint | null {
  if (ladder.length === 0 || taken <= 0) return null;
  return ladder[Math.min(taken, ladder.length) - 1];
}
