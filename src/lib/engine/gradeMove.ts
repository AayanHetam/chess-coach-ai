/**
 * Grade one move against another from ONE search (pathway 3.5).
 *
 * The review grades a move by the win percentage it gave up between two
 * positions on a warm table. Here both moves come from the same search
 * (`evaluateMoves`: one `searchmoves` search, one depth, a cold table), so
 * their difference means something, and the loss is read with the review's
 * own bands (winBands.ts) so a grade here and a card there cannot drift.
 * The compare (compareVerdict.ts) is the first caller, and the quiz and
 * sparring reuse it.
 *
 * Scores arrive White-relative, the convention every LineEval uses, and
 * are turned to the mover's side here: a Black move that leaves White at
 * +1.00 is a loss for Black.
 *
 * Pure and client-safe: the win-percentage curve, the bands and the enums,
 * never moveClassification.ts and the opening book it imports.
 */
import { MoveClassification } from "@/types/enums";
import { getLineWinPercentage } from "./helpers/winPercentage";
import { classifyWinLoss } from "./helpers/winBands";

export type GradeBand =
  | MoveClassification.Best
  | MoveClassification.Excellent
  | MoveClassification.Good
  | MoveClassification.Inaccuracy
  | MoveClassification.Mistake
  | MoveClassification.Blunder;

/** One move as a search scored it, White-relative. */
export interface ScoredMove {
  uci: string;
  cp?: number;
  mate?: number;
  depth: number;
}

/** The moves ONE search scored from `fen`. Never moves from two searches. */
export interface OneSearch {
  fen: string;
  moves: readonly ScoredMove[];
}

export interface MoveGrade {
  uci: string;
  /** The move it is graded against. */
  reference: string;
  mover: "w" | "b";
  /** The mover's win percentage after the move, 0 to 100. */
  win: number;
  referenceWin: number;
  /** Win-percentage points the move gives up against the reference, never below 0. */
  lossPts: number;
  band: GradeBand;
  /** Mover-relative: positive when the mover mates, negative when mated. */
  mate: number | null;
  referenceMate: number | null;
  /** The shallower of the two moves' depths. */
  depth: number;
}

/** The side to move in `fen`, or null when its side field is not "w" or "b". */
export function sideToMove(fen: string): "w" | "b" | null {
  const side = typeof fen === "string" ? fen.trim().split(/\s+/)[1] : "";
  return side === "w" || side === "b" ? side : null;
}

/** A move's score: a mate other than 0 first, else a finite cp, or null when it has neither. */
function scoreOf(m: ScoredMove): { cp: number } | { mate: number } | null {
  if (typeof m.mate === "number" && Number.isFinite(m.mate) && m.mate !== 0)
    return { mate: m.mate };
  if (typeof m.cp === "number" && Number.isFinite(m.cp)) return { cp: m.cp };
  return null;
}

/** White's win percentage after the move, or null when it is not scored. */
function whiteWin(m: ScoredMove): number | null {
  const s = scoreOf(m);
  return s
    ? getLineWinPercentage({ pv: [], depth: 0, multiPv: 1, ...s })
    : null;
}

/** The mover's win percentage after the move, 0 to 100, or null when it is not scored. */
export function moverWin(m: ScoredMove, mover: "w" | "b"): number | null {
  const w = whiteWin(m);
  return w === null ? null : mover === "w" ? w : 100 - w;
}

/** The mate in the mover's terms (positive: the mover mates), or null when the move is no mate. */
export function moverMate(m: ScoredMove, mover: "w" | "b"): number | null {
  const s = scoreOf(m);
  return s && "mate" in s ? s.mate * (mover === "w" ? 1 : -1) : null;
}

/** The mover's cp, read only for a move that is scored and no mate. */
function moverCp(m: ScoredMove, mover: "w" | "b"): number {
  return (m.cp ?? 0) * (mover === "w" ? 1 : -1);
}

/**
 * The scored moves, best for the mover first: sortLines' rule
 * (parseResults.ts) over mover-relative scores. A mate for the mover comes
 * first and a mate against it last. Of two mates for the mover the shorter
 * comes first, of two against it the longer, and otherwise the higher cp.
 * Unscored moves are left out, and a bad side field gives nothing.
 */
export function rankForMover(search: OneSearch): ScoredMove[] {
  const mover = sideToMove(search.fen);
  if (!mover) return [];
  return search.moves
    .filter((m) => scoreOf(m) !== null)
    .sort((a, b) => {
      const ma = moverMate(a, mover);
      const mb = moverMate(b, mover);
      if (ma !== null && mb !== null) {
        if (ma > 0 !== mb > 0) return ma > 0 ? -1 : 1;
        return ma - mb;
      }
      if (ma !== null) return ma > 0 ? -1 : 1;
      if (mb !== null) return mb > 0 ? 1 : -1;
      return moverCp(b, mover) - moverCp(a, mover);
    });
}

/**
 * Grade `uci` against `opts.reference`, else against the search's best for
 * the mover, with the review's bands. A reference worse than the move is
 * no loss (band Best). Null for a bad side field, a move or a reference the
 * search does not have, or one it did not score.
 */
export function gradeMove(
  search: OneSearch,
  uci: string,
  opts?: { reference?: string }
): MoveGrade | null {
  const mover = sideToMove(search.fen);
  if (!mover) return null;
  const move = search.moves.find((m) => m.uci === uci);
  if (!move || scoreOf(move) === null) return null;
  const ref = opts?.reference
    ? search.moves.find((m) => m.uci === opts.reference)
    : rankForMover(search)[0];
  if (!ref || scoreOf(ref) === null) return null;
  const win = moverWin(move, mover)!;
  const referenceWin = moverWin(ref, mover)!;
  const band = classifyWinLoss(
    whiteWin(ref)!,
    whiteWin(move)!,
    mover === "w"
  ) as GradeBand;
  return {
    uci: move.uci,
    reference: ref.uci,
    mover,
    win,
    referenceWin,
    lossPts: Math.max(0, referenceWin - win),
    band,
    mate: moverMate(move, mover),
    referenceMate: moverMate(ref, mover),
    depth: Math.min(move.depth, ref.depth),
  };
}
