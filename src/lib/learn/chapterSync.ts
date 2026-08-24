// Keeping one chapter's mastery in step across devices.
//
// ─────────────────────────────────────────────────────────────────────────────
// LOCAL FIRST, ALWAYS
//
// The screen never waits on a network to know what you know. `loadChapter`
// answers immediately from localStorage and the round starts; the account copy
// arrives when it arrives and is merged in.
//
// That ordering is not a performance preference. A trainer that blocks on a
// fetch is a trainer that is unusable on a train, and the local copy is right
// almost always — the sync exists for the cleared cache and the new phone, not
// for the common case.
//
// EVERY FAILURE IS SILENT AND HARMLESS. A sync that does not happen costs
// nothing that was not already saved locally, so nothing here throws and
// nothing here reports. The failure the player must be told about is the LOCAL
// write failing, which `writeChapter` returns and the screen surfaces — losing
// the device copy is the loss that matters.
// ─────────────────────────────────────────────────────────────────────────────

import { loadChapter, mergeChapters, sanitiseRecords, writeChapter } from '@/lib/learn/chapterProgress';
import type { Records } from '@/lib/learn/chapterRound';

const ENDPOINT = '/api/course-progress';

interface Target {
  account: string;
  courseId: string;
  chapter: number;
}

async function readJson(url: string, init?: RequestInit): Promise<Records | null> {
  try {
    const res = await fetch(url, { credentials: 'same-origin', ...init });
    if (!res.ok) return null;
    const body = (await res.json()) as { records?: unknown };
    return sanitiseRecords(body.records);
  } catch {
    return null;
  }
}

/**
 * The account's copy, merged into this device's, saved locally, and returned.
 *
 * Returns null when nothing changed or nothing came back, so a caller can skip
 * a re-render it does not need.
 */
export async function pullChapter(target: Target): Promise<Records | null> {
  const remote = await readJson(
    `${ENDPOINT}?courseId=${encodeURIComponent(target.courseId)}&chapter=${target.chapter}`
  );
  if (!remote || Object.keys(remote).length === 0) return null;

  const local = loadChapter(target.account, target.courseId, target.chapter);
  const merged = mergeChapters(local, remote);
  writeChapter(target.account, target.courseId, target.chapter, merged, Date.now());
  return merged;
}

/**
 * Push this device's copy, and take back the union.
 *
 * The server merges rather than overwrites, so two devices posting in the same
 * minute cannot clobber each other, and what comes back is everything both
 * copies knew. Saved locally too, because that union is now the truth.
 */
export async function pushChapter(target: Target, records: Records): Promise<Records | null> {
  const merged = await readJson(ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ courseId: target.courseId, chapter: target.chapter, records }),
  });
  if (!merged) return null;
  writeChapter(target.account, target.courseId, target.chapter, merged, Date.now());
  return merged;
}
