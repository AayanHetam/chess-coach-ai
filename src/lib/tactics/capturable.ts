/**
 * Whether a piece can be WON — the one definition of "hanging" shared by the
 * line story (what a move leaves en prise) and the claim verifier (whether
 * "the knight hangs" is true). Two readers with two definitions would
 * contradict each other on the same board.
 *
 * Moved verbatim out of contract/lineStory.ts. PRECISION OVER RECALL: a
 * piece hangs only when taking it clears a full pawn by static exchange,
 * taken by a capturer that is not relatively pinned to a dearer piece, with
 * en passant counted (2026-09-05 adversarial review).
 */
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import { attackersOf, cheapestCapture, see, squareToCoord, coordToSquare } from "./utils";
import { PIECE_UNITS } from "./netMaterial";

const opp = (c: Color): Color => (c === "w" ? "b" : "w");
const cp = (p: PieceSymbol) => (PIECE_UNITS[p] ?? 0) * 100;

/** A piece is "en prise" only when taking it clears a full pawn — a +10cp knight-for-bishop read is a trade, not a hanging piece. */
export const EN_PRISE_MIN_CP = 100;

/** The square directly in front of `sq` for `color` (positionalFacts.squareInFront; tactics/ does not import contract/). */
function squareInFront(sq: Square, color: Color): Square | null {
  const [x, y] = squareToCoord(sq);
  return coordToSquare(x, y + (color === "w" ? 1 : -1));
}

/** A position with `color` to move, or null when chess.js rejects the flip. */
export function withTurn(fen: string, color: Color): Chess | null {
  const parts = fen.split(" ");
  if (parts[1] !== color) {
    parts[1] = color;
    parts[3] = "-";
  }
  try {
    return new Chess(parts.join(" "));
  } catch {
    return null;
  }
}

/**
 * Would moving the piece on `from` uncover a dearer friendly piece to an
 * enemy slider? Legal-move SEE respects absolute pins but is blind to
 * relative ones: a knight pinned to its queen "can" recapture, so the square
 * it guards reads as safe and the pawn it attacks reads as hanging.
 */
export function exposesDearerPiece(game: Chess, from: Square, capturedValueCp: number): boolean {
  const mover = game.get(from);
  if (!mover) return false;
  const enemy = opp(mover.color);
  const [fx, fy] = squareToCoord(from);
  for (const s of attackersOf(game, from, enemy)) {
    if (!["b", "r", "q"].includes(s.piece)) continue;
    const [sx, sy] = squareToCoord(s.square);
    const dx = Math.sign(fx - sx), dy = Math.sign(fy - sy);
    // Walk on past `from` along the same ray to the first piece behind it.
    let x = fx + dx, y = fy + dy;
    while (x >= 0 && x <= 7 && y >= 0 && y <= 7) {
      const sq = coordToSquare(x, y)!;
      const p = game.get(sq);
      if (p) {
        if (p.color === mover.color && (p.type === "k" || cp(p.type) > capturedValueCp)) return true;
        break;
      }
      x += dx; y += dy;
    }
  }
  return false;
}

/**
 * A legal en passant capture of the pawn on `sq` by `by`: null when there is
 * none, else whether it WINS the pawn (the capturing pawn cannot be taken
 * back). Attack scans see pawn geometry only, so a double step landing beside
 * an enemy pawn used to read as safe — and as "passed".
 */
export function enPassantWins(game: Chess, sq: Square, by: Color): boolean | null {
  const target = game.get(sq);
  if (!target || target.type !== "p" || target.color === by || game.turn() !== by) return null;
  const epSquare = game.fen().split(" ")[3];
  if (!epSquare || epSquare === "-" || squareInFront(sq, by) !== epSquare) return null;
  const ep = game.moves({ verbose: true }).find((m) => m.flags.includes("e") && m.to === epSquare);
  if (!ep) return null;
  try {
    const clone = new Chess(game.fen());
    clone.move(ep.san);
    return !clone.moves({ verbose: true }).some((m) => m.to === epSquare && m.captured);
  } catch {
    return null;
  }
}

/** Can `by` win the piece on `sq` outright — a full pawn of profit, by a capturer that is not relatively pinned? */
export function capturable(game: Chess, sq: Square, by: Color): boolean {
  const target = game.get(sq);
  if (!target || target.color === by || target.type === "k") return false;
  if (target.type === "p" && enPassantWins(game, sq, by) === true) return true;
  if (attackersOf(game, sq, by).length === 0) return false;
  if (see(game, sq, by) < EN_PRISE_MIN_CP) return false;
  const positioned = withTurn(game.fen(), by);
  if (!positioned) return false;
  const cap = cheapestCapture(positioned, sq);
  if (!cap) return false;
  return !exposesDearerPiece(positioned, cap.from, cp(target.type));
}
