// What a player knows about one chapter, kept between sittings.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS NOT trainerProgress
//
// It looks like the same job and it is not. `trainerProgress` stores ONE
// in-flight session with a three-day TTL, because resuming into the middle of a
// drill you have no memory of starting is worse than starting again. That
// reasoning is right about a session and wrong about MASTERY: come back in six
// weeks and the chapter must still know which decisions you own.
//
// So mastery has no TTL, and it has its own key. Sharing `trainerProgress`'s
// would also have meant a chapter clobbering a paused repair of a line measured
// off the player's own games — that slot holds one session for the whole app.
//
// A WRITE THAT FAILS SAYS SO. `writeChapter` returns a boolean rather than
// swallowing the error, because on this origin `savedEvalsAtom` grows without
// eviction through jotai's unguarded setItem, so a full origin is a real state
// — and a chapter that silently stopped saving is pixel-identical to one nobody
// has studied.
// ─────────────────────────────────────────────────────────────────────────────

import type { Correctness, ProbeRecord, Records } from '@/lib/learn/chapterRound';

const PREFIX = 'cm.course.v1';

/** Identity of one chapter's progress for one account. */
export function chapterKey(account: string, courseId: string, chapter: number): string {
  return `${PREFIX}.chapter:${account.toLowerCase()}:${courseId}:${chapter}`;
}

export interface StoredChapter {
  v: 1;
  courseId: string;
  chapter: number;
  /** Records by probe key. */
  records: Records;
  updatedAt: number;
}

const CORRECTNESS: Correctness[] = [0, -1, 1, 2];

/**
 * Field-by-field, in the shape of `isCard` in reviewSchedule.ts.
 *
 * A record that validates loosely is worse than one that fails: `misses` is
 * arithmetic, and `undefined + 1` is NaN, which persists silently and makes
 * every later comparison false.
 */
function isRecord(value: unknown): value is ProbeRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<ProbeRecord>;
  return (
    typeof r.key === 'string' &&
    r.key.length > 0 &&
    typeof r.asks === 'number' &&
    Number.isFinite(r.asks) &&
    typeof r.misses === 'number' &&
    Number.isFinite(r.misses) &&
    typeof r.hinted === 'boolean' &&
    typeof r.lastRound === 'number' &&
    Number.isFinite(r.lastRound) &&
    typeof r.at === 'number' &&
    Number.isFinite(r.at) &&
    CORRECTNESS.includes(r.correctness as Correctness)
  );
}

/**
 * Records that survive validation, keyed correctly.
 *
 * Exported because the SERVER has to run the same check on a payload a browser
 * sent it. A store that validates on read and not on write is a store that
 * trusts whatever the last client happened to post.
 */
export function sanitiseRecords(value: unknown, limit = MAX_RECORDS): Records {
  if (!value || typeof value !== 'object') return {};
  const clean: Records = {};
  let kept = 0;
  for (const [key, record] of Object.entries(value as Record<string, unknown>)) {
    if (kept >= limit) break;
    // Drop individual bad records rather than the whole chapter: one corrupt
    // entry should cost one decision, not a month of work.
    if (isRecord(record) && record.key === key) {
      clean[key] = record;
      kept++;
    }
  }
  return clean;
}

/**
 * Records per chapter, bounded.
 *
 * The largest chapter in the shipped corpus is 286 decisions at the strong
 * band, and `probesOf` caps what is asked at 60. 400 is well clear of both and
 * bounds a synced document a client could otherwise grow without limit.
 */
export const MAX_RECORDS = 400;

/**
 * What is known about this chapter. An empty object is the honest answer for
 * anything unreadable — a chapter nobody has studied and a chapter whose store
 * is corrupt are the same thing to ask about.
 */
export function loadChapter(account: string, courseId: string, chapter: number): Records {
  if (typeof window === 'undefined') return {};
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(chapterKey(account, courseId, chapter));
  } catch {
    return {};
  }
  if (!raw) return {};
  let parsed: StoredChapter | null = null;
  try {
    parsed = JSON.parse(raw) as StoredChapter;
  } catch {
    return {};
  }
  if (!parsed || parsed.v !== 1) return {};
  return sanitiseRecords(parsed.records);
}

/** Store this chapter. False means it was not saved, and the screen must say so. */
export function writeChapter(
  account: string,
  courseId: string,
  chapter: number,
  records: Records,
  now: number
): boolean {
  if (typeof window === 'undefined') return false;
  const payload: StoredChapter = { v: 1, courseId, chapter, records, updatedAt: now };
  try {
    window.localStorage.setItem(chapterKey(account, courseId, chapter), JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearChapter(account: string, courseId: string, chapter: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(chapterKey(account, courseId, chapter));
  } catch {
    /* nothing to do, and nothing worth failing for */
  }
}

/**
 * Two copies of one chapter, reconciled.
 *
 * Needed because mastery syncs to the account: a player studies on a laptop and
 * a phone, and both hold a partial truth. Per DECISION rather than per chapter,
 * because taking the newer whole chapter would throw away work done on the
 * other device in the same window.
 *
 * CORRECTNESS takes the more recent answer, and the counters take the larger of
 * the two. Two rules I got wrong first and both are worth writing down:
 *
 *   Taking the higher `correctness` refuses to let a player FORGET. A decision
 *   known on a laptop in March and missed on a phone in June is not known, and
 *   a sync that says otherwise deletes the only evidence spaced repetition
 *   runs on.
 *
 *   `Math.max` is not the knowledge order anyway. The values are 2, 1, -1, 0,
 *   so max(-1, 0) is 0 — a merge that quietly erased a miss in favour of never
 *   having asked.
 *
 * `hinted` ORs, always: a hint taken anywhere was taken, and `known` must never
 * come to mean `was shown` on any device.
 */
export function mergeChapters(a: Records, b: Records): Records {
  const out: Records = { ...a };
  for (const [key, theirs] of Object.entries(b)) {
    const mine = out[key];
    if (!mine) {
      out[key] = theirs;
      continue;
    }
    const current = theirs.at > mine.at ? theirs : mine;
    out[key] = {
      key,
      correctness: current.correctness,
      asks: Math.max(mine.asks, theirs.asks),
      misses: Math.max(mine.misses, theirs.misses),
      hinted: mine.hinted || theirs.hinted,
      lastRound: Math.max(mine.lastRound, theirs.lastRound),
      at: Math.max(mine.at, theirs.at),
    };
  }
  return out;
}
