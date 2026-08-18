import { Chess, type Square, type Color } from "chess.js";
import { attackersOf, pieceValue, see, squareToCoord, coordToSquare, pawnAttackSquares, rawAttacks } from "./utils";
import type { AnyMotif, ForkMotif, PinMotif, SkewerMotif, DiscoveredAttackMotif, RemovedDefenderMotif, Refutation } from "./types";

// 2-ply forcing-move search: can the opponent immediately refute the tactic?
// "Forcing moves" = captures of the motif piece, checks, promotions.
// Returns { confirmed, refutation } for a given motif.

function opponentCanCaptureForFree(
  gameAfter: Chess,
  targetSq: Square,
  opponentColor: Color,
  movingColor: Color,
): { refuted: boolean; byMove: string } {
  const atks = attackersOf(gameAfter, targetSq, opponentColor);
  for (const atk of atks) {
    const netSee = see(gameAfter, targetSq, opponentColor);
    if (netSee > 0) {
      return { refuted: true, byMove: `${atk.square}x${targetSq}` };
    }
  }
  return { refuted: false, byMove: "" };
}

function confirmFork(
  gameAfter: Chess,
  motif: ForkMotif,
  movingColor: Color,
): { confirmed: boolean; refutation: Refutation | null } {
  const opponentColor: Color = movingColor === "w" ? "b" : "w";

  // Refuted if forking piece can be captured for free
  const { refuted, byMove } = opponentCanCaptureForFree(
    gameAfter, motif.by_square, opponentColor, movingColor,
  );
  if (refuted) {
    return { confirmed: false, refutation: { move: byMove, refuted_by: "recapture" } };
  }

  // If forker is not hanging, check if both targets can escape
  // (At least one must be un-saveable for the fork to be confirmed)
  let atLeastOneTrapped = false;
  for (const target of motif.targets) {
    const targetPiece = gameAfter.get(target.square);
    if (!targetPiece) continue;
    // Try each legal move for the target piece; if none lead to safety, it's trapped
    const legalEscapes = gameAfter.moves({ square: target.square as import("chess.js").Square, verbose: true });
    let canEscape = false;
    for (const escape of legalEscapes) {
      // After escaping, is the OTHER target still hit?
      const tempGame = new Chess(gameAfter.fen());
      try {
        tempGame.move(escape);
        const otherTarget = motif.targets.find((t) => t.square !== target.square);
        if (otherTarget) {
          const otherStillAttacked = tempGame.isAttacked(
            otherTarget.square,
            movingColor as import("chess.js").Color,
          );
          if (otherStillAttacked) {
            canEscape = true; // can save self but fork still wins other target
            atLeastOneTrapped = true;
            break;
          }
        }
      } catch { /* skip invalid moves */ }
    }
    if (!canEscape) {
      atLeastOneTrapped = true;
    }
  }

  return { confirmed: atLeastOneTrapped, refutation: null };
}

// Is `s` on the infinite line through `a` and `b`? `a` and `b` are known to sit
// on a common rank, file or diagonal, so a zero cross-product against that
// direction is an exact collinearity test.
function isOnLineThrough(a: Square, b: Square, s: Square): boolean {
  const [ax, ay] = squareToCoord(a);
  const [bx, by] = squareToCoord(b);
  const [sx, sy] = squareToCoord(s);
  const dx = Math.sign(bx - ax);
  const dy = Math.sign(by - ay);
  return (sx - ax) * dy === (sy - ay) * dx;
}

// Every square the piece on `from` could move to by its movement pattern in
// this position, respecting blockers but IGNORING king safety. Pseudo-legal on
// purpose — see relativePinBinds.
function pseudoLegalDestinations(game: Chess, from: Square): Square[] {
  const piece = game.get(from);
  if (!piece) return [];

  if (piece.type === "p") {
    const [fx, fy] = squareToCoord(from);
    const dir = piece.color === "w" ? 1 : -1;
    const out: Square[] = [];
    const one = coordToSquare(fx, fy + dir);
    if (one && !game.get(one)) {
      out.push(one);
      const startRank = piece.color === "w" ? 1 : 6;
      const two = coordToSquare(fx, fy + 2 * dir);
      if (fy === startRank && two && !game.get(two)) out.push(two);
    }
    const ep = game.fen().split(" ")[3];
    for (const sq of pawnAttackSquares(from, piece.color)) {
      const occupant = game.get(sq);
      if ((occupant && occupant.color !== piece.color) || sq === ep) out.push(sq);
    }
    return out;
  }

  // For every other piece, the squares it attacks are the squares it moves to,
  // minus those already holding a friend.
  return rawAttacks(game, from).filter((sq) => game.get(sq)?.color !== piece.color);
}

