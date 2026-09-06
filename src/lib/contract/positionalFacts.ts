/**
 * Positional board facts — the deterministic half of "why was that a good
 * quiet move?".
 *
 * lineStory.ts narrates forcing chess well (checks, captures, forks, mate
 * threats) and had nothing to say about a quiet move: 8% of solution plies
 * and most positional mistakes read "a quiet move". Coaches do have words for
 * those moves, and most of them are board arithmetic: the rook comes to an
 * open file, the knight lands on an outpost no pawn can ever drive away, the
 * bishop blockades a passed pawn, a piece piles onto a pinned knight, a pawn
 * becomes passed. This module computes those predicates; the story decides
 * when they are worth saying.
 *
 * Pure chess.js board reads, no engine, no judgement about how GOOD any of
 * it is — "on an open file" is a fact, "controls the file" is not.
 */
import type { Chess, Color, PieceSymbol, Square } from "chess.js";
import { rawAttacks, squareToCoord, coordToSquare } from "@/lib/tactics/utils";

const FILES = "abcdefgh";
const CENTRE: Square[] = ["d4", "e4", "d5", "e5"];

export interface PawnMap {
  /** file letter → ranks (1-8) holding a pawn of that colour */
  w: Record<string, number[]>;
  b: Record<string, number[]>;
}

export function pawnMap(game: Chess): PawnMap {
  const m: PawnMap = { w: {}, b: {} };
  for (const row of game.board()) {
    for (const sq of row) {
      if (!sq || sq.type !== "p") continue;
      const file = sq.square[0];
      const rank = Number(sq.square[1]);
      (m[sq.color][file] ??= []).push(rank);
    }
  }
  return m;
}

const adjacentFiles = (file: string): string[] => {
  const i = FILES.indexOf(file);
  return [FILES[i - 1], FILES[i + 1]].filter((f): f is string => !!f);
};

/** No pawn of either colour on the file. */
export function isOpenFile(pm: PawnMap, file: string): boolean {
  return !pm.w[file] && !pm.b[file];
}

/** No pawn of `color` on the file (the file is half-open FOR `color`). */
export function isHalfOpenFileFor(pm: PawnMap, file: string, color: Color): boolean {
  return !pm[color][file] && !isOpenFile(pm, file);
}

/** A pawn of `color` on `square` with no enemy pawn ahead of it on its own or adjacent files. */
export function isPassedPawn(pm: PawnMap, square: Square, color: Color): boolean {
  const file = square[0];
  const rank = Number(square[1]);
  const enemy: Color = color === "w" ? "b" : "w";
  for (const f of [file, ...adjacentFiles(file)]) {
    for (const r of pm[enemy][f] ?? []) {
      if (color === "w" ? r > rank : r < rank) return false;
    }
  }
  return true;
}

/**
 * Can a pawn of `color` on `square` ever be defended by a friendly pawn?
 * "isolated" — no friendly pawn on either adjacent file at all;
 * "backward" — friendly pawns exist on adjacent files but all of them stand
 * ahead of it, so none can ever step up beside it; null — it can be defended.
 * Only meaningful when no friendly pawn defends it RIGHT NOW (caller checks).
 */
export function pawnWeakness(pm: PawnMap, square: Square, color: Color): "isolated" | "backward" | null {
  const file = square[0];
  const rank = Number(square[1]);
  const neighbours = adjacentFiles(file).flatMap((f) => pm[color][f] ?? []);
  if (neighbours.length === 0) return "isolated";
  // A neighbour behind it can step up beside it; a neighbour LEVEL with it
  // supports its advance (c6 beside d6 means ...d5 is on) — either way it is
  // not left behind. Only neighbours strictly ahead leave it backward.
  const canDefend = neighbours.some((r) => (color === "w" ? r <= rank : r >= rank));
  if (canDefend) return null;
  // A pawn still on its home rank is not "backward" — its neighbours simply
  // have not moved yet (every rook and knight pawn would qualify otherwise).
  // The classical backward pawn has been left behind AND cannot advance
  // safely: the square in front of it is covered by an enemy pawn.
  if (rank === (color === "w" ? 2 : 7)) return null;
  const front = squareInFront(square, color);
  if (!front) return null;
  const enemy: Color = color === "w" ? "b" : "w";
  return pawnDefends(pm, front, enemy) ? "backward" : null;
}

/** Squares a pawn of `color` standing on `square` attacks. */
function pawnAttacksFrom(square: Square, color: Color): Square[] {
  const [x, y] = squareToCoord(square);
  const dy = color === "w" ? 1 : -1;
  return [coordToSquare(x - 1, y + dy), coordToSquare(x + 1, y + dy)].filter((s): s is Square => s !== null);
}

/** Is `square` defended by a pawn of `color`? */
export function pawnDefends(pm: PawnMap, square: Square, color: Color): boolean {
  const [x, y] = squareToCoord(square);
  const dy = color === "w" ? -1 : 1; // the defending pawn stands one rank BEHIND
  for (const dx of [-1, 1]) {
    const s = coordToSquare(x + dx, y + dy);
    if (s && (pm[color][s[0]] ?? []).includes(Number(s[1]))) return true;
  }
  return false;
}

