/**
 * The checks over a fielded moment (moment.ts).
 *
 * Today the follow-up referee judges one string sentence by sentence and
 * deletes what it cannot license. With fields the question changes from
 * "which sentence goes" to "which claim fails, and what is true instead":
 *
 *   - the proof is a reference the app resolves to a line it holds, and
 *     that line must replay legally from the board at its ply;
 *   - a move in notation or an evaluation inside the prose lines is a
 *     violation (the app draws the line and attaches the eval), the
 *     moment's own move excepted;
 *   - a tactical word in the prose must be licensed by the review's facts
 *     for the move or by a fresh read of the board, the same vocabulary
 *     the referee uses;
 *   - a piece on a square must stand there on one of the boards the moment
 *     is about, and belong to the side the prose says;
 *   - the lesson is a teaching class: a pattern's name and a check, with no
 *     square, move or eval in it;
 *   - the two-line budget, which no schema can state, is counted here.
 *
 * Every failure carries its computed result in `computed` and in one plain
 * sentence in `detail`, so a regeneration can be told what is true rather
 * than only what was wrong, and telemetry can count checks by name without
 * carrying prose. A failure's `kind` says what the consumer does after one
 * regeneration: a "fact" failure omits the field (moment.ts projects the
 * absence clause in its place), a "shape" failure is served as it is to the
 * referee's second net.
 *
 * Pure. No call sites yet.
 */
import { Chess } from "chess.js";
import type { CompactContract, CompactInsight } from "@/lib/contract/followUp";
import {
  EVAL_RE,
  PIECE_LETTER,
  PIECE_ON_SQUARE_RE,
  SAN_TOKEN_RE,
  stripSan,
  TACTICAL_FAMILIES,
} from "@/lib/contract/followUpReferee";
import { isDefinitionalSentence } from "@/lib/contract/refereeChecks";
import { fensAlongGame } from "@/lib/contract/chessFormat";
import { buildRelationalFacts } from "@/lib/relational/relationalFactsBuilder";
import {
  countProseWords,
  countSentences,
  MOMENT_BUDGET,
  type MomentBudget,
  type MomentEnvelope,
  type MomentProof,
  type MomentProse,
  type MomentProseField,
  type ProofRef,
  type Side,
} from "./moment";

export type MomentCheckName =
  | "empty"
  | "budget"
  | "san_in_prose"
  | "eval_in_prose"
  | "tactical_keyword"
  | "piece_on_square"
  | "proof_unresolved"
  | "proof_illegal"
  | "lesson_not_teaching";

export interface MomentCheckFailure {
  field: MomentProseField;
  check: MomentCheckName;
  /** "fact": the field says something the app cannot back. "shape": the field is malformed or over budget. */
  kind: "fact" | "shape";
  /** The offending text, or the whole field when the field is the problem. */
  span: string;
  /** One sentence for the regeneration turn, with the computed result in it. */
  detail: string;
  /** The computed result, for telemetry and tests. Never a FEN, never the prose. */
  computed: Record<string, string | number | boolean | string[] | null>;
}

/** A line the proof may reference, with where it starts. */
export interface ProofCandidate extends ProofRef {
  startFen: string;
  startPly: number;
  sans: readonly string[];
  evalDisplay: string | null;
}

/** What the checks know about the position the moment is about. */
export interface MomentFacts {
  /** The board the moment is about. */
  fen: string;
  /** Half-moves played in the game before `fen`; null for an exploration position. */
  ply: number | null;
  playerColor: Side;
  /** Moves the prose may name: the move played at this ply and the engine's best. */
  ownMoves: readonly string[];
  /** Lines the proof may reference. */
  lines: readonly ProofCandidate[];
  /** Text whose tactical words license the prose: allowed keywords, motif sayables, line stories, relational sayables. */
  licence: readonly string[];
  /** Further boards a piece-on-square claim may describe: the boards before and after the move. */
  boards: readonly string[];
}

export interface MomentCheckOptions {
  /** The budget to count against; the default is the follow-up's. */
  budget?: Partial<MomentBudget>;
}

// ── Facts from the compact contract ─────────────────────────────────────────

/** Half-moves played before move `moveNumber` by `color`. */
export function plyOf(moveNumber: number, color: Side): number {
  return color === "b" ? moveNumber * 2 - 1 : (moveNumber - 1) * 2;
}

