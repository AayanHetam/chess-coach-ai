import { Chess, type Square, type Color } from "chess.js";
import { squareToCoord, coordToSquare, pieceValue, rayLabel } from "../utils";
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
