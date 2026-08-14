import { Chess } from "chess.js";
import { PIECE_VALUE_CP } from "@/lib/tactics/utils";
import { whiteRelativeToMover } from "./intentFacts";
import { buildPositionFacts, isTemptingReply, isLegalSan, nullMoveFen, didCaptureThreatPiece } from "./positionFacts";
import type { IntentProbe, IntentScore, EngineLine } from "./types";
import type { GameEval, LineEval } from "@/types/eval";

/**
 * Build IntentProbes from the gameEval a review already has.
 *
 * TWO TIERS, because the engine work divides cleanly:
 *
 *   Tier 0 — FREE. gameEval carries depth-16 multi-PV root lines for every ply,
 *     and position i+1 holds the opponent's best reply. That is enough for
 *     mate, material, escape, cost, and — measured on the founder's games — all
 *     34 positions where the opponent had a forced mate that the played move
 *     did not deal with. No extra search at all.
 *
 *   Tier 1 — 1.26s per position. The null move (what would the opponent do with
 *     a free tempo?) cannot be recovered from gameEval; it needs a fresh search
 *     on a flipped FEN. It buys prophylaxis, trap attribution, and the
 *     distinction between a threat we FAILED to stop and one we CREATED.
 *     Running it on every ply of a 40-move game costs ~101s; running it only on
 *     carded positions costs ~3.8s, which is why it is opt-in per ply.
 *
 * ── SIGN CONVENTION ────────────────────────────────────────────────────────
 * gameEval centipawns are WHITE-relative; this module is mover-relative. The
 * conversion is not optional and does not throw when omitted — it silently
 * inverts every comparison for Black. Every score below goes through
 * `whiteRelativeToMover`, and the tests assert a Black-to-move case directly.
 */

/** Engine lines carry a depth-0 sentinel when the client timed out on a position. */
function isTimedOut(lines: LineEval[] | undefined): boolean {
  return !lines || lines.length === 0 || lines[0]?.depth === 0;
}

function toScore(line: LineEval | undefined): IntentScore | null {
  if (!line) return null;
  if (line.cp === undefined && line.mate === undefined) return null;
  return { cp: line.cp ?? null, mate: line.mate ?? null };
}

function uciToSan(fen: string, uci: string | undefined): string | null {
  if (!uci) return null;
  try {
    const g = new Chess(fen);
    const mv = g.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    return mv ? mv.san : null;
  } catch {
    return null;
  }
}

function pvToSan(fen: string, pv: string[] | undefined, max = 8): string[] {
  const out: string[] = [];
  if (!pv) return out;
  try {
    const g = new Chess(fen);
    for (const u of pv.slice(0, max)) {
      const mv = g.move({
        from: u.slice(0, 2),
        to: u.slice(2, 4),
        promotion: u.length > 4 ? u[4] : undefined,
      });
      if (!mv) break;
      out.push(mv.san);
    }
  } catch {
    /* a partial pv is still worth showing */
  }
  return out;
}

/**
 * The null-move measurements for one ply, when a caller has paid for them.
 * Scores are the OPPONENT's, exactly as the engine reports them at the flipped
 * position — no conversion, because there the opponent IS the side to move.
 */
export interface NullMoveProbe {
  threat: EngineLine | null;
  threatAfter: EngineLine | null;
  threatAlternative: EngineLine | null;
  threatStillLegal: boolean;
  threatAfterAlternatives: IntentProbe["threatAfterAlternatives"];
  counterfactualCostCp: number | null;
}

export interface ProbeFromEval {
  ply: number;
  probe: IntentProbe;
  /** True when this ply's engine data was missing or timed out. */
  skipped: boolean;
}

/**
 * Which plies are worth paying Tier 1 for? Callers pass the plies they intend
 * to card; everything else gets Tier 0 only.
 */