/**
 * The facts for a moment about one reviewed move, from the compact
 * contract a follow-up already carries: the board before the move, the
 * played and best moves, the engine's line and the game's continuation as
 * the two proof candidates, and the licence text the referee uses.
 */
export function factsFromCompactInsight(
  insight: CompactInsight,
  compact: CompactContract,
  moveHistory: readonly string[]
): MomentFacts {
  const ply = plyOf(insight.moveNumber, insight.color);
  const lines: ProofCandidate[] = [];
  if (insight.bestLineSan.length > 0) {
    lines.push({
      kind: "engine",
      moveNumber: insight.moveNumber,
      color: insight.color,
      startFen: insight.fenBefore,
      startPly: ply,
      sans: insight.bestLineSan,
      evalDisplay: insight.evalBeforeDisplay || null,
    });
  }
  const played = moveHistory.slice(ply);
  if (played.length > 0) {
    lines.push({
      kind: "played",
      moveNumber: insight.moveNumber,
      color: insight.color,
      startFen: insight.fenBefore,
      startPly: ply,
      sans: played,
      evalDisplay: null,
    });
  }
  const ownMoves = [insight.playedSan];
  if (insight.bestSan) ownMoves.push(insight.bestSan);
  return {
    fen: insight.fenBefore,
    ply,
    playerColor: compact.playerColor === "b" ? "b" : "w",
    ownMoves,
    lines,
    licence: [
      ...insight.allowedTacticalKeywords,
      ...insight.motifSayables,
      ...insight.bestLineStory,
      ...insight.gameStory,
      ...insight.relationalSayables,
    ],
    boards: [insight.fenAfter],
  };
}

// ── The proof ───────────────────────────────────────────────────────────────

/** The line a reference names, or null when the facts hold none. */
export function resolveProof(
  ref: ProofRef,
  facts: MomentFacts
): MomentProof | null {
  const line = facts.lines.find(
    (l) =>
      l.kind === ref.kind &&
      l.moveNumber === ref.moveNumber &&
      l.color === ref.color
  );
  if (!line) return null;
  return {
    kind: line.kind,
    moveNumber: line.moveNumber,
    color: line.color,
    startFen: line.startFen,
    startPly: line.startPly,
    sans: line.sans.slice(),
    evalDisplay: line.evalDisplay,
  };
}

/** Replay a line from its board; the number of plies that were legal and the first that was not. */
export function replayLine(
  startFen: string,
  sans: readonly string[]
): { legalPlies: number; failedSan: string | null } {
  let game: Chess;
  try {
    game = new Chess(startFen);
  } catch {
    return { legalPlies: 0, failedSan: sans[0] ?? null };
  }
  for (let i = 0; i < sans.length; i++) {
    try {
      if (!game.move(sans[i])) return { legalPlies: i, failedSan: sans[i] };
    } catch {
      return { legalPlies: i, failedSan: sans[i] };
    }
  }
  return { legalPlies: sans.length, failedSan: null };
}

function describeRef(ref: ProofRef): string {
  return `${ref.kind === "played" ? "the game's moves" : "the engine's line"} from move ${ref.moveNumber}${ref.color === "b" ? "..." : "."}`;
}

export function checkProof(
  ref: ProofRef | null,
  facts: MomentFacts
): MomentCheckFailure[] {
  if (!ref) return [];
  const resolved = resolveProof(ref, facts);
  const available = facts.lines.map(
    (l) => `${l.kind}:${l.moveNumber}:${l.color}`
  );
  if (!resolved) {
    return [
      {
        field: "proof",
        check: "proof_unresolved",
        kind: "fact",
        span: `${ref.kind}:${ref.moveNumber}:${ref.color}`,
        detail: `There is no ${describeRef(ref)} among the lines held for this moment; the lines held are ${available.length > 0 ? available.join(", ") : "none"}.`,
        computed: {
          kind: ref.kind,
          moveNumber: ref.moveNumber,
          color: ref.color,
          available,
        },
      },
    ];
  }
  const replay = replayLine(resolved.startFen, resolved.sans);
  if (replay.failedSan !== null) {
    return [
      {
        field: "proof",
        check: "proof_illegal",
        kind: "fact",
        span: `${ref.kind}:${ref.moveNumber}:${ref.color}`,
        detail: `${describeRef(ref)} does not replay: ${replay.failedSan} is not legal after ${replay.legalPlies} ${replay.legalPlies === 1 ? "ply" : "plies"}.`,
        computed: {
          kind: ref.kind,
          moveNumber: ref.moveNumber,
          color: ref.color,
          legalPlies: replay.legalPlies,
          failedSan: replay.failedSan,
          plies: resolved.sans.length,
        },
      },
    ];
  }
  return [];
}

