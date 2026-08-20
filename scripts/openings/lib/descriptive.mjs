// Descriptive notation, converted by matching against legal moves.
//
// Every chess book written before about 1975 uses descriptive notation, which
// is where all the public-domain opening prose lives: "1. P-K4, P-K4; 2. Kt-KB3,
// Kt-QB3; 3. B-Kt5" is the Ruy Lopez in Edward Lasker's 1915 Chess Strategy.
// Nothing downstream can use a word of it until the moves are algebraic.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS CONVERTS BY MATCHING RATHER THAN BY PARSING
//
// Descriptive notation is relative and ambiguous by design. "K4" means the
// fourth rank counted from the MOVER's side, so it is e4 for White and e5 for
// Black. "B-Kt5" does not say which knight file. "PxP" does not say which pawn.
// A parser would have to guess, and a wrong guess produces a legal-looking move
// that quietly desynchronises the rest of the game.
//
// So: generate every legal move, render each one back INTO descriptive, and
// keep the one that matches. Ambiguity resolves itself, because only one legal
// move usually has a given description. When two do, that is genuinely
// ambiguous and we stop rather than pick — a line that silently continues down
// the wrong branch would attach real prose to the wrong position, which is
// worse than losing the line.
// ─────────────────────────────────────────────────────────────────────────────

import { Chess } from 'chess.js';

/** Files, named from the side that is moving. Same names for both colours. */
const FILE_NAMES = {
  a: ['QR'],
  b: ['QN', 'QKt'],
  c: ['QB'],
  d: ['Q'],
  e: ['K'],
  f: ['KB'],
  g: ['KN', 'KKt'],
  h: ['KR'],
};

/** A piece's descriptive letter. Kt and N are both knights, by era. */
const PIECE_NAMES = { p: ['P'], n: ['KT', 'N'], b: ['B'], r: ['R'], q: ['Q'], k: ['K'] };

/** The rank number a square has, counted from `colour`'s own side. */
export function relativeRank(square, colour) {
  const rank = Number(square[1]);
  return colour === 'w' ? rank : 9 - rank;
}

/**
 * Every descriptive spelling a legal move could be written as.
 *
 * Books are inconsistent about how much they qualify: the same move appears as
 * "Kt-KB3", "Kt-B3" and "N-B3" across three pages of one book, so every
 * abbreviation a reader would recognise has to be generated.
 */
export function spellings(move, colour) {
  const out = new Set();
  const pieces = PIECE_NAMES[move.piece] ?? [];
  const toFiles = FILE_NAMES[move.to[0]] ?? [];
  const rank = relativeRank(move.to, colour);
  const capture = Boolean(move.captured);

  for (const piece of pieces) {
    if (capture) {
      const takenNames = PIECE_NAMES[move.captured] ?? [];
      for (const taken of takenNames) {
        // "KtxP", and the fuller "KtxQP" naming the captured man's file.
        out.add(`${piece}X${taken}`);
        for (const file of toFiles) out.add(`${piece}X${file}${taken}`);
        for (const file of toFiles) out.add(`${piece}X${taken}${rank}`);
      }
      // Some books write captures as a destination instead: "KtxQ4".
      for (const file of toFiles) out.add(`${piece}X${file}${rank}`);
    }
    for (const file of toFiles) {
      out.add(`${piece}-${file}${rank}`);
      out.add(`${piece}${file}${rank}`);
      // The unqualified short form: "B-B4" for a bishop to either bishop file.
      const short = file.replace(/^[KQ](?=[A-Z])/, '');
      if (short !== file) {
        out.add(`${piece}-${short}${rank}`);
        out.add(`${piece}${short}${rank}`);
      }
    }
    // The hybrid form some books use, where the destination is already
    // algebraic: "P-d4", "Kt-f3". Cheap to support, and it makes a whole book
    // parseable that otherwise would not be.
    out.add(`${piece}-${move.to}`);
    out.add(`${piece}${move.to}`);
    if (capture) out.add(`${piece}X${move.to}`);
  }
  if (move.san === 'O-O') ['O-O', '0-0', 'CASTLESKR', 'KR'].forEach(s => out.add(s));
  if (move.san === 'O-O-O') ['O-O-O', '0-0-0', 'CASTLESQR', 'QR'].forEach(s => out.add(s));
  // Compared against a normalised token, which is upper-cased. Leaving these
  // mixed-case made 'QKt5' never equal 'QKT5', and every knight and bishop
  // move in every descriptive book failed to convert.
  return new Set(Array.from(out, spelling => spelling.toUpperCase()));
}

/** Strip a descriptive token down to something comparable. */
export function normalise(token) {
  return token
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[!?+#]/g, '')
    .replace(/–|—/g, '-')
    .replace(/^KT/, 'KT')
    .replace(/\(.*?\)/g, '')
    .replace(/E\.?P\.?$/, '')
    .replace(/CH$/, '');
}

/**
 * One descriptive move, applied. Returns the SAN, or null when the token does
 * not match exactly one legal move.
 */
export function playDescriptive(board, token) {
  const want = normalise(token);
  if (!want) return null;
  const colour = board.turn();
  const matches = [];
  for (const move of board.moves({ verbose: true })) {
    if (spellings(move, colour).has(want)) matches.push(move);
  }
  // Exactly one, or we stop. Two legal moves sharing a description is real
  // ambiguity, and picking one would attach the book's prose to a position the
  // book was not talking about.
  if (matches.length !== 1) return null;
  board.move(matches[0].san);
  return matches[0].san;
}

/**
 * A run of descriptive moves, converted until one fails.
 *
 * Returns what it managed, plus where it stopped. A partial line is still
 * useful — the first six moves of a Ruy Lopez are the part the prose is about —
 * and stopping is always better than guessing onward.
 */
export function convertLine(tokens, startFen) {
  const board = startFen ? new Chess(startFen) : new Chess();
  const sans = [];
  for (const token of tokens) {
    const san = playDescriptive(board, token);
    if (!san) break;
    sans.push(san);
  }
  return { sans, fen: board.fen(), converted: sans.length, offered: tokens.length };
}

/** Move-like tokens out of a run of book text, in order. */
export function tokenise(text) {
  // Descriptive moves, the hybrid "P-d4" form some books use, and castling.
  const pattern =
    /\b(?:O-O-O|0-0-0|O-O|0-0|(?:P|Kt|N|B|R|Q|K)\s*(?:-|—|–|x|X)\s*(?:[KQ]?\s*(?:R|Kt|N|B|Q|K)?\s*\d|[a-h]\d)|(?:P|Kt|N|B|R|Q|K)\s*x\s*(?:P|Kt|N|B|R|Q|K)\s*\d?)\b/g;
  return (text.match(pattern) ?? []).map(t => t.replace(/\s+/g, ''));
}
