// Server-only readers for the generated courses.
//
// Read with `fs` at module scope rather than `import`ed, for the reason spelled
// out in src/lib/repertoire/load.ts: webpack bundling a megabyte of JSON into
// every server output is how this repo has hung Vercel builds before. Because
// webpack never sees these files the tracer cannot either, so they are named in
// `outputFileTracingIncludes` in next.config.js — the .js, not the .ts, which
// Next does not load and which has therefore never taken effect.
//
// One file is read per request, not all 43. A course is ~85 KB; the index that
// lists them is 6 KB and is the only thing read on a page that shows the
// catalogue.

import fs from 'fs';
import path from 'path';
import type { Course, CourseIndex } from '@/types/course';

const DIR = path.join(process.cwd(), 'src', 'data', 'courses');

let indexCache: CourseIndex | null = null;
let indexFailed = false;

/** The catalogue. Null when the artifacts are missing, never a throw. */
export function loadCourseIndex(): CourseIndex | null {
  if (indexCache) return indexCache;
  if (indexFailed) return null;
  try {
    indexCache = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')) as CourseIndex;
    return indexCache;
  } catch {
    // A build without the courses generated, or an SSR pre-pass with a
    // different cwd. Degrade to "no courses" so the page renders without them
    // rather than 500ing on a data file.
    indexFailed = true;
    return null;
  }
}

const courses = new Map<string, Course | null>();

/**
 * One course by id.
 *
 * The id is used to build a path, so it is validated against the index rather
 * than sanitised: an id that is not in the catalogue is not a course, whatever
 * it would resolve to on disk.
 */
export function loadCourse(id: string): Course | null {
  if (courses.has(id)) return courses.get(id) ?? null;
  const index = loadCourseIndex();
  if (!index?.courses.some(c => c.id === id)) {
    courses.set(id, null);
    return null;
  }
  try {
    const course = JSON.parse(fs.readFileSync(path.join(DIR, `${id}.json`), 'utf8')) as Course;
    courses.set(id, course);
    return course;
  } catch {
    courses.set(id, null);
    return null;
  }
}

/** Courses that fill a given bracket slot, i.e. share the catalogue choice id. */
export function courseForChoice(choiceId: string): Course | null {
  return loadCourse(choiceId);
}

/** Test seam. The caches are process-lifetime otherwise. */
export function resetCourseCache(): void {
  indexCache = null;
  indexFailed = false;
  courses.clear();
}