export function intentProbesFromGameEval(params: {
  gameEval: GameEval;
  /** SAN move list, one per ply. */
  moves: string[];
  /** Optional Tier 1 data, keyed by ply. */
  nullMoveProbes?: Map<number, NullMoveProbe>;
  /**
   * Where the move list starts. Defaults to the standard initial position,
   * which is right for ordinary games; puzzles and Chess960 do not start there
   * and would otherwise replay onto the wrong board and silently produce
   * nothing.
   */
  startFen?: string;
}): ProbeFromEval[] {
  const { gameEval, moves, nullMoveProbes, startFen } = params;
  const out: ProbeFromEval[] = [];
  const positions = gameEval?.positions ?? [];

  let board: Chess;
  try {
    board = startFen ? new Chess(startFen) : new Chess();
  } catch {
    return out; // an unreadable start position yields no probes, never a guess
  }
  let lastCaptureSquare: string | null = null;
  let lastCaptureValueCp: number | null = null;

  for (let ply = 0; ply < moves.length; ply++) {
    const fenBefore = board.fen();
    // Whose move it is comes from the BOARD, never from ply parity. Parity is
    // right only when the game starts from the initial position; for a puzzle
    // or any Black-to-move start it inverts every score in this function, and
    // nothing throws when it does.
    const mover: "w" | "b" = board.turn();
    const opponent: "w" | "b" = mover === "w" ? "b" : "w";

    let mv;
    try {
      mv = board.move(moves[ply]);
    } catch {
      break; // the move list and the board have diverged; nothing after is trustworthy
    }
    const fenAfter = board.fen();

    const here = positions[ply];
    const next = positions[ply + 1];
    const afterNext = positions[ply + 2];

    // A timed-out position yields no usable score. Emitting a probe anyway
    // would let the module reason from a depth-0 evaluation as if it were a
    // depth-16 one, so the ply is marked skipped instead.
    if (isTimedOut(here?.lines)) {
      out.push({ ply, probe: emptyProbe(fenBefore, mv.san, fenAfter), skipped: true });
      lastCaptureSquare = mv.captured ? mv.to : null;
      lastCaptureValueCp = mv.captured ? (PIECE_VALUE_CP[mv.captured] ?? 0) : null;
      continue;
    }

    const rootLines: EngineLine[] = (here.lines ?? [])
      .map((l) => {
        const san = uciToSan(fenBefore, l.pv?.[0]);
        const score = toScore(l);
        if (!san || !score) return null;
        return {
          san,
          score: whiteRelativeToMover(score, mover),
          pv: pvToSan(fenBefore, l.pv),
          depth: l.depth,
        } satisfies EngineLine;
      })
      .filter((l): l is EngineLine => l !== null);

    // The played move's value IS the evaluation of the position it produced,
    // read from our side. No separate search is needed for it.
    const afterScore = isTimedOut(next?.lines) ? null : toScore(next!.lines[0]);
    const playedScore = afterScore ? whiteRelativeToMover(afterScore, mover) : null;
    // The same number, read from THEIR side, is the baseline a threat has to be
    // measured against.
    const opponentBestAfter = afterScore ? whiteRelativeToMover(afterScore, opponent) : null;

    // What they actually did next, and what the engine wanted them to do.
    let opponentReply: IntentProbe["opponentReply"] = null;
    const replySan = moves[ply + 1];
    if (replySan && afterScore && !isTimedOut(next?.lines)) {
      const bestSan = uciToSan(fenAfter, next!.lines[0]?.pv?.[0]);
      const actualScore = isTimedOut(afterNext?.lines) ? null : toScore(afterNext!.lines[0]);
      const passedFen = nullMoveFen(fenBefore);
      if (bestSan) {
        opponentReply = {
          san: replySan,
          actual: actualScore ? whiteRelativeToMover(actualScore, opponent) : null,
          bestSan,
          best: whiteRelativeToMover(afterScore, opponent),
          tempting: isTemptingReply(fenAfter, replySan),
          replyExistedBefore: passedFen ? isLegalSan(passedFen, replySan) : null,
          counterfactualCostCp: nullMoveProbes?.get(ply)?.counterfactualCostCp ?? null,
        };
      }
    }

    let moverHasPieces = true;
    try {
      moverHasPieces = new Chess(fenBefore)
        .board()
        .flat()
        .some((sq) => sq && sq.color === mover && sq.type !== "p" && sq.type !== "k");
    } catch {
      /* default true: the guard only ever suppresses a claim */
    }

    const t1 = nullMoveProbes?.get(ply);
    const probe: IntentProbe = {
      fenBefore,
      playedSan: mv.san,
      fenAfter,
      rootLines,
      threat: t1?.threat ?? null,
      threatAfter: t1?.threatAfter ?? null,
      threatAlternative: t1?.threatAlternative ?? null,
      threatStillLegal: t1?.threatStillLegal ?? true,
      threatPieceCaptured: t1?.threat
        ? didCaptureThreatPiece(fenBefore, mv.san, t1.threat.san)
        : null,
      opponentBestAfter,
      threatAfterAlternatives: t1?.threatAfterAlternatives ?? [],
      playedScore,
      moverHasPieces,
      position: buildPositionFacts(fenBefore, mv.san, lastCaptureSquare, lastCaptureValueCp),
      opponentReply,
    };

    out.push({ ply, probe, skipped: false });
    lastCaptureSquare = mv.captured ? mv.to : null;
    lastCaptureValueCp = mv.captured ? (PIECE_VALUE_CP[mv.captured] ?? 0) : null;
  }

  return out;
}

/** A probe with nothing measured — every rule declines rather than guesses. */
function emptyProbe(fenBefore: string, playedSan: string, fenAfter: string): IntentProbe {
  return {
    fenBefore,
    playedSan,
    fenAfter,
    rootLines: [],
    threat: null,
    threatAfter: null,
    threatAlternative: null,
    threatStillLegal: true,
    threatPieceCaptured: null,
    opponentBestAfter: null,
    threatAfterAlternatives: [],
    playedScore: null,
    moverHasPieces: true,
    position: null,
    opponentReply: null,
  };
}