// ── The prose lines ─────────────────────────────────────────────────────────

const PIECE_NAME: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

function describeSquare(fen: string, square: string): string {
  try {
    const p = new Chess(fen).get(square as never);
    if (!p) return "empty";
    return `${p.color === "w" ? "white" : "black"} ${PIECE_NAME[p.type] ?? p.type}`;
  } catch {
    return "unknown";
  }
}

function claimedColor(
  word: string | undefined,
  playerColor: Side
): Side | null {
  const w = (word ?? "").toLowerCase();
  if (w === "white") return "w";
  if (w === "black") return "b";
  if (w === "your" || w === "my") return playerColor;
  if (w === "their" || w.includes("opponent"))
    return playerColor === "w" ? "b" : "w";
  return null;
}

interface BoardReads {
  hangingSquares: string[];
  pinnedSquares: string[];
}

function readBoard(fen: string): BoardReads {
  try {
    const rel = buildRelationalFacts(fen);
    return {
      hangingSquares: rel.hanging.map((h) => h.square),
      pinnedSquares: rel.pins.map((p) => p.pinnedSquare),
    };
  } catch {
    return { hangingSquares: [], pinnedSquares: [] };
  }
}

function listOrNone(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "none";
}

/**
 * The checks one prose line gets: no evaluation, no move but the moment's
 * own, every tactical word licensed, every piece on a square standing
 * there. `boards` are the Chess positions a piece-on-square claim may
 * describe; `reads` is the fresh relational read of the moment's board.
 */
function checkProseLine(
  field: MomentProseField,
  text: string,
  facts: MomentFacts,
  boards: Chess[],
  reads: BoardReads,
  poolText: string
): MomentCheckFailure[] {
  const out: MomentCheckFailure[] = [];
  const own = new Set(facts.ownMoves.map(stripSan));

  for (const m of Array.from(text.matchAll(EVAL_RE))) {
    out.push({
      field,
      check: "eval_in_prose",
      kind: "shape",
      span: m[1],
      detail: `The evaluation ${m[1]} belongs to the line the app draws, not to the prose; say what the move does, never the number.`,
      computed: { figure: m[1] },
    });
  }

  const sanTokens = Array.from(text.matchAll(SAN_TOKEN_RE));
  const foreign = sanTokens
    .map((m) => m[3] ?? m[6] ?? m[7])
    .filter((san): san is string => !!san && !own.has(stripSan(san)));
  if (foreign.length > 0) {
    out.push({
      field,
      check: "san_in_prose",
      kind: "shape",
      span: foreign.join(" "),
      detail: `The app draws the line; the prose may name only this moment's move (${facts.ownMoves.join(" or ")}), not ${foreign.join(", ")}.`,
      computed: { moves: foreign, ownMoves: facts.ownMoves.slice() },
    });
  }

  if (!isDefinitionalSentence(text)) {
    for (const fam of TACTICAL_FAMILIES) {
      if (!fam.re.test(text)) continue;
      const licensed =
        fam.poolRoots.some((r) => poolText.includes(r)) ||
        (fam.board === "hanging" && reads.hangingSquares.length > 0) ||
        (fam.board === "pin" && reads.pinnedSquares.length > 0);
      if (licensed) continue;
      out.push({
        field,
        check: "tactical_keyword",
        kind: "fact",
        span: fam.name,
        detail: `Nothing in the facts for this move confirms a ${fam.name}; on this board the hanging pieces are ${listOrNone(reads.hangingSquares)} and the pinned pieces are ${listOrNone(reads.pinnedSquares)}.`,
        computed: {
          family: fam.name,
          hangingSquares: reads.hangingSquares,
          pinnedSquares: reads.pinnedSquares,
        },
      });
    }
  }

  for (const m of Array.from(text.matchAll(PIECE_ON_SQUARE_RE))) {
    const piece = m[2].toLowerCase();
    const square = m[3].toLowerCase();
    const color = claimedColor(m[1], facts.playerColor);
    const stands = boards.some((b) => {
      const p = b.get(square as never);
      return (
        !!p &&
        p.type === PIECE_LETTER[piece] &&
        (color === null || p.color === color)
      );
    });
    if (stands) continue;
    const found = describeSquare(facts.fen, square);
    const claimed = `${color === "w" ? "white " : color === "b" ? "black " : ""}${piece}`;
    out.push({
      field,
      check: "piece_on_square",
      kind: "fact",
      span: m[0],
      detail: `There is no ${claimed} on ${square}: on this board ${square} is ${found === "empty" ? "empty" : `a ${found}`}.`,
      computed: { square, claimed, found },
    });
  }
  return out;
}

