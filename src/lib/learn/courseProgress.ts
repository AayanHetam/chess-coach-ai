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

import type { CourseProgress } from '@/lib/courses/catalogue';
import type { StoredChapter } from '@/lib/learn/chapterProgress';

/** Matches chapterKey(): `cm.course.v1.chapter:<account>:<courseId>:<chapter>`. */
const PREFIX = 'cm.course.v1.chapter:';

/**
 * Every course this account has touched.
 *
 * Every failure returns an empty map rather than throwing. This runs on mount
 * on a page whose whole job is to list courses, and a corrupt entry must cost
 * a progress bar, never the catalogue.
 */
export function readCourseProgress(account: string): Map<string, CourseProgress> {
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
      const answered = stored?.records ? Object.keys(stored.records).length : 0;
      if (answered === 0) continue;

      const prev = out.get(courseId);
      out.set(courseId, {
        started: (prev?.started ?? 0) + 1,
        at: Math.max(prev?.at ?? 0, typeof stored?.updatedAt === 'number' ? stored.updatedAt : 0),
      });
    }
  } catch {
    // Storage disabled entirely (Safari private mode). No progress bars.
    return out;
  }
  return out;
}
