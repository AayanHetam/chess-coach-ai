import { Chess } from "chess.js";

/**
 * Keyboard move entry for the shared puzzle board (PuzzleBoardSurface).
 *
 * A keyboard-only user could not answer a course-trainer probe — or any
 * puzzle — because every input path was pointer-shaped (drag, or tap-tap).
 * This parser is the pure half of the fix: text in ("e4", "Nf3", "O-O",
 * "e2e4"), a move the board's `onPieceDrop` sink can express out. The board
 * stays the sole owner of HOW the text is collected; every grading path is
 * untouched because the parsed move travels through the same sink as a drag.
 *
 * Accepts SAN (chess.js strict-ish) and bare UCI. Forgiveness is deliberate
 * and NARROW:
 *  - `0-0` / `o-o` style castling is normalised to `O-O`.
 *  - A leading lowercase n/r/q/k is capitalised ("nf3" → "Nf3") — those four
 *    letters can never start a legal SAN token otherwise, since files run
 *    a–h. Lowercase `b` is left alone: "bxc4" (pawn from the b-file) and
 *    "Bxc4" (bishop) are DIFFERENT moves, and guessing between them would
 *    grade a move the user did not type.
 */

export type ParsedKeyboardMove =
  | { ok: true; from: string; to: string; piece: string }
  | { ok: false; error: string };

const UCI_RE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;
const CASTLE_RE = /^[0oO]-[0oO](-[0oO])?$/;

function candidates(text: string): string[] {
  const out = [text];
  if (CASTLE_RE.test(text)) {
    out.push(text.split("-").length === 3 ? "O-O-O" : "O-O");
  }
  if (/^[nrqk]/.test(text)) {
    out.push(text[0].toUpperCase() + text.slice(1));
  }
  return out;
}

export function parseKeyboardMove(fen: string, raw: string): ParsedKeyboardMove {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Type a move like e4, Nf3 or O-O." };

  let game: Chess;
  try {
    game = new Chess(fen);
  } catch {
    return { ok: false, error: "The board position isn't ready yet." };
  }

  const uci = UCI_RE.exec(text.toLowerCase());
  let move = null;
  if (uci) {
    try {
      move = game.move({
        from: uci[1],
        to: uci[2],
        // Match the board's autoPromoteToQueen unless the user spelled it out.
        promotion: (uci[3] as "q" | "r" | "b" | "n" | undefined) ?? "q",
      });
    } catch {
      move = null;
    }
  } else {
    for (const c of candidates(text)) {
      try {
        move = game.move(c);
        break;
      } catch {
        move = null;
      }
    }
  }

  if (!move) return { ok: false, error: "Not a legal move here." };

  // The sink's signature is (from, to, piece) and the board auto-queens —
  // an underpromotion would silently grade as a queen promotion, which is a
  // different move. Refuse it honestly instead.
  if (move.promotion && move.promotion !== "q") {
    return { ok: false, error: "Promotion is always to a queen here." };
  }

  return {
    ok: true,
    from: move.from,
    to: move.to,
    piece: `${move.color}${move.piece.toUpperCase()}`,
  };
}

/**
 * True when a keypress should OPEN the entry overlay: the plausible first
 * character of a move token. Files a–h, piece letters (either case for
 * n/r/q/k, both cases for B — "bxc4" is legal SAN), and 0/o/O for castling.
 */
export function isMoveStartKey(key: string): boolean {
  return /^[a-hnrqkBNRQKoO0]$/.test(key);
}
