/**
 * The player's own mistakes in this game, as puzzles (pathway 4.7).
 *
 * After the diagnosing question is graded, the coach offers a drill set
 * for the cause it found: the player's other mistakes of the same kind in
 * this game, topped up from the static feed when the game has fewer than
 * three.
 *
 * The mistakes are read from the client's own sweep by the rule of the
 * server's puzzle rows (`generatePuzzleRecommendations` in the
 * enhanced-analysis route): a drop of at least 150 cp for the mover, never
 * at a depth-0 sentinel or across a mixed-depth pair, and a line with no
 * score is skipped rather than read as 0. Only the player's moves count.
 * The page cannot read the server's rows themselves: they come only with
 * Neo4j, only on turn 1 and for both colours, and the client never read
 * them.
 *
 * A mistake becomes a puzzle in the Lichess convention that /puzzles and
 * the feed share: the position before it, the mistake as the setup move,
 * and the opponent's punishment (the engine's line after the mistake) as
 * the solution. It is kept only when the punishment is the only move: the
 * search's second line is at least 15 points of winning chances worse for
 * the side to move, at the same depth, or with no second line the first is
 * a mate. It is extended by two plies only while the solver's moves stay
 * forcing (a mate, a check or a capture worth 200 cp, the threat tree's
 * rule). Every solution is replayed legal, or the row is dropped.
 *
 * Pure, client-safe and model-free. Never throws.
 */
import { Chess, type Move } from "chess.js";
import type { LineEval, PositionEval } from "@/types/eval";
import type { Side } from "@/lib/coach/gameStory";
import { isComparableDepthPair } from "@/lib/contract/evalDepth";
import { flattenEval } from "@/lib/contract/selectInsights";
import { getLineWinPercentage } from "@/lib/engine/helpers/winPercentage";
import type { PuzzleContext } from "@/lib/validation/puzzleChatSchemas";
import {
  isConcrete,
  moveUci,
  playUci,
  replyAt,
  sideAt,
} from "./decisiveMoment";
import { truthCause, type DiagnoseCause } from "./gradeAnswer";

/** The punishment is the only move when the second line is this many win-% points worse. */
export const ONLY_MOVE_GAP = 15;
/** Puzzles in a drill set. */
export const DRILL_SET_SIZE = 3;
/** A move is a mistake worth a puzzle at this drop, the server's puzzle rows' own threshold. */
export const MISTAKE_DROP_CP = 150;

export interface GameDrill {
  /** "g-<hash of the game>-<ply>", unique per game and move. */
  id: string;
  /** Half-moves on the board after the mistake (the cursor value). */
  ply: number;
  cause: DiagnoseCause;
  /** One solver move, or three plies of a forcing line. */
  kind: "single" | "forcing";
  puzzle: PuzzleContext;
}

export interface GameDrillsInput {
  positions: readonly PositionEval[];
  sans: readonly string[];
  player: Side;
  declaredDepth: number | null;
  /** Anything that tells this game from another: hashed into the ids. */
  gameKey: string;
}

const other = (s: Side): Side => (s === "w" ? "b" : "w");

