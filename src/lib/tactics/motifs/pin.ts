import { Chess, type Square, type Color } from "chess.js";
import { squareToCoord, coordToSquare, pawnAttackSquares, pieceValue, rayLabel } from "../utils";
import type { PinMotif } from "../types";

const SLIDER_DIRS: Record<string, [number, number][]> = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
};

/**
 * Is "<pinned> in front of <behind>" a pin worth the name? A PIECE is pinned
 * to anything dearer than itself. A PAWN is pinned only to its queen — a pawn
 * "pinned" to a knight or rook (Bc4 against f7 with the knight on g8 behind)
 * is geometrically a pin and never something a coach would say; the line
 * story was narrating it as the point of the move.
 */
function relativePinCounts(pinned: import("chess.js").PieceSymbol, behind: import("chess.js").PieceSymbol): boolean {
  if (pinned === "p") return behind === "q";
  return pieceValue(behind) > pieceValue(pinned);
}

// Scan all sliding pieces of `movingColor` and find any that create a pin
// on an enemy piece toward a more valuable enemy piece (or king) on the same ray.
// Focused on the piece that just arrived at `movedTo` (if it's a slider).
export function detectPin(
  gameAfter: Chess,
  movedTo: Square,
  movingColor: Color,
): PinMotif | null {
  const pinner = gameAfter.get(movedTo);
  if (!pinner) return null;
  // Pins only created by sliders
  if (!["b", "r", "q"].includes(pinner.type)) return null;

  const opponentColor: Color = movingColor === "w" ? "b" : "w";
  const dirs = SLIDER_DIRS[pinner.type];
  if (!dirs) return null;

  const [px, py] = squareToCoord(movedTo);

  for (const [dx, dy] of dirs) {
    let x = px + dx, y = py + dy;
    let firstEnemy: { square: Square; piece: import("chess.js").PieceSymbol } | null = null;

    while (x >= 0 && x <= 7 && y >= 0 && y <= 7) {
      const sq = coordToSquare(x, y)!;
      const p = gameAfter.get(sq);
      if (p) {
        if (p.color === movingColor) break; // own piece blocks ray
        if (p.color === opponentColor) {
          if (!firstEnemy) {
            firstEnemy = { square: sq, piece: p.type };
          } else {
            // second enemy piece on the ray
            const behind = { square: sq, piece: p.type };
            const isPinnedAbsolute = p.type === "k";
            const isPinnedRelative =
              !isPinnedAbsolute && relativePinCounts(firstEnemy.piece, p.type);
            if (isPinnedAbsolute || isPinnedRelative) {
              return {
                motif: "pin",
                kind: isPinnedAbsolute ? "absolute" : "relative",
                pinner: { square: movedTo, piece: pinner.type },
                pinned: firstEnemy,
                behind,
                ray: rayLabel(movedTo, sq),
                confirmed: isPinnedAbsolute, // absolute pins are always confirmed; relative = escapability check
                refutation: null,
              };
            }
            break; // not a pin direction
          }
        }
      }
      x += dx; y += dy;
    }
  }

  return null;
}

// Also detect pins created by pawns capturing diagonally (rare but valid).
// E.g., pawn moves to attack square that pins bishop to king on same diagonal.
// Handled by the slider loop above when the pawn is not the pinner; this function
// handles the case where the pawn move itself revealed a slider's pin (use detectDiscoveredAttack instead).

// Scan ALL our sliders (not just the moved piece) to catch pins revealed by a mover clearing a ray.
export function detectPinsAfterMove(
  gameAfter: Chess,
  movingColor: Color,
): PinMotif[] {
  const pins: PinMotif[] = [];
  const opponentColor: Color = movingColor === "w" ? "b" : "w";

  for (const row of gameAfter.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== movingColor) continue;
      if (!["b", "r", "q"].includes(sq.type)) continue;
      const pinnerSq = sq.square as Square;
      const dirs = SLIDER_DIRS[sq.type]!;
      const [px, py] = squareToCoord(pinnerSq);

      for (const [dx, dy] of dirs) {
        let x = px + dx, y = py + dy;
        let firstEnemy: { square: Square; piece: import("chess.js").PieceSymbol } | null = null;

        while (x >= 0 && x <= 7 && y >= 0 && y <= 7) {
          const csq = coordToSquare(x, y)!;
          const p = gameAfter.get(csq);
          if (p) {
            if (p.color === movingColor) break;
            if (!firstEnemy) {
              firstEnemy = { square: csq, piece: p.type };
            } else {
              const behind = { square: csq, piece: p.type };
              const isAbs = p.type === "k";
              const isRel = !isAbs && relativePinCounts(firstEnemy.piece, p.type);
              if (isAbs || isRel) {
                pins.push({
                  motif: "pin",
                  kind: isAbs ? "absolute" : "relative",
                  pinner: { square: pinnerSq, piece: sq.type },
                  pinned: firstEnemy,
                  behind,
                  ray: rayLabel(pinnerSq, csq),
                  confirmed: isAbs,
                  refutation: null,
                });
              }
              break;
            }
          }
          x += dx; y += dy;
        }
      }
    }
  }

  // Deduplicate (same pinner + pinned pair)
  const seen = new Set<string>();
  return pins.filter((p) => {
    const key = `${p.pinner.square}:${p.pinned.square}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
