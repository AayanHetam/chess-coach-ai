// A course graph, flattened into the lines a person actually reads.
//
// The graph is the right shape to STORE — transpositions pool, nothing is
// duplicated, and the trainer walks it by position. It is the wrong shape to
// READ: nobody learns an opening by studying a node table. So this turns a
// chapter into an ordered list of variations, each one a sequence of moves from
// the course root to wherever that branch stops, with the reason it stopped.

import type { Course, CourseNode, Termination } from '@/types/course';

export interface CourseLine {
  /** SAN moves from the START of the game, so the board can be replayed. */
  moves: string[];
  /** Why it stops here. `wall` and `depth` are different claims. */
  end: Termination;
  /** Share of games that reach the end of this line, 0-1. */
  weight: number;
  /** White-relative centipawns at the end, when the engine has an opinion. */
  cp: number | null;
  /** Where our own moves came from, deduped. Audit trail for the whole line. */
  sources: string[];
}

export const MAX_LINES_PER_CHAPTER = 60;

export interface ChapterLines {
  lines: CourseLine[];
  /** Lines this chapter holds in total. Equal to `lines.length` when nothing was cut. */
  total: number;
  /** True when the list is shorter than the chapter. Callers MUST say so. */
  capped: boolean;
}

/**
 * Every variation in a chapter, most likely first.
 *
 * Depth-first from the chapter root, following our own move where we have one
 * and branching over theirs. Cycle-safe: a transposition can make the graph
 * cyclic and an unguarded walk would not return.
 *
 * Capped, and the cap is REPORTED by the caller rather than silently applied —
 * a course that quietly shows 60 of 300 lines is claiming completeness it does
 * not have.
 */
export function linesOf(
  view: { nodes: Record<string, CourseNode> } | Course,
  chapterAt: string,
  rootMoves: string[]
): ChapterLines {
  const nodes = view.nodes as Record<string, CourseNode>;
  const out: CourseLine[] = [];
  const onPath = new Set<string>();

  let total = 0;

  const walk = (key: string, moves: string[], sources: Set<string>) => {
    // Counted even past the cap, so the page can say how much it is not showing.
    // A list that quietly stops at 60 of 300 claims a completeness it does not
    // have, and nothing on the screen would contradict it.
    if (out.length >= MAX_LINES_PER_CHAPTER) {
      total++;
      return;
    }
    const node = nodes[key];
    if (!node || onPath.has(key)) {
      if (moves.length) {
        total++;
        out.push({
          moves,
          end: 'wall',
          weight: 0,
          cp: null,
          sources: Array.from(sources),
        });
      }
      return;
    }
    onPath.add(key);
    const next = new Set(sources);
    if (node.src) next.add(node.src);

    if (node.us && node.next) {
      walk(node.next, [...moves, node.us], next);
    } else if (node.them?.length) {
      for (const reply of node.them) walk(reply.to, [...moves, reply.san], next);
    } else {
      total++;
      out.push({
        moves,
        end: node.end ?? 'depth',
        weight: node.w,
        cp: node.ev?.cp ?? null,
        sources: Array.from(next),
      });
    }
    onPath.delete(key);
  };

  walk(chapterAt, rootMoves, new Set());
  return {
    lines: out.sort((a, b) => b.weight - a.weight),
    total,
    capped: total > out.length,
  };
}

/** Moves numbered the way a player writes them, from move one. */
export function numbered(moves: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    const n = i / 2 + 1;
    parts.push(moves[i + 1] ? `${n}.${moves[i]} ${moves[i + 1]}` : `${n}.${moves[i]}`);
  }
  return parts.join(' ');
}

/**
 * An evaluation in the words a player uses, from THEIR side.
 *
 * Never a raw centipawn number: "+0.34" is engine dialect, and a course that
 * speaks it is a course for people who already know what it means.
 */
export function evalWords(cp: number | null, side: 'white' | 'black'): string | null {
  if (cp === null) return null;
  const ours = side === 'white' ? cp : -cp;
  if (Math.abs(ours) >= 99000) return ours > 0 ? 'winning' : 'lost';
  if (ours <= -150) return 'worse for you';
  if (ours <= -60) return 'slightly worse';
  if (ours < 60) return 'balanced';
  if (ours < 150) return 'slightly better';
  return 'better for you';
}

/**
 * What is worth saying about a line, and nothing else.
 *
 * The first version printed the evaluation, the stop reason and the provenance
 * on every row. In a Caro-Kann chapter that is "balanced · as deep as your level
 * needs · played and engine-checked" forty times, which is not information — it
 * is wallpaper, and it buries the two rows where something IS different.
 *
 * So each part is shown only when it deviates from the ordinary case:
 *   the evaluation      unless the position is balanced
 *   the stop reason     unless we stopped because the band said to
 *   the provenance      only where we OVERRODE popularity, or had no evaluation
 */
export function lineNotes(line: CourseLine, side: 'white' | 'black'): string[] {
  const notes: string[] = [];
  const ev = evalWords(line.cp, side);
  if (ev && ev !== 'balanced') notes.push(ev);
  if (line.end !== 'depth') notes.push(endWords(line.end));
  if (line.sources.includes('corpus')) notes.push('most played, not engine-checked');
  else if (line.sources.includes('engine')) notes.push("the engine's choice over the popular move");
  return notes;
}

/** Why a line stops, said once, in words rather than a code. */
export function endWords(end: Termination): string {
  switch (end) {
    case 'depth':
      return 'as deep as your level needs';
    case 'wall':
      // Honest: not "the line ends", which would imply the position is finished.
      return 'past what the games can show';
    case 'pruned':
      return 'too rare to prepare';
  }
}
