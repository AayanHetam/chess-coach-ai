/**
 * The story of a game in one line, from the engine data the client holds.
 *
 * A loaded game used to arrive under "Loaded W vs B. Step through the
 * moves..." and nothing was said about the game itself. This module says
 * the one thing a coach says on meeting a game: who played, how it ended,
 * and the move it turned on, so the first message is about this game
 * before the model has been asked anything.
 *
 * Everything is computed, nothing written by a model, and the line honours
 * the floor the review's own selection keeps: a ply the engine timed out
 * on (depth 0), an unscored line, or a before/after pair whose searches
 * reached different depths (the silent depth-12 retry that fabricates 50 to
 * 150 cp swings) is never read as a swing. Positions are White-relative
 * centipawns turned into Lichess win percentages, so a swing means the same
 * thing in an equal middlegame and a won endgame.
 *
 * "Decisive" is the point of no return: the first move after which the
 * side that lost never again reached an equal position, taken from a
 * position that was still in the balance. A game the winner led from the
 * first comparable position has no decisive move and the line says so.
 */
import type { PositionEval } from "@/types/eval";
import { getLineWinPercentage } from "@/lib/engine/helpers/winPercentage";
import { achievedDepth, isComparableDepthPair } from "@/lib/contract/evalDepth";

export type Side = "w" | "b";
export type GameResult = "1-0" | "0-1" | "1/2-1/2";

export interface TurningPoint {
  /** Half-moves on the board after the move (the cursor value). */
  ply: number;
  moveNumber: number;
  color: Side;
  san: string;
  /** "23.Rxd4" / "23...Rxd4" */
  label: string;
  /** White's win percentage before and after the move. */
  winBefore: number;
  winAfter: number;
  /** What the mover gave away, in win-percentage points (positive). */
  swing: number;
}

export interface GameStoryInput {
  /** Engine data, index 0 the start position; null before the sweep lands. */
  positions: readonly PositionEval[] | null | undefined;
  /** The game's SAN moves. */
  sans: readonly string[];
  white: string | null | undefined;
  black: string | null | undefined;
  /** The PGN Result header, when there is one. */
  result: string | null | undefined;
  /**
   * How the game ended on the board, for a game whose Result header is
   * missing or "*": the mating side's win, or a draw (stalemate,
   * repetition, insufficient material, the fifty-move rule). The engine
   * does not score a finished position, so without this a stalemate was
   * told as a win for the side ahead before it.
   */
  finalResult?: GameResult | null;
  /** The side the reader played, when known. */
  playerColor: Side | null;
  /** The depth the sweep asked for, so a shallower retry is not read as a swing. */
  declaredDepth?: number | null;
}

export interface GameStory {
  result: GameResult | null;
  /** Who won, from the result, else from where the engine's final verdict stands. */
  winner: Side | null;
  decisive: TurningPoint | null;
  /** The biggest swings, at most three, in game order. */
  turningPoints: TurningPoint[];
  /** "Aayan vs Rival": the names, kept first so every surface can bold them. */
  names: string;
  /** The rest of the line, starting with a space. */
  summary: string;
  /** names + summary. */
  line: string;
  /** What the result means for the reader's mascot: analysisMood's terminal. */
  terminal: GameResult | null;
}

/** A swing of this many points of White's win percentage is a turning point. */
export const TURNING_POINT_SWING = 15;
/** The decisive move leaves the winner's side at or above this and never below even again. */
const DECISIVE_WIN = 55;
const EQUAL_WIN = 50;
/** With no result header, a final verdict this far from even names a winner. */
const FINAL_VERDICT_MARGIN = 20;

