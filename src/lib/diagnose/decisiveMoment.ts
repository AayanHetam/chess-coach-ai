/**
 * The move to ask the player about, and the truth to grade the answer by.
 *
 * A coach who has gone through a game asks the player one question at the
 * move that cost the most: "after this, what was your opponent threatening?"
 * This module picks that move and reads the answer's truth, from engine data
 * alone, with no model in the loop.
 *
 * The move comes from the game's story (gameStory.ts `scoredMoves`, so the
 * depth-0, unscored and mixed-depth guards are the story's own): the move
 * the game turned on when it is the player's and gave away at least 15
 * points of winning chances, else the player's largest swing of 15 or more,
 * else none. A turning point can be a tiny swing (fixture 09 turned on a
 * 2.7-point move) or the other side's move, and neither is worth a question.
 *
 * The truth is the opponent's best reply from the review's own sweep
 * (`lines[0].pv[0]` of the position after the move), kept only when the
 * threat tree calls it concrete: a mate, a check or a capture worth 200 cp
 * (`forcingMoves`, the tree's own scorer). A quiet best reply is no threat
 * to name, so `threatAt` returns null and the question asks for the plan
 * instead. Replies of the same search at the same depth within 5 points
 * count as equal, and every number read here comes from that one search.
 *
 * Pure, client-safe and model-free. Never throws.
 */
import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";
import type { LineEval, PositionEval } from "@/types/eval";
import {
  TURNING_POINT_SWING,
  buildGameStory,
  scoredMoves,
  type GameStory,
  type GameStoryInput,
  type Side,
  type TurningPoint,
} from "@/lib/coach/gameStory";
import { achievedDepth } from "@/lib/contract/evalDepth";
import { getLineWinPercentage } from "@/lib/engine/helpers/winPercentage";
import { forcingMoves } from "@/lib/mastermind/threatTree";
import { buildRelationalFacts } from "@/lib/relational/relationalFactsBuilder";

/** The least a move must have given away, in win-percentage points, to be asked about. */
export const DIAGNOSE_MIN_SWING = TURNING_POINT_SWING;
/** Another reply of the same search, at the same depth, this close is as good as the best. */
export const EQUAL_REPLY_WIN = 5;
/** The truth's line is cut to this many plies. */
const LINE_PLIES = 8;
/** The threat tree's piece values (threatTree.ts), for a capture's worth. */
const PIECE_CP: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

export type DiagnoseSource = "decisive" | "swing" | "asked";

export interface DiagnoseMoment {
  /** Half-moves on the board after the move (the cursor value). */
  ply: number;
  moveNumber: number;
  color: Side;
  san: string;
  /** "7... Qxc1", the strip's spelling. */
  label: string;
  /** What the move gave away, in win-percentage points. */
  swing: number;
  source: DiagnoseSource;
  fenBefore: string;
  fenAfter: string;
}

export interface ThreatTruth {
  uci: string;
  san: string;
  /** "8. Qxc1": the opponent's move at index `ply`. */
  label: string;
  from: Square;
  to: Square;
  captured: PieceSymbol | null;
  isCheck: boolean;
  isMate: boolean;
  materialGainCp: number;
  /** Non-empty only for a fork that wins material. */
  forkTargets: Square[];
  /** The reply takes one of the player's loose pieces. */
  capturesHanging: boolean;
  /** UCI: other lines at lines[0]'s depth within EQUAL_REPLY_WIN. */
  equalReplies: string[];
  /** UCI: the first moves of lines[1..] at lines[0]'s depth. */
  engineReplies: string[];
  /** lines[0].pv, at most 8 plies, every ply replayed legal. */
  line: string[];
  depth: number;
}

const other = (s: Side): Side => (s === "w" ? "b" : "w");

/** The side that plays the move at `index` of a game from the standard start. */
export function sideAt(index: number): Side {
  return index % 2 === 0 ? "w" : "b";
}

/** The move at `index` (0-based) as the strip writes it: "8. Nc7+", "8... Kd8". */
export function labelAt(index: number, san: string): string {
  const moveNumber = Math.floor(index / 2) + 1;
  return `${moveNumber}${index % 2 === 0 ? "." : "..."} ${san}`;
}

