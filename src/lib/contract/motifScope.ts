/**
 * PRECISION PACK fix 4 — motif scope extension (the builder.ts scope gap).
 *
 * detectMotifs(fenBefore, playedSan) only sees tactics FROM THE MOVER'S
 * PERSPECTIVE in the position after the played move. The 30-game FP
 * adjudication showed real board tactics falling outside that scope and
 * getting flagged as fabrications by the tactical-keyword check:
 *   - #1/#3/#6: a REAL absolute pin (Bc4 pins the d5-knight to the king that
 *     just stepped to e6) — created by the OPPONENT's geometry, invisible to
 *     a mover-perspective scan;
 *   - #16/#22: pieces/kings genuinely trapped in a position reached by a
 *     contract PV, not by the played move;
 *   - #11/#12: fork threats living inside the engine line.
 *
 * buildMotifLicense() widens detection to:
 *   1. a STATIC both-color scan of fenAfter (pins / hanging / trapped —
 *      the position-level motifs that don't need a triggering move), and
 *   2. detectMotifs over the FIRST 2 PLIES of each contract PV.
 *
 * The result feeds InsightContract.motifLicense — a referee LICENSE POOL
 * only. It is never rendered, never serialized to the verbalizer, and never
 * touches the voter, so the CI-1 byte-equality snapshots and the CI-4
 * verbalizer prompt are unchanged by construction.
 */
import { Chess, type Color } from "chess.js";
import { detectMotifs } from "@/lib/tactics";
import type { AnyMotif } from "@/lib/tactics";
import { detectPinsAfterMove } from "@/lib/tactics/motifs/pin";
import { detectHangingPieces } from "@/lib/tactics/motifs/hanging_piece";
import { detectTrappedPieces } from "@/lib/tactics/motifs/trapped_piece";
import { applyEscapability } from "@/lib/tactics/escapability";

/**
 * Position-level motifs of `fen`, scanned from BOTH colors' perspectives.
 * The sub-detectors follow the detectMotifs convention: "movingColor" is the
 * side whose tactics we're scanning, and the trapped-piece detector needs the
 * OPPONENT to be on move (it generates the victim's escape moves), so each
 * perspective runs on a turn-adjusted FEN. Turn-flipped positions that
 * chess.js rejects (e.g. the flipped side could capture the king) skip that
 * perspective — license-only, fail quiet.
 */
export function detectStaticMotifs(fen: string): AnyMotif[] {
  const out: AnyMotif[] = [];
  for (const color of ["w", "b"] as Color[]) {
    const opponent: Color = color === "w" ? "b" : "w";
    try {
      const parts = fen.split(" ");
      if (parts[1] !== opponent) {
        parts[1] = opponent;
        parts[3] = "-"; // en passant is stale after a turn flip
      }
      const game = new Chess(parts.join(" "));
      const motifs: AnyMotif[] = [];
      motifs.push(...detectPinsAfterMove(game, color));
      motifs.push(...detectHangingPieces(game, color));
      motifs.push(...detectTrappedPieces(game, color));
      try {
        applyEscapability(game, motifs, color);
      } catch {
        // keep whatever confirmed state detection set
      }
      out.push(...motifs);
    } catch {
      // illegal turn-flipped position — skip this perspective
    }
  }
  return out;
}

/**
 * The license pool for one insight: static fenAfter scan + detectMotifs over
 * the first 2 plies of each contract PV (SAN lines as the contract carries
 * them). Every step is best-effort: an unreplayable PV ply just ends that
 * line's contribution.
 */
export function buildMotifLicense(args: {
  fenBefore: string;
  fenAfter: string;
  pvSans: string[][];
}): AnyMotif[] {
  const out: AnyMotif[] = [];
  out.push(...detectStaticMotifs(args.fenAfter));
  for (const pv of args.pvSans) {
    let fen = args.fenBefore;
    for (let i = 0; i < Math.min(2, pv.length); i++) {
      out.push(...detectMotifs(fen, pv[i]));
      try {
        const game = new Chess(fen);
        game.move(pv[i]);
        fen = game.fen();
      } catch {
        break;
      }
    }
  }
  return out;
}
