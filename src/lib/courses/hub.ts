// One course, as the screen that hangs everything off it needs it.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS MEMOISED AND WHY THAT IS NOT PREMATURE
//
// The hub needs a decision count for EVERY chapter, and the only count that may
// appear there is the trainer's own — `probesOf`, which replays the chapter
// with chess.js. Measured across all 44 shipped courses: 73ms per course at the
// club band on average and 393ms for the worst (w-nf3). On a server-rendered
// page that is a third of a second of blocking work to draw a list of headings,
// paid again on every visit.
//
// It is also entirely wasted work: a course file is static and there are five
// bands, so the answer for a (course, band) pair can never change inside a
// process. 220 entries, computed at most once each.
//
// The alternative — a cheaper count computed a second way — is the drift this
// repo has been bitten by before: two numbers for the same thing that agree
// until they do not. The hub says "24 decisions" and the trainer asks 24.
// ─────────────────────────────────────────────────────────────────────────────

import type { Band } from '@/lib/repertoire/levels';
import { loadCourse } from '@/lib/courses/load';
import { courseVerdict, viewFor, type CourseView } from '@/lib/courses/view';
import { probesOf } from '@/lib/courses/probes';
import { planChapter, type Study } from '@/lib/courses/studies';
import type { CourseMeta } from '@/types/course';

export interface ChapterUnit {
  i: number;
  at: string;
  line: string[];
  title: string | null;
  /** Share of play that reaches this chapter, 0-1. */
  share: number;
  /** Running total across the chapters kept for this band. */
  cum: number;
  /** Decisions in the chapter, counted past the trainer's cap. */
  decisions: number;
  /** Decisions the trainer will actually ask. Equal to `decisions` unless capped. */
  asked: number;
  capped: boolean;
  /** Empty when the chapter is one unit — see studies.ts for the condition. */
  studies: Study[];
}

export interface CourseHub {
  meta: CourseMeta;
  band: Band['id'];
  bandName: string;
  theoryPlies: number;
  verdict: string;
  covered: number;
  omitted: { chapters: number; share: number };
  chapters: ChapterUnit[];
  /** Decisions across every chapter in this view. */
  decisions: number;
  /**
   * Decisions a session can actually ask, across every chapter.
   *
   * THE DENOMINATOR OF PROGRESS, and it is not `decisions`. `probesOf` caps a
   * chapter at 60 questions, and measured on the shipped courses that cap bites
   * on 29 of 44 courses at the club band — the Reti course holds 884 decisions
   * and a session can reach 360 of them. A bar drawn against 884 would stop at
   * 41% however much a player learned, which reads as a broken product rather
   * than as a cap. Progress is measured against what can be earned; the size of
   * the chapter is said separately, and the cap is said out loud.
   */
  asked: number;
}

const cache = new Map<string, CourseHub | null>();

/** The units of one chapter, in the trainer's own counting. */
export function unitsOf(view: CourseView, side: 'white' | 'black'): ChapterUnit[] {
  return view.chapters.map(chapter => {
    const { probes, total, capped } = probesOf(view, chapter.i, side);
    const plan = planChapter(view.nodes, chapter, view.maxPly, side);
    return {
      i: chapter.i,
      at: chapter.at,
      line: chapter.line,
      title: chapter.title,
      share: chapter.share,
      cum: chapter.cum,
      decisions: total,
      asked: probes.length,
      capped,
      studies: plan.studies,
    };
  });
}

/**
 * The hub for one course at one band. Null when there is no such course.
 *
 * SERVER ONLY: `loadCourse` reads the filesystem. The page passes the result
 * through `getServerSideProps`, which is also what makes the band a gate rather
 * than a suggestion — the deeper chapters are not in the payload at all.
 */
export function hubFor(courseId: string, band: Band): CourseHub | null {
  const key = `${courseId}:${band.id}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const course = loadCourse(courseId);
  if (!course) {
    cache.set(key, null);
    return null;
  }
  const view = viewFor(course, band);
  const chapters = unitsOf(view, course.meta.side);
  const hub: CourseHub = {
    meta: course.meta,
    band: band.id,
    bandName: band.name,
    theoryPlies: view.theoryPlies,
    verdict: courseVerdict(view),
    covered: view.covered,
    omitted: view.omitted,
    chapters,
    decisions: chapters.reduce((sum, c) => sum + c.decisions, 0),
    asked: chapters.reduce((sum, c) => sum + c.asked, 0),
  };
  cache.set(key, hub);
  return hub;
}

/** Test seam. The cache is process-lifetime otherwise. */
export function resetHubCache(): void {
  cache.clear();
}
