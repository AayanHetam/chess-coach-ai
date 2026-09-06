import { Chess, type Square, type PieceSymbol, type Color } from "chess.js";

export const PIECE_VALUE_CP: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 99999,
};

export function pieceValue(p: PieceSymbol): number {
  return PIECE_VALUE_CP[p] ?? 0;
}

const KNIGHT_OFFSETS: [number, number][] = [
  [1, 2], [2, 1], [2, -1], [1, -2],
  [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const KING_OFFSETS: [number, number][] = [
  [1, 0], [1, 1], [0, 1], [-1, 1],
  [-1, 0], [-1, -1], [0, -1], [1, -1],
];
const BISHOP_DIRS: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function squareToCoord(sq: Square): [number, number] {
  return [sq.charCodeAt(0) - 97, parseInt(sq[1], 10) - 1];
}

export function coordToSquare(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${String.fromCharCode(97 + file)}${rank + 1}` as Square;
}

export function pawnAttackSquares(sq: Square, color: Color): Square[] {
  const [fx, fy] = squareToCoord(sq);
  const dir = color === "w" ? 1 : -1;
  return ([-1, 1] as number[])
    .map((df) => coordToSquare(fx + df, fy + dir))
    .filter((s): s is Square => s !== null);
}

// All squares a piece on `from` can attack (full ray for sliders; stops at first piece).
export function rawAttacks(game: Chess, from: Square): Square[] {
  const piece = game.get(from);
  if (!piece) return [];
  const [fx, fy] = squareToCoord(from);
  const result: Square[] = [];

  if (piece.type === "p") return pawnAttackSquares(from, piece.color);

  if (piece.type === "n") {
    for (const [dx, dy] of KNIGHT_OFFSETS) {
      const sq = coordToSquare(fx + dx, fy + dy);
      if (sq) result.push(sq);
    }
    return result;
  }

  if (piece.type === "k") {
    for (const [dx, dy] of KING_OFFSETS) {
      const sq = coordToSquare(fx + dx, fy + dy);
      if (sq) result.push(sq);
    }
    return result;
  }

  const dirs =
    piece.type === "b" ? BISHOP_DIRS :
    piece.type === "r" ? ROOK_DIRS :
    [...BISHOP_DIRS, ...ROOK_DIRS];

  for (const [dx, dy] of dirs) {
    let x = fx + dx, y = fy + dy;
    while (x >= 0 && x <= 7 && y >= 0 && y <= 7) {
      const sq = coordToSquare(x, y)!;
      result.push(sq);
      if (game.get(sq)) break;
      x += dx; y += dy;
    }
  }
  return result;
}

/**
 * If `target` holds the pawn that has just double-stepped and `byColor` is to
 * move, the square `byColor` would capture it on en passant; else null. The
 * only capture in chess that lands somewhere other than the captured piece's
 * square — every geometry-based scan below misses it without this.
 */
export function enPassantSquareFor(game: Chess, target: Square, byColor: Color): Square | null {
  if (game.turn() !== byColor) return null;
  const occupant = game.get(target);
  if (!occupant || occupant.type !== "p" || occupant.color === byColor) return null;
  const ep = game.fen().split(" ")[3];
  if (!ep || ep === "-") return null;
  const [tx, ty] = squareToCoord(target);
  return coordToSquare(tx, ty + (byColor === "w" ? 1 : -1)) === ep ? (ep as Square) : null;
}

// All pieces of `byColor` that attack `target` — including, when `byColor` is
// to move, the pawns that could take a just-double-stepped pawn en passant.
export function attackersOf(
  game: Chess,
  target: Square,
  byColor: Color,
): Array<{ square: Square; piece: PieceSymbol }> {
  const result: Array<{ square: Square; piece: PieceSymbol }> = [];
  for (const row of game.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== byColor) continue;
      if (rawAttacks(game, sq.square as Square).includes(target)) {
        result.push({ square: sq.square as Square, piece: sq.type });
      }
    }
  }
  if (enPassantSquareFor(game, target, byColor)) {
    const [tx, ty] = squareToCoord(target);
    for (const dx of [-1, 1]) {
      const s = coordToSquare(tx + dx, ty);
      const p = s ? game.get(s) : null;
      if (s && p && p.color === byColor && p.type === "p" && !result.some((r) => r.square === s)) {
        result.push({ square: s, piece: "p" });
      }
    }
  }
  return result;
}

/**
 * Piece value for MATERIAL maths: the king is never winnable material (0).
 * Contrast `pieceValue`, whose 99999 king sentinel exists for attack ordering.
 */
export function materialValue(piece: PieceSymbol | string | undefined): number {
  if (!piece || piece === "k") return 0;
  return PIECE_VALUE_CP[piece as PieceSymbol] ?? 0;
}

/** What a promotion adds beyond the pawn that bought it. */
export function promotionBonus(promotion: string | undefined): number {
  if (!promotion) return 0;
  return (PIECE_VALUE_CP[promotion as PieceSymbol] ?? 0) - PIECE_VALUE_CP.p;
}

/**
 * The cheapest legal capture on `target` by the side to move, priced the way
 * the exchange recursion prices it — by what the capture is WORTH to the
 * capturer (king ranked dearest, promotion credited in the sort key), not by
 * bare piece value.
 *
 * Candidates come from the board scan (attackersOf) and are tried cheapest
 * first with `game.move`, which is chess.js's own legality check for ONE
 * piece — pins and king-into-check are respected exactly as before, without
 * generating every legal move in the position for each exchange step. (The
 * line story calls this thousands of times per contract; the full-generation
 * version cost ~50ms per narrated ply.)
 */
export function cheapestCapture(
  game: Chess,
  target: Square,
): { from: Square; to: Square; promotion?: string; gained: number } | null {
  const side = game.turn();
  const occupant = game.get(target);
  if (!occupant || occupant.color === side) return null;
  const lastRank = side === "w" ? "8" : "1";
  const epSquare = enPassantSquareFor(game, target, side);
  const candidates = attackersOf(game, target, side).map((a) => {
    const promotion = a.piece === "p" && target[1] === lastRank ? "q" : undefined;
    // An en passant capturer stands BESIDE the target and lands behind it.
    const to = epSquare && a.piece === "p" && a.square[1] === target[1] ? epSquare : target;
    return { from: a.square, to, piece: a.piece, promotion };
  });
  const cost = (m: { piece: PieceSymbol; promotion?: string }) =>
    (m.piece === "k" ? PIECE_VALUE_CP.q + 1 : materialValue(m.piece)) - promotionBonus(m.promotion);
  candidates.sort((a, b) => cost(a) - cost(b));
  for (const c of candidates) {
    let legal = false;
    try {
      const mv = game.move({ from: c.from, to: c.to, promotion: c.promotion as never });
      legal = !!mv;
      if (mv) game.undo();
    } catch {
      legal = false;
    }
    if (!legal) continue;
    return {
      from: c.from,
      to: c.to,
      promotion: c.promotion,
      gained: materialValue(occupant.type) + promotionBonus(c.promotion),
    };
  }
  return null;
}

/** `game` with `side` to move (en passant cleared), or null if the position breaks. */
function withSideToMove(game: Chess, side: Color): Chess | null {
  if (game.turn() === side) return game;
  const parts = game.fen().split(" ");
  parts[1] = side;
  parts[3] = "-";
  try {
    return new Chess(parts.join(" "));
  } catch {
    return null;
  }
}

/**
 * Static exchange evaluation, played out on real legal moves.
 *
 * Moved here from intent/positionFacts (issue #350) so tactics and intent
 * share one audited engine. Two hazards it has to avoid, both of which were
 * live defects found by an adversarial audit:
 *
 *  - The KING is not capturable material. chess.js happily generates
 *    "Rxe1" capturing a king on the turn-flipped position this function builds,
 *    and PIECE_VALUE_CP.k is 99999 — so an unguarded recursion priced every
 *    check evasion at 999.99 pawns, then re-parsed a kingless board and threw.
 *  - A PROMOTION is worth more than the piece standing on the target square.
 *    Pricing only the occupant inverted the sign of rook-winning promotions.
 *
 * Returns what `side` can WIN on `target` — an option price, floored at 0
 * because a side that would lose material simply declines to capture.
 *
 * Plays the exchange forward with move/undo on one board: after a capture
 * the other side is on move, so no turn flip (and no FEN re-parse) is needed
 * inside the recursion. `position` is left exactly as it was passed in.
 */
export function exchangeValue(position: Chess, target: Square, side: Color, depth = 0): number {
  if (depth > 12) return 0; // pathological positions; exchanges never run this deep
  const occupant = position.get(target);
  if (!occupant || occupant.color === side) return 0;
  // A king can be attacked but never won.
  if (occupant.type === "k") return 0;

  // chess.js only generates moves for the side to move, so asking what the
  // OPPONENT could win on a square during our turn silently returns nothing.
  const game = withSideToMove(position, side);
  if (!game) return 0;

  const capture = cheapestCapture(game, target);
  if (!capture) return 0;

  let played = false;
  try {
    played = !!game.move({ from: capture.from, to: capture.to, promotion: (capture.promotion ?? "q") as never });
  } catch {
    played = false;
  }
  if (!played) return 0;
  const opponent: Color = side === "w" ? "b" : "w";
  // The opponent recaptures only if it pays; hence max(0, ...).
  const value = Math.max(0, capture.gained - exchangeValue(game, capture.to, opponent, depth + 1));
  game.undo();
  return value;
}

/**
 * Static Exchange Evaluator on real legal moves (issue #350 rewrite).
 * Returns net centipawns for `capturingColor` capturing on `target`:
 * the FIRST capture is taken as given (that is the question being asked),
 * every later recapture is option-priced by `exchangeValue`. Positive =
 * profitable; negative = losing exchange; 0 when no legal capture exists,
 * the square is empty, or the occupant is a king (never winnable material).
 *
 * The old swap-list implementation priced the recapturing side's own piece
 * as the gain, reused the initial capturer, and double-counted the
 * alternation in its backward pass — a losing QxN came back +320.
 */
export function see(game: Chess, target: Square, capturingColor: Color): number {
  const occupant = game.get(target);
  if (!occupant || occupant.color === capturingColor) return 0;
  if (occupant.type === "k") return 0;

  const positioned = withSideToMove(game, capturingColor);
  if (!positioned) return 0;

  const capture = cheapestCapture(positioned, target);
  if (!capture) return 0;

  let played = false;
  try {
    played = !!positioned.move({ from: capture.from, to: capture.to, promotion: (capture.promotion ?? "q") as never });
  } catch {
    played = false;
  }
  if (!played) return 0;
  const opponent: Color = capturingColor === "w" ? "b" : "w";
  const value = capture.gained - exchangeValue(positioned, capture.to, opponent, 1);
  positioned.undo();
  return value;
}

// Check if two squares share a rank, file, or diagonal.
export function onSameRay(a: Square, b: Square): boolean {
  const [ax, ay] = squareToCoord(a);
  const [bx, by] = squareToCoord(b);
  return ax === bx || ay === by || Math.abs(ax - bx) === Math.abs(ay - by);
}

// Unit step from `from` toward `toward` (assumes they're on the same ray).
export function rayStep(from: Square, toward: Square): [number, number] | null {
  const [fx, fy] = squareToCoord(from);
  const [tx, ty] = squareToCoord(toward);
  const dx = tx - fx, dy = ty - fy;
  if (dx === 0 && dy === 0) return null;
  if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return null;
  return [Math.sign(dx), Math.sign(dy)];
}

// Squares strictly between `from` and `to` on the same ray (exclusive).
export function squaresBetween(from: Square, to: Square): Square[] {
  const step = rayStep(from, to);
  if (!step) return [];
  const [dx, dy] = step;
  const [fx, fy] = squareToCoord(from);
  const [tx, ty] = squareToCoord(to);
  const result: Square[] = [];
  let x = fx + dx, y = fy + dy;
  // Bounded by board geometry: x/y diverge from tx/ty by at most 7 steps
  // before coordToSquare returns null. The explicit 8-iteration cap is a
  // belt-and-suspenders against any rayStep regression that would loop
  // forever — also satisfies no-constant-condition.
  for (let safety = 0; safety < 8; safety++) {
    const sq = coordToSquare(x, y);
    if (!sq || (x === tx && y === ty)) break;
    result.push(sq);
    x += dx; y += dy;
  }
  return result;
}

// Ray label: "file-d", "rank-5", "diag-a1h8", etc.  Used in motif output for human readability.
export function rayLabel(a: Square, b: Square): string {
  const [ax, ay] = squareToCoord(a);
  const [bx, by] = squareToCoord(b);
  if (ax === bx) return `file-${a[0]}`;
  if (ay === by) return `rank-${a[1]}`;
  return `diag-${a}-${b}`;
}