/** djb2, as eight hex digits at most. */
function djb2(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++)
    h = (Math.imul(h, 33) + text.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

/** The mover's win percentage of a line, or null when it carries no real score. */
function moverWin(line: LineEval | undefined, mover: Side): number | null {
  if (!line) return null;
  const cp = typeof line.cp === "number" ? line.cp : undefined;
  const mate = typeof line.mate === "number" ? line.mate : undefined;
  if (cp === undefined && mate === undefined) return null;
  try {
    const win = getLineWinPercentage({ ...line, cp, mate });
    if (!Number.isFinite(win)) return null;
    return mover === "w" ? win : 100 - win;
  } catch {
    return null;
  }
}

/**
 * The search's best move is the only one: its second line, at the same
 * depth, is ONLY_MOVE_GAP worse for the side to move. With no second line
 * only a mate for the side to move qualifies.
 */
function onlyMove(position: PositionEval, mover: Side): boolean {
  const best = position.lines[0];
  const bestWin = moverWin(best, mover);
  if (!best || bestWin === null) return false;
  const second = position.lines[1];
  if (!second || !second.pv?.[0])
    return (
      typeof best.mate === "number" &&
      (mover === "w" ? best.mate > 0 : best.mate < 0)
    );
  if (second.depth !== best.depth) return false;
  const secondWin = moverWin(second, mover);
  return secondWin !== null && bestWin - secondWin >= ONLY_MOVE_GAP;
}

/**
 * The feed's own theme for the drill, only when it is true of it: a mate in
 * one or two for a check that mates, the loose piece, the fork. A check
 * that does not mate and a calculation slip have no theme of their own, and
 * a theme names the pattern to the puzzle coach, so none is given.
 */
function drillThemes(
  cause: DiagnoseCause,
  solverMoves: number,
  mates: boolean
): string[] {
  if (cause === "hanging") return ["hangingPiece"];
  if (cause === "fork") return ["fork"];
  if (cause === "check" && mates)
    return [solverMoves === 1 ? "mateIn1" : "mateIn2"];
  return [];
}

/** The puzzle for the mistake played at `fenBefore`, or null when the punishment is not the only move. */
function drillAt(
  fenBefore: string,
  played: Move,
  after: PositionEval,
  player: Side,
  ply: number,
  hash: string
): GameDrill | null {
  const replier = other(player);
  if (!onlyMove(after, replier)) return null;
  const fenAfter = played.after;
  const truth = replyAt(fenAfter, after, player, ply);
  if (!truth) return null;
  const pv = after.lines[0].pv ?? [];

  const walk = new Chess(fenAfter);
  const first = playUci(walk, pv[0] ?? "");
  if (!first) return null;
  const solution = [moveUci(played), moveUci(first)];
  let kind: GameDrill["kind"] = "single";
  let mates = walk.isCheckmate();
  // Two more plies while the solver's moves stay forcing.
  if (!mates && pv.length >= 3 && isConcrete(fenAfter, moveUci(first))) {
    const reply = playUci(walk, pv[1]);
    const fenSecond = walk.fen();
    const second = reply ? playUci(walk, pv[2]) : null;
    if (reply && second && isConcrete(fenSecond, moveUci(second))) {
      solution.push(moveUci(reply), moveUci(second));
      kind = "forcing";
      mates = walk.isCheckmate();
    }
  }

  // The whole solution, replayed from the puzzle's own position.
  const check = new Chess(fenBefore);
  for (const uci of solution) if (!playUci(check, uci)) return null;

  const cause = truthCause(truth);
  return {
    id: `g-${hash}-${ply}`,
    ply,
    cause,
    kind,
    puzzle: {
      id: `g-${hash}-${ply}`,
      fen: fenBefore,
      solution,
      themes: drillThemes(cause, kind === "single" ? 1 : 2, mates),
    },
  };
}

/**
 * The player's mistakes in the game that make a puzzle, in game order. The
 * walk replays the game from the standard start and stops at the first
 * move it cannot replay.
 */
export function gameDrillsFor(input: GameDrillsInput): GameDrill[] {
  const { positions, sans, player, declaredDepth } = input;
  const out: GameDrill[] = [];
  try {
    const hash = djb2(input.gameKey);
    const game = new Chess();
    for (let i = 0; i < sans.length; i++) {
      const fenBefore = game.fen();
      let played: Move | null = null;
      try {
        played = game.move(sans[i]);
      } catch {
        played = null;
      }
      if (!played) break;
      if (sideAt(i) !== player) continue;
      const before = positions[i];
      const after = positions[i + 1];
      if (!before?.lines?.[0] || !after?.lines?.[0]) continue;
      if (before.lines[0].depth === 0 || after.lines[0].depth === 0) continue;
      if (!isComparableDepthPair(before, after, declaredDepth)) continue;
      const cpBefore = flattenEval(before.lines[0]);
      const cpAfter = flattenEval(after.lines[0]);
      if (cpBefore === null || cpAfter === null) continue;
      const drop = player === "w" ? cpBefore - cpAfter : cpAfter - cpBefore;
      if (drop < MISTAKE_DROP_CP) continue;
      const drill = drillAt(fenBefore, played, after, player, i + 1, hash);
      if (drill) out.push(drill);
    }
  } catch {
    return out;
  }
  return out;
}

/**
 * The game's drills for one cause, in game order, without the move the
 * question was asked about, at most `size`, and how many the feed must add.
 */
export function drillSetFor(
  drills: readonly GameDrill[],
  cause: DiagnoseCause,
  opts: { excludePly?: number; size?: number } = {}
): { fromGame: GameDrill[]; missing: number } {
  const size = opts.size ?? DRILL_SET_SIZE;
  const fromGame = drills
    .filter((d) => d.cause === cause && d.ply !== opts.excludePly)
    .slice(0, size);
  return { fromGame, missing: size - fromGame.length };
}

const FEED_THEMES: Readonly<Record<DiagnoseCause, readonly string[]>> = {
  check: ["mateIn1", "mateIn2", "discoveredCheck", "doubleCheck"],
  hanging: ["hangingPiece"],
  fork: ["fork"],
  calculation: ["defensiveMove"],
  guess: ["hangingPiece", "fork", "mateIn1"],
};

/** The static feed's themes that train the cause (all in the shipped CSV). */
export function causeFeedThemes(cause: DiagnoseCause): string[] {
  return [...FEED_THEMES[cause]];
}

/** What a set of the cause is called on /puzzles. */
export const CAUSE_DRILL_NAMES: Readonly<Record<DiagnoseCause, string>> = {
  check: "missed checks",
  hanging: "loose pieces",
  fork: "forks",
  calculation: "answering threats",
  guess: "the blunder check",
};

/** The link under a graded reply. */
export function drillLinkLabel(
  fromGame: number,
  size: number = DRILL_SET_SIZE
): string {
  if (fromGame >= size) return `Drill it: ${size} from this game`;
  if (fromGame > 0)
    return `Drill it: ${fromGame} from this game, ${size - fromGame} like it`;
  return `Drill it: ${size} puzzles like it`;
}

/** The banner over the set on /puzzles. */
export function practiceLabel(
  cause: DiagnoseCause,
  fromGame: number,
  topUp: number
): string {
  const name = CAUSE_DRILL_NAMES[cause];
  if (fromGame <= 0)
    return `Practising ${name}: puzzles like the one in your game`;
  if (topUp <= 0) return `Practising ${name}: ${fromGame} from your game`;
  return `Practising ${name}: ${fromGame} from your game, ${topUp} like it`;
}

/** What the coach says when neither the game nor the feed gave a puzzle. */
export const DRILL_SET_EMPTY =
  "The puzzle store didn't answer just now. Try again in a moment.";