// ── The lesson ──────────────────────────────────────────────────────────────

const SQUARE_IN_TEXT_RE = /\b[a-h][1-8]\b/g;

/**
 * A lesson teaches a class of position, not this one: the pattern's name
 * and a check the player can run, with no square, no move and no
 * evaluation in either. The referee's definitional-sentence test is the
 * same rule read the other way (a sentence with none of those is teaching).
 */
export function checkLesson(
  lesson: MomentEnvelope["lesson"]
): MomentCheckFailure[] {
  if (!lesson) return [];
  const out: MomentCheckFailure[] = [];
  for (const part of ["pattern", "check"] as const) {
    const text = lesson[part];
    if (!text.trim()) continue;
    const evals = Array.from(text.matchAll(EVAL_RE)).map((m) => m[1]);
    const squares = Array.from(text.matchAll(SQUARE_IN_TEXT_RE)).map(
      (m) => m[0]
    );
    const moves = Array.from(text.matchAll(SAN_TOKEN_RE))
      .map((m) => m[3] ?? m[6] ?? m[7])
      .filter((s): s is string => !!s);
    if (
      evals.length === 0 &&
      squares.length === 0 &&
      moves.length === 0 &&
      isDefinitionalSentence(text)
    )
      continue;
    out.push({
      field: "lesson",
      check: "lesson_not_teaching",
      kind: "fact",
      span: text,
      detail: `The lesson's ${part} must name a pattern and a check for any game, with no square, move or evaluation in it; it carries ${
        [
          evals.length > 0 ? `the evaluation ${evals.join(", ")}` : "",
          moves.length > 0 ? `the move ${moves.join(", ")}` : "",
          squares.length > 0 ? `the square ${squares.join(", ")}` : "",
        ]
          .filter((s) => s.length > 0)
          .join(" and ") || "a piece on a square"
      }.`,
      computed: { part, evals, moves, squares },
    });
  }
  return out;
}

// ── The budget ──────────────────────────────────────────────────────────────

export function checkBudget(
  envelope: MomentEnvelope,
  budget: Partial<MomentBudget> = {}
): MomentCheckFailure[] {
  const b: MomentBudget = { ...MOMENT_BUDGET, ...budget };
  const out: MomentCheckFailure[] = [];
  const ideaSentences = countSentences(envelope.idea);
  const happensSentences = countSentences(envelope.happens);
  const openingWords =
    countProseWords(envelope.idea) + countProseWords(envelope.happens);
  if (ideaSentences > b.ideaSentences) {
    out.push({
      field: "idea",
      check: "budget",
      kind: "shape",
      span: envelope.idea,
      detail: `The idea is one sentence; this one is ${ideaSentences}.`,
      computed: { sentences: ideaSentences, limit: b.ideaSentences },
    });
  }
  if (happensSentences > b.happensSentences) {
    out.push({
      field: "happens",
      check: "budget",
      kind: "shape",
      span: envelope.happens,
      detail: `What happens is at most ${b.happensSentences} sentences; this is ${happensSentences}.`,
      computed: { sentences: happensSentences, limit: b.happensSentences },
    });
  }
  if (openingWords > b.openingWords) {
    out.push({
      field: "happens",
      check: "budget",
      kind: "shape",
      span: envelope.happens,
      detail: `The idea and what happens together are at most ${b.openingWords} words; they are ${openingWords}.`,
      computed: { words: openingWords, limit: b.openingWords },
    });
  }
  if (envelope.lesson) {
    const lessonWords =
      countProseWords(envelope.lesson.pattern) +
      countProseWords(envelope.lesson.check);
    if (lessonWords > b.lessonWords) {
      out.push({
        field: "lesson",
        check: "budget",
        kind: "shape",
        span: `${envelope.lesson.pattern} ${envelope.lesson.check}`.trim(),
        detail: `The lesson is at most ${b.lessonWords} words; it is ${lessonWords}.`,
        computed: { words: lessonWords, limit: b.lessonWords },
      });
    }
  }
  if (envelope.question) {
    const questionSentences = countSentences(envelope.question);
    if (questionSentences > b.questionSentences) {
      out.push({
        field: "question",
        check: "budget",
        kind: "shape",
        span: envelope.question,
        detail: `The question is one sentence; this is ${questionSentences}.`,
        computed: { sentences: questionSentences, limit: b.questionSentences },
      });
    }
  }
  return out;
}

