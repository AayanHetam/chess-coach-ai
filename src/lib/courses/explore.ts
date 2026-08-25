// Finding a position in a course.
//
// ─────────────────────────────────────────────────────────────────────────────
// ONE LINE PER POSITION, NOT ONE PER PATH
//
// The graph pools transpositions, so a position can be reached several ways and
// a path enumeration would list the same position over and over — the same
// mistake `probesOf` documents, wearing a search box. Breadth-first from the
// chapter roots visits every position once and keeps the SHORTEST way in, which
// is also the one a player would recognise.
//
// The search matches MOVES, because that is what someone looking for a position
// has. Names would be better and we do not have them per node: the corpus names
// openings, not the 3,000 positions inside one.
// ─────────────────────────────────────────────────────────────────────────────

import { branchesOf } from '@/lib/courses/walk';
import type { CourseChapter, CourseNode } from '@/types/course';

export interface Position {
  key: string;
  /** SAN from the start of the game. The shortest way into this position. */
  line: string[];
  chapter: number;
  /** True when it is our move here — the positions a player is asked about. */
  ours: boolean;
}

/**
 * Every position in the view, shortest line first.
 *
 * `limit` bounds the walk rather than the result, so a course larger than the
 * cap is truncated at a knowable place — breadth-first, so what survives is the
 * shallow half rather than an arbitrary slice.
 */
export function positionsOf(
  nodes: Record<string, CourseNode>,
  chapters: CourseChapter[],
  limit = 4000
): Position[] {
  const out: Position[] = [];
  const seen = new Set<string>();
  const queue: Array<{ key: string; line: string[] }> = [];

  for (const chapter of chapters) {
    if (!nodes[chapter.at] || seen.has(chapter.at)) continue;
    seen.add(chapter.at);
    queue.push({ key: chapter.at, line: chapter.line });
  }

  for (let head = 0; head < queue.length && out.length < limit; head++) {
    const { key, line } = queue[head];
    const node = nodes[key];
    if (!node) continue;
    out.push({ key, line, chapter: node.ch, ours: Boolean(node.us) });
    for (const branch of branchesOf(node, nodes)) {
      if (seen.has(branch.to)) continue;
      seen.add(branch.to);
      queue.push({ key: branch.to, line: [...line, branch.san] });
    }
  }
  return out;
}

/**
 * A typed query, as moves.
 *
 * Move numbers are stripped rather than parsed: someone pasting "3. Bf4 Nc6"
 * out of a game means the moves, and treating "3." as a token would match
 * nothing and look broken. Case is kept — SAN is case-sensitive and `B` is a
 * bishop where `b` is a file.
 */
export function tokens(query: string): string[] {
  return query
    .replace(/\d+\.(\.\.)?/g, ' ')
    .split(/[\s,]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0);
}

/**
 * Positions whose line contains the query's moves, consecutively.
 *
 * Consecutive and in order, because that is what a sequence of moves means. A
 * bag-of-moves match would put every position in the course behind a query for
 * two common moves and rank them by nothing.
 */
export function search(positions: Position[], query: string, limit = 40): Position[] {
  const want = tokens(query);
  if (want.length === 0) return [];
  const hits = positions.filter(p => contains(p.line, want));
  // Shortest first: the earliest position a line reaches is the one someone
  // searching for it is most likely to have meant.
  hits.sort((a, b) => a.line.length - b.line.length || a.chapter - b.chapter);
  return hits.slice(0, limit);
}

/** `want` appears in `line` as a run. */
function contains(line: string[], want: string[]): boolean {
  if (want.length > line.length) return false;
  for (let i = 0; i + want.length <= line.length; i++) {
    let all = true;
    for (let j = 0; j < want.length; j++) {
      if (line[i + j] !== want[j]) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  return false;
}
