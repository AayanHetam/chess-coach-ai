/**
 * A what-if, read from the question and scored by the client's own engine.
 *
 * "What about Bxf7+ instead?" names an alternative. The server answers in
 * words; the board can answer in moves, first: the asked move played on
 * the board, the engine's reply under the question as a line, and the
 * asked move's number beside the move it is compared with, from one search
 * so the two numbers mean the same thing (UciEngine.evaluateMoves: one
 * `searchmoves` search, one depth, a cold table).
 *
 * It reads the question with the same resolvers the chat route uses
 * (questionAnchor.ts, questionIntent.ts), so the client and the server
 * agree on which move is asked about and where; it turns the asked
 * notation into a move legal in that position, picks the moves worth
 * scoring beside it, and turns a search result into the line ProofLine
 * draws. It also holds the runner (one search through the page's engine
 * turn, lib/engine/engineTurn.ts, ended by the caller's signal or a bound),
 * the store the line reads its state from, and the gate on the coach's
 * jump for the same question. The engine instance and the board live with
 * the page.
 *
 * Scores are White-relative, like every number the page shows (MoveEval in
 * types/eval.ts says so); the pair is compared with itself and never with
 * the review's warm sweep or the live effect's deeper number.
 */
import { Chess, type Move } from "chess.js";
import type {
  EvaluateMovesParams,
  MoveEval,
  MovesEval,
  PositionEval,
} from "@/types/eval";
import type { EngineTurn } from "@/lib/engine/engineTurn";
import { resolveQuestionAnchor } from "@/lib/coach/questionAnchor";
import { resolveQuestionIntent } from "@/lib/coach/questionIntent";
import {
  CLIENT_EVALS_LINE_PLIES,
  type ClientEvals,
} from "@/lib/coach/clientEvals";
import { readCompare } from "@/lib/coach/compareWords";
import { compareTwo, compareVerdictWords } from "@/lib/coach/compareVerdict";
import { formatEval, type CoachLine } from "./coachLines";

/**
 * Why a move is in the search: the one asked about, the one the game played
 * there, the review's best there. In a compare, the second move the player
 * names beside the first.
 */
export type WhatIfRole = "asked" | "compared" | "played" | "best";

export interface WhatIfMove {
  role: WhatIfRole;
  /** chess.js spelling (e1g1 for castling), as evaluateMoves wants it. */
  uci: string;
  san: string;
}

export interface WhatIfAsk {
  /** Half-moves before the position the alternative is played from: the cursor value for it. */
  index: number;
  /** That position. */
  fen: string;
  moveNumber: number;
  /** The side that plays the asked move. */
  color: "w" | "b";
  asked: WhatIfMove;
  /**
   * A compare's second move ("8. Qxc1 or 8. Nd6+?"), the one named after
   * the asked move. Absent for a what-if.
   */
  compared?: WhatIfMove;
  /** The search's moves: the asked one first, then the compared, the played and the best where they differ. */
  moves: WhatIfMove[];
  /** How the question named the alternative, or "compare" for two moves set side by side. */
  rule: "asked_san" | "phrase" | "compare";
}

export interface WhatIfContext {
  /** The game's SAN moves. */
  sans: readonly string[];
  /** The game's starting FEN when it is not the standard position. */
  rootFen?: string;
  /** The cursor: the position the player is looking at, for a question with no move number. */
  viewedPly: number;
  playerColor: "w" | "b";
  /**
   * False while the player's side is a guess (the board's orientation):
   * "what about Nd5 on move 4" is then drawn only where it is legal for
   * one side, never for the guessed one.
   */
  playerSideKnown?: boolean;
  /**
   * The side a bare "move 8" legal for both sides is read as, the way the
   * coach will anchor it (standingSide.ts, whatIfDefaultSide): a side the
   * words name, or the page's standing side. Absent, the player's side
   * when it is known, as before.
   */
  defaultSide?: "w" | "b";
  /** The review's sweep, for the engine's best move at the position. */
  enginePositions?: readonly PositionEval[] | null;
  /**
   * An exploration is on the board (the position shown is not the cursor's
   * mainline position). A bare alternative is then asked about a board this
   * resolver cannot see, so it draws nothing; a numbered one still resolves.
   */
  exploring?: boolean;
  /**
   * The board shows a what-if's own alternative, played at `index` (the
   * exploration the page put there for it), and `fen` is the position after
   * it. A bare alternative is then the next one at the same ply, unless it
   * is also the reply on that board and nothing in the words picks one.
   */
  onWhatIf?: { index: number; fen: string };
}

/** The asked move's number beside the others', from one result. */
export interface WhatIfScore extends WhatIfMove {
  cp?: number;
  mate?: number;
  depth: number;
  /** "+2.51" / "M+3"; null when the engine returned no line for the move. */
  evalDisplay: string | null;
}

/** The pathway's rule: the first drawn line comes from a partial at least this deep. */
export const WHAT_IF_FIRST_DEPTH = 10;
/** The depth the search runs to; the line deepens under the reader. */
export const WHAT_IF_DEPTH = 16;
/** A search given up after this long frees the engine for the live evals behind it (the sweep bounds each position the same way). */
export const WHAT_IF_TIMEOUT_MS = 30_000;

function replay(
  rootFen: string | undefined,
  sans: readonly string[],
  plies: number
): Chess | null {
  try {
    const g = rootFen ? new Chess(rootFen) : new Chess();
    for (let i = 0; i < plies; i++) g.move(sans[i]);
    return g;
  } catch {
    return null;
  }
}

function uciOf(m: Move): string {
  return `${m.from}${m.to}${m.promotion ?? ""}`;
}

function uciParams(uci: string): {
  from: string;
  to: string;
  promotion?: string;
} {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length >= 5 ? uci[4] : undefined,
  };
}

/** Play `move` on a copy of `board`; null when it is not legal there. */
function tryMove(
  board: Chess,
  move: string | { from: string; to: string; promotion?: string }
): { uci: string; san: string } | null {
  try {
    const g = new Chess(board.fen());
    const played = g.move(move as Parameters<Chess["move"]>[0]);
    return played ? { uci: uciOf(played), san: played.san } : null;
  } catch {
    return null;
  }
}

/**
 * A move the question wrote, where it wrote it, and what the words around
 * it make of it: "instead of Y" / "rather than Y" mark Y as the move set
 * aside, and "after Y" marks Y as the line the alternative follows, with
 * the moves written straight after it ("after 7... Qxc1 8. Nc7+").
 */
interface QuestionMove {
  san: string;
  /** The number and side written beside it ("8. Qxc1", "8... Kd8"), if any. */
  numbered?: { number: number; color: "w" | "b" };
  role: "plain" | "set-aside" | "context";
  /** Where the notation sits in the question, its number included. */
  start: number;
  end: number;
}

/** One move the question names, however often it is written. */
interface NamedMove {
  san: string;
  numbered?: { number: number; color: "w" | "b" };
  role: "plain" | "set-aside";
  tokens: QuestionMove[];
}

type Side = "w" | "b";

const SAN_CORE =
  "(?:[NBRQK][a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?|[a-h]x[a-h][1-8](?:=[NBRQ])?[+#]?|[a-h][1-8](?:=[NBRQ])?[+#]?)";
