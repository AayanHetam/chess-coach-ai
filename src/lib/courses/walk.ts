// Stepping through a course, one move at a time.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE STATE IS A LIST OF MOVES, NOT A LIST OF POSITIONS
//
// The graph is keyed by position and pools transpositions, so a position does
// not know how it was reached — and the reader has to show a LINE, which is
// exactly the thing a position key throws away. Keeping the moves and replaying
// them means the board, the move numbering and the back button all agree,
// and it makes a repetition legible instead of a loop that silently rejoins.
//
// It also means chess.js is the only thing deciding what is legal here. A
// course that could not be replayed would be a corrupt course, and the reader
// stops at the last position it could reach rather than rendering a board that
// does not exist.
// ─────────────────────────────────────────────────────────────────────────────

import { Chess } from 'chess.js';
import type { CourseNode } from '@/types/course';

/** The identity a course node is keyed by: the first four FEN fields. */
export const keyOf = (fen: string): string => fen.split(' ').slice(0, 4).join(' ');

export interface Replayed {
  fen: string;
  key: string;
  /** The move that produced this position, for the board's own highlight. */
  lastMove: { from: string; to: string } | null;
  /** Moves that were actually played. Shorter than the input if one was illegal. */
  played: string[];
}

/** Replay from the start of the game. Never throws; stops where it cannot go on. */
export function replay(sans: string[]): Replayed {
  const board = new Chess();
  const played: string[] = [];
  let lastMove: { from: string; to: string } | null = null;
  for (const san of sans) {
    try {
      const move = board.move(san);
      if (!move) break;
      lastMove = { from: move.from, to: move.to };
      played.push(san);
    } catch {
      break;
    }
  }
  const fen = board.fen();
  return { fen, key: keyOf(fen), lastMove, played };
}

export interface Branch {
  san: string;
  /** Position key the move leads to. */
  to: string;
  /** Their share of play here, 0-1. Absent on our own move — we choose it. */
  share?: number;
  ours: boolean;
}

/**
 * Where a position can go.
 *
 * One branch on our turn, because a repertoire has one answer; theirs, in the
 * order the corpus gave, which is most-played first. A node whose child is not
 * in this view yields nothing — the boundary is an end, not a dangling edge.
 */
export function branchesOf(
  node: CourseNode | undefined,
  nodes: Record<string, CourseNode>
): Branch[] {
  if (!node) return [];
  if (node.us) {
    return node.next && nodes[node.next] ? [{ san: node.us, to: node.next, ours: true }] : [];
  }
  return (node.them ?? [])
    .filter(reply => Boolean(nodes[reply.to]))
    .map(reply => ({ san: reply.san, to: reply.to, share: reply.share, ours: false }));
}

/**
 * The move to take when someone just presses forward.
 *
 * Ours when it is our turn; their most-played otherwise. NOT "the first branch":
 * `them` is corpus order, which is most-played order today, and a reader that
 * silently depended on that would break the day the builder sorts differently.
 */
export function defaultBranch(branches: Branch[]): Branch | null {
  if (branches.length === 0) return null;
  if (branches[0].ours) return branches[0];
  return branches.reduce((best, b) => ((b.share ?? 0) > (best.share ?? 0) ? b : best));
}

/**
 * Every position on one line, from the chapter root to where it stops.
 *
 * Used to open the reader on a line rather than at a fork: "continue" should
 * land on the next thing to learn, not on the first move of the chapter.
 */
export function principalLine(
  nodes: Record<string, CourseNode>,
  from: string,
  maxSteps = 64
): string[] {
  const sans: string[] = [];
  const seen = new Set<string>();
  let key = from;
  for (let i = 0; i < maxSteps; i++) {
    if (seen.has(key)) break;
    seen.add(key);
    const branch = defaultBranch(branchesOf(nodes[key], nodes));
    if (!branch) break;
    sans.push(branch.san);
    key = branch.to;
  }
  return sans;
}
