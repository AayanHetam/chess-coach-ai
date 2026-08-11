import { Chess, type Square, type Color } from "chess.js";
import { squareToCoord, coordToSquare, pieceValue, rayLabel, attackersOf, see } from "../utils";
import type { SkewerMotif } from "../types";

const SLIDER_DIRS: Record<string, [number, number][]> = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
};

// Inverse of pin: a high-value enemy piece is in front; a lower-value enemy piece sits behind.
// When the front piece moves away (forced by the attack), the back piece is captured.
export function detectSkewers(
  gameAfter: Chess,
  movedTo: Square,
  movingColor: Color,
): SkewerMotif[] {
  const skewerer = gameAfter.get(movedTo);
  if (!skewerer) return [];
  if (!["b", "r", "q"].includes(skewerer.type)) return [];

  const opponentColor: Color = movingColor === "w" ? "b" : "w";
  const dirs = SLIDER_DIRS[skewerer.type]!;
  const [px, py] = squareToCoord(movedTo);
  const result: SkewerMotif[] = [];

  for (const [dx, dy] of dirs) {
    let x = px + dx, y = py + dy;
    let front: { square: Square; piece: import("chess.js").PieceSymbol } | null = null;

    while (x >= 0 && x <= 7 && y >= 0 && y <= 7) {
      const sq = coordToSquare(x, y)!;
      const p = gameAfter.get(sq);
      if (p) {
        if (p.color === movingColor) break;
        if (!front) {
          // Front piece must be higher value (or king) to be a skewer target
          if (pieceValue(p.type) >= pieceValue(skewerer.type) || p.type === "k") {
            front = { square: sq, piece: p.type };
          } else {
            break; // lower-value piece in front → pin not skewer
          }
        } else {
          // Back piece: must be lower value than front (otherwise it's just a pin)
          if (pieceValue(p.type) < pieceValue(front.piece)) {
            result.push({
              motif: "skewer",
              skewerer: { square: movedTo, piece: skewerer.type },
              front,
              back: { square: sq, piece: p.type },
              ray: rayLabel(movedTo, sq),
              confirmed: false, // set by escapability
              refutation: null,
            });
          }
          break;
        }
      }
      x += dx; y += dy;
    }
  }

  return result;
}

/**
 * ROUND 2 (referee license pool ONLY — never called by detectMotifs, so the
 * voter/prompt inputs and the CI-1 byte-pinned snapshots are untouched):
 * skewer THREATS with PAWN back-pieces, scanned for every slider of
 * `movingColor` in the given position.
 *
 * The shipped detectSkewers requires the FRONT piece to be worth >= the
 * skewerer (or be the king), which misses the adjudicated v2 #34-36 class:
 * Bh5 attacks the g6-knight with the f7-PAWN behind it on the same ray — a
 * verified x-ray ("skewer-like" in the coach's own words) where the front
 * piece (knight 300) is cheaper than the skewerer (bishop 330). The
 * relaxation is deliberately restricted to PAWN back-pieces (the founder's
 * round-2 scope) so this stays a narrow license, and the threat is only
 * emitted when the skewerer is not capturable for free (same SEE guard as
 * escapability).
 */
export function detectSkewerThreats(gameAfter: Chess, movingColor: Color): SkewerMotif[] {
  const opponentColor: Color = movingColor === "w" ? "b" : "w";
  const result: SkewerMotif[] = [];
  for (const row of gameAfter.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== movingColor) continue;
      if (!["b", "r", "q"].includes(sq.type)) continue;
      const from = sq.square as Square;
      // Skewerer must not hang for free (SEE from the opponent's side).
      const atks = attackersOf(gameAfter, from, opponentColor);
      if (atks.length > 0 && see(gameAfter, from, opponentColor) > 0) continue;
      const dirs = SLIDER_DIRS[sq.type]!;
      const [px, py] = squareToCoord(from);
      for (const [dx, dy] of dirs) {
        let x = px + dx,
          y = py + dy;
        let front: { square: Square; piece: import("chess.js").PieceSymbol } | null = null;
        while (x >= 0 && x <= 7 && y >= 0 && y <= 7) {
          const raySq = coordToSquare(x, y)!;
          const p = gameAfter.get(raySq);
          if (p) {
            if (p.color === movingColor) break;
            if (!front) {
              // Threat form: ANY enemy piece may stand in front (the attack
              // still demands a response) — except a pawn (a pawn in front
              // is a plain blocked ray, not an x-ray story).
              if (p.type === "p") break;
              front = { square: raySq, piece: p.type };
            } else {
              // Back piece: PAWN ONLY (founder's round-2 scope).
              if (p.type === "p") {
                result.push({
                  motif: "skewer",
                  skewerer: { square: from, piece: sq.type },
                  front,
                  back: { square: raySq, piece: p.type },
                  ray: rayLabel(from, raySq),
                  confirmed: true, // geometry verified + SEE-guarded; license-only
                  refutation: null,
                });
              }
              break;
            }
          }
          x += dx;
          y += dy;
        }
      }
    }
  }
  return result;
}
