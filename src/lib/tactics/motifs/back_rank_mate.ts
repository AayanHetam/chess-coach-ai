import { Chess, type Square, type Color } from "chess.js";
import { attackersOf, coordToSquare, squareToCoord } from "../utils";
import type { BackRankMateMotif } from "../types";

// Enemy king is on its back rank with no escape.
// Detect both "back_rank_mate" (immediate) and "back_rank_threat" (one move away).
export function detectBackRankMate(
  gameAfter: Chess,
  movingColor: Color,
): BackRankMateMotif | null {
  const opponentColor: Color = movingColor === "w" ? "b" : "w";
  const backRank = opponentColor === "w" ? "1" : "8";

  // Find opponent king
  let kingSq: Square | null = null;
  for (const row of gameAfter.board()) {
    for (const sq of row) {
      if (sq && sq.color === opponentColor && sq.type === "k") {
        kingSq = sq.square as Square;
      }
    }
  }
  if (!kingSq || kingSq[1] !== backRank) return null;

  const [kx, ky] = squareToCoord(kingSq);
  const KING_OFFSETS: [number, number][] = [
    [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [-1, -1], [0, -1], [1, -1],
  ];

  const escapeInfo: Array<{ square: Square; blocker: "own_piece" | "attacked" }> = [];
  let escapePossible = false;

  for (const [dx, dy] of KING_OFFSETS) {
    const esq = coordToSquare(kx + dx, ky + dy);
    if (!esq) continue;
    const occupant = gameAfter.get(esq);
    if (occupant && occupant.color === opponentColor) {
      escapeInfo.push({ square: esq, blocker: "own_piece" });
    } else if (gameAfter.isAttacked(esq, movingColor)) {
      escapeInfo.push({ square: esq, blocker: "attacked" });
    } else {
      escapePossible = true;
      break;
    }
  }

  if (escapePossible) return null;

  // King has no escape. Find back-rank attackers that can deliver mate.
  // Look for our heavy pieces (R or Q) that can reach the back rank.
  const backRankSquares = Array.from({ length: 8 }, (_, i) =>
    coordToSquare(i, opponentColor === "w" ? 0 : 7),
  ).filter((s): s is Square => s !== null);

  let deliveringSq: Square | null = null;
  let deliveringPiece: import("chess.js").PieceSymbol | null = null;

  // Check if we're already in checkmate (gameAfter.isCheckmate())
  const isImmediateMate = gameAfter.isCheckmate();

  // Check which of our pieces attacks the king square or a back-rank square adjacent to king
  for (const sq of backRankSquares) {
    const atks = attackersOf(gameAfter, sq, movingColor);
    for (const atk of atks) {
      const atkPiece = gameAfter.get(atk.square);
      if (atkPiece && ["r", "q"].includes(atkPiece.type)) {
        // Verify no interposers between attacker and target rank
        const interposers = findInterposers(gameAfter, atk.square, sq);
        if (interposers.length === 0) {
          deliveringSq = atk.square;
          deliveringPiece = atkPiece.type;
        }
      }
    }
  }

  if (!deliveringSq || !deliveringPiece) return null;

  // Check for interposers on the back rank between attacker and king
  const interposers = findInterposers(gameAfter, deliveringSq, kingSq);

  return {
    motif: isImmediateMate ? "back_rank_mate" : "back_rank_threat",
    delivering_square: deliveringSq,
    delivering_piece: deliveringPiece,
    king_square: kingSq,
    escape_squares_blocked_by: escapeInfo,
    interposers,
    confirmed: isImmediateMate || interposers.length === 0,
    refutation: interposers.length > 0 ? { move: `interpose-${interposers[0]}`, refuted_by: "counter_threat" } : null,
  };
}

function findInterposers(game: Chess, from: Square, to: Square): Square[] {
  const [fx, fy] = squareToCoord(from);
  const [tx, ty] = squareToCoord(to);
  const dx = Math.sign(tx - fx), dy = Math.sign(ty - fy);
  const interposers: Square[] = [];
  let x = fx + dx, y = fy + dy;
  while (x !== tx || y !== ty) {
    const sq = coordToSquare(x, y);
    if (!sq) break;
    if (game.get(sq)) interposers.push(sq);
    x += dx; y += dy;
  }
  return interposers;
}
