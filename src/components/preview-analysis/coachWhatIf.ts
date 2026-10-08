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
 * This is the pure half. It reads the question with the same resolvers the
 * chat route uses (questionAnchor.ts, questionIntent.ts), so the client and
 * the server agree on which move is asked about and where; it turns the
 * asked notation into a move legal in that position, picks the moves worth
 * scoring beside it, and turns a search result into the line ProofLine
 * draws. The engine, the mutex and the message live with the page.
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
import { formatEval, type CoachLine } from "./coachLines";

/** Why a move is in the search: the one asked about, the one the game played there, the review's best there. */
export type WhatIfRole = "asked" | "played" | "best";

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
  /** The search's moves: the asked one first, then the played and the best where they differ. */
  moves: WhatIfMove[];
  /** How the question named the alternative. */
  rule: "asked_san" | "phrase";
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
  /** The review's sweep, for the engine's best move at the position. */
  enginePositions?: readonly PositionEval[] | null;
  /**
   * An exploration is on the board (the position shown is not the cursor's
   * mainline position). A bare alternative is then asked about a board this
   * resolver cannot see, so it draws nothing; a numbered one still resolves.
   */
  exploring?: boolean;
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

/** A move named with its number: "8. Qxc1", "8... Kd8". */
interface NumberedRef {
  number: number;
  color: "w" | "b";
  san: string;
}

const SAN_CORE =
  "(?:[NBRQK][a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?|[a-h]x[a-h][1-8](?:=[NBRQ])?[+#]?|[a-h][1-8](?:=[NBRQ])?[+#]?)";
const NUMBERED_RE = new RegExp(
  `(?<![A-Za-z0-9])(\\d{1,3})\\s*(\\.{1,3})\\s*(${SAN_CORE})(?![A-Za-z0-9])`,
  "g"
);
/** "move 8", "my 8th move": a number with no side. */
const MOVE_NUMBER_RE =
  /\bmove\s+(\d{1,3})\b|\b(\d{1,3})(?:st|nd|rd|th)\s+move\b/i;
/** "instead", "rather than", "why not": the alternative replaces the move the strip names, the one just played. */
const REPLACE_CUE_RE =
  /\b(?:instead|rather\s+than|why\s+not|why\s+didn'?t|(?:should|could|would)(?:n'?t)?\s+(?:i|you|he|she|they|we)\s+have)\b/i;
/** "here", "now", "from here": the alternative is the next move from the position shown. */
const NEXT_CUE_RE = /\b(?:here|now|from\s+here|in\s+this\s+position|next)\b/i;

