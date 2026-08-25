// Links into the course trainer, and reading its query back.
//
// Deliberately NOT in trainerRoute.ts. That module parses `?line=` and
// `?review=` and its `modeOf` returns only 'review' | 'repair', which is pinned
// by its own test — the measured-hole path is the one thing on that page that
// must not move, and widening it to know about courses would put the two
// products' routing in one place for no gain.

const COURSE_ID = /^[a-z0-9-]{1,40}$/;

/**
 * The trainer for one chapter: the CONTRACT screen, which is what a link into
 * the trainer should land on.
 *
 * `?round=` is the phase — its absence is the contract screen and a number is a
 * live round — so a href for round 1 must carry `?round=1`. It did not: this
 * took a `round > 1` test, "round 1 is implied by its absence", and the Start
 * button therefore linked at the screen it was on. Clicking it reloaded the
 * contract. Nobody could begin a course session except by typing the query
 * themselves, and every test passed because each one navigated directly.
 *
 * So the two are now two functions. A phase that is decided by a parameter's
 * presence cannot also have a default for it.
 */
export function courseTrainerHref(courseId: string, chapter: number, round?: number): string {
  const base = `/train/course/${encodeURIComponent(courseId)}/${chapter}`;
  return round && round > 1 ? `${base}?round=${round}` : base;
}

/** One live round. Always carries `?round=`, including round 1. */
export function courseRoundHref(courseId: string, chapter: number, round: number): string {
  // Anything that is not a round is round one. `Math.max(1, NaN)` is NaN, which
  // would put `?round=NaN` in a href that `roundParam` then reads as 1 anyway —
  // correct behaviour reached through a URL nobody would want to see.
  const n = Number.isInteger(round) && round > 1 ? round : 1;
  return `/train/course/${encodeURIComponent(courseId)}/${chapter}?round=${n}`;
}

/** Back to the chapter the player came from. */
export const courseReaderHref = (courseId: string): string =>
  `/learn/${encodeURIComponent(courseId)}`;

/**
 * A course id that is safe to turn into a file path.
 *
 * `loadCourse` already validates against the index, which is the real guard.
 * This one keeps a malformed id from reaching it at all, and keeps the shape in
 * one place so the API route and the page cannot disagree about it.
 */
export const isCourseId = (value: unknown): value is string =>
  typeof value === 'string' && COURSE_ID.test(value);

/** The chapter in a route parameter, or null when it is not one. */
export function chapterParam(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  // An empty string is not a chapter: `Number('')` is 0, so a missing parameter
  // would otherwise open chapter 0.
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 99 ? n : null;
}

/**
 * The round in `?round=`.
 *
 * Absent, junk and out-of-range all mean round 1, because a bad round number is
 * not worth a 404 — the round is a position in a sitting, not an identity, and
 * starting at the beginning is always a coherent thing to do.
 */
export function roundParam(value: unknown, rounds: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, rounds);
}
