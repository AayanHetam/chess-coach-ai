// How far through each course they are, read in one pass.
//
// The catalogue needs a number for all 43 courses at once. Calling
// loadChapter() per (course, chapter) would be ~350 localStorage reads and 350
// JSON.parse calls on mount — so this scans the keyspace once instead, and
// parses only what it finds.
//
// Deliberately counts CHAPTERS STARTED rather than positions known. "3 of 8
// chapters" is a sentence a person can check against their own memory; a
// percentage of positions is a number they have to trust. The catalogue is a
// place to choose what to work on, not to be assessed.
//
// IT ALSO COUNTS WHAT IS DUE, in the same pass. Cards are earned per chapter
// and were visible only on the chapter's own hub, so a review earned on Monday
// was invisible on every screen a player actually opens. An earned review
// nobody can find is a review that does not exist. Counting it here rather than
// in a second scan matters: the alternative is parsing every chapter twice on
// the mount of a page whose whole job is to list courses.

import type { CourseProgress } from '@/lib/courses/catalogue';
import { sanitiseRecords, type StoredChapter } from '@/lib/learn/chapterProgress';
import { isDue } from '@/lib/learn/chapterRound';

/** Matches chapterKey(): `cm.course.v1.chapter:<account>:<courseId>:<chapter>`. */
const PREFIX = 'cm.course.v1.chapter:';

/**
 * Every course this account has touched.
 *
 * Every failure returns an empty map rather than throwing. This runs on mount
 * on a page whose whole job is to list courses, and a corrupt entry must cost
 * a progress bar, never the catalogue.
 */
export function readCourseProgress(account: string, now = 0): Map<string, CourseProgress> {
  const out = new Map<string, CourseProgress>();
  if (typeof window === 'undefined') return out;
  const scope = `${PREFIX}${account.toLowerCase()}:`;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(scope)) continue;
      // `<courseId>:<chapter>` — course ids never contain a colon (they are
      // `w-london`, `b-sicilian-najdorf`), so the LAST colon is the separator.
      const tail = key.slice(scope.length);
      const cut = tail.lastIndexOf(':');
      if (cut <= 0) continue;
      const courseId = tail.slice(0, cut);

      let stored: StoredChapter | null = null;
      try {
        stored = JSON.parse(window.localStorage.getItem(key) ?? 'null') as StoredChapter;
      } catch {
        continue;
      }
      // A chapter that exists but holds no answered position is not started.
      // Writing the key happens before the first answer, so counting keys would
      // report progress for a chapter they opened and immediately left.
      // Validated, not trusted. `dueAt` is arithmetic and a stored NaN compares
      // false against every clock — the decision would be permanently not-due
      // with nothing on any screen to see. `sanitiseRecords` drops half a card.
      const records = sanitiseRecords(stored?.records);
      const answered = Object.keys(records).length;
      if (answered === 0) continue;

      let due = 0;
      let nextAt: number | null = null;
      for (const record of Object.values(records)) {
        // `now` defaults to 0, so a caller that passes no clock counts nothing
        // due rather than everything.
        if (isDue(record, now)) due++;
        if (record.dueAt !== undefined && (nextAt === null || record.dueAt < nextAt)) {
          nextAt = record.dueAt;
        }
      }

      const prev = out.get(courseId);
      out.set(courseId, {
        started: (prev?.started ?? 0) + 1,
        at: Math.max(prev?.at ?? 0, typeof stored?.updatedAt === 'number' ? stored.updatedAt : 0),
        due: (prev?.due ?? 0) + due,
        nextAt:
          nextAt === null ? (prev?.nextAt ?? null)
          : prev?.nextAt == null ? nextAt
          : Math.min(prev.nextAt, nextAt),
      });
    }
  } catch {
    // Storage disabled entirely (Safari private mode). No progress bars.
    return out;
  }
  return out;
}