export function parseResult(
  header: string | null | undefined
): GameResult | null {
  const r = (header ?? "").trim();
  if (r === "1-0" || r === "0-1" || r === "1/2-1/2") return r;
  if (r === "½-½") return "1/2-1/2";
  return null;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function moveLabel(ply: number, san: string): string {
  const moveNumber = Math.ceil(ply / 2);
  return `${moveNumber}${ply % 2 === 1 ? "." : "..."}${san}`;
}

/** White's win percentage of a position, or null when it has no real score. */
export function positionWin(position: PositionEval | undefined): number | null {
  if (!position || achievedDepth(position) === null) return null;
  const line = position.lines[0];
  if (!line || (line.cp === undefined && line.mate === undefined)) return null;
  try {
    return getLineWinPercentage(line);
  } catch {
    return null;
  }
}

/**
 * The win percentage before and after every move the engine scored on both
 * sides at comparable depth, in game order. Index k is the move at ply k+1.
 */
export function scoredMoves(input: GameStoryInput): TurningPoint[] {
  const { positions, sans } = input;
  if (!positions) return [];
  const declared = input.declaredDepth ?? null;
  const out: TurningPoint[] = [];
  for (let i = 0; i < sans.length && i + 1 < positions.length; i++) {
    const before = positions[i];
    const after = positions[i + 1];
    if (!isComparableDepthPair(before, after, declared)) continue;
    const winBefore = positionWin(before);
    const winAfter = positionWin(after);
    if (winBefore === null || winAfter === null) continue;
    const ply = i + 1;
    const color: Side = i % 2 === 0 ? "w" : "b";
    const swing = color === "w" ? winBefore - winAfter : winAfter - winBefore;
    out.push({
      ply,
      moveNumber: Math.floor(i / 2) + 1,
      color,
      san: sans[i],
      label: moveLabel(ply, sans[i]),
      winBefore,
      winAfter,
      swing,
    });
  }
  return out;
}

function winnerOf(
  input: GameStoryInput,
  result: GameResult | null,
  last: TurningPoint | null
): Side | null {
  if (result === "1-0") return "w";
  if (result === "0-1") return "b";
  if (result === "1/2-1/2") return null;
  if (!last) return null;
  if (last.winAfter >= EQUAL_WIN + FINAL_VERDICT_MARGIN) return "w";
  if (last.winAfter <= EQUAL_WIN - FINAL_VERDICT_MARGIN) return "b";
  return null;
}

/**
 * The point of no return: the first scored move that took the winner from
 * a position still in the balance to one it never let go of again.
 */
export function findDecisive(
  moves: readonly TurningPoint[],
  winner: Side | null
): TurningPoint | null {
  if (!winner || moves.length === 0) return null;
  const forWinner = (whiteWin: number) =>
    winner === "w" ? whiteWin : 100 - whiteWin;
  // The lowest the winner ever sinks from each move on, read backwards.
  const floorFrom = new Array<number>(moves.length);
  let floor = Infinity;
  for (let k = moves.length - 1; k >= 0; k--) {
    floor = Math.min(floor, forWinner(moves[k].winAfter));
    floorFrom[k] = floor;
  }
  for (let k = 0; k < moves.length; k++) {
    const m = moves[k];
    if (forWinner(m.winBefore) >= DECISIVE_WIN) continue; // already decided before this move
    if (forWinner(m.winAfter) < DECISIVE_WIN) continue;
    if (floorFrom[k] < EQUAL_WIN) continue; // the loser got back to equal later
    return m;
  }
  return null;
}

/**
 * A player's name from the PGN, or null. chess.js fills an absent White or
 * Black tag with the PGN placeholder "?", which is no name.
 */
export function playerName(header: string | null | undefined): string | null {
  const name = (header ?? "").trim();
  return name && name !== "?" ? name : null;
}

function sideName(side: Side, input: GameStoryInput): string {
  return (
    playerName(side === "w" ? input.white : input.black) ??
    (side === "w" ? "White" : "Black")
  );
}

function resultWords(result: GameResult | null, input: GameStoryInput): string {
  if (result === "1-0") return `${sideName("w", input)} won`;
  if (result === "0-1") return `${sideName("b", input)} won`;
  if (result === "1/2-1/2") return "drawn";
  return "";
}

/**
 * The line, in a shape that knows the reader's side when it is known and a
 * side-neutral one when it is not. The names stay first in every shape.
 */
export function buildGameStory(input: GameStoryInput): GameStory {
  const result = parseResult(input.result) ?? input.finalResult ?? null;
  const moves = scoredMoves(input);
  const last = moves.length > 0 ? moves[moves.length - 1] : null;
  const winner = winnerOf(input, result, last);
  const decisive = findDecisive(moves, winner);
  const turningPoints = moves
    .filter((m) => m.swing >= TURNING_POINT_SWING)
    .sort((a, b) => b.swing - a.swing)
    .slice(0, 3)
    .sort((a, b) => a.ply - b.ply);

  const names = `${sideName("w", input)} vs ${sideName("b", input)}`;
  const outcome = resultWords(result, input);
  const player = input.playerColor;
  const you = (side: Side) => player === side;
  const who = (side: Side) =>
    you(side) ? "you" : player ? "your opponent" : sideName(side, input);
  const whose = (side: Side) =>
    you(side)
      ? "your move"
      : `${player ? "your opponent" : sideName(side, input)}'s move`;

  let summary: string;
  if (!input.positions || input.positions.length === 0) {
    summary = outcome ? `, ${outcome}.` : ".";
  } else if (decisive && winner) {
    const loser: Side = winner === "w" ? "b" : "w";
    const loserRef = who(loser);
    summary = `${outcome ? `, ${outcome}.` : "."} The game turned at ${decisive.label} (${whose(decisive.color)}): after it ${loserRef} never got back to equal.`;
  } else if (turningPoints.length > 0) {
    const biggest = turningPoints.reduce((a, b) => (b.swing > a.swing ? b : a));
    summary = `${outcome ? `, ${outcome}.` : "."} No single move decided it; the biggest swing was ${biggest.label} (${whose(biggest.color)}).`;
  } else if (moves.length > 0) {
    summary = `${outcome ? `, ${outcome}.` : "."} No big swings: a steady game.`;
  } else {
    summary = outcome ? `, ${outcome}.` : ".";
  }

  return {
    result,
    winner,
    decisive,
    turningPoints,
    names,
    summary,
    line: `${names}${summary}`,
    terminal: result,
  };
}