/**
 * A UCI move played on `game`, or null when it is not one of its legal moves
 * as chess.js writes them (a stray promotion suffix is no second spelling).
 */
export function playUci(game: Chess, uci: string): Move | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  const promotion = uci.length === 5 ? uci[4] : undefined;
  const legal = game
    .moves({ verbose: true })
    .find(
      (m) =>
        m.from === uci.slice(0, 2) &&
        m.to === uci.slice(2, 4) &&
        (m.promotion ?? undefined) === promotion
    );
  if (!legal) return null;
  try {
    return game.move(legal);
  } catch {
    return null;
  }
}

/** The move's own UCI, as chess.js writes it (e1g1 for castling, e7e8q for a promotion). */
export function moveUci(m: Pick<Move, "from" | "to" | "promotion">): string {
  return `${m.from}${m.to}${m.promotion ?? ""}`;
}

/** White's win percentage of a line, or null when it carries no real score. */
function lineWin(line: LineEval | undefined): number | null {
  if (!line) return null;
  const cp = typeof line.cp === "number" ? line.cp : undefined;
  const mate = typeof line.mate === "number" ? line.mate : undefined;
  if (cp === undefined && mate === undefined) return null;
  try {
    const win = getLineWinPercentage({ ...line, cp, mate });
    return Number.isFinite(win) ? win : null;
  } catch {
    return null;
  }
}

function momentOf(
  input: GameStoryInput,
  tp: TurningPoint,
  source: DiagnoseSource
): DiagnoseMoment | null {
  if (tp.ply < 1 || tp.ply > input.sans.length) return null;
  try {
    const game = new Chess();
    let fenBefore = game.fen();
    let last: Move | null = null;
    for (let i = 0; i < tp.ply; i++) {
      fenBefore = game.fen();
      last = game.move(input.sans[i]);
      if (!last) return null;
    }
    if (!last || last.color !== tp.color) return null;
    return {
      ply: tp.ply,
      moveNumber: tp.moveNumber,
      color: tp.color,
      san: tp.san,
      label: labelAt(tp.ply - 1, tp.san),
      swing: tp.swing,
      source,
      fenBefore,
      fenAfter: game.fen(),
    };
  } catch {
    return null;
  }
}

/**
 * The player's move to ask about: the move the game turned on when it is
 * the player's and swung at least DIAGNOSE_MIN_SWING, else the player's
 * largest swing of that size (the earlier on a tie), else null.
 */
export function findDiagnoseMoment(
  input: GameStoryInput,
  story: GameStory = buildGameStory(input)
): DiagnoseMoment | null {
  const player = input.playerColor;
  if (!player) return null;
  const decisive = story.decisive;
  if (
    decisive &&
    decisive.color === player &&
    decisive.swing >= DIAGNOSE_MIN_SWING
  )
    return momentOf(input, decisive, "decisive");
  let best: TurningPoint | null = null;
  for (const m of scoredMoves(input)) {
    if (m.color !== player || m.swing < DIAGNOSE_MIN_SWING) continue;
    if (!best || m.swing > best.swing) best = m;
  }
  return best ? momentOf(input, best, "swing") : null;
}

/** The player's scored move at `ply`, asked about by the reader, when it gave anything away. */
export function diagnoseMomentAt(
  input: GameStoryInput,
  ply: number
): DiagnoseMoment | null {
  const player = input.playerColor;
  if (!player) return null;
  const m = scoredMoves(input).find((t) => t.ply === ply);
  if (!m || m.color !== player || !(m.swing > 0)) return null;
  return momentOf(input, m, "asked");
}

/** The move is a mate, a check or a capture worth 200 cp for the side to move (the threat tree's rule). */
export function isConcrete(fen: string, uci: string): boolean {
  try {
    return forcingMoves(fen, Infinity).some((m) => m.uci === uci);
  } catch {
    return false;
  }
}

/**
 * The opponent's best reply after the player's move, from the review's own
 * search of `fenAfter` (`position`, positions[ply]), or null when that search
 * is no real reading or its first move does not replay. `player` is the side
 * that made the move: the reply must be the other side's.
 */
