// Where a game left what players at your level actually play.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS FUNCTION MAKES A CLAIM ABOUT A REAL PERSON'S GAME, SO IT HAS FIVE
// ANSWERS AND NONE OF THEM MAY PRINT AS ANOTHER.
//
//   left          The position was described, and the move played is below the
//                 book's floor. THIS is the only one that is a book exit.
//   opponent-left Their opponent went first. Nothing after that point is a
//                 statement about the reader, and the walk stops.
//   thin          A position was reached that the corpus does not describe —
//                 fewer than `minGames` games went through it. We do not know
//                 what players at this level do here. "We have no data" is the
//                 opposite claim from "you left theory", and collapsing the two
//                 would tell a player they went off-book for playing a line
//                 nobody in the sample happened to reach.
//   in-book       Still in book when the game, or the corpus, ran out. The
//                 corpus stops at `meta.maxPly`; past that this says nothing.
//   unreadable    The moves do not make a legal game. A bug upstream, not a
//                 fact about anybody's opening.
//
// AND NOTHING HERE IS A JUDGEMENT. No engine has been consulted, no evaluation
// is attached, and frequency is not quality. The strongest sentence this
// supports is "fewer than one player in fifty at your level plays this here",
// which is a count. A rare move can be the best move on the board.
// ─────────────────────────────────────────────────────────────────────────────

import { Chess } from 'chess.js';
import type { OpeningBook } from '@/types/book';

export type BookExitOutcome = 'left' | 'opponent-left' | 'thin' | 'in-book' | 'unreadable';

export interface BookMove {
  san: string;
  /** Share of the band's games from that position, per mille. */
  perMille: number;
}

export interface BookExit {
  outcome: BookExitOutcome;
  /** 0-based ply where it happened, or -1 when nothing happened. */
  ply: number;
  /** The move number a player would say: ply 12 is move 7. -1 when ply is. */
  moveNumber: number;
  /** The move played there, or null. */
  san: string | null;
  /**
   * What the band plays from that position instead, share-descending.
   *
   * Capped for display, and the cap lives HERE rather than in the book, so a
   * move ranked seventh still counts as in book. Empty when the position was
   * never described.
   */
  common: BookMove[];
  /** Plies confirmed in book before the outcome. */
  depth: number;
  /**
   * True when the played move, rare as it is from that position, still reaches
   * a position the book describes.
   *
   * The book is keyed by POSITION, so a rare move order can rejoin a common
   * line. Saying "you left theory" about a transposition into a main line is
   * true about the move and false about the game, and the reader is entitled
   * to the difference.
   */
  transposes: boolean;
}

const NOTHING: BookExit = {
  outcome: 'in-book',
  ply: -1,
  moveNumber: -1,
  san: null,
  common: [],
  depth: 0,
  transposes: false,
};

/** The book's key: the first four FEN fields, matching how it was built. */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

const DISPLAY_ALTERNATIVES = 3;

const shown = (rows: Array<[string, number]> | undefined): BookMove[] =>
  (rows ?? []).slice(0, DISPLAY_ALTERNATIVES).map(([san, perMille]) => ({ san, perMille }));

/**
 * Walk a game against one band's book and report the first thing worth saying.
 *
 * `side` is the colour the reader played. Their opponent leaving first is
 * reported and the walk stops: once the game is off the corpus, a later move
 * being absent says nothing about whether the reader knew their theory.
 */
export function bookExit(sans: string[], side: 'white' | 'black', book: OpeningBook): BookExit {
  const board = new Chess();
  const mine = side === 'white' ? 0 : 1;
  const maxPly = book.meta?.maxPly ?? Infinity;

  for (let ply = 0; ply < sans.length && ply < maxPly; ply++) {
    const rows = book.book[positionKey(board.fen())];
    const san = sans[ply];

    // The position itself is not described. Whoever is to move, we have no
    // measurement here, and no measurement is not an exit.
    if (!rows) {
      return { ...NOTHING, outcome: 'thin', ply, moveNumber: Math.floor(ply / 2) + 1, san, depth: ply };
    }

    const played = rows.find(r => r[0] === san);
    if (!played) {
      // Advance one move to see whether this rejoins the book, then report.
      let transposes = false;
      try {
        board.move(san);
        transposes = Boolean(book.book[positionKey(board.fen())]);
      } catch {
        return { ...NOTHING, outcome: 'unreadable', ply, moveNumber: Math.floor(ply / 2) + 1, san, depth: ply };
      }
      return {
        outcome: ply % 2 === mine ? 'left' : 'opponent-left',
        ply,
        moveNumber: Math.floor(ply / 2) + 1,
        san,
        common: shown(rows),
        depth: ply,
        transposes,
      };
    }

    try {
      board.move(san);
    } catch {
      return { ...NOTHING, outcome: 'unreadable', ply, moveNumber: Math.floor(ply / 2) + 1, san, depth: ply };
    }
  }

  // Ran out of game, or ran out of corpus. Either way nothing left the book,
  // and `depth` is how far that claim actually reaches.
  return { ...NOTHING, depth: Math.min(sans.length, maxPly === Infinity ? sans.length : maxPly) };
}
