import { Chess, type Square, type Color } from "chess.js";
import { detectFork } from "./motifs/fork";
import { detectPinsAfterMove } from "./motifs/pin";
import { detectSkewers } from "./motifs/skewer";
import { detectDiscoveredAttacks } from "./motifs/discovered_attack";
import { detectRemovedDefenders } from "./motifs/removed_defender";
import { detectHangingPieces } from "./motifs/hanging_piece";
import { detectTrappedPieces } from "./motifs/trapped_piece";
import { detectBackRankMate } from "./motifs/back_rank_mate";
import { applyEscapability } from "./escapability";
import type { AnyMotif, PinMotif } from "./types";

export type { AnyMotif } from "./types";
export type {
  ForkMotif, PinMotif, SkewerMotif, DiscoveredAttackMotif,
  RemovedDefenderMotif, HangingPieceMotif, TrappedPieceMotif,
  BackRankMateMotif, Refutation,
} from "./types";

/**
 * Main entry point for the tactical motif detector.
 *
 * Given a FEN before the move and the SAN of the move played, returns all
 * detected tactical motifs with `confirmed: boolean` set via a 2-ply
 * forcing-move search. The LLM should only narrate `confirmed: true` motifs
 * directly; `confirmed: false` motifs require citing the refutation or staying silent.
 *
 * Runs in O(pieces × legal_moves) — well under 50ms per call in any realistic position.
 */
export function detectMotifs(fenBefore: string, moveSan: string): AnyMotif[] {
  let gameBefore: Chess;
  let moveObj: ReturnType<Chess["move"]>;
  try {
    gameBefore = new Chess(fenBefore);
    moveObj = gameBefore.move(moveSan); // throws on invalid SAN in chess.js v1+
    if (!moveObj) return [];
  } catch {
    return [];
  }

  const gameAfter = gameBefore; // gameBefore has been mutated by .move()
  const fenAfter = gameAfter.fen();
  const movingColor: Color = moveObj.color;
  const opponentColor: Color = movingColor === "w" ? "b" : "w";
  const movedTo = moveObj.to as Square;
  const movedFrom = moveObj.from as Square;
  const capturedSq: Square | null = moveObj.captured ? (moveObj.to as Square) : null;

  // Reconstruct gameBefore for detectors that need pre-move state
  const gameBeforeClean = new Chess(fenBefore);

  const motifs: AnyMotif[] = [];

  try {
    // 1. Fork
    const fork = detectFork(gameAfter, movedTo, movingColor);
    if (fork) motifs.push(fork);

    // 2 & 3. Pin and Skewer — scan ALL our sliders post-move (a mover can open
    // a ray for a slider that never moved), and say which pins THIS MOVE
    // created. 63.7% of the pins this list carried on Lichess solutions
    // already existed before the move (scripts/eval/motif_detector_recall.ts);
    // they stay in the list (a pinned knight that cannot recapture is often
    // the whole point of the move), tagged so "Bg5 pins the knight" is only
    // ever written about the move that pinned it.
    const pinsBefore = new Set(
      detectPinsAfterMove(gameBeforeClean, movingColor).map(pinKey),
    );
    const pins = detectPinsAfterMove(gameAfter, movingColor).map((p) => ({
      ...p,
      createdByMove: !pinsBefore.has(pinKey(p)),
    }));
    motifs.push(...pins);

    const skewers = detectSkewers(gameAfter, movedTo, movingColor);
    motifs.push(...skewers);

    // 4. Discovered attack (needs both pre- and post-move state + origin square)
    const discovered = detectDiscoveredAttacks(
      gameBeforeClean, gameAfter, movedFrom, movedTo, movingColor,
    );
    motifs.push(...discovered);

    // 5. Removed defender (capture only in v1)
    if (moveObj.captured) {
      const removed = detectRemovedDefenders(
        gameBeforeClean, gameAfter, capturedSq, movingColor,
      );
      motifs.push(...removed);
    }

    // 6. Hanging pieces
    const hanging = detectHangingPieces(gameAfter, movingColor);
    motifs.push(...hanging);

    // 7. Trapped pieces
    const trapped = detectTrappedPieces(gameAfter, movingColor);
    motifs.push(...trapped);

    // 8. Back rank mate / threat
    const backRank = detectBackRankMate(gameAfter, movingColor);
    if (backRank) motifs.push(backRank);
  } catch {
    // Non-critical: return whatever we collected
  }

  // Apply escapability confirmation (mutates motifs in place)
  try {
    applyEscapability(gameAfter, motifs, movingColor);
  } catch {
    // Keep whatever confirmed state was set during detection
  }

  // Deduplicate: if a hanging piece is also a fork target, prefer fork
  return deduplicateMotifs(motifs);
}

function pinKey(p: PinMotif): string {
  return `${p.pinner.square}:${p.pinned.square}:${p.behind.square}`;
}

// Prevents the same tactical benefit from being reported twice under different
// motif labels: a fork target or a trapped piece is by construction also
// "hanging", and the fork / trap is the explanation worth teaching.
function deduplicateMotifs(motifs: AnyMotif[]): AnyMotif[] {
  const explained = new Set<Square>();
  for (const m of motifs) {
    if (m.motif === "fork") {
      for (const t of m.targets) explained.add(t.square);
    } else if (m.motif === "trapped_piece") {
      explained.add(m.square);
    }
  }
  return motifs.filter((m) => {
    if (m.motif === "hanging_piece" && explained.has(m.square)) return false;
    return true;
  });
}

/**
 * Serialize motifs to the prompt context block injected before LLM narration.
 * Format: pretty-printed JSON that the LLM can read and is told to treat as
 * the only source of tactical truth.
 */
export function motifsToPropmt(motifs: AnyMotif[]): string {
  if (motifs.length === 0) return "[]";
  return JSON.stringify(motifs, null, 2);
}

/**
 * Set of tactical keywords the LLM is forbidden from using when motifs are empty
 * or all motifs are unconfirmed. Used by motifGroundingValidator.
 */
export const TACTICAL_CLAIM_KEYWORDS = [
  "fork", "pin", "skewer", "discovered", "removes the defender",
  "hanging", "trapped", "back rank", "back-rank", "mate threat",
  "double attack", "fork",
] as const;