export function replyAt(
  fenAfter: string,
  position: PositionEval | undefined,
  player: Side,
  ply: number
): ThreatTruth | null {
  try {
    if (!position || achievedDepth(position) === null) return null;
    const best = position.lines[0];
    const first = best?.pv?.[0];
    if (!best || !first) return null;
    const replier = other(player);
    const game = new Chess(fenAfter);
    // The reply is the other side's, and the move at index `ply` is theirs.
    if (game.turn() !== replier || sideAt(ply) !== replier) return null;
    const move = playUci(game, first);
    if (!move) return null;
    const uci = moveUci(move);
    const fenAfterReply = game.fen();
    const isMate = game.isCheckmate();
    const isCheck = game.inCheck();
    const captured = (move.captured ?? null) as PieceSymbol | null;
    const capturedSquare: Square | null = captured
      ? move.flags.includes("e")
        ? (`${move.to[0]}${move.from[1]}` as Square)
        : move.to
      : null;

    // A capture of one of the player's loose pieces.
    const before = buildRelationalFacts(fenAfter);
    const capturesHanging =
      capturedSquare !== null &&
      before.hanging.some(
        (h) => h.square === capturedSquare && h.color === player
      );

    // A fork that wins material: the moved piece hits two of the player's
    // pieces worth a knight or more (or the king), one of them loose.
    const afterReply = buildRelationalFacts(fenAfterReply);
    const hit = new Map<Square, PieceSymbol>();
    for (const c of afterReply.captures) {
      if (c.attackerSquare !== move.to || c.targetColor !== player) continue;
      if (c.targetType === "k" || PIECE_CP[c.targetType] >= PIECE_CP.n)
        hit.set(c.targetSquare, c.targetType);
    }
    const winsMaterial = Array.from(hit).some(
      ([sq, type]) =>
        type !== "k" && afterReply.hanging.some((h) => h.square === sq)
    );
    const forkTargets =
      hit.size >= 2 && winsMaterial ? Array.from(hit.keys()) : [];

    // The other replies of the same search, at the same depth.
    const depth = best.depth;
    const moverWin = (line: LineEval) => {
      const w = lineWin(line);
      return w === null ? null : replier === "w" ? w : 100 - w;
    };
    const bestWin = moverWin(best);
    const equalReplies: string[] = [];
    const engineReplies: string[] = [];
    for (const line of position.lines.slice(1)) {
      if (!line || line.depth !== depth || !line.pv?.[0]) continue;
      const alt = playUci(new Chess(fenAfter), line.pv[0]);
      if (!alt) continue;
      const altUci = moveUci(alt);
      if (altUci === uci || engineReplies.includes(altUci)) continue;
      engineReplies.push(altUci);
      const altWin = moverWin(line);
      if (
        bestWin !== null &&
        altWin !== null &&
        bestWin - altWin <= EQUAL_REPLY_WIN
      )
        equalReplies.push(altUci);
    }

    // The line, as far as it replays legal.
    const walk = new Chess(fenAfter);
    const pvLine: string[] = [];
    for (const step of best.pv.slice(0, LINE_PLIES)) {
      const m = playUci(walk, step);
      if (!m) break;
      pvLine.push(moveUci(m));
    }

    return {
      uci,
      san: move.san,
      label: labelAt(ply, move.san),
      from: move.from,
      to: move.to,
      captured,
      isCheck,
      isMate,
      materialGainCp: captured ? PIECE_CP[captured] : 0,
      forkTargets,
      capturesHanging,
      equalReplies,
      engineReplies,
      line: pvLine,
      depth,
    };
  } catch {
    return null;
  }
}

/**
 * The threat after the moment: the opponent's best reply when it is
 * concrete, or null (the plan variant: there was no threat to name).
 */
export function threatAt(
  moment: DiagnoseMoment,
  positions: readonly PositionEval[]
): ThreatTruth | null {
  const truth = replyAt(
    moment.fenAfter,
    positions[moment.ply],
    moment.color,
    moment.ply
  );
  return truth && isConcrete(moment.fenAfter, truth.uci) ? truth : null;
}
