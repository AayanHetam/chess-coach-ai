import { Chess, Square, PieceSymbol, Color } from "chess.js";

export type PieceRole =
  | "attacker"
  | "defender"
  | "pinned"
  | "pinning"
  | "overworked"
  | "outpost"
  | "bad-bishop"
  | "tactical-anchor";

export interface PieceRoleEntry {
  square: Square;
  piece: PieceSymbol;
  color: Color;
  roles: PieceRole[];
  detail: { defending?: Square[]; attacking?: Square[]; pinnedBy?: Square };
}

export type PieceRoleMap = Record<string, PieceRoleEntry>;

export interface RoleChange {
  square: Square;
  piece: PieceSymbol;
  color: Color;
  gained: PieceRole[];
  lost: PieceRole[];
}

const OUTPOST_RANKS_WHITE: readonly string[] = ["4", "5", "6"];
const OUTPOST_RANKS_BLACK: readonly string[] = ["3", "4", "5"];

function pawnAttackSquares(sq: Square, color: Color): Square[] {
  const file = sq.charCodeAt(0);
  const rank = parseInt(sq[1], 10);
  const dir = color === "w" ? 1 : -1;
  const targets: Square[] = [];
  for (const df of [-1, 1]) {
    const tf = file + df;
    const tr = rank + dir;
    if (tf < 97 || tf > 104 || tr < 1 || tr > 8) continue;
    targets.push(`${String.fromCharCode(tf)}${tr}` as Square);
  }
  return targets;
}

