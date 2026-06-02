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

// All pieces of `byColor` that attack `target`.
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
  return result;
}

// Simplified Static Exchange Evaluator.
// Returns net centipawns for `capturingColor` capturing on `target`.
// Positive = profitable; negative = losing exchange.
export function see(game: Chess, target: Square, capturingColor: Color): number {
  const targetPiece = game.get(target);
  if (!targetPiece) return 0;
  const opponentColor: Color = capturingColor === "w" ? "b" : "w";

  const atks = attackersOf(game, target, capturingColor)
    .map((a) => pieceValue(a.piece))
    .sort((a, b) => a - b);
  const defs = attackersOf(game, target, opponentColor)
    .map((d) => pieceValue(d.piece))
    .sort((a, b) => a - b);

  if (atks.length === 0) return 0;
  if (defs.length === 0) return pieceValue(targetPiece.type);

  // Simulate exchange: cheapest attacker captures first
  const gains: number[] = [pieceValue(targetPiece.type)];
  let ai = 0, di = 0;
  let turn = "def"; // after initial capture, defender recaptures
  let lastGain = gains[0];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (turn === "def") {
      if (di >= defs.length) break;
      lastGain = defs[di++] - lastGain;
      gains.push(lastGain);
      turn = "atk";
    } else {
      if (ai >= atks.length) break;
      lastGain = atks[ai++] - lastGain;
      gains.push(lastGain);
      turn = "def";
    }
  }

  // Each side only recaptures if it's profitable; walk backwards
  let result = 0;
  for (let i = gains.length - 1; i >= 0; i--) {
    result = Math.max(0, gains[i] - result);
  }
  return result;
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
  while (true) {
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
