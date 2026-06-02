import { Chess, type Square, type Color } from "chess.js";
import { attackersOf, pieceValue, see } from "./utils";
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

function confirmPin(
  gameAfter: Chess,
  motif: PinMotif,
  movingColor: Color,
): { confirmed: boolean; refutation: Refutation | null } {
  // Absolute pins: the pinned piece literally cannot legally move → always confirmed
  if (motif.kind === "absolute") return { confirmed: true, refutation: null };

  // Relative pins: the pinned piece CAN move but exposes a higher-value piece
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