const stripSan = (san: string) => san.replace(/[+#!?]/g, "").toLowerCase();

function numberedReferences(question: string): NumberedRef[] {
  return Array.from(question.matchAll(NUMBERED_RE)).map((m) => ({
    number: Number(m[1]),
    color: m[2].length >= 2 ? "b" : "w",
    san: m[3],
  }));
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

interface Reading {
  index: number;
  board: Chess;
  asked: { uci: string; san: string };
  played: { uci: string; san: string } | null;
}

/**
 * The alternative played from `index`, when one of the candidates is legal
 * there: a candidate that differs from the move the game played there, or,
 * when `allowPlayed`, the played move itself asked about by name ("what
 * about 8. Nc7+?" scores it against the best).
 */
function readingAt(
  ctx: WhatIfContext,
  index: number,
  candidates: readonly string[],
  allowPlayed: boolean
): Reading | null {
  const board = replay(ctx.rootFen, ctx.sans, index);
  if (!board) return null;
  const playedSan = ctx.sans[index];
  const played = playedSan ? tryMove(board, playedSan) : null;
  const legal = candidates
    .map((san) => tryMove(board, san))
    .filter((m): m is { uci: string; san: string } => m !== null);
  const other = legal.find((m) => !played || m.uci !== played.uci);
  const same = played ? legal.find((m) => m.uci === played.uci) : undefined;
  const asked = other ?? (allowPlayed ? same : undefined);
  if (!asked) return null;
  return { index, board, asked, played };
}

/**
 * The alternative a question names, as a move legal in the position it is
 * asked about, with the moves to score beside it. Null when the question
 * is not a what-if, names no move that is legal where it is asked about,
 * or leaves the board it means open (the coach still answers in words;
 * the board stays where it is).
 *
 * Where the alternative is played from:
 * 1. A move the question numbered sits at its own number, counted from
 *    the game's root. Of several, the one that is NOT the move the game
 *    played there carries the alternative ("after 7... Qxc1, why not
 *    8. Qxc1?" is about White's move 8); when every numbered move was
 *    played, the first is the move being replaced ("instead of 8. Nc7+,
 *    what about Nd6+?").
 * 2. "move 8" with no side: the ply of that number where the alternative
 *    is legal; where it is legal for both, the player's side when it is
 *    known, else nothing.
 * 3. A bare alternative beside the move it replaces, named ("what about
 *    Nd5 instead of Bc4?"): the occurrence of that move nearest the board.
 * 4. A bare alternative alone. The strip at ply N names move N, the one
 *    just played, so "what about Nd5 instead?" replaces it (the position
 *    before it, the side that moved), while "what about Nd5 here?" is the
 *    next move from the position shown. With neither cue the two are
 *    tried and the board decides; legal for both sides, it is left to the
 *    coach's words. Only on the mainline: with an exploration or a drill
 *    on the board the question is about a board this resolver cannot see.
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
  const named = anchor?.askedSan ? [anchor.askedSan] : (intent.moves ?? []);
  if (named.length === 0) return null;

  const viewed = Math.max(0, Math.min(ctx.viewedPly, sans.length));
  const replaceCue = REPLACE_CUE_RE.test(question);
  const nextCue = !replaceCue && NEXT_CUE_RE.test(question);
  const numbered = numberedReferences(question);
  const moveNumber =
    numbered.length === 0 ? MOVE_NUMBER_RE.exec(question) : null;

  let reading: Reading | null = null;
  if (numbered.length > 0) {
    let own: { ref: NumberedRef; index: number } | null = null;
    let replaced: { ref: NumberedRef; index: number } | null = null;
    for (const ref of numbered) {
      const k = indexOfNumbered(ctx.rootFen, sans, ref);
      if (k === null) continue;
      const there = sans[k];
      if (!there || stripSan(there) !== stripSan(ref.san)) {
        own = { ref, index: k };
        break;
      }
      if (!replaced) replaced = { ref, index: k };
    }
    const pick = own ?? replaced;
    if (!pick) return null;
    const board = replay(ctx.rootFen, sans, pick.index);
    // The number the player typed must be the board's, or the label lies.
    if (
      !board ||
      board.moveNumber() !== pick.ref.number ||
      board.turn() !== pick.ref.color
    )
      return null;
    reading = readingAt(ctx, pick.index, own ? [own.ref.san] : named, true);
  } else if (moveNumber) {
    const n = Number(moveNumber[1] ?? moveNumber[2]);
    const other: "w" | "b" = ctx.playerColor === "w" ? "b" : "w";
    const readings = [ctx.playerColor, other]
      .map((color) => {
        const k = indexOfNumbered(ctx.rootFen, sans, { number: n, color });
        return k === null ? null : readingAt(ctx, k, named, true);
      })
      .filter((r): r is Reading => r !== null);
    if (readings.length === 1) reading = readings[0];
    else if (readings.length === 2 && ctx.playerSideKnown)
      reading = readings[0];
    else return null;
  } else if (
    anchor &&
    anchor.matched === "bare-san" &&
    named.some((san) => stripSan(san) !== stripSan(anchor.san))
  ) {
    reading = readingAt(ctx, anchor.index, named, true);
  } else {
    if (ctx.exploring) return null;
    const before = viewed >= 1 ? viewed - 1 : null;
    const order = replaceCue
      ? [before, viewed]
      : nextCue
        ? [viewed]
        : [viewed, before];
    const readings = order
      .filter((k): k is number => k !== null)
      .map((k) => readingAt(ctx, k, named, !replaceCue))
      .filter((r): r is Reading => r !== null);
    if (readings.length === 0) return null;
    if (readings.length > 1 && !replaceCue && !nextCue) return null;
    reading = readings[0];
  }
  if (!reading) return null;

  const { index, board, played } = reading;
  const asked: WhatIfMove = { role: "asked", ...reading.asked };
  const moves: WhatIfMove[] = [asked];
  if (played && played.uci !== asked.uci)
    moves.push({ role: "played", ...played });
  const best = ctx.enginePositions?.[index]?.lines?.[0];
  if (best && best.depth > 0 && best.pv?.[0]) {
    const m = tryMove(board, uciParams(best.pv[0]));
    if (m && !moves.some((x) => x.uci === m.uci))
      moves.push({ role: "best", ...m });
  }

  return {
    index,
    fen: board.fen(),
    moveNumber: board.moveNumber(),
    color: board.turn(),
    asked,
    moves,
    rule: anchor?.askedSan ? "asked_san" : "phrase",
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
  const scored = askedMoveEval(ask, result);
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

/** Every move of the search with its number, in the ask's order: asked, played, best. */
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
  /** The page's engine turn (lib/engine/engineTurn.ts): the search waits for the live eval and the sweep, and they wait for it. */
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
      const bound = setTimeout(() => search.abort(), timeoutMs);
      try {
        const result = await engine.evaluateMoves({
          fen: ask.fen,
          moves: ask.moves.map((m) => m.uci),
          depth,
          signal: search.signal,
          onPartial: (partial) => {
            if (isStale() || partial.depth < firstDepth) return;
            onResult(partial, false);
          },
        });
        if (isStale()) return null;
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
}

export function initialWhatIfState(id: number, ask: WhatIfAsk): WhatIfState {
  return { id, ask, status: "checking", line: null, scores: [], depth: 0 };
}

export function whatIfUnavailable(
  prev: WhatIfState,
  reason: WhatIfUnavailable
): WhatIfState {
  return { ...prev, status: "unavailable", reason };
}

/**
 * The state after a result. A partial that gave the asked move no line is
 * waited through; a final without one is "no-line". When the moves are the
 * ones already drawn, the previous line's `sans` array is kept, so
 * ProofLine's caption memo holds across partials and only the numbers
 * change under the reader.
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
  if (!line) {
    return final
      ? {
          ...prev,
          status: "unavailable",
          reason: "no-line",
          line: null,
          scores: [],
          depth: result.depth,
        }
      : prev;
  }
  const same =
    prev.line !== null && prev.line.sans.join(" ") === line.sans.join(" ");
  return {
    ...prev,
    status: final ? "final" : "drawn",
    line: same
      ? { ...prev.line!, evalDisplay: line.evalDisplay, depth: line.depth }
      : line,
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
  played: "played",
  best: "engine's",
};

/**
 * The one line of plain words above the drawn line: the asked move's
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
      for (const o of others) {
        const san = moveLabel(state.ask.moveNumber, state.ask.color, o.san);
        parts.push(`${ROLE_WORD[o.role]} ${san} ${o.evalDisplay ?? "?"}`);
      }
      parts.push(`d${state.depth}`);
      return parts.join(" · ");
    }
  }
}
