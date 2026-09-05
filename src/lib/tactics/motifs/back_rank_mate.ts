import { Chess, type Square, type Color, type PieceSymbol } from "chess.js";
import { attackersOf, coordToSquare, squareToCoord } from "../utils";
import type { BackRankMateMotif } from "../types";

/**
 * Enemy king on its back rank with no legal move; a heavy piece delivers
 * (back_rank_mate) or can deliver next move (back_rank_threat).
 *
 * Both forms are decided by chess.js legality, never by isAttacked() on the
 * neighbouring squares: a rook checking along the rank does not "attack" the
 * square behind the king (the king blocks its own ray), yet the king cannot
 * step there because the ray opens the moment it vacates. That x-ray class
 * cost the previous detector half its recall on Lichess `backRankMate`
 * puzzles (54% → 100%, scripts/eval/motif_detector_recall.ts).
 *
 * The threat form is a real mate-in-one search: some rook or queen of the
 * mover can land on the back rank and it is checkmate. The previous "a heavy
 * piece attacks a back-rank square" heuristic fired on rooks the king could
 * simply capture, and needed the king already boxed in — but luft that is
 * only closed by the mating check is exactly the back-rank pattern.
 */
export function detectBackRankMate(
  gameAfter: Chess,
  movingColor: Color,
): BackRankMateMotif | null {
  const opponentColor: Color = movingColor === "w" ? "b" : "w";
  const backRank = opponentColor === "w" ? "1" : "8";

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
  for (const [dx, dy] of KING_OFFSETS) {
    const esq = coordToSquare(kx + dx, ky + dy);
    if (!esq) continue;
    const occupant = gameAfter.get(esq);
    escapeInfo.push({
      square: esq,
      blocker: occupant && occupant.color === opponentColor ? "own_piece" : "attacked",
    });
  }

  if (gameAfter.isCheckmate()) {
    const checker = attackersOf(gameAfter, kingSq, movingColor).find(
      (a) => (a.piece === "r" || a.piece === "q") && a.square[1] === backRank,
    );
    if (!checker) return null; // mated, but not along the back rank
    return {
      motif: "back_rank_mate",
      delivering_square: checker.square,
      delivering_piece: checker.piece,
      king_square: kingSq,
      escape_squares_blocked_by: escapeInfo,
      interposers: [],
      confirmed: true,
      refutation: null,
    };
  }
  if (gameAfter.inCheck()) return null; // the reply is forced elsewhere; not a standing threat

  // Threat: give the mover the move again and look for a heavy-piece mate on the rank.
  const parts = gameAfter.fen().split(" ");
  parts[1] = movingColor;
  parts[3] = "-";
  let again: Chess;
  try {
    again = new Chess(parts.join(" "));
  } catch {
    return null;
  }
  for (const m of again.moves({ verbose: true })) {
    if ((m.piece !== "r" && m.piece !== "q") || m.to[1] !== backRank) continue;
    const probe = new Chess(again.fen());
    probe.move(m);
    if (!probe.isCheckmate()) continue;
    return {
      motif: "back_rank_threat",
      delivering_square: m.to as Square,
      delivering_piece: m.piece as PieceSymbol,
      king_square: kingSq,
      escape_squares_blocked_by: escapeInfo,
      interposers: [],
      confirmed: true,
      refutation: null,
    };
  }
  return null;
}
