/**
 * Grades the player's answer to "what was your opponent threatening?".
 *
 * The answer is a move, typed (SAN or UCI) or played on the board, or "no
 * idea". It is graded against the truth decisiveMoment.ts read from the
 * review's own search: exact when it is the reply or one the same search
 * rates as good, partial when it found part of the threat (another forcing
 * reply of the search, the reply's target square, its piece, or a capture
 * of one of the player's loose or pinned pieces, in that order), else a
 * miss. The cause names the lesson: an exact answer is a calculation slip
 * (the threat was seen and played into), "no idea" is a guess, and anything
 * else is the reply's own feature (a mate or a check, a fork, a loose
 * piece, else calculation).
 *
 * Pure, client-safe and model-free. Never throws.
 */
import { Chess, type Square } from "chess.js";
import { buildRelationalFacts } from "@/lib/relational/relationalFactsBuilder";
import {
  isConcrete,
  labelAt,
  moveUci,
  playUci,
  type ThreatTruth,
} from "./decisiveMoment";

export type DiagnoseGrade = "exact" | "partial" | "miss" | "no-idea";
export type DiagnoseCause =
  | "check"
  | "hanging"
  | "fork"
  | "calculation"
  | "guess";
export type PartialBy = "threat" | "target" | "piece" | "weakness";
export type DiagnoseAnswer =
  | { kind: "move"; uci: string }
  | { kind: "no-idea" };

export interface DiagnoseResult {
  grade: DiagnoseGrade;
  cause: DiagnoseCause;
  partialBy: PartialBy | null;
  /** The move answered, as the strip writes it ("8. Qxc1"), or null for "no idea". */
  answer: { uci: string; san: string; label: string } | null;
  truth: ThreatTruth;
}

/**
 * A typed answer, read as one move on `fen`, as UCI, or null. The whole
 * message is the move: a leading move number ("8.", "6...") and trailing
 * marks ("!", "?", ".") are allowed, and "0-0" is O-O. Anything with a
 * second word is not an answer. Piece case matters, as everywhere in the
 * app: "qxc1" is no move.
 */
export function parseAnswerMove(fen: string, text: string): string | null {
  let token = text
    .trim()
    .replace(/^\d+\s*\.{1,3}\s*/, "")
    .replace(/[!?.]+$/, "")
    .trim();
  if (!token || /\s/.test(token)) return null;
  token = token.replace(/^0-0-0/, "O-O-O").replace(/^0-0/, "O-O");
  try {
    const move = new Chess(fen).move(token);
    return move ? moveUci(move) : null;
  } catch {
    return null;
  }
}

/** The lesson the truth teaches when the answer did not find it. */
export function truthCause(
  truth: ThreatTruth
): Exclude<DiagnoseCause, "guess"> {
  if (truth.isMate) return "check";
  if (truth.forkTargets.length >= 2) return "fork";
  if (truth.isCheck) return "check";
  if (truth.capturesHanging) return "hanging";
  return "calculation";
}

/**
 * The answer graded at `fenAfter` (the position after the player's move,
 * the opponent to move), whose reply is the move at index `ply`. Null for
 * a move that is not legal there, or a position whose side to move is not
 * the side that plays at `ply`.
 */
export function gradeAnswer(
  fenAfter: string,
  ply: number,
  truth: ThreatTruth,
  answer: DiagnoseAnswer
): DiagnoseResult | null {
  if (answer.kind === "no-idea")
    return {
      grade: "no-idea",
      cause: "guess",
      partialBy: null,
      answer: null,
      truth,
    };
  try {
    const game = new Chess(fenAfter);
    const replier = game.turn();
    if (replier !== (ply % 2 === 0 ? "w" : "b")) return null;
    const move = playUci(game, answer.uci);
    if (!move) return null;
    const uci = moveUci(move);
    const answered = { uci, san: move.san, label: labelAt(ply, move.san) };
    if (uci === truth.uci || truth.equalReplies.includes(uci))
      return {
        grade: "exact",
        cause: "calculation",
        partialBy: null,
        answer: answered,
        truth,
      };

    let partialBy: PartialBy | null = null;
    if (truth.engineReplies.includes(uci) && isConcrete(fenAfter, uci))
      partialBy = "threat";
    else if (move.to === truth.to) partialBy = "target";
    else if (move.from === truth.from) partialBy = "piece";
    else if (move.captured) {
      const player = replier === "w" ? "b" : "w";
      const square: Square = move.flags.includes("e")
        ? (`${move.to[0]}${move.from[1]}` as Square)
        : move.to;
      const facts = buildRelationalFacts(fenAfter);
      const loose = facts.hanging.some(
        (h) => h.square === square && h.color === player
      );
      const pinned = facts.pins.some(
        (p) => p.pinnedSquare === square && p.pinnerColor === replier
      );
      if (loose || pinned) partialBy = "weakness";
    }
    return {
      grade: partialBy ? "partial" : "miss",
      cause: truthCause(truth),
      partialBy,
      answer: answered,
      truth,
    };
  } catch {
    return null;
  }
}