/**
 * Does a relative pin actually bind?
 *
 * A relative pin is a constraint, not a shape: it exists only if moving the
 * pinned piece would expose the dearer piece behind it. Geometry alone is not
 * enough — a pawn stacked between an enemy queen and its own rook on the same
 * file is not pinned, because every pawn push stays on the file and keeps
 * blocking. That single class accounted for most of the false pins the coach
 * was narrating.
 *
 * Detection already guarantees the ray is clear from pinner to pinned and from
 * pinned to behind, so ANY destination off that line exposes the piece behind.
 * The test is therefore: can the pinned piece reach a square off the line?
 *
 * Reachability is deliberately PSEUDO-legal. Whether the pinned side happens to
 * be in check right now is a fact about the position, not about the pin, and
 * motifs are scanned on turn-flipped FENs where a check can be an artifact of
 * the flip. Judging the pin on legal moves let an unrelated check erase a real
 * pin (Bg4 pinning Nf3 to Qd1 is a pin whether or not White is in check).
 */
function relativePinBinds(gameAfter: Chess, motif: PinMotif): boolean {
  return pseudoLegalDestinations(gameAfter, motif.pinned.square).some(
    (dest) => !isOnLineThrough(motif.pinner.square, motif.behind.square, dest),
  );
}

function confirmPin(
  gameAfter: Chess,
  motif: PinMotif,
  movingColor: Color,
): { confirmed: boolean; refutation: Refutation | null } {
  // Absolute pins: the pinned piece literally cannot legally move → always confirmed
  if (motif.kind === "absolute") return { confirmed: true, refutation: null };

  // Relative pins: only real if moving the pinned piece would actually expose
  // the piece behind. A phantom pin is not "refuted" — it never existed — so
  // it carries no refutation, it simply goes unconfirmed.
  if (!relativePinBinds(gameAfter, motif)) {
    return { confirmed: false, refutation: null };
  }

  // Refuted if the pinned piece can ALSO check or capture the pinner
  const opponentColor: Color = movingColor === "w" ? "b" : "w";
  const { refuted, byMove } = opponentCanCaptureForFree(
    gameAfter, motif.pinner.square, opponentColor, movingColor,
  );
  if (refuted) {
    return { confirmed: false, refutation: { move: byMove, refuted_by: "recapture" } };
  }
  return { confirmed: true, refutation: null };
}

function confirmSkewer(
  gameAfter: Chess,
  motif: SkewerMotif,
  movingColor: Color,
): { confirmed: boolean; refutation: Refutation | null } {
  const opponentColor: Color = movingColor === "w" ? "b" : "w";
  // Skewer is confirmed if front piece has no good square to move to that doesn't lose the back piece
  // Simplified: confirmed if the skewerer isn't immediately capturable for free
  const { refuted, byMove } = opponentCanCaptureForFree(
    gameAfter, motif.skewerer.square, opponentColor, movingColor,
  );
  if (refuted) {
    return { confirmed: false, refutation: { move: byMove, refuted_by: "recapture" } };
  }
  return { confirmed: true, refutation: null };
}

function confirmDiscoveredAttack(
  gameAfter: Chess,
  motif: DiscoveredAttackMotif,
  movingColor: Color,
): { confirmed: boolean; refutation: Refutation | null } {
  const opponentColor: Color = movingColor === "w" ? "b" : "w";
  // Confirmed if the victim is actually winning to capture (SEE ≥ 0)
  const seeValue = see(gameAfter, motif.victim.square, movingColor);
  if (seeValue <= 0) {
    return { confirmed: false, refutation: { move: `defend-${motif.victim.square}`, refuted_by: "counter_threat" } };
  }
  // Also: if we're in check (discovered check), even more confirmed
  if (motif.also_check) return { confirmed: true, refutation: null };
  return { confirmed: true, refutation: null };
}

function confirmRemovedDefender(
  gameAfter: Chess,
  motif: RemovedDefenderMotif,
  movingColor: Color,
): { confirmed: boolean; refutation: Refutation | null } {
  // Confirmed if the now-hanging piece is still there and winnable (SEE ≥ 0)
  const stillThere = gameAfter.get(motif.was_defending.square);
  if (!stillThere) return { confirmed: false, refutation: null };
  const seeValue = see(gameAfter, motif.was_defending.square, movingColor);
  if (seeValue <= 0) {
    return { confirmed: false, refutation: { move: `defend-${motif.was_defending.square}`, refuted_by: "counter_threat" } };
  }
  return { confirmed: true, refutation: null };
}

// Apply escapability confirmation to a list of motifs.
// Mutates `confirmed` and `refutation` in place.
export function applyEscapability(
  gameAfter: Chess,
  motifs: AnyMotif[],
  movingColor: Color,
): void {
  for (const motif of motifs) {
    let result: { confirmed: boolean; refutation: Refutation | null };

    switch (motif.motif) {
      case "fork":
        result = confirmFork(gameAfter, motif, movingColor);
        break;
      case "pin":
        result = confirmPin(gameAfter, motif, movingColor);
        break;
      case "skewer":
        result = confirmSkewer(gameAfter, motif, movingColor);
        break;
      case "discovered_attack":
        result = confirmDiscoveredAttack(gameAfter, motif, movingColor);
        break;
      case "removed_defender":
        result = confirmRemovedDefender(gameAfter, motif, movingColor);
        break;
      // hanging_piece, trapped_piece, back_rank_mate set their own confirmed during detection
      default:
        continue;
    }

    motif.confirmed = result.confirmed;
    motif.refutation = result.refutation;
  }
}
