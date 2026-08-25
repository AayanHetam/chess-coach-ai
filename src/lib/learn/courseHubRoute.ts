// Links out of the course hub, and reading them back.
//
// Beside courseRoute.ts rather than inside it for the reason that file already
// gives about trainerRoute: the trainer's own routing is pinned by its tests
// and widening it to know about a reader and a drill picker would put three
// products' URLs in one place. What it does share is `isCourseId`, because two
// modules disagreeing about what an id looks like is how a path traversal gets
// in.

export { isCourseId, chapterParam, courseTrainerHref, courseReaderHref } from '@/lib/learn/courseRoute';

/**
 * A study id is the opponent's SAN — `Qxd5`, `Nf6`, `exd5`, `O-O`.
 *
 * Validated as a shape rather than trusted, because it reaches a graph walk and
 * a `nodes[key]` lookup. SAN is a small alphabet and anything outside it is not
 * a move whatever else it might be.
 */
const SAN = /^[a-hKQRBNOx0-9+#=@_-]{2,10}$/;

export const isStudyId = (value: unknown): value is string =>
  typeof value === 'string' && SAN.test(value);

/** The study in a query parameter, or null when it is not one. */
export function studyParam(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return isStudyId(raw) ? raw : null;
}

/** The step-through reader for one chapter, optionally opened at one study. */
export function chapterReaderHref(courseId: string, chapter: number, study?: string): string {
  const base = `/learn/${encodeURIComponent(courseId)}/${chapter}`;
  return study ? `${base}?study=${encodeURIComponent(study)}` : base;
}

/**
 * Drill: the same trainer, asking everything rather than what you owe.
 *
 * Without a chapter it is the picker. With one it is a session, and the flag
 * lives in the query rather than in a separate route so that the trainer stays
 * ONE page — two copies of the probe loop is how the two would drift into
 * grading differently.
 */
export function drillHref(courseId: string, chapter?: number, study?: string): string {
  if (chapter === undefined) return `/train/course/${encodeURIComponent(courseId)}/drill`;
  const base = `/train/course/${encodeURIComponent(courseId)}/${chapter}?drill=1`;
  return study ? `${base}&study=${encodeURIComponent(study)}` : base;
}

/** True when this request is a drill rather than a session of what is owed. */
export const isDrill = (value: unknown): boolean => {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === '1' || raw === 'true' || raw === '';
};
