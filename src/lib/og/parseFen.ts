/**
 * Parse the piece-placement field of a FEN string into an 8×8 array
 * indexed from a8 (white's perspective, top-left) to h1 (bottom-right).
 *
 * Returns null for empty squares; otherwise returns the piece letter
 * with case preserved (uppercase = white, lowercase = black). This is
 * the canonical FEN representation — no translation needed by callers
 * that already speak chess.
 *
 * Defensive: returns the starting position when the input is empty or
 * malformed. The OG image renderer would rather show a default board
 * than crash on a corrupted insight.
 */

export type PieceLetter =
  | "K" | "Q" | "R" | "B" | "N" | "P"
  | "k" | "q" | "r" | "b" | "n" | "p";

export type BoardSquare = PieceLetter | null;

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

function isPieceLetter(c: string): c is PieceLetter {
  return /^[KQRBNPkqrbnp]$/.test(c);
}

export function parseFenToBoard(fen: string): BoardSquare[][] {
  const placement = (fen?.trim().split(/\s+/)[0] ?? "").trim();
  const rows = (placement || STARTING_FEN).split("/");
  if (rows.length !== 8) {
    return parseFenToBoard(STARTING_FEN);
  }
  const board: BoardSquare[][] = [];
  for (const row of rows) {
    const squares: BoardSquare[] = [];
    for (const ch of row) {
      if (/^[1-8]$/.test(ch)) {
        const count = Number(ch);
        for (let i = 0; i < count; i++) squares.push(null);
      } else if (isPieceLetter(ch)) {
        squares.push(ch);
      } else {
        // Malformed character — bail to starting position.
        return parseFenToBoard(STARTING_FEN);
      }
    }
    if (squares.length !== 8) {
      return parseFenToBoard(STARTING_FEN);
    }
    board.push(squares);
  }
  return board;
}

/** Parse the side-to-move field. Defaults to "w" when malformed. */
export function sideToMoveFromFen(fen: string): "w" | "b" {
  const f = (fen?.trim().split(/\s+/)[1] ?? "").trim();
  return f === "b" ? "b" : "w";
}
