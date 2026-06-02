import { Chess, type Square, type Color } from "chess.js";
import { squareToCoord, coordToSquare, pieceValue, onSameRay, rayStep } from "../utils";
import type { DiscoveredAttackMotif } from "../types";

const SLIDER_DIRS: Record<string, [number, number][]> = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
};

// Was the moved piece (from → to) blocking an attack by a friendly slider on `revealerSq`?
// Returns the enemy piece now exposed, if any.
function findRevealedVictim(
  gameAfter: Chess,
  from: Square,
  revealerSq: Square,
  movingColor: Color,
): { square: Square; piece: import("chess.js").PieceSymbol } | null {
  const revealer = gameAfter.get(revealerSq);
  if (!revealer || revealer.color !== movingColor) return null;
  if (!["b", "r", "q"].includes(revealer.type)) return null;

  const opponentColor: Color = movingColor === "w" ? "b" : "w";
  const dirs = SLIDER_DIRS[revealer.type]!;
  const [rx, ry] = squareToCoord(revealerSq);

  for (const [dx, dy] of dirs) {
    let x = rx + dx, y = ry + dy;
    let hitFrom = false;

    while (x >= 0 && x <= 7 && y >= 0 && y <= 7) {
      const sq = coordToSquare(x, y)!;
      if (sq === from) {
        hitFrom = true;
        // Continue past the vacated square
        x += dx; y += dy;
        continue;
      }
      const p = gameAfter.get(sq);
      if (p) {
        if (hitFrom && p.color === opponentColor && pieceValue(p.type) >= 100) {
          return { square: sq, piece: p.type };
        }
        break;
      }
      x += dx; y += dy;
    }
  }
  return null;
}

export function detectDiscoveredAttacks(
  gameBefore: Chess,
  gameAfter: Chess,
  from: Square,
  to: Square,
  movingColor: Color,
): DiscoveredAttackMotif[] {
  const moverAfter = gameAfter.get(to);
  if (!moverAfter) return [];

  const opponentColor: Color = movingColor === "w" ? "b" : "w";
  const results: DiscoveredAttackMotif[] = [];

  // Scan all our sliders (in the AFTER position) and check if `from` was on their ray
  for (const row of gameAfter.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== movingColor || sq.square === to) continue;
      if (!["b", "r", "q"].includes(sq.type)) continue;
      const revealerSq = sq.square as Square;

      // Check if the mover's origin (`from`) was blocking this slider
      if (!onSameRay(revealerSq, from as Square)) continue;
      const step = rayStep(revealerSq, from as Square);
      if (!step) continue;

      // The victim must be further along the same ray past `from` in the AFTER position
      const victim = findRevealedVictim(gameAfter, from, revealerSq, movingColor);
      if (!victim) continue;

      const also_check = gameAfter.inCheck();

      // Double-attack: the mover itself may also attack a separate target
      let double_attack_target: { square: Square; piece: import("chess.js").PieceSymbol } | null = null;
      const moverPiece = moverAfter;
      if (gameAfter.isAttacked(victim.square, movingColor)) {
        // The revealer hits the victim; check if mover also independently attacks something
        for (const row2 of gameAfter.board()) {
          for (const s2 of row2) {
            if (!s2 || s2.color !== opponentColor || s2.square === victim.square) continue;
            if (gameAfter.isAttacked(s2.square as Square, movingColor)) {
              double_attack_target = { square: s2.square as Square, piece: s2.type };
              break;
            }
          }
          if (double_attack_target) break;
        }
      }

      results.push({
        motif: "discovered_attack",
        mover: { from, to, piece: moverAfter.type },
        revealer: { square: revealerSq, piece: sq.type },
        victim,
        also_check,
        double_attack_target,
        confirmed: false,
        refutation: null,
      });
    }
  }

  return results;
}
