// One course, viewed at one player's level.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY BANDS ARE A VIEW AND NOT A BUILD
//
// A course is generated once, to full depth. What a player sees is a truncation
// of it. That buys a guarantee worth stating out loud and testing:
//
//   Every line a beginner learns is a PREFIX of the line a club player learns.
//   Improving never means unlearning.
//
// Generating a separate shallow course per band would not give that. Two builds
// with different thresholds can pick different moves at the same position — the
// popular-move tie-break depends on which replies survived — and a player moving
// up a band would find their opening quietly rewritten underneath them.
//
// It is also the segregation itself. Truncation happens HERE, before anything
// reaches a screen, so a player in a lower band cannot reach deeper content
// through any path: it is not in the object they were given.
// ─────────────────────────────────────────────────────────────────────────────

import type { Band } from '@/lib/repertoire/levels';
import type { Course, CourseChapter, CourseNode } from '@/types/course';

export interface CourseView {
  meta: Course['meta'];
  /** The band this was cut for, so a caller can never mistake it for the whole. */
  band: Band['id'];
  /**
   * Absolute ply the view stops at: the course root plus the band's depth.
   *
   * The band's `depth` is plies of THIS OPENING'S theory, not plies from move
   * one. Capping absolutely looks like segregation and is really a lottery on
   * where an opening happens to start: the Najdorf begins at ply 10, so a club
   * player — cap 12 — would have been handed two plies of it and called that a
   * course, while a Caro player got ten. Measured across the catalogue, six of
   * the openings gave a beginner literally nothing.
   */
  maxPly: number;
  chapters: CourseChapter[];
  nodes: Record<string, CourseNode>;
  /** Distinct lines in THIS view, not in the course. */
  lines: number;
  /** Share of real play the kept chapters account for, 0-1. */
  covered: number;
  /** Chapters left out, and what they are worth together. */
  omitted: { chapters: number; share: number };
  /** Plies of this opening's own theory the band is taught. */
  theoryPlies: number;
}

/**
 * Lines in a node graph, counted honestly and safe against transposition cycles.
 *
 * Exported because the view's count is the one every user-facing sentence uses,
 * and a caller that recounted it a second way would eventually disagree.
 */
export function countLines(nodes: Record<string, CourseNode>, roots: string[]): number {
  const memo = new Map<string, number>();
  const onStack = new Set<string>();

  const from = (key: string): number => {
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (onStack.has(key)) return 0;
    const node = nodes[key];
    if (!node) return 1;
    onStack.add(key);
    let total: number;
    if (node.end) total = 1;
    else if (node.us) total = node.next && nodes[node.next] ? from(node.next) : 1;
    else if (node.them?.length) total = node.them.reduce((sum, r) => sum + from(r.to), 0);
    else total = 1;
    onStack.delete(key);
    memo.set(key, total);
    return total;
  };

  return roots.reduce((sum, key) => sum + from(key), 0);
}

/**
 * The course as this band should see it.
 *
 * Two cuts, both from `Band` so there is no second tuning table anywhere:
 *
 *   DEPTH   `band.depth` plies. Past it the node is kept but marked `depth`,
 *           because "this is where we stop" and "there is nothing here" are
 *           different things and a learner deserves to know which.
 *   BREADTH chapters by share until the running total reaches `band.enoughAt`.
 *           The rest are named as omitted rather than silently dropped.
 */
export function viewFor(course: Course, band: Band): CourseView {
  const rootPly = course.meta.root.length;
  // Depth is measured from where the opening starts, not from move one.
  const maxPly = Math.min(rootPly + band.depth, course.meta.maxPly);
  const keep = new Set<number>();
  let covered = 0;
  for (const chapter of course.chapters) {
    if (covered >= band.enoughAt) break;
    keep.add(chapter.i);
    covered += chapter.share;
  }
  // A course whose first chapter already clears the threshold still has to
  // teach something, and an empty view is never the honest answer.
  if (keep.size === 0 && course.chapters.length > 0) {
    keep.add(course.chapters[0].i);
    covered = course.chapters[0].share;
  }

  const nodes: Record<string, CourseNode> = {};
  for (const [key, node] of Object.entries(course.nodes)) {
    // The trunk (ch -1) belongs to every chapter.
    if (node.ch !== -1 && !keep.has(node.ch)) continue;
    if (node.p > maxPly) continue;
    // A child beyond the boundary is not in this view, so a reply pointing at it
    // would be a dangling edge. Trim those rather than leave the graph broken.
    // A child outside this view makes the edge dangling, and every consumer
    // that walks the graph would hit undefined. `next` has to be tested the
    // same way as `them`: checking it against the SOURCE course only catches a
    // key that never existed, not one this band is not allowed to see.
    const inView = (childKey: string) => {
      const child = course.nodes[childKey];
      return Boolean(child) && child.p <= maxPly && (child.ch === -1 || keep.has(child.ch));
    };

    const trimmed: CourseNode = { ...node };
    // Trimming the edges IS the boundary. There is no separate "we are at
    // band.depth" case: a node there loses every child to the filters below and
    // is marked `depth` by them. A second path producing the same answer was
    // one more thing to keep in step, and a mutation proved it changed nothing.
    if (trimmed.them) {
      trimmed.them = trimmed.them.filter(r => inView(r.to));
      if (trimmed.them.length === 0) {
        trimmed.them = undefined;
        trimmed.end = trimmed.end ?? 'depth';
      }
    }
    if (trimmed.next && !inView(trimmed.next)) {
      trimmed.next = undefined;
      trimmed.us = undefined;
      trimmed.end = trimmed.end ?? 'depth';
    }
    nodes[key] = trimmed;
  }

  const chapters = course.chapters.filter(c => keep.has(c.i));
  const roots = chapters.map(c => c.at).filter(key => nodes[key]);
  const omittedChapters = course.chapters.filter(c => !keep.has(c.i));

  return {
    meta: course.meta,
    band: band.id,
    maxPly,
    theoryPlies: maxPly - rootPly,
    chapters,
    nodes,
    lines: countLines(nodes, roots),
    covered: Number(Math.min(1, covered).toFixed(4)),
    omitted: {
      chapters: omittedChapters.length,
      share: Number(omittedChapters.reduce((s, c) => s + c.share, 0).toFixed(4)),
    },
  };
}

/**
 * The one line to put at the top of a course.
 *
 * Mirrors `verdict()` in levels.ts, pointed at depth instead of breadth: the
 * point is to tell a player when they can stop, which nothing else in this
 * market does.
 */
export function courseVerdict(view: CourseView): string {
  const pct = Math.round(view.covered * 100);
  const moves = Math.floor(view.theoryPlies / 2);
  if (view.omitted.chapters === 0) {
    return `${view.chapters.length} chapters, ${moves} moves deep. That is all of it at your level.`;
  }
  return (
    `${view.chapters.length} chapters, ${moves} moves deep, get you to ${pct}% of what you ` +
    `will actually meet. The other ${view.omitted.chapters} cover the last ` +
    `${Math.round(view.omitted.share * 100)}%.`
  );
}