const KNIGHT_OFFSETS: Array<[number, number]> = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const KING_OFFSETS: Array<[number, number]> = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];
const BISHOP_DIRS: Array<[number, number]> = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function coordToSquare(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${String.fromCharCode(97 + file)}${rank + 1}` as Square;
}

function squareToCoord(square: Square): [number, number] {
  return [square.charCodeAt(0) - 97, parseInt(square[1], 10) - 1];
}

/**
 * Squares the piece attacks regardless of own/enemy occupancy. Sliders stop
 * at the first piece encountered (and include that square as attacked).
 * This differs from chess.js's `moves()` which would exclude own-piece squares
 * from legal destinations — but for piece-role analysis ("what is this piece
 * defending?") we need the full attack pattern.
 */
function rawAttackSquares(game: Chess, from: Square, pieceType: PieceSymbol): Square[] {
  const [fx, fy] = squareToCoord(from);
  const result: Square[] = [];

  const traceRay = (dx: number, dy: number) => {
    let x = fx + dx;
    let y = fy + dy;
    while (x >= 0 && x < 8 && y >= 0 && y < 8) {
      const sq = coordToSquare(x, y);
      if (!sq) break;
      result.push(sq);
      if (game.get(sq)) break;
      x += dx;
      y += dy;
    }
  };

  switch (pieceType) {
    case "n":
      for (const [dx, dy] of KNIGHT_OFFSETS) {
        const sq = coordToSquare(fx + dx, fy + dy);
        if (sq) result.push(sq);
      }
      break;
    case "k":
      for (const [dx, dy] of KING_OFFSETS) {
        const sq = coordToSquare(fx + dx, fy + dy);
        if (sq) result.push(sq);
      }
      break;
    case "b":
      for (const [dx, dy] of BISHOP_DIRS) traceRay(dx, dy);
      break;
    case "r":
      for (const [dx, dy] of ROOK_DIRS) traceRay(dx, dy);
      break;
    case "q":
      for (const [dx, dy] of [...BISHOP_DIRS, ...ROOK_DIRS]) traceRay(dx, dy);
      break;
  }
  return result;
}

/**
 * Identify squares where an opponent pawn could never evict the piece: no
 * opposing pawn on the adjacent files in front. The classical outpost definition.
 */
function isOutpostSquare(game: Chess, square: Square, color: Color): boolean {
  const file = square[0];
  const rank = parseInt(square[1], 10);
  const validRanks = color === "w" ? OUTPOST_RANKS_WHITE : OUTPOST_RANKS_BLACK;
  if (!validRanks.includes(square[1])) return false;

  const adjacentFiles = [file.charCodeAt(0) - 1, file.charCodeAt(0) + 1]
    .filter((f) => f >= 97 && f <= 104)
    .map((f) => String.fromCharCode(f));

  const oppositeColor: Color = color === "w" ? "b" : "w";
  const forwardRanks = color === "w" ? [rank + 1, rank + 2, rank + 3] : [rank - 1, rank - 2, rank - 3];

  for (const f of adjacentFiles) {
    for (const r of forwardRanks.filter((x) => x >= 1 && x <= 8)) {
      const piece = game.get(`${f}${r}` as Square);
      if (piece && piece.type === "p" && piece.color === oppositeColor) return false;
    }
  }
  return true;
}

/**
 * Pin detection without using non-public chess.js APIs: for each of our pieces,
 * temporarily check whether moving it would expose our king to check.
 */
function findPinned(game: Chess, color: Color): Map<Square, Square> {
  const pinned = new Map<Square, Square>();
  const oppositeColor: Color = color === "w" ? "b" : "w";

  const myPieces: Array<{ square: Square; type: PieceSymbol }> = [];
  for (const row of game.board()) {
    for (const sq of row) {
      if (sq && sq.color === color && sq.type !== "k") myPieces.push({ square: sq.square as Square, type: sq.type });
    }
  }

  for (const piece of myPieces) {
    const legalMoves = game.moves({ square: piece.square, verbose: true });
    if (legalMoves.length === 0) continue;

    const fenWithoutPiece = removePiece(game.fen(), piece.square);
    if (!fenWithoutPiece) continue;
    const ghost = new Chess(fenWithoutPiece);
    const opponentMoves = ghost.moves({ verbose: true });
    const checkers = opponentMoves
      .filter((m) => m.color === oppositeColor && m.flags.includes("c"))
      .map((m) => m.from as Square);

    for (const checker of checkers) {
      const sliderMoves = game.moves({ square: checker, verbose: true });
      if (sliderMoves.some((m) => m.to === piece.square)) {
        pinned.set(piece.square, checker);
        break;
      }
    }
  }
  return pinned;
}

/**
 * Remove a piece from a FEN string while preserving side-to-move and other
 * fields. Used to test "what would the position look like without this piece?"
 * for pin detection. Returns null if the FEN can't be rewritten.
 */
function removePiece(fen: string, square: Square): string | null {
  const parts = fen.split(" ");
  if (parts.length < 2) return null;
  const board = parts[0];
  const fileIdx = square.charCodeAt(0) - 97;
  const rankIdx = 8 - parseInt(square[1], 10);

  const rows = board.split("/");
  if (rows.length !== 8) return null;
  const row = rows[rankIdx];

  let expanded = "";
  for (const ch of row) {
    if (/\d/.test(ch)) expanded += ".".repeat(parseInt(ch, 10));
    else expanded += ch;
  }
  if (expanded.length !== 8) return null;
  const newRow = expanded.slice(0, fileIdx) + "." + expanded.slice(fileIdx + 1);

  let collapsed = "";
  let runEmpty = 0;
  for (const ch of newRow) {
    if (ch === ".") runEmpty++;
    else {
      if (runEmpty > 0) {
        collapsed += String(runEmpty);
        runEmpty = 0;
      }
      collapsed += ch;
    }
  }
  if (runEmpty > 0) collapsed += String(runEmpty);

  rows[rankIdx] = collapsed;
  parts[0] = rows.join("/");
  return parts.join(" ");
}

export function classifyPieceRoles(fen: string): PieceRoleMap {
  const game = new Chess(fen);
  const result: PieceRoleMap = {};
  const board = game.board();

  const pinnedWhite = findPinned(game, "w");
  const pinnedBlack = findPinned(game, "b");

  for (const row of board) {
    for (const piece of row) {
      if (!piece) continue;
      const sq = piece.square as Square;
      const entry: PieceRoleEntry = {
        square: sq,
        piece: piece.type,
        color: piece.color,
        roles: [],
        detail: {},
      };

      const ownPieces = new Set<Square>();
      for (const r of board) for (const s of r) if (s && s.color === piece.color) ownPieces.add(s.square as Square);

      let attackTargets: Square[];
      if (piece.type === "p") {
        attackTargets = pawnAttackSquares(sq, piece.color);
      } else {
        attackTargets = rawAttackSquares(game, sq, piece.type);
      }

      const attacking: Square[] = [];
      const defending: Square[] = [];
      for (const target of attackTargets) {
        if (ownPieces.has(target)) defending.push(target);
        else if (game.get(target)) attacking.push(target);
      }

      if (attacking.length > 0) {
        entry.roles.push("attacker");
        entry.detail.attacking = attacking;
      }
      if (defending.length > 0) {
        entry.roles.push("defender");
        entry.detail.defending = defending;
      }
      if (defending.length + attacking.length >= 3) entry.roles.push("overworked");

      const pinSet = piece.color === "w" ? pinnedWhite : pinnedBlack;
      if (pinSet.has(sq)) {
        entry.roles.push("pinned");
        entry.detail.pinnedBy = pinSet.get(sq);
      }
      const oppositePinSet = piece.color === "w" ? pinnedBlack : pinnedWhite;
      let pins = false;
      oppositePinSet.forEach((pinner) => {
        if (pinner === sq) pins = true;
      });
      if (pins) entry.roles.push("pinning");

      if (piece.type === "n" && isOutpostSquare(game, sq, piece.color)) entry.roles.push("outpost");

      if (piece.type === "b") {
        const isLightSquare = (sq.charCodeAt(0) + parseInt(sq[1], 10)) % 2 === 1;
        let blockedPawns = 0;
        for (const r of board) for (const s of r) {
          if (!s || s.type !== "p" || s.color !== piece.color) continue;
          const pawnSq = s.square;
          const pawnIsLight = (pawnSq.charCodeAt(0) + parseInt(pawnSq[1], 10)) % 2 === 1;
          if (pawnIsLight === isLightSquare) blockedPawns++;
        }
        if (blockedPawns >= 4) entry.roles.push("bad-bishop");
      }

      result[sq] = entry;
    }
  }
  return result;
}

export function diffPieceRoles(before: PieceRoleMap, after: PieceRoleMap): RoleChange[] {
  const changes: RoleChange[] = [];
  const allSquares = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

  for (const sq of allSquares) {
    const b = before[sq];
    const a = after[sq];

    if (a && !b) {
      changes.push({ square: a.square, piece: a.piece, color: a.color, gained: a.roles, lost: [] });
      continue;
    }
    if (b && !a) {
      changes.push({ square: b.square, piece: b.piece, color: b.color, gained: [], lost: b.roles });
      continue;
    }
    if (!a || !b) continue;
    if (a.piece !== b.piece || a.color !== b.color) {
      changes.push({ square: a.square, piece: a.piece, color: a.color, gained: a.roles, lost: b.roles });
      continue;
    }
    const gained = a.roles.filter((r) => !b.roles.includes(r));
    const lost = b.roles.filter((r) => !a.roles.includes(r));
    if (gained.length || lost.length) {
      changes.push({ square: a.square, piece: a.piece, color: a.color, gained, lost });
    }
  }
  return changes;
}