// ── All of it ───────────────────────────────────────────────────────────────

export function checkMoment(
  envelope: MomentEnvelope,
  facts: MomentFacts,
  opts: MomentCheckOptions = {}
): MomentCheckFailure[] {
  const out: MomentCheckFailure[] = [];
  for (const field of ["idea", "happens"] as const) {
    if (!envelope[field].trim()) {
      out.push({
        field,
        check: "empty",
        kind: "fact",
        span: "",
        detail:
          field === "idea"
            ? "The idea is missing: one line on what the move was for."
            : "What happens is missing: one line on what the opponent gets to do and why it works.",
        computed: {},
      });
    }
  }

  const boards: Chess[] = [];
  for (const fen of [facts.fen, ...facts.boards]) {
    try {
      boards.push(new Chess(fen));
    } catch {
      /* a board that will not parse licenses nothing */
    }
  }
  const reads = readBoard(facts.fen);
  const poolText = facts.licence.join(" | ").toLowerCase();

  if (envelope.idea.trim())
    out.push(
      ...checkProseLine("idea", envelope.idea, facts, boards, reads, poolText)
    );
  if (envelope.happens.trim())
    out.push(
      ...checkProseLine(
        "happens",
        envelope.happens,
        facts,
        boards,
        reads,
        poolText
      )
    );
  if (envelope.question && envelope.question.trim())
    out.push(
      ...checkProseLine(
        "question",
        envelope.question,
        facts,
        boards,
        reads,
        poolText
      )
    );
  out.push(...checkProof(envelope.proof, facts));
  out.push(...checkLesson(envelope.lesson));
  out.push(...checkBudget(envelope, opts.budget));
  return out;
}

// ── What the consumer does with failures ────────────────────────────────────

/**
 * The served prose after the checks: every field with a "fact" failure is
 * removed and listed in `omitted`, so momentToText says in one clause that
 * it is not there. A "shape" failure leaves the field standing; the
 * referee's second net still runs over the projection. Nothing is
 * rewritten and nothing is hedged: a field is either the model's words or
 * absent.
 */
export function omitFailedFields(
  envelope: MomentEnvelope,
  failures: readonly MomentCheckFailure[],
  facts?: MomentFacts
): MomentProse {
  const omitted: MomentProseField[] = [];
  const failed = (field: MomentProseField) =>
    failures.some((f) => f.field === field && f.kind === "fact");
  for (const field of [
    "idea",
    "happens",
    "proof",
    "lesson",
    "question",
  ] as const) {
    if (failed(field)) omitted.push(field);
  }
  // A proof the facts cannot resolve is absent whether or not it was named.
  const proof = omitted.includes("proof") ? null : envelope.proof;
  if (proof && facts && !resolveProof(proof, facts)) omitted.push("proof");
  return {
    idea: omitted.includes("idea") ? null : envelope.idea,
    happens: omitted.includes("happens") ? null : envelope.happens,
    proof: omitted.includes("proof") ? null : proof,
    lesson: omitted.includes("lesson") ? null : envelope.lesson,
    question: omitted.includes("question") ? null : envelope.question,
    more: null,
    omitted,
  };
}

/** FENs along the game, for callers that resolve a ply to a board. */
export function boardAtPly(
  moveHistory: readonly string[],
  ply: number
): string | null {
  const fens = fensAlongGame(moveHistory);
  return fens[ply] ?? null;
}