/** A move in notation, optionally numbered. */
const MOVE_TOKEN_RE = new RegExp(
  `(?<![A-Za-z0-9])(?:(\\d{1,3})\\s*(\\.{1,3})\\s*)?(${SAN_CORE})(?![A-Za-z0-9])`,
  "g"
);
/** A bare pawn push ("e4") is a square as often as a move: it counts beside a cue only. */
const PAWN_PUSH_RE = /^[a-h][1-8](?:=[NBRQ])?[+#]?$/;
const PAWN_CUE_BEFORE_RE =
  /\b(?:play|plays|played|playing|push|pushes|pushed|pushing|try|tried|move|moved|with|after|following|instead\s+of|rather\s+than|in\s+place\s+of|than|why|not|about|if)\s*$/i;
const PAWN_CUE_AFTER_RE = /^\s*(?:instead|rather)\b/i;
const SET_ASIDE_BEFORE_RE =
  /\b(?:instead\s+of|rather\s+than|in\s+place\s+of)\s*$/i;
/** "after Bc4", "after my opponent's Bc4", "after White played Bc4": the line the alternative follows. */
const CONTEXT_BEFORE_RE =
  /\b(?:after|following)\s+(?:(?:(?:my|the)\s+opponent['’]s|my|his|her|their|white['’]s|black['’]s|the\s+move)\s+|(?:i|he|she|they|we|white|black|(?:my|the)\s+opponent)\s+(?:played|plays|play)\s+|playing\s+)?$/i;
/** What may stand between the moves of an "after" line: spaces, a comma, "and", "then". */
const LINE_GAP_RE = /^[\s,]*(?:(?:and\s+)?then\s+|and\s+)?$/i;
/** "move 8", "my 8th move": a number with no side. */
const MOVE_NUMBER_RE =
  /\bmove\s+(\d{1,3})\b|\b(\d{1,3})(?:st|nd|rd|th)\s+move\b/i;
/** "instead", "rather than", "why not": the alternative replaces the move the strip names, the one just played. */
const REPLACE_CUE_RE =
  /\b(?:instead|rather\s+than|why\s+not|why\s+didn'?t|(?:should|could|would)(?:n'?t)?\s+(?:i|you|he|she|they|we)\s+have)\b/i;
/** "Instead" and "rather": with an "after" line, the alternative may replace the line's last move. */
const INSTEAD_RE = /\b(?:instead|rather)\b/i;
/**
 * "Nd5 here", "Nd5 now", "Nd5 from this position": the next move from the
 * position shown, when the words sit beside the move. Not "here's" or
 * "here is" (a lead-in), and not a bare "next" ("next time" is another game).
 */
const NEXT_AFTER_RE =
  /^\s*(?:(?:be|is|was|been|have\s+been|work|works|worked|good|better|best|ok|okay|possible|playable|stronger|right|correct)\s+){0,3}(?:right\s+)?(?:here(?!['’]s\b|\s+is\b)|now|from\s+here|from\s+this\s+position|in\s+this\s+position|at\s+this\s+point|(?:on\s+the\s+)?next\s+move)\b/i;
/**
 * "Here, what about Nd5?", "Now Nd5?", "In this position, is Nd5 good?":
 * the clause that holds the move opens with the cue and goes straight to
 * the question. Not "Now, I wonder why not Nd5": "now" there is a word of
 * the sentence, not the position.
 */
const NEXT_CLAUSE_RE =
  /^\s*(?:(?:so|ok|okay|and|but|well|hmm)[,\s]+)*(?:right\s+)?(?:here(?!['’]s\b|\s+is\b)|now|from\s+here|from\s+this\s+position|in\s+this\s+position|at\s+this\s+point)\s*[,:]?\s*(?:(?:what\s+about|how\s+about|why\s+not|what\s+if|is|was|would|could|should|can|does|do|let['’]?s)\b[^,;]*)?$/i;
/** "Why X instead of Y?" asks why X was played: Y is the alternative. */
const WHY_PLAYED_BEFORE_RE =
  /\bwhy\s+(?:(?:did|do|does|would|was|is)\s+(?:(?:i|you|he|she|they|we|white|black|(?:my|the)\s+opponent)\s+)?)?(?:(?:play|go\s+for|choose|pick|push|castle)\s+)?$/i;

const MOVE_VERB =
  "(?:play|plays|played|playing|go|goes|went|push|pushes|pushed|take|takes|took|try|tries|tried|castle|castles|castled|choose|chose|answer|answered|reply|replied|respond|responded|move|moves|moved)";
const AUXILIARY =
  "(?:(?:could|should|would|might|must|can|will|shall|did|do|does|didn['’]?t|don['’]?t|doesn['’]?t|couldn['’]?t|shouldn['’]?t|wouldn['’]?t|can['’]?t|won['’]?t|not|never|just|also|still|really|then|have|has|had)\\s+)*";
/**
 * Who plays the move, from the words right before it: "could I have
 * played", "what if Black plays", "why didn't my opponent play", "my Nd5".
 * A pronoun anywhere else in the message says nothing about the move.
 */
const SUBJECT_BEFORE_RE = new RegExp(
  `\\b(i(?:['’](?:d|ll|ve))?|(?:my|the)\\s+opponent|opponent|he|she|they|white|black)\\s+${AUXILIARY}${MOVE_VERB}\\s+(?:with\\s+)?$`,
  "i"
);
const OWNER_BEFORE_RE =
  /\b((?:my\s+|the\s+)?opponent['’]s|my|his|her|their|white['’]s|black['’]s)\s+$/i;
const SIDE_AFTER_RE = /^\s*(?:for|by)\s+(white|black)\b/i;

/** SAN without its check or comment marks, case kept: Bxc4 is not the pawn's bxc4. */
const stripSan = (san: string) => san.replace(/[+#!?]/g, "");
const sameSan = (a: string, b: string) => stripSan(a) === stripSan(b);

/**
 * The moves a question wrote, in order. A bare pawn push counts beside a
 * cue ("why not d4?", "d4 instead"), or inside an "after" line, where the
 * line itself is the cue ("after 1.e4 e5 2.Nf3").
 */
function questionMoves(question: string): QuestionMove[] {
  const out: QuestionMove[] = [];
  for (const m of Array.from(question.matchAll(MOVE_TOKEN_RE))) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const san = m[3];
    const numbered = m[1]
      ? {
          number: Number(m[1]),
          color: (m[2].length >= 2 ? "b" : "w") as "w" | "b",
        }
      : undefined;
    const before = question.slice(0, start);
    const last = out[out.length - 1];
    const inLine =
      last?.role === "context" &&
      LINE_GAP_RE.test(question.slice(last.end, start));
    if (
      !inLine &&
      !numbered &&
      PAWN_PUSH_RE.test(san) &&
      !PAWN_CUE_BEFORE_RE.test(before) &&
      !PAWN_CUE_AFTER_RE.test(question.slice(end))
    )
      continue;
    const role: QuestionMove["role"] = inLine
      ? "context"
      : SET_ASIDE_BEFORE_RE.test(before)
        ? "set-aside"
        : CONTEXT_BEFORE_RE.test(before)
          ? "context"
          : "plain";
    out.push({ san, numbered, role, start, end });
  }
  return out;
}

/** The moves outside the "after" line, one per notation; null when one is written two ways. */
function namedMoves(moves: readonly QuestionMove[]): NamedMove[] | null {
  const out: NamedMove[] = [];
  for (const m of moves) {
    if (m.role === "context") continue;
    const named = out.find((n) => sameSan(n.san, m.san));
    if (!named) {
      out.push({ san: m.san, numbered: m.numbered, role: m.role, tokens: [m] });
      continue;
    }
    if (named.role !== m.role) return null;
    if (m.numbered) {
      if (
        named.numbered &&
        (named.numbered.number !== m.numbered.number ||
          named.numbered.color !== m.numbered.color)
      )
        return null;
      named.numbered = m.numbered;
    }
    named.tokens.push(m);
  }
  return out;
}

/**
 * The index a numbered reference names, counted from the game's root (a
 * FEN-rooted game starts at its own move number and side), or null when it
 * is not in the game.
 */
function indexOfNumbered(
  rootFen: string | undefined,
  sans: readonly string[],
  ref: { number: number; color: "w" | "b" }
): number | null {
  let root: Chess;
  try {
    root = rootFen ? new Chess(rootFen) : new Chess();
  } catch {
    return null;
  }
  const offset = root.turn() === "b" ? 1 : 0;
  const k =
    (ref.number - root.moveNumber()) * 2 + (ref.color === "b" ? 1 : 0) - offset;
  return k >= 0 && k <= sans.length ? k : null;
}

/** The move number of the position `index` half-moves into the game. */
function moveNumberAt(ctx: WhatIfContext, index: number): number | null {
  try {
    const root = ctx.rootFen ? new Chess(ctx.rootFen) : new Chess();
    const offset = root.turn() === "b" ? 1 : 0;
    return root.moveNumber() + Math.floor((index + offset) / 2);
  } catch {
    return null;
  }
}

/** The game replayed once per question: the position before each ply and the move played from it. */
const walks = new WeakMap<WhatIfContext, { fens: string[]; ucis: string[] }>();
function gameWalk(ctx: WhatIfContext): { fens: string[]; ucis: string[] } {
  const known = walks.get(ctx);
  if (known) return known;
  const fens: string[] = [];
  const ucis: string[] = [];
  try {
    const g = ctx.rootFen ? new Chess(ctx.rootFen) : new Chess();
    for (const san of ctx.sans) {
      fens.push(g.fen());
      const m = g.move(san);
      ucis.push(uciOf(m));
    }
  } catch {
    /* the walk stops at an unplayable move */
  }
  const walk = { fens, ucis };
  walks.set(ctx, walk);
  return walk;
}

const DEST_RE = /([a-h][1-8])(?:=[NBRQ])?$/;

/**
 * Was `san` the game's move at `index`? By its spelling, or as the same move
 * spelt another way ("Nd5" for Nxd5, "Nd2" for Nbd2 when only one knight
 * goes there): played on that board, it is the game's move.
 */
function playedAt(ctx: WhatIfContext, index: number, san: string): boolean {
  const played = ctx.sans[index];
  if (!played) return false;
  if (sameSan(played, san)) return true;
  const to = DEST_RE.exec(stripSan(san));
  if (!to || DEST_RE.exec(stripSan(played))?.[1] !== to[1]) return false;
  const walk = gameWalk(ctx);
  const fen = walk.fens[index];
  if (!fen) return false;
  const m = tryMove(new Chess(fen), san);
  return !!m && m.uci === walk.ucis[index];
}

interface Reading {
  index: number;
  board: Chess;
  asked: { uci: string; san: string };
  played: { uci: string; san: string } | null;
  /** The named move taken for the alternative, when two were named. */
  alt?: NamedMove;
}

/**
 * The alternative `san` played from `index`, when it is legal there and,
 * unless `allowPlayed`, not the move the game played there ("what about
 * 8. Nc7+?" asks about the played move by name and scores it against the
 * best).
 */
function readingAt(
  ctx: WhatIfContext,
  index: number,
  san: string,
  allowPlayed: boolean
): Reading | null {
  if (index < 0 || index > ctx.sans.length) return null;
  const board = replay(ctx.rootFen, ctx.sans, index);
  if (!board) return null;
  const playedSan = ctx.sans[index];
  const played = playedSan ? tryMove(board, playedSan) : null;
  const asked = tryMove(board, san);
  if (!asked) return null;
  if (played && asked.uci === played.uci && !allowPlayed) return null;
  return { index, board, asked, played };
}

const isReading = (r: Reading | null): r is Reading => r !== null;

/**
 * The side the words give the moves in `tokens`: who plays them ("could I
 * have played", "what if Black plays", "why didn't my opponent play"),
 * whose they are ("my Nd5", "Black's e5"), or "for White". "I" and "my
 * opponent" name a side only once the player's side is known. "conflict"
 * when the words name both.
 */
function sideNamed(
  question: string,
  tokens: readonly QuestionMove[],
  ctx: WhatIfContext
): Side | null | "conflict" {
  const sides = new Set<Side>();
  const opponent: Side = ctx.playerColor === "w" ? "b" : "w";
  const add = (word: string) => {
    const w = word.toLowerCase();
    if (w.startsWith("white")) sides.add("w");
    else if (w.startsWith("black")) sides.add("b");
    else if (!ctx.playerSideKnown) return;
    else if (/opponent|^(?:he|she|they|his|her|their)$/.test(w))
      sides.add(opponent);
    else sides.add(ctx.playerColor);
  };
  for (const t of tokens) {
    const before = question.slice(0, t.start);
    const subject =
      SUBJECT_BEFORE_RE.exec(before) ?? OWNER_BEFORE_RE.exec(before);
    if (subject) add(subject[1]);
    const after = SIDE_AFTER_RE.exec(question.slice(t.end));
    if (after) add(after[1]);
  }
  if (sides.size > 1) return "conflict";
  return sides.size === 1 ? Array.from(sides)[0] : null;
}

/** The readings of the side the words name, one per place and move. */
function onSide(readings: readonly Reading[], side: Side | null): Reading[] {
  const seen = new Set<string>();
  return readings.filter((r) => {
    if (side && r.board.turn() !== side) return false;
    const key = `${r.index}:${r.asked.uci}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** A numbered reference's index, checked against the board there. */
function numberedIndex(
  ctx: WhatIfContext,
  ref: { number: number; color: "w" | "b" }
): number | null {
  const k = indexOfNumbered(ctx.rootFen, ctx.sans, ref);
  if (k === null) return null;
  const board = replay(ctx.rootFen, ctx.sans, k);
  if (!board || board.moveNumber() !== ref.number || board.turn() !== ref.color)
    return null;
  return k;
}

/** Is there a next-move cue beside this token ("Nd5 here", "Now, what about Nd5")? */
function nextCueBeside(question: string, t: QuestionMove): boolean {
  if (NEXT_AFTER_RE.test(question.slice(t.end))) return true;
  const before = question.slice(0, t.start);
  // The clause the move sits in: after the last sentence break, not the
  // dots of a move number ("7... Qxc1", "1.e4").
  let from = 0;
  for (const m of Array.from(before.matchAll(/[?!;]|(?<![\d.])\.(?!\.)/g)))
    from = (m.index ?? 0) + 1;
  return NEXT_CLAUSE_RE.test(before.slice(from));
}

/**
 * Each named move where the game played it, with the other in its place:
 * "what about Qxc1 instead of Nc7+?" and "why Nc7+ instead of Qxc1?" both
 * read 8. Qxc1 off the game, which decides which move is which. Within
 * `plies` when given (a "move N" question).
 */
function replacements(
  ctx: WhatIfContext,
  named: readonly NamedMove[],
  plies?: readonly number[]
): Reading[] {
  const out: Reading[] = [];
  const at = plies ?? ctx.sans.map((_, k) => k);
  for (const [played, alt] of [
    [named[0], named[1]],
    [named[1], named[0]],
  ]) {
    for (const k of at) {
      if (!playedAt(ctx, k, played.san)) continue;
      const r = readingAt(ctx, k, alt.san, false);
      if (r) out.push({ ...r, alt });
    }
  }
  return out;
}

/**
 * The readings that read the words' way round: "why X instead of Y?" asks
 * why X was played, so Y is the alternative; any other form ("what about
 * X instead of Y?", "why not X instead of Y?", "X instead of Y?") asks
 * about X. All of them when the words do not set the two moves against
 * each other.
 */
function inWordsOrder(
  question: string,
  named: readonly NamedMove[],
  readings: readonly Reading[]
): Reading[] {
  const plain = named.find((n) => n.role === "plain");
  const setAside = named.find((n) => n.role === "set-aside");
  if (!plain || !setAside) return [...readings];
  const whyPlayed = plain.tokens.some((t) =>
    WHY_PLAYED_BEFORE_RE.test(question.slice(0, t.start))
  );
  const alt = whyPlayed ? setAside : plain;
  return readings.filter((r) => r.alt === alt);
}

/**
 * A move the question numbered sits at its own number counted from the
 * game's root ("after 7... Qxc1, why not 8. Qxc1?" is White's move 8). One
 * numbered move alone is the alternative there, or the played move asked
 * about by name. Beside another named move, the game decides: the one
 * played at that number is set aside and the other is the alternative
 * ("instead of 8. Nc7+, what about Nd6+?", "8. Nc7+ instead of 8. Qxc1?");
 * when neither or both were played there, nothing.
 */
function fromNumbers(
  question: string,
  named: readonly NamedMove[],
  ctx: WhatIfContext
): Reading | null {
  const side = sideNamed(
    question,
    named.flatMap((n) => n.tokens),
    ctx
  );
  if (side === "conflict") return null;
  const placed = named.map((n) => ({
    n,
    index: n.numbered ? numberedIndex(ctx, n.numbered) : null,
  }));
  if (placed.some((p) => p.n.numbered && p.index === null)) return null;
  let reading: Reading | null = null;
  if (placed.length === 1) {
    const { n, index } = placed[0];
    if (n.role !== "plain") return null;
    reading = readingAt(ctx, index!, n.san, true);
  } else {
    const [a, b] = placed;
    if (a.n.numbered && b.n.numbered) {
      if (a.index !== b.index) return null;
      const aPlayed = playedAt(ctx, a.index!, a.n.san);
      if (aPlayed === playedAt(ctx, b.index!, b.n.san)) return null;
      reading = readingAt(ctx, a.index!, (aPlayed ? b : a).n.san, false);
    } else {
      const num = a.n.numbered ? a : b;
      const bare = a.n.numbered ? b : a;
      const k = num.index!;
      if (playedAt(ctx, k, num.n.san))
        reading = readingAt(ctx, k, bare.n.san, false);
      else if (playedAt(ctx, k, bare.n.san))
        reading = readingAt(ctx, k, num.n.san, false);
      else return null;
    }
  }
  if (!reading) return null;
  return side && reading.board.turn() !== side ? null : reading;
}

/**
 * "Move 4" with no side: the alternative is read at White's and Black's
 * move 4. One named move: where it is legal (or was played), and legal for
 * both, the side the words name, else the player's when it is known. Two:
 * where one of them was played there, the other in its place, read the
 * words' way round.
 */
function onMoveNumber(
  question: string,
  named: readonly NamedMove[],
  n: number,
  ctx: WhatIfContext
): Reading | null {
  const side = sideNamed(
    question,
    named.flatMap((m) => m.tokens),
    ctx
  );
  if (side === "conflict") return null;
  const plies = (["w", "b"] as const)
    .map((color) => numberedIndex(ctx, { number: n, color }))
    .filter((k): k is number => k !== null);
  if (named.length === 1) {
    const alt = named[0];
    if (alt.role !== "plain") return null;
    const left = onSide(
      plies.map((k) => readingAt(ctx, k, alt.san, true)).filter(isReading),
      side
    );
    if (left.length === 1) return left[0];
    const tie =
      ctx.defaultSide ?? (ctx.playerSideKnown ? ctx.playerColor : undefined);
    if (left.length === 2 && !side && tie)
      return left.find((r) => r.board.turn() === tie) ?? null;
    return null;
  }
  const left = onSide(
    inWordsOrder(question, named, replacements(ctx, named, plies)),
    side
  );
  return left.length === 1 ? left[0] : null;
}

/**
 * Two moves named, neither numbered: one of them where the game played it,
 * the other in its place (replacements), read the words' way round and on
 * the side they name. Nothing unless exactly one place is left.
 */
function fromPlayedMove(
  question: string,
  named: readonly NamedMove[],
  ctx: WhatIfContext
): Reading | null {
  const side = sideNamed(
    question,
    named.flatMap((m) => m.tokens),
    ctx
  );
  if (side === "conflict") return null;
  const left = onSide(
    inWordsOrder(question, named, replacements(ctx, named)),
    side
  );
  return left.length === 1 ? left[0] : null;
}

/**
 * "After Y, what about X?": Y is a line the game played (one move or
 * several, "after 7... Qxc1 8. Nc7+"), found where it was played, and X is
 * the next move after it; with "instead" X may also replace the line's
 * last move ("after 7... Qxc1 8. Nc7+, what about Nd6+ instead?"). A line
 * the game never played, a second move beside X, or two places that fit,
 * and nothing is drawn. The side the words name is X's, not the line's.
 */
function afterLine(
  question: string,
  line: readonly QuestionMove[],
  named: readonly NamedMove[],
  moveNumber: number | null,
  ctx: WhatIfContext
): Reading | null {
  if (named.length !== 1 || named[0].role !== "plain") return null;
  const alt = named[0];
  const side = sideNamed(question, alt.tokens, ctx);
  if (side === "conflict") return null;
  let altIndex: number | undefined;
  if (alt.numbered) {
    const k = numberedIndex(ctx, alt.numbered);
    if (k === null) return null;
    altIndex = k;
  }
  const pinned = line.map((m) =>
    m.numbered ? numberedIndex(ctx, m.numbered) : undefined
  );
  if (pinned.some((k) => k === null)) return null;
  const r = line.length;
  const instead = INSTEAD_RE.test(question);
  const readings: Reading[] = [];
  for (let k = 0; k + r <= ctx.sans.length; k++) {
    const fits = line.every(
      (m, i) =>
        playedAt(ctx, k + i, m.san) &&
        (pinned[i] === undefined || pinned[i] === k + i)
    );
    if (!fits) continue;
    // After the line's last move, or in its place with "instead" or a
    // number that says so ("after 7... Qxc1 8. Nc7+, why not 8. Qxc1?").
    const places =
      instead || altIndex === k + r - 1 ? [k + r, k + r - 1] : [k + r];
    for (const at of places) {
      if (altIndex !== undefined && at !== altIndex) continue;
      if (
        moveNumber !== null &&
        moveNumberAt(ctx, k + r - 1) !== moveNumber &&
        moveNumberAt(ctx, at) !== moveNumber
      )
        continue;
      const reading = readingAt(ctx, at, alt.san, false);
      if (reading) readings.push(reading);
    }
  }
  const left = onSide(readings, side);
  return left.length === 1 ? left[0] : null;
}

/**
 * A bare alternative alone, read against the board. The strip at ply N
 * names move N, the one just played, so "what about Nd5 instead?" replaces
 * it (the position before it, the side that moved), while "what about Nd5
 * here?" is the next move from the position shown. Legal at both, the side
 * the words name decides ("could I have played Nd5 here?"), then the cue:
 * a replace cue alone takes the move just played, anything else draws
 * nothing. Only on the mainline (with an exploration or a drill on the
 * board the question is about a board this resolver cannot see), except
 * on a what-if's own alternative: there the next alternative replaces it
 * at the same ply, unless the move is also the reply on the board shown
 * and nothing in the words picks the replacement.
 */
function fromBoard(
  question: string,
  alt: NamedMove,
  ctx: WhatIfContext
): Reading | null {
  if (alt.role !== "plain") return null;
  const side = sideNamed(question, alt.tokens, ctx);
  if (side === "conflict") return null;
  const replace = REPLACE_CUE_RE.test(question);
  const next = alt.tokens.some((t) => nextCueBeside(question, t));
  if (ctx.onWhatIf) {
    // "Here" is the board shown, off the mainline: the coach's words.
    if (next && !replace) return null;
    const reading = readingAt(ctx, ctx.onWhatIf.index, alt.san, !replace);
    if (!reading) return null;
    if (side) return reading.board.turn() === side ? reading : null;
    let reply: { uci: string; san: string } | null = null;
    try {
      reply = tryMove(new Chess(ctx.onWhatIf.fen), alt.san);
    } catch {
      reply = null;
    }
    return reply && !replace ? null : reading;
  }
  if (ctx.exploring) return null;
  const viewed = Math.max(0, Math.min(ctx.viewedPly, ctx.sans.length));
  const plies = next && !replace ? [viewed] : [viewed - 1, viewed];
  const left = onSide(
    plies
      .map((k) => readingAt(ctx, k, alt.san, k === viewed && !replace))
      .filter(isReading),
    side
  );
  if (left.length === 1) return left[0];
  if (left.length === 2 && replace && !next) return left[0];
  return null;
}

/**
 * The alternative a question names, as a move legal in the position it is
 * asked about, with the moves to score beside it. Null when the question
 * is not a what-if, names no move legal where it is asked about, or leaves
 * the place it means open: two readings fit and nothing in the words
 * picks one, the words name a side that cannot play it there, or the
 * question names more than two moves besides an "after" line. The coach
 * still answers in words and the board stays where it is. A wrong ply,
 * number or side is never drawn.
 *
 * Where the alternative is played from, in order: after an "after" line
 * (afterLine); at a number the question wrote (fromNumbers); at "move N"
 * (onMoveNumber); where one of two named moves was played (fromPlayedMove);
 * against the board shown (fromBoard).
 */
export function resolveWhatIf(
  question: string,
  ctx: WhatIfContext
): WhatIfAsk | null {
  const { sans } = ctx;
  if (!question.trim() || sans.length === 0) return null;
  const anchor = resolveQuestionAnchor(
    question,
    sans,
    ctx.playerColor,
    ctx.viewedPly
  );
  const intent = resolveQuestionIntent(question, {
    anchor,
    moves: sans,
    playerColor: ctx.playerColor,
  });
  if (intent.intent !== "what_if") return null;
  const moves = questionMoves(question);
  const line = moves.filter((m) => m.role === "context");
  const named = namedMoves(moves);
  if (!named || named.length === 0 || named.length > 2) return null;
  const mn = MOVE_NUMBER_RE.exec(question);
  const moveNumber = mn ? Number(mn[1] ?? mn[2]) : null;

  const reading =
    line.length > 0
      ? afterLine(question, line, named, moveNumber, ctx)
      : named.some((n) => n.numbered)
        ? fromNumbers(question, named, ctx)
        : moveNumber !== null
          ? onMoveNumber(question, named, moveNumber, ctx)
          : named.length === 2
            ? fromPlayedMove(question, named, ctx)
            : fromBoard(question, named[0], ctx);
  if (!reading) return null;
  // On a what-if's own board, a move that is also the reply there is
  // asked about that board unless the reading replaces the what-if itself:
  // the words placed it elsewhere in the game, the reader may mean the
  // board in front of them, and that is left to the coach.
  if (ctx.onWhatIf && reading.index !== ctx.onWhatIf.index) {
    let reply: { uci: string; san: string } | null = null;
    try {
      reply = tryMove(new Chess(ctx.onWhatIf.fen), reading.asked.san);
    } catch {
      reply = null;
    }
    if (reply) return null;
  }

  const { index, board, played } = reading;
  const asked: WhatIfMove = { role: "asked", ...reading.asked };
  const askedMoves: WhatIfMove[] = [asked];
  if (played && played.uci !== asked.uci)
    askedMoves.push({ role: "played", ...played });
  const best = ctx.enginePositions?.[index]?.lines?.[0];
  if (best && best.depth > 0 && best.pv?.[0]) {
    const m = tryMove(board, uciParams(best.pv[0]));
    if (m && !askedMoves.some((x) => x.uci === m.uci))
      askedMoves.push({ role: "best", ...m });
  }

  return {
    index,
    fen: board.fen(),
    moveNumber: board.moveNumber(),
    color: board.turn(),
    asked,
    moves: askedMoves,
    rule: anchor?.askedSan ? "asked_san" : "phrase",
  };
}

/** A piece named before the moves: "is my knight better on e4 or d4?" names squares, not pawn moves. */
const PIECE_WORD_RE = /\b(?:king|queen|rook|bishop|knight|piece)s?\b/i;

/**
 * Two moves set side by side ("8. Qxc1 or 8. Nd6+?", "Nf3 or Nc3 here?"),
 * read with the router's own rule (compareWords.ts, readCompare), as two
 * moves legal in one position, with the review's best beside them where it
 * is neither. Tried after resolveWhatIf, which never reads a compare. Null
 * unless the words place both moves at exactly one ply:
 * - The two moves the rule read are the only moves written, as written
 *   (no third move, so no "after" line), and no "move 8" is named.
 * - A bare pawn pair counts only beside a move cue ("should I push e4 or
 *   d4?", "e4 or d4 here?"), and never after a piece's name.
 * - A side the words name is the side to move there.
 * - A number written beside either move places them, both numbers alike,
 *   else the board: the next move with "here" or "now", the move the strip
 *   names with "instead" or "should I have", either with neither cue or
 *   both, and never on an exploration or a what-if's own board, which this
 *   resolver cannot see.
 * Both moves must be legal there and differ. The coach still answers in
 * words when nothing is drawn, and a wrong ply is never drawn.
 */
export function resolveCompare(
  question: string,
  ctx: WhatIfContext
): WhatIfAsk | null {
  const { sans } = ctx;
  if (!question.trim() || sans.length === 0) return null;
  const tokens = readCompare(question, {
    anchor: null,
    moves: sans,
    playerColor: ctx.playerColor,
  });
  if (!tokens) return null;
  // The two moves named, and no third: a bare square elsewhere ("to control
  // d5") is no move, and the same move named again ("I like Nf3") is the
  // same move. Spelled as written, so "qxc1 or Nd6+" is not read.
  const written = Array.from(question.matchAll(MOVE_TOKEN_RE)).filter((m) => {
    const at = m.index ?? 0;
    const isToken = tokens.some((t) => at >= t.start && at < t.end);
    return isToken || m[1] !== undefined || !PAWN_PUSH_RE.test(m[3]);
  });
  const named = new Set(written.map((m) => m[3]));
  if (
    written.length < 2 ||
    written[0][3] !== tokens[0].san ||
    written[1][3] !== tokens[1].san ||
    named.size !== 2
  )
    return null;
  if (MOVE_NUMBER_RE.test(question)) return null;
  const moves: QuestionMove[] = tokens.map((t) => ({
    san: t.san,
    numbered: t.numbered,
    role: "plain",
    start: t.start,
    end: t.end,
  }));
  const [first, second] = moves;
  const numbers = moves.flatMap((m) => (m.numbered ? [m.numbered] : []));
  if (numbers.length === 0 && moves.some((m) => PAWN_PUSH_RE.test(m.san))) {
    const before = question.slice(0, first.start);
    if (PIECE_WORD_RE.test(before)) return null;
    // A cue before the pair, beside either move, or "instead" after it.
    if (
      !PAWN_CUE_BEFORE_RE.test(before) &&
      !moves.some((m) => nextCueBeside(question, m)) &&
      !PAWN_CUE_AFTER_RE.test(question.slice(second.end))
    )
      return null;
  }
  const side = sideNamed(question, moves, ctx);
  if (side === "conflict") return null;

  let plies: number[];
  if (numbers.length > 0) {
    const [a, b] = numbers;
    if (b && (a.number !== b.number || a.color !== b.color)) return null;
    const k = numberedIndex(ctx, a);
    if (k === null) return null;
    plies = [k];
  } else {
    if (ctx.exploring || ctx.onWhatIf) return null;
    const viewed = Math.max(0, Math.min(ctx.viewedPly, sans.length));
    const replace = REPLACE_CUE_RE.test(question);
    const next = moves.some((m) => nextCueBeside(question, m));
    plies =
      next && !replace
        ? [viewed]
        : replace && !next
          ? [viewed - 1]
          : [viewed - 1, viewed];
  }
  const fits = plies.flatMap((k) => {
    const a = readingAt(ctx, k, first.san, true);
    const b = readingAt(ctx, k, second.san, true);
    if (!a || !b || a.asked.uci === b.asked.uci) return [];
    if (side && a.board.turn() !== side) return [];
    return [{ k, board: a.board, asked: a.asked, compared: b.asked }];
  });
  if (fits.length !== 1) return null;
  const { k, board } = fits[0];
  // On a what-if's own board, as for a what-if: a move that is also the
  // reply there may be about the board in front of the reader, and that is
  // left to the coach.
  if (ctx.onWhatIf && k !== ctx.onWhatIf.index) {
    for (const m of [first, second]) {
      let reply: { uci: string; san: string } | null = null;
      try {
        reply = tryMove(new Chess(ctx.onWhatIf.fen), m.san);
      } catch {
        reply = null;
      }
      if (reply) return null;
    }
  }

  const asked: WhatIfMove = { role: "asked", ...fits[0].asked };
  const compared: WhatIfMove = { role: "compared", ...fits[0].compared };
  const searched: WhatIfMove[] = [asked, compared];
  const best = ctx.enginePositions?.[k]?.lines?.[0];
  if (best && best.depth > 0 && best.pv?.[0]) {
    const m = tryMove(board, uciParams(best.pv[0]));
    if (m && !searched.some((x) => x.uci === m.uci))
      searched.push({ role: "best", ...m });
  }
  return {
    index: k,
    fen: board.fen(),
    moveNumber: board.moveNumber(),
    color: board.turn(),
    asked,
    compared,
    moves: searched,
    rule: "compare",
  };
}

/** The asked move's score in a result, or null when the engine gave it no line. */
export function askedMoveEval(
  ask: WhatIfAsk,
  result: MovesEval
): MoveEval | null {
  return result.moves.find((m) => m.uci === ask.asked.uci) ?? null;
}

/**
 * The line ProofLine draws for the what-if: the asked move and the
 * engine's reply to it, from the position it is asked about.
 */
export function whatIfLine(
  ask: WhatIfAsk,
  result: MovesEval,
  maxPlies = 8
): CoachLine | null {
  return whatIfLineFor(ask, result, ask.asked.uci, maxPlies);
}

/**
 * The line for one move of the search (`uci`): that move and the engine's
 * reply to it, from the position it is asked about. A compare draws two.
 */
export function whatIfLineFor(
  ask: WhatIfAsk,
  result: MovesEval,
  uci: string,
  maxPlies = 8
): CoachLine | null {
  const scored = result.moves.find((m) => m.uci === uci) ?? null;
  if (!scored || scored.pv.length === 0) return null;
  const sans: string[] = [];
  try {
    const g = new Chess(ask.fen);
    for (const uci of scored.pv.slice(0, maxPlies)) {
      const mv = g.move(uciParams(uci) as Parameters<Chess["move"]>[0]);
      if (!mv) break;
      sans.push(mv.san);
    }
  } catch {
    /* keep what replayed */
  }
  if (sans.length === 0) return null;
  return {
    kind: "engine",
    anchorPly: ask.index,
    startFen: ask.fen,
    sans,
    moveNumber: ask.moveNumber,
    startsWhite: ask.color === "w",
    evalDisplay: formatEval(scored),
    depth: scored.depth,
  };
}

/** How long the question waits for the what-if's first deep partial before it goes up without its numbers. */
export const WHAT_IF_EVALS_WAIT_MS = 1500;

/**
 * The numbers a what-if sends up with its question (lib/coach/clientEvals.ts,
 * verified there against the stored game, never trusted): every move the
 * search scored with its own number, depth and line, White-relative, the
 * line cut to the length the server licenses. Null while the asked move has
 * no line or the search is short of the pathway's first depth; the question
 * then goes up without them. A compare's second move goes up as `compared`,
 * and a compare whose second move is not scored sends nothing.
 */
export function whatIfClientEvals(
  ask: WhatIfAsk,
  result: MovesEval
): ClientEvals | null {
  const moves: ClientEvals["moves"] = [];
  for (const m of ask.moves) {
    const e = result.moves.find((x) => x.uci === m.uci);
    if (!e || e.pv[0] !== m.uci) continue;
    const score =
      e.mate !== undefined && e.mate !== 0
        ? { mate: e.mate }
        : e.cp !== undefined
          ? { cp: e.cp }
          : null;
    if (!score) continue;
    moves.push({
      role: m.role,
      uci: m.uci,
      ...score,
      depth: e.depth,
      pv: e.pv.slice(0, CLIENT_EVALS_LINE_PLIES),
    });
  }
  if (!moves.some((m) => m.role === "asked")) return null;
  if (ask.compared && !moves.some((m) => m.role === "compared")) return null;
  const depth = Math.min(...moves.map((m) => m.depth));
  if (depth < WHAT_IF_FIRST_DEPTH) return null;
  return { index: ask.index, fen: ask.fen, depth, moves };
}

/** The numbers for a question, or null when they are not there within `ms`: the question never waits longer. */
export function whatIfEvalsWithin(
  numbers: Promise<ClientEvals | null> | undefined,
  ms: number
): Promise<ClientEvals | null> {
  if (!numbers) return Promise.resolve(null);
  return new Promise((resolve) => {
    const bound = setTimeout(() => resolve(null), ms);
    numbers.then(
      (v) => {
        clearTimeout(bound);
        resolve(v);
      },
      () => {
        clearTimeout(bound);
        resolve(null);
      }
    );
  });
}

/** Every move of the search with its number, in the ask's order: asked, compared, played, best. */
export function whatIfScores(ask: WhatIfAsk, result: MovesEval): WhatIfScore[] {
  return ask.moves.map((m) => {
    const scored = result.moves.find((r) => r.uci === m.uci);
    return {
      ...m,
      cp: scored?.cp,
      mate: scored?.mate,
      depth: scored?.depth ?? 0,
      evalDisplay: scored ? formatEval(scored) : null,
    };
  });
}

/** "8. Qxc1" / "8... Qxc1", the way the strip and the jump state name a move. */
export function moveLabel(
  moveNumber: number,
  color: "w" | "b",
  san: string
): string {
  return `${moveNumber}${color === "b" ? "..." : "."} ${san}`;
}

export function whatIfMoveLabel(ask: WhatIfAsk): string {
  return moveLabel(ask.moveNumber, ask.color, ask.asked.san);
}

// ─── Running the search ─────────────────────────────────────────────────────

/** The one engine method a what-if needs, so a test can hand in a fake. */
export interface WhatIfEngine {
  evaluateMoves(params: EvaluateMovesParams): Promise<MovesEval>;
}

export interface WhatIfRun {
  ask: WhatIfAsk;
  engine: WhatIfEngine;
  /**
   * The page's engine turn (lib/engine/engineTurn.ts): the search waits for
   * the live eval, and the live eval waits for it. The review's sweep is not
   * in the turn: a what-if is refused while it runs ("busy").
   */
  turn: EngineTurn;
  /** The depth the search runs to. */
  depth?: number;
  /** Partials shallower than this are not reported: the first drawn line is at a stable depth. */
  firstDepth?: number;
  /**
   * Every result worth drawing, in order: each partial at or above
   * `firstDepth` with every asked move scored, then the final result.
   */
  onResult: (result: MovesEval, final: boolean) => void;
  /** True once nobody wants the answer any more (a new game, the page gone). */
  isStale?: () => boolean;
  /** Go before the engine jobs still waiting (the page's live evals), after the one running. */
  ahead?: boolean;
  /** Ends the search: a new game, the page gone, or a newer what-if. */
  signal?: AbortSignal;
  /** The search is given up after this long, so the turn is never held for good. */
  timeoutMs?: number;
}

/**
 * Score the ask's moves in one search when the engine is free, reporting
 * each partial deep enough to draw. Resolves with the final result, or null
 * when the search was not run (stale before its turn), was ended (the
 * caller's signal, or the bound) or failed; a failure is the caller's to
 * show, never a retry. The engine's search gets a signal of its own that
 * aborts with the caller's and when the bound runs out, so a search that
 * never answers cannot hold the turn.
 */
export async function runWhatIf(run: WhatIfRun): Promise<MovesEval | null> {
  const {
    ask,
    engine,
    turn,
    depth = WHAT_IF_DEPTH,
    firstDepth = WHAT_IF_FIRST_DEPTH,
    onResult,
    isStale = () => false,
    ahead = false,
    signal,
    timeoutMs = WHAT_IF_TIMEOUT_MS,
  } = run;
  return turn.run(
    async () => {
      if (isStale() || signal?.aborted) return null;
      const search = new AbortController();
      const onOuterAbort = () => search.abort();
      signal?.addEventListener("abort", onOuterAbort, { once: true });
      let bound: ReturnType<typeof setTimeout> | undefined;
      // The job settles at the bound whatever the engine does: the search
      // is told to stop, and the turn is released even if the engine never
      // answers the stop.
      const giveUp = new Promise<never>((_, reject) => {
        bound = setTimeout(() => {
          search.abort();
          reject(new Error("What-if search given up"));
        }, timeoutMs);
      });
      const searching = engine.evaluateMoves({
        fen: ask.fen,
        moves: ask.moves.map((m) => m.uci),
        depth,
        signal: search.signal,
        onPartial: (partial) => {
          if (isStale() || search.signal.aborted || partial.depth < firstDepth)
            return;
          onResult(partial, false);
        },
      });
      searching.catch(() => {
        /* settled through the race below */
      });
      try {
        const result = await Promise.race([searching, giveUp]);
        if (isStale() || search.signal.aborted) return null;
        onResult(result, true);
        return result;
      } catch {
        return null;
      } finally {
        clearTimeout(bound);
        signal?.removeEventListener("abort", onOuterAbort);
      }
    },
    { ahead }
  );
}

// ─── The state the player's message carries ─────────────────────────────────

export type WhatIfStatus = "checking" | "drawn" | "final" | "unavailable";
export type WhatIfUnavailable =
  | "no-engine"
  | "busy"
  | "failed"
  | "no-line"
  | "superseded";

/**
 * What the player's message knows about its what-if, from the moment it is
 * pushed (the space under it is reserved then) to the final depth.
 */
export interface WhatIfState {
  /** Tells one what-if's updates from another's after the transcript changes. */
  id: number;
  ask: WhatIfAsk;
  status: WhatIfStatus;
  /** The asked move and the engine's reply, once a partial deep enough has scored it. */
  line: CoachLine | null;
  scores: WhatIfScore[];
  /** The depth of the result shown; 0 until one is. */
  depth: number;
  reason?: WhatIfUnavailable;
  /**
   * The line once the reader tapped or played it, or the page played it
   * on their order: held from then on, so a deeper search never swaps the
   * moves under the reader.
   */
  pinned?: CoachLine | null;
  /**
   * A compare's second line, beside `line` (the asked move's): drawn with
   * it, never before, and held on its own once the reader taps or plays it.
   */
  compared?: { line: CoachLine | null; pinned?: CoachLine | null };
}

export function initialWhatIfState(id: number, ask: WhatIfAsk): WhatIfState {
  return {
    id,
    ask,
    status: "checking",
    line: null,
    scores: [],
    depth: 0,
    ...(ask.compared ? { compared: { line: null } } : {}),
  };
}

/**
 * The state with `line` held for good, unless a line already is. A
 * compare holds each of its two lines on its own: the one that opens with
 * the compared move is the second.
 */
export function pinWhatIfLine(
  state: WhatIfState,
  line: CoachLine
): WhatIfState {
  const compared = state.ask.compared;
  if (compared && line.sans[0] === compared.san) {
    const slot = state.compared ?? { line: null };
    return slot.pinned
      ? state
      : { ...state, compared: { ...slot, pinned: line } };
  }
  return state.pinned ? state : { ...state, pinned: line };
}

export function whatIfUnavailable(
  prev: WhatIfState,
  reason: WhatIfUnavailable
): WhatIfState {
  return { ...prev, status: "unavailable", reason };
}

/** `next`, keeping `prev`'s `sans` array when the moves are the same, so only the numbers change. */
function keptLine(prev: CoachLine | null, next: CoachLine): CoachLine {
  return prev !== null && prev.sans.join(" ") === next.sans.join(" ")
    ? { ...prev, evalDisplay: next.evalDisplay, depth: next.depth }
    : next;
}

/**
 * The state after a result. A partial that gave the asked move no line is
 * waited through; a final without one is "no-line". When the moves are the
 * ones already drawn, the previous line's `sans` array is kept, so
 * ProofLine's caption memo holds across partials and only the numbers
 * change under the reader. A compare is drawn only with both its lines: a
 * partial missing either is waited through, and a final missing either is
 * "no-line".
 */
export function whatIfStateFrom(
  prev: WhatIfState,
  result: MovesEval,
  final: boolean
): WhatIfState {
  // A partial is never shallower than the one before it (evaluateMoves
  // reports them in order), but nothing drawn is ever replaced by less;
  // and a line already drawn is redrawn every second depth, not every one,
  // so the page is not re-rendered seven times while the search deepens.
  if (!final && result.depth < prev.depth) return prev;
  if (!final && prev.line && result.depth < prev.depth + 2) return prev;
  const line = whatIfLine(prev.ask, result);
  const compared = prev.ask.compared
    ? whatIfLineFor(prev.ask, result, prev.ask.compared.uci)
    : null;
  if (!line || (prev.ask.compared && !compared)) {
    return final
      ? {
          ...prev,
          status: "unavailable",
          reason: "no-line",
          line: null,
          scores: [],
          depth: result.depth,
          ...(prev.compared
            ? { compared: { ...prev.compared, line: null } }
            : {}),
        }
      : prev;
  }
  return {
    ...prev,
    status: final ? "final" : "drawn",
    line: keptLine(prev.line, line),
    ...(compared
      ? {
          compared: {
            ...prev.compared,
            line: keptLine(prev.compared?.line ?? null, compared),
          },
        }
      : {}),
    scores: whatIfScores(prev.ask, result),
    depth: result.depth,
  };
}

// ─── The coach's jump for the same question ─────────────────────────────────

/** What the page does with the coach's anchor jump for a reply. */
export type WhatIfJumpDecision = "apply" | "skip" | "defer";

/**
 * The coach's reply to a question that asked a what-if names a move (the
 * game's move there, usually), and the page would put that position on
 * the board. The board belongs to the what-if for that one reply: once its
 * line is drawn the jump is skipped; while it is still checking the jump
 * waits (it is applied only if no line comes); when nothing could be
 * checked the jump is applied as it always was. Every other reply,
 * including a later question about the same move, jumps as before.
 */
export function whatIfJumpDecision(
  state: WhatIfState | undefined
): WhatIfJumpDecision {
  if (!state) return "apply";
  if (state.status === "drawn" || state.status === "final") return "skip";
  if (state.status === "checking") return "defer";
  return "apply";
}

/**
 * The page's hold on the coach's jump for a what-if's own reply, kept out
 * of the page so the sequence is tested: a jump that arrives while the
 * what-if is checking is held; it is dropped when the line is drawn or a
 * newer reply starts, and handed back when the what-if settles with no
 * line. The page still decides whether the reader moved on meanwhile.
 */
export interface WhatIfJumpGate<J> {
  /** A reply started: a jump held for an older one is no longer anyone's. */
  replyStarted(): void;
  /** The coach's jump for what-if `id`'s own reply, given its state now. */
  jump(id: number, state: WhatIfState | undefined, jump: J): WhatIfJumpDecision;
  /** What-if `id` drew its line: its held jump is dropped. */
  drawn(id: number): void;
  /** What-if `id` settled; its held jump when no line was drawn, else null. */
  settled(id: number, drawn: boolean): J | null;
}

export function createWhatIfJumpGate<J>(): WhatIfJumpGate<J> {
  let held: { id: number; jump: J } | null = null;
  return {
    replyStarted: () => {
      held = null;
    },
    jump: (id, state, jump) => {
      const decision = whatIfJumpDecision(state);
      if (decision === "defer") held = { id, jump };
      return decision;
    },
    drawn: (id) => {
      if (held?.id === id) held = null;
    },
    settled: (id, drawn) => {
      if (held?.id !== id) return null;
      const jump = held.jump;
      held = null;
      return drawn ? null : jump;
    },
  };
}

// ─── Where the state lives ──────────────────────────────────────────────────

/**
 * The what-if states, outside React. A partial carried through the
 * transcript's state re-rendered the whole page each time it landed (half
 * a second or more on the phone the e2e throttles like, between the
 * engine's first partial and the line's paint); through this store only the
 * line under the question re-renders (WhatIfLine subscribes to its own id
 * with useSyncExternalStore). The message carries the id and the ask; the
 * store carries the rest, for the life of the page.
 */
export interface WhatIfStore {
  get(id: number): WhatIfState | undefined;
  set(id: number, state: WhatIfState): void;
  /** Apply `update`; an update that returns the same state notifies nobody. */
  update(id: number, update: (state: WhatIfState) => WhatIfState): void;
  subscribe(listener: () => void): () => void;
}

export function createWhatIfStore(): WhatIfStore {
  const states = new Map<number, WhatIfState>();
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of Array.from(listeners)) listener();
  };
  return {
    get: (id) => states.get(id),
    set: (id, state) => {
      states.set(id, state);
      notify();
    },
    update: (id, update) => {
      const prev = states.get(id);
      if (!prev) return;
      const next = update(prev);
      if (next === prev) return;
      states.set(id, next);
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const ROLE_WORD: Record<WhatIfRole, string> = {
  asked: "",
  compared: "",
  played: "played",
  best: "engine's",
};

/**
 * The words above the drawn line (two lines are reserved for them): the asked move's
 * number beside the others' from the same search, with the depth; or what
 * is being checked; or why nothing could be.
 */
export function whatIfSummary(state: WhatIfState): string {
  const label = whatIfMoveLabel(state.ask);
  switch (state.status) {
    case "checking":
      return `Checking ${label} with the engine…`;
    case "unavailable":
      switch (state.reason) {
        case "no-engine":
          return `The engine isn't available here, so ${label} is unchecked.`;
        case "busy":
          return `The engine is still reviewing the game, so ${label} is unchecked.`;
        case "no-line":
          return `The engine found no line for ${label}.`;
        case "superseded":
          return `A newer question took the engine before ${label} was checked.`;
        default:
          return `The engine couldn't check ${label}.`;
      }
    default: {
      const [asked, ...others] = state.scores;
      const parts = [`${label} ${asked?.evalDisplay ?? "?"}`];
      // The moves compared are played from the same position, so the
      // number is written once, on the asked move: the three-role form then
      // fits the two reserved lines on a phone.
      for (const o of others)
        parts.push(`${ROLE_WORD[o.role]} ${o.san} ${o.evalDisplay ?? "?"}`);
      parts.push(`d${state.depth}`);
      return parts.join(" · ");
    }
  }
}

// ─── A compare ──────────────────────────────────────────────────────────────

/**
 * Off until its flip (pathway 3.5, never on before the server's
 * COACH_COMPARE): its own one-line PR changes this default, and the env
 * overrides it either way, which is how the Playwright legs run it on.
 */
export const COMPARE_PUBLIC_DEFAULT = false;

/**
 * Read once at module level by the analysis page. `NEXT_PUBLIC_` values are
 * inlined at build time, and only for this literal spelling of the name.
 */
export function isCompareEnabledPublic(): boolean {
  const v = (process.env.NEXT_PUBLIC_COACH_COMPARE ?? "").trim().toLowerCase();
  if (v === "1" || v === "on" || v === "true") return true;
  if (v === "0" || v === "off" || v === "false") return false;
  return COMPARE_PUBLIC_DEFAULT;
}

/** "8. Qxc1 and Nd6+": the two moves, the number written once, as the summary names them. */
export function compareLabel(ask: WhatIfAsk): string {
  const first = whatIfMoveLabel(ask);
  return ask.compared ? `${first} and ${ask.compared.san}` : first;
}

/**
 * The two rows above a compare's lines (two lines are reserved for each):
 * the numbers, both moves' and the engine's best where it is neither, from
 * the one search, with its depth, and the engine's verdict on the two in
 * the app's words, never a figure (compareVerdict.ts). Before the numbers,
 * what is being checked or why nothing could be, and no verdict.
 */
export function compareSummary(state: WhatIfState): {
  numbers: string;
  words: string;
} {
  const label = compareLabel(state.ask);
  const unchecked = (numbers: string) => ({ numbers, words: "" });
  switch (state.status) {
    case "checking":
      return unchecked(`Checking ${label} with the engine…`);
    case "unavailable":
      switch (state.reason) {
        case "no-engine":
          return unchecked(
            `The engine isn't available here, so ${label} are unchecked.`
          );
        case "busy":
          return unchecked(
            `The engine is still reviewing the game, so ${label} are unchecked.`
          );
        case "no-line":
          return unchecked(
            `The engine found no line for one of ${label}, so they are not compared.`
          );
        case "superseded":
          return unchecked(
            `A newer question took the engine before ${label} were checked.`
          );
        default:
          return unchecked(`The engine couldn't check ${label}.`);
      }
    default: {
      const { ask } = state;
      // The moves are played from the same position, so the number is
      // written once, on the first.
      const parts = state.scores.map((s) =>
        s.role === "asked"
          ? `${whatIfMoveLabel(ask)} ${s.evalDisplay ?? "?"}`
          : [ROLE_WORD[s.role], s.san, s.evalDisplay ?? "?"]
              .filter(Boolean)
              .join(" ")
      );
      parts.push(`d${state.depth}`);
      const verdict = ask.compared
        ? compareTwo(
            { fen: ask.fen, moves: state.scores },
            ask.asked.uci,
            ask.compared.uci
          )
        : null;
      const san = (uci: string) =>
        ask.moves.find((m) => m.uci === uci)?.san ?? uci;
      return {
        numbers: parts.join(" · "),
        words: verdict ? compareVerdictWords(verdict, san, "short") : "",
      };
    }
  }
}
