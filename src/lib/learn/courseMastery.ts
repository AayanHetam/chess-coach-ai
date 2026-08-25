// What a player knows about a whole course, read on the client.
//
// Separate from courseProgress.ts, which scans the WHOLE keyspace to answer
// "which courses has this account touched" for the catalogue. This one is
// pointed at a single course whose chapters are already known, so it reads
// those keys directly — a handful of gets rather than a scan of every key on
// the origin.
//
// It counts DECISIONS, not chapters, because the hub is where a player decides
// what to do next and "31 of 48" tells them that where "3 chapters started"
// does not. The catalogue keeps the chapter count for the opposite reason: a
// shelf is for choosing between courses, not for being assessed.

import { loadChapter } from '@/lib/learn/chapterProgress';
import type { Records } from '@/lib/learn/chapterRound';

export interface ChapterMastery {
  /** Answered right, cold. */
  known: number;
  /** Missed, or right only after a miss or a hint. */
  learning: number;
  /** Never asked. */
  unseen: number;
  /**
   * Decisions a session can ASK in this chapter, from the server.
   *
   * Not the chapter's size: `probesOf` caps a chapter at 60, and a bar drawn
   * against a number no player can reach only ever reports a fraction.
   */
  total: number;
}

export interface CourseMastery {
  byChapter: Map<number, ChapterMastery>;
  known: number;
  learning: number;
  total: number;
  /** Chapters with at least one answer. */
  started: number;
}

/**
 * One chapter's records, counted against what the chapter actually holds.
 *
 * CLAMPED, and the clamp is not defensive dressing: a player who drops a band —
 * a rating correction, a platform switch — keeps records for decisions the
 * shallower view no longer contains, and an unclamped count renders "26 of 24"
 * or a bar past its own end. The extra answers are real and they are not
 * progress through THIS view.
 */
export function masteryOf(records: Records, total: number): ChapterMastery {
  let known = 0;
  let learning = 0;
  for (const record of Object.values(records)) {
    if (record.correctness === 2) known++;
    else if (record.correctness !== 0) learning++;
  }
  known = Math.min(known, total);
  learning = Math.min(learning, Math.max(0, total - known));
  return { known, learning, unseen: Math.max(0, total - known - learning), total };
}

/** Every chapter of one course, for one account. Empty for a signed-out reader. */
export function readCourseMastery(
  account: string,
  courseId: string,
  chapters: Array<{ i: number; asked: number }>
): CourseMastery {
  const byChapter = new Map<number, ChapterMastery>();
  let known = 0;
  let learning = 0;
  let total = 0;
  let started = 0;
  for (const chapter of chapters) {
    const records = account ? loadChapter(account, courseId, chapter.i) : {};
    const mastery = masteryOf(records, chapter.asked);
    byChapter.set(chapter.i, mastery);
    known += mastery.known;
    learning += mastery.learning;
    total += mastery.total;
    if (Object.keys(records).length > 0) started++;
  }
  return { byChapter, known, learning, total, started };
}

/**
 * The chapter to open when they press Continue.
 *
 * The first chapter with anything left, in share order — which is the order the
 * chapters are already in, so this is "the most likely thing you do not yet
 * know". Null when the course is finished, and the caller must say so rather
 * than sending them somewhere.
 */
export function nextChapter(
  chapters: Array<{ i: number; asked: number }>,
  mastery: CourseMastery
): number | null {
  for (const chapter of chapters) {
    if (chapter.asked === 0) continue;
    const at = mastery.byChapter.get(chapter.i);
    if (!at || at.known < at.total) return chapter.i;
  }
  return null;
}
