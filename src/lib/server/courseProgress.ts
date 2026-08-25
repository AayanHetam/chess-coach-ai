// Chapter mastery, on the account.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS NOT localStorage-ONLY
//
// Every other progress layer in this repo is device-local, and `trainerProgress`
// calls that intentional: "the working copy of one person's progress on one
// device." That reasoning holds for a drill you did once. It does not hold for a
// repertoire, which is built over months and is the thing a player would be
// most angry to lose to a cleared cache or a new phone.
//
// The local copy stays the fast path — the screen never waits on a network to
// know what you know. This is the copy that survives the device.
//
// THE MERGE RUNS HERE, not on the client. Two devices posting at once would
// otherwise each overwrite the other's chapter, and last-write-wins on a whole
// chapter throws away a sitting. `mergeChapters` reconciles per DECISION.
// ─────────────────────────────────────────────────────────────────────────────

import { getAdminFirestore } from '@/lib/server/firebaseAdmin';
import { withFirestoreTimeout } from '@/lib/server/withFirestoreTimeout';
import { mergeChapters, sanitiseRecords } from '@/lib/learn/chapterProgress';
import type { Records } from '@/lib/learn/chapterRound';

const USERS = 'users';
const SUB = 'courseProgress';

/**
 * Eight seconds, matching users.ts.
 *
 * Its comment is the reason: the FIRST Firestore call on a cold serverless
 * instance pays gRPC channel and token setup, measured at over 3s in
 * production, so the 3s default flaked on cold starts.
 */
const TIMEOUT_MS = 8_000;

/** One document per chapter, so a write is small and a merge is scoped. */
const docId = (courseId: string, chapter: number): string => `${courseId}__${chapter}`;

export interface StoredChapterDoc {
  courseId: string;
  chapter: number;
  records: Records;
  updatedAt: number;
}

export async function readChapter(
  uid: string,
  courseId: string,
  chapter: number
): Promise<Records> {
  const db = await getAdminFirestore();
  const snap = await withFirestoreTimeout(
    db.collection(USERS).doc(uid).collection(SUB).doc(docId(courseId, chapter)).get(),
    `courseProgress.read(${uid}/${courseId}/${chapter})`,
    TIMEOUT_MS
  );
  if (!snap.exists) return {};
  const data = snap.data() as Partial<StoredChapterDoc> | undefined;
  // Sanitised on the way OUT as well as in. A document written by an older
  // shape, or by hand, must not reach the round machine unchecked.
  return sanitiseRecords(data?.records);
}

/**
 * Merge the client's copy into the account's, and return the result.
 *
 * The return value is the point: the caller writes it straight back to its own
 * local store, so a device that has been away comes back holding everything
 * both copies knew.
 */
export async function mergeChapter(
  uid: string,
  courseId: string,
  chapter: number,
  incoming: Records,
  now: number
): Promise<Records> {
  const db = await getAdminFirestore();
  const ref = db.collection(USERS).doc(uid).collection(SUB).doc(docId(courseId, chapter));

  const snap = await withFirestoreTimeout(
    ref.get(),
    `courseProgress.merge.read(${uid}/${courseId}/${chapter})`,
    TIMEOUT_MS
  );
  const existing = snap.exists
    ? sanitiseRecords((snap.data() as Partial<StoredChapterDoc> | undefined)?.records)
    : {};

  const merged = mergeChapters(existing, sanitiseRecords(incoming));
  const payload: StoredChapterDoc = { courseId, chapter, records: merged, updatedAt: now };
  await withFirestoreTimeout(
    ref.set(payload),
    `courseProgress.merge.write(${uid}/${courseId}/${chapter})`,
    TIMEOUT_MS
  );
  return merged;
}
