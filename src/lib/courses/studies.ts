// Chapters split into studies — but only when a chapter is big enough to need it.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE MEASUREMENT THIS IS BUILT ON
//
// The reference product splits every chapter into studies because its chapters
// are big: its courses run 60-150 lines. Ours do not. Measured across all 43
// generated courses, at the depth each band actually sees:
//
//   band        decisions per chapter (median)   chapters over one sitting
//   new                     4                          0 of 222   (0%)
//   beginner               10                         31 of 222  (13%)
//   improving              18                         98 of 222  (44%)
//   club                   32                        144 of 222  (64%)
//   strong                 37                        149 of 222  (67%)
//
// Below `club` a study averages one to six decisions. Splitting a four-decision
// chapter into three studies of one move each is bureaucracy: it adds a level
// of navigation, a screen, and a sense of a long way to go, in exchange for
// grouping that carries no information.
//
// So the study level is CONDITIONAL. A chapter that fits in one sitting is one
// unit and no study level is shown at all. A chapter that does not splits by
// the opponent's replies — which is what a study actually is, and why the
// reference names them "Black Plays 2...Qxd5".
//
// The threshold is one SITTING, not a number picked to look tidy: the trainer
// already defines a sitting as ROUND_SIZE x SITTING_ROUNDS. A chapter you can
// finish in one go does not need to be cut into pieces you finish in one go.
// ─────────────────────────────────────────────────────────────────────────────

import { ROUND_SIZE, SITTING_ROUNDS } from '@/lib/learn/chapterRound';
import type { CourseChapter, CourseNode } from '@/types/course';

/** Positions in one sitting of the trainer. The unit a chapter is measured in. */
export const ONE_SITTING = ROUND_SIZE * SITTING_ROUNDS;

export interface Study {
  /** Stable within its chapter: the opponent move that opens it. */
  id: string;
  /** "Black plays 2...Qxd5". Derived from the move; never authored. */
  title: string;
  /** Position key the study begins at. */
  at: string;
  /** SAN from the start of the game to that position. */
  line: string[];
  /** Share of the chapter's play that runs through it, 0-1. */
  share: number;
  /** Our decisions inside it. */
  decisions: number;
}

export interface ChapterPlan {
  /** True when the chapter is one unit and no study level should be shown. */
  flat: boolean;
  /** Our decisions in the whole chapter. */
  decisions: number;
  /** Empty when `flat`. */
  studies: Study[];
}

/**
 * Keys of our decisions reachable from a position, within the view.
 *
 * POSITIONS, not paths: the graph pools transpositions, so a path count would
 * report the same decision several times and make a chapter look bigger than
 * the work in it.
 *
 * ── THE CHAPTER BOUND IS NOT OPTIONAL DECORATION ────────────────────────────
 * Edges cross chapters. Without `chapter` this walks straight out of the
 * chapter it was asked about and counts a neighbour's work as its own, exactly
 * as `probesOf` warns. Measured on the shipped courses at the club band, an
 * unbounded walk disagreed with the trainer on 44% of chapters, worst case 223
 * against 2 — a chapter split into eleven studies that the trainer would ask
 * two questions about. It is bounded the same way `probesOf` bounds itself, so
 * the number on the hub and the number in the session are the same number.
 */
export function keysUnder(
  nodes: Record<string, CourseNode>,
  start: string,
  maxPly: number,
  chapter?: number
): Set<string> {
  const seen = new Set<string>();
  const ours = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const key = stack.pop()!;
    if (seen.has(key)) continue;
    seen.add(key);
    const node = nodes[key];
    if (!node || node.p > maxPly) continue;
    // The trunk (ch -1) belongs to every chapter; anything else does not.
    if (chapter !== undefined && node.ch !== chapter && node.ch !== -1) continue;
    if (node.us) {
      ours.add(key);
      if (node.next) stack.push(node.next);
    }
    for (const reply of node.them ?? []) stack.push(reply.to);
  }
  return ours;
}

/** How many decisions `keysUnder` finds. */
export function decisionsUnder(
  nodes: Record<string, CourseNode>,
  start: string,
  maxPly: number,
  chapter?: number
): number {
  return keysUnder(nodes, start, maxPly, chapter).size;
}

/**
 * "Black plays 2...Qxd5" — a move, numbered, with the side that played it.
 *
 * `ply` is the number of half-moves made INCLUDING this one, so ply 4 is
 * Black's second move. Numbering from the ply rather than from the line's
 * length means a study opened deep in a chapter is still numbered from the
 * start of the game, which is how anyone reading a board would number it.
 */
export function studyTitle(san: string, ply: number, ourSide: 'white' | 'black'): string {
  const move = Math.ceil(ply / 2);
  const theirsIsWhite = ourSide === 'black';
  // Odd ply is White's move. The opponent is whoever we are not.
  const whitePlayed = ply % 2 === 1;
  const them = theirsIsWhite ? 'White' : 'Black';
  const numbered = whitePlayed ? `${move}.${san}` : `${move}...${san}`;
  return `${them} plays ${numbered}`;
}

/**
 * How to present one chapter.
 *
 * Splits at the first place the OPPONENT chooses, which is the only branch
 * point that means anything: our own moves are not a fork, they are the answer.
 */
export function planChapter(
  nodes: Record<string, CourseNode>,
  chapter: CourseChapter,
  maxPly: number,
  ourSide: 'white' | 'black',
  splitAt: number = ONE_SITTING
): ChapterPlan {
  const decisions = decisionsUnder(nodes, chapter.at, maxPly, chapter.i);
  const root = nodes[chapter.at];
  if (!root || decisions <= splitAt) return { flat: true, decisions, studies: [] };

  // The chapter opens with OUR move; the fork is the reply to it.
  const after = root.us && root.next ? nodes[root.next] : root;
  const replies = after?.them ?? [];
  const studies: Study[] = [];
  for (const reply of replies) {
    const target = nodes[reply.to];
    if (!target || target.p > maxPly) continue;
    const count = decisionsUnder(nodes, reply.to, maxPly, chapter.i);
    // A reply with nothing behind it is a move, not a study. It stays in the
    // chapter and is reached by playing into it.
    if (count === 0) continue;
    studies.push({
      id: reply.san,
      title: studyTitle(reply.san, target.p, ourSide),
      at: reply.to,
      line: [...chapter.line, ...(root.us ? [root.us] : []), reply.san],
      share: reply.share,
      decisions: count,
    });
  }
  studies.sort((a, b) => b.share - a.share);
  // One study is not a split. If every branch but one is empty, the chapter is
  // still a single thing and dressing it as "Study 1 of 1" is a lie about shape.
  if (studies.length < 2) return { flat: true, decisions, studies: [] };
  return { flat: false, decisions, studies };
}
