/**
 * The engine's verdict on two moves compared from one position (pathway
 * 3.5), from ONE search: the client's `evaluateMoves`, which scores both
 * with the same depth on a cold table.
 *
 * The words are the app's, never the model's. They never carry a figure
 * (the page shows the numbers beside them) and never the review's verdict
 * names: a move graded against the other compared move from a cold search
 * is not the review's grade against the best on a warm table, and the same
 * word would contradict the card. Inside the review's good band the two are
 * too close to call. Past it the margin is clear, big or wide, the next
 * three bands. Mates and decided positions are said as such.
 *
 * The long form goes in the chat route's anchor block, numbered and put as
 * the engine's, so the eval parser reads it as a report and not a claim.
 * The short form is the page's.
 *
 * Pure and client-safe.
 */
import { MoveClassification } from "@/types/enums";
import {
  gradeMove,
  moverMate,
  moverWin,
  rankForMover,
  sideToMove,
  type MoveGrade,
  type OneSearch,
} from "@/lib/engine/gradeMove";

export type CompareKind =
  | "close"
  | "prefers"
  | "only_mates"
  | "both_mate"
  | "allows_mate"
  | "both_winning"
  | "both_losing";
export type CompareMargin = "clear" | "big" | "wide";

export interface CompareVerdict {
  kind: CompareKind;
  /** The two moves, UCI, in the order the player named them. */
  first: string;
  second: string;
  mover: "w" | "b";
  /** The move the engine prefers, or null when it prefers neither. */
  preferred: string | null;
  /** The other move when one is preferred (the mated one for allows_mate). */
  other: string | null;
  margin: CompareMargin | null;
  /** The other move graded against the preferred one, when the two were graded. */
  grade: MoveGrade | null;
  /** The shallower of the two moves' depths. */
  depth: number;
}

/** A mover's win percentage at or past which the game is decided either way. */
const DECIDED_WIN = 90;
const DECIDED_LOSS = 10;

const MARGIN: Partial<Record<MoveClassification, CompareMargin>> = {
  [MoveClassification.Inaccuracy]: "clear",
  [MoveClassification.Mistake]: "big",
  [MoveClassification.Blunder]: "wide",
};

/**
 * The verdict on `first` and `second` (UCI) from one search, or null when the
 * side to move is unreadable, the two are the same move, or either is not
 * scored. The first rule that applies decides: mates, then a decided
 * position, then the grade of the lower-ranked move against the other.
 */
export function compareTwo(
  search: OneSearch,
  first: string,
  second: string
): CompareVerdict | null {
  const mover = sideToMove(search.fen);
  if (!mover || first === second) return null;
  const a = search.moves.find((m) => m.uci === first);
  const b = search.moves.find((m) => m.uci === second);
  if (!a || !b) return null;
  const wa = moverWin(a, mover);
  const wb = moverWin(b, mover);
  if (wa === null || wb === null) return null;
  const base = {
    first,
    second,
    mover,
    margin: null,
    grade: null,
    depth: Math.min(a.depth, b.depth),
  };
  const prefer = (p: string, kind: CompareKind): CompareVerdict => ({
    ...base,
    kind,
    preferred: p,
    other: p === first ? second : first,
  });
  const neither = (kind: CompareKind): CompareVerdict => ({
    ...base,
    kind,
    preferred: null,
    other: null,
  });

  // 1. Mates, in the mover's terms.
  const ma = moverMate(a, mover);
  const mb = moverMate(b, mover);
  const aMates = ma !== null && ma > 0;
  const bMates = mb !== null && mb > 0;
  if (aMates !== bMates) return prefer(aMates ? first : second, "only_mates");
  if (aMates && bMates)
    return ma === mb
      ? neither("both_mate")
      : prefer(ma! < mb! ? first : second, "both_mate");
  const aMated = ma !== null && ma < 0;
  const bMated = mb !== null && mb < 0;
  if (aMated && bMated) return neither("both_losing");
  if (aMated || bMated) {
    const mated = aMated ? first : second;
    return {
      ...base,
      kind: "allows_mate",
      preferred: mated === first ? second : first,
      other: mated,
    };
  }

  // 2. A decided position.
  if (wa >= DECIDED_WIN && wb >= DECIDED_WIN) return neither("both_winning");
  if (wa <= DECIDED_LOSS && wb <= DECIDED_LOSS) return neither("both_losing");

  // 3. The lower-ranked move graded against the other.
  const [top, low] = rankForMover({ fen: search.fen, moves: [a, b] });
  const grade = gradeMove({ fen: search.fen, moves: [a, b] }, low.uci, {
    reference: top.uci,
  });
  if (!grade) return null;
  const margin = MARGIN[grade.band] ?? null;
  if (!margin) return { ...neither("close"), grade };
  return { ...prefer(top.uci, "prefers"), margin, grade };
}

/**
 * The verdict in the app's words. `label` writes a move: SAN alone for the
 * page ("Qxc1", the short form), SAN with its number for the anchor block
 * ("8. Qxc1", the long form). No figure, no review verdict name.
 */
export function compareVerdictWords(
  v: CompareVerdict,
  label: (uci: string) => string,
  form: "short" | "long"
): string {
  const short = form === "short";
  const side = v.mover === "w" ? "White" : "Black";
  const p = v.preferred ? label(v.preferred) : "";
  switch (v.kind) {
    case "close":
      return short
        ? "Too close to call in this search."
        : `The engine rates ${label(v.first)} and ${label(v.second)} too close to call.`;
    case "prefers":
      return short
        ? `The engine prefers ${p}, by a ${v.margin} margin.`
        : `Of the two, the engine prefers ${p}, by a ${v.margin} margin.`;
    case "only_mates":
      return short
        ? `Only ${p} forces mate.`
        : `The engine finds a forced mate only after ${p}.`;
    case "both_mate":
      if (short)
        return p ? `Both force mate, ${p} sooner.` : "Both force mate.";
      return p
        ? `The engine finds a forced mate after either move, sooner after ${p}.`
        : "The engine finds a forced mate after either move.";
    case "allows_mate": {
      const x = v.other ? label(v.other) : "";
      return short
        ? `${x} allows a forced mate.`
        : `The engine finds a forced mate against ${side} after ${x}.`;
    }
    case "both_winning":
      return short
        ? `${side} is winning after either move.`
        : `The engine has ${side} winning after either move.`;
    case "both_losing":
      return short
        ? `${side} is losing after either move.`
        : `The engine has ${side} losing after either move.`;
  }
}