/**
 * The classical outpost: a square in the enemy's half (ranks 5-6 for White,
 * 3-4 for Black), defended by a friendly pawn, that no enemy pawn can ever
 * attack — none stands on an adjacent file ahead of it, so none can advance
 * to challenge the piece. A knight on d4 in front of an isolated d5 pawn is
 * a BLOCKADER, not an outpost — coaches keep the words apart, so the 4th
 * rank is out (adversarial review 2026-09-05).
 */
export function isOutpost(pm: PawnMap, square: Square, color: Color): boolean {
  const rank = Number(square[1]);
  if (color === "w" ? rank < 5 || rank > 6 : rank < 3 || rank > 4) return false;
  if (!pawnDefends(pm, square, color)) return false;
  const enemy: Color = color === "w" ? "b" : "w";
  for (const f of adjacentFiles(square[0])) {
    for (const r of pm[enemy][f] ?? []) {
      // An enemy pawn ahead of the square (from its own point of view) can advance to attack it.
      if (color === "w" ? r > rank : r < rank) return false;
    }
  }
  return true;
}

/** The square directly in front of a pawn of `color` (where a blockader sits). */
export function squareInFront(square: Square, color: Color): Square | null {
  const [x, y] = squareToCoord(square);
  return coordToSquare(x, y + (color === "w" ? 1 : -1));
}

/**
 * A friendly rook or queen on the same file or rank as `square` with only
 * empty squares between — the piece on `square` has just formed a battery.
 */
export function batteryPartner(game: Chess, square: Square, color: Color): { square: Square; piece: PieceSymbol; line: string } | null {
  const [x, y] = squareToCoord(square);
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as Array<[number, number]>) {
    let cx = x + dx, cy = y + dy;
    while (cx >= 0 && cx <= 7 && cy >= 0 && cy <= 7) {
      const s = coordToSquare(cx, cy)!;
      const p = game.get(s);
      if (p) {
        if (p.color === color && (p.type === "r" || p.type === "q")) {
          return { square: s, piece: p.type, line: dx === 0 ? `${square[0]}-file` : `${ordinal(y + 1)} rank` };
        }
        break;
      }
      cx += dx; cy += dy;
    }
  }
  return null;
}

function ordinal(n: number): string {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

/**
 * Is the piece on `square` pinned — unable to move without exposing its king
 * (absolute) or a dearer piece (relative) to an enemy slider on the far side?
 * Returns what it is pinned against.
 */
export function pinnedAgainst(game: Chess, square: Square, valueCp: (p: PieceSymbol) => number): { square: Square; piece: PieceSymbol } | null {
  const piece = game.get(square);
  if (!piece || piece.type === "k") return null;
  const enemy: Color = piece.color === "w" ? "b" : "w";
  const [x, y] = squareToCoord(square);
  for (const row of game.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== enemy || !["b", "r", "q"].includes(sq.type)) continue;
      const from = sq.square as Square;
      if (!rawAttacks(game, from).includes(square)) continue;
      const [sx, sy] = squareToCoord(from);
      const dx = Math.sign(x - sx), dy = Math.sign(y - sy);
      if (sq.type === "b" && (dx === 0 || dy === 0)) continue;
      if (sq.type === "r" && dx !== 0 && dy !== 0) continue;
      // A pawn "pinned" along its own file can still do everything it does
      // — advance — so no coach calls it pinned (Qd2 vs ...d6 with the queen
      // on d8 behind it is a battery, not a pin).
      if (piece.type === "p" && dx === 0) continue;
      let cx = x + dx, cy = y + dy;
      while (cx >= 0 && cx <= 7 && cy >= 0 && cy <= 7) {
        const s = coordToSquare(cx, cy)!;
        const behind = game.get(s);
        if (behind) {
          // Same rule as the pin detector: a PIECE is pinned to anything dearer;
          // a PAWN only to its king or queen (Bc4 "pinning" f7 to the g8 knight
          // is geometry, not chess).
          const counts = behind.color === piece.color && (
            behind.type === "k" ||
            (piece.type === "p" ? behind.type === "q" : valueCp(behind.type) > valueCp(piece.type))
          );
          if (counts) return { square: s, piece: behind.type };
          break;
        }
        cx += dx; cy += dy;
      }
    }
  }
  return null;
}

/** Chebyshev distance from `square` to the nearest centre square. */
export function distanceToCentre(square: Square): number {
  const [x, y] = squareToCoord(square);
  return Math.min(...CENTRE.map((c) => { const [cx, cy] = squareToCoord(c); return Math.max(Math.abs(cx - x), Math.abs(cy - y)); }));
}

/** No queens, and neither side has more than two pieces besides king and pawns. */
export function isEndgame(game: Chess): boolean {
  let q = 0; const pieces = { w: 0, b: 0 };
  for (const row of game.board()) for (const sq of row) {
    if (!sq) continue;
    if (sq.type === "q") q++;
    else if (sq.type !== "k" && sq.type !== "p") pieces[sq.color]++;
  }
  return q === 0 && pieces.w <= 2 && pieces.b <= 2;
}

export const CENTRE_SQUARES = CENTRE;
export { pawnAttacksFrom };
