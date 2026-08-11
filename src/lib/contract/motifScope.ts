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
import type { AnyMotif, ForkMotif } from "@/lib/tactics";
import { detectPinsAfterMove } from "@/lib/tactics/motifs/pin";
import { detectHangingPieces } from "@/lib/tactics/motifs/hanging_piece";
import { detectTrappedPieces, detectImmobilizedPieces } from "@/lib/tactics/motifs/trapped_piece";
import { detectSkewerThreats } from "@/lib/tactics/motifs/skewer";
import { applyEscapability } from "@/lib/tactics/escapability";
import { PIECE_UNITS, netForClaimant, replayPvMaterial } from "@/lib/tactics/netMaterial";

/**
 * ROUND 2 — both-color skewer-THREAT scan (pawn back-pieces; see
 * detectSkewerThreats). Board-inspection only (no move generation), so no
 * turn-flip gymnastics are needed. License pool only.
 */
function detectSkewerThreatsBothColors(fen: string): AnyMotif[] {
  const out: AnyMotif[] = [];
  try {
    const game = new Chess(fen);
    out.push(...detectSkewerThreats(game, "w"), ...detectSkewerThreats(game, "b"));
  } catch {
    // unloadable position — license-only, fail quiet
  }
  return out;
}

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
      // ROUND 2 fix 4a: unattacked-but-immobilized pieces (all flight
      // squares covered — v2 #27 Na8) count as trapped. License-only.
      motifs.push(...detectImmobilizedPieces(game, color));
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
 * ROUND 2 — value-aware fork confirmation (the founder's rule, 2026-08-10;
 * uses the shared net-material helper, netMaterial.ts): a fork the 1-ply SEE
 * escapability refuted by RECAPTURE of the forker is still narratable when
 * the net gain survives losing the forker:
 *
 *   banked-through-the-fork-ply (chess.js replay of the line from its start,
 *   claimant = the fork owner) + conservative harvest (the SECOND-highest
 *   target — the opponent is granted the save of the dearer one) − forker
 *   value  >  0.
 *
 * v2 spans #1/#3 (Nxf7 forking Qd8+Rh8: banked +1 pawn on entry, harvest
 * rook 5, forker 3 → +3 → confirmed) become licensed; round-1's TF class
 * (Ne6 "forking the bishop pair": banked 0, harvest 3, forker 3 → 0 → NOT
 * confirmed) keeps firing. Applied to LICENSE-POOL copies only — the
 * insight's own `motifs` (voter/prompt inputs, CI-1 byte-pinned) are never
 * touched.
 */
function confirmForksByValue(motifs: AnyMotif[], lineStartFen: string, sansThroughPly: string[]): void {
  const forks = motifs.filter(
    (m): m is ForkMotif =>
      m.motif === "fork" && !m.confirmed && m.refutation?.refuted_by === "recapture",
  );
  if (forks.length === 0) return;
  const steps = replayPvMaterial(lineStartFen, sansThroughPly);
  if (steps.length < sansThroughPly.length) return; // unreplayable — leave refuted
  const claimant = steps[steps.length - 1].mover; // the fork-creating ply's mover
  const banked = netForClaimant(steps, claimant, 0, steps.length - 1);
  for (const f of forks) {
    const forkerValue = PIECE_UNITS[f.by_piece] ?? 0;
    const sorted = [...f.targets].sort(
      (a, b) => (PIECE_UNITS[b.piece] ?? 0) - (PIECE_UNITS[a.piece] ?? 0),
    );
    const conservativeHarvest = PIECE_UNITS[sorted[Math.min(1, sorted.length - 1)].piece] ?? 0;
    if (banked + conservativeHarvest - forkerValue > 0) {
      f.confirmed = true; // refutation kept for transparency in the license pool
    }
  }
}

/**
 * The license pool for one insight: static fenAfter scan + detectMotifs over
 * the first 2 plies of each contract PV (SAN lines as the contract carries
 * them) + (ROUND 2) the game's OWN next 2 plies from fenAfter — prose
 * narrating what actually happened next in the game ("Nxf7 with a strong
 * fork", v2 spans #1/#3) references real contract-known tactics the
 * PV-only scope missed. Every step is best-effort: an unreplayable ply just
 * ends that line's contribution.
 */
export function buildMotifLicense(args: {
  fenBefore: string;
  fenAfter: string;
  pvSans: string[][];
  /** The game's actual continuation after fenAfter (moveHistory[ply+1..ply+2]). */
  gameSans?: string[];
}): AnyMotif[] {
  const out: AnyMotif[] = [];
  out.push(...detectStaticMotifs(args.fenAfter));
  out.push(...detectSkewerThreatsBothColors(args.fenAfter)); // round 2 (v2 #34-36 class)
  const walkLine = (startFen: string, sans: string[], maxPlies: number) => {
    let fen = startFen;
    for (let i = 0; i < Math.min(maxPlies, sans.length); i++) {
      const detected = detectMotifs(fen, sans[i]);
      confirmForksByValue(detected, startFen, sans.slice(0, i + 1)); // round 2
      out.push(...detected);
      try {
        const game = new Chess(fen);
        game.move(sans[i]);
        fen = game.fen();
      } catch {
        break;
      }
      // ROUND 2: x-ray/skewer THREATS live in the positions the line reaches
      // (the Bh5 -> Ng6 -> f7 class sits after PV ply 1) — scan them too.
      out.push(...detectSkewerThreatsBothColors(fen));
    }
  };
  for (const pv of args.pvSans) walkLine(args.fenBefore, pv, 2);
  if (args.gameSans && args.gameSans.length > 0) walkLine(args.fenAfter, args.gameSans, 2);
  return out;
}
