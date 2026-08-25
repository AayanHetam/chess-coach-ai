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
import { isDue, type Records } from '@/lib/learn/chapterRound';

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
  /**
   * Cards owed right now.
   *
   * NOT clamped against `total` the way `known` is. A card exists because
   * something went wrong, and a decision that has dropped out of this band's
   * view is still a decision they got wrong — hiding it would be the review
   * list quietly forgetting on their behalf.
   */
  due: number;
}

export interface CourseMastery {
  byChapter: Map<number, ChapterMastery>;
  known: number;
  learning: number;
  total: number;
  /** Cards owed across the course. Zero for a course nobody has got wrong. */
  due: number;
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
export function masteryOf(records: Records, total: number, now = 0): ChapterMastery {
  let known = 0;
  let learning = 0;
  let due = 0;
  for (const record of Object.values(records)) {
    if (record.correctness === 2) known++;
    else if (record.correctness !== 0) learning++;
    // `now` defaults to 0, so a caller that passes no clock counts nothing due
    // rather than everything.
    if (isDue(record, now)) due++;
  }
  known = Math.min(known, total);
  learning = Math.min(learning, Math.max(0, total - known));
  return { known, learning, unseen: Math.max(0, total - known - learning), total, due };
}

/** Every chapter of one course, for one account. Empty for a signed-out reader. */
export function readCourseMastery(
  account: string,
  courseId: string,
  chapters: Array<{ i: number; asked: number }>,
  now = 0
): CourseMastery {
  const byChapter = new Map<number, ChapterMastery>();
  let known = 0;
  let learning = 0;
  let total = 0;
  let due = 0;
  let started = 0;
  for (const chapter of chapters) {
    const records = account ? loadChapter(account, courseId, chapter.i) : {};
    const mastery = masteryOf(records, chapter.asked, now);
    byChapter.set(chapter.i, mastery);
    known += mastery.known;
    learning += mastery.learning;
    total += mastery.total;
    due += mastery.due;
    if (Object.keys(records).length > 0) started++;
  }
  return { byChapter, known, learning, total, due, started };
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
