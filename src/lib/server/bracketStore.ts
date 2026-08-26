// The player's repertoire bracket, on the account.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
//
// `courseProgress.ts` already says it, about the drilling: a repertoire "is
// built over months and is the thing a player would be most angry to lose to a
// cleared cache or a new phone". That reasoning was applied to the DRILLING and
// not to the repertoire itself. Which openings you chose — the thing the
// drilling is for — lived only in localStorage, and its writer swallowed a
// quota failure without telling anyone.
//
// The asymmetry was the hazard. Course progress runs to about 1.2 MB for a
// six-course repertoire and 4.2 MB for all forty-three, against a ~5 MB origin
// budget, and it is backed up. The bracket is a few kilobytes and was not. So
// the biggest consumer could starve the smallest and most precious one, and the
// only visible symptom would be a repertoire quietly reverting.
//
// The local copy stays the fast path — /learn never waits on a network to know
// what you picked. This is the copy that survives the device.
//
// THE MERGE RUNS HERE, not on the client, for the same reason it does for
// chapters: two devices posting at once would otherwise each overwrite the
// other. `mergeBrackets` reconciles per COLOUR, and its own comment explains
// why that grain and not per pick.
// ─────────────────────────────────────────────────────────────────────────────

import { getAdminFirestore } from '@/lib/server/firebaseAdmin';
import { withFirestoreTimeout } from '@/lib/server/withFirestoreTimeout';
import { EMPTY, mergeBrackets, sanitiseBracket, type BracketState } from '@/lib/repertoire/store';

const USERS = 'users';
const SUB = 'repertoire';
/** One document. A bracket is a few kilobytes and is read and written whole. */
const DOC = 'bracket';

/**
 * Eight seconds, matching users.ts and courseProgress.ts.
 *
 * Its comment is the reason: the FIRST Firestore call on a cold serverless
 * instance pays gRPC channel and token setup, measured at over 3s in
 * production, so the 3s default flaked on cold starts.
 */
const TIMEOUT_MS = 8_000;

const ref = async (uid: string) => {
  const db = await getAdminFirestore();
  return db.collection(USERS).doc(uid).collection(SUB).doc(DOC);
};

/** The account's bracket, or EMPTY. Sanitised on the way OUT as well as in. */
export async function readBracket(uid: string): Promise<BracketState> {
  const doc = await ref(uid);
  const snap = await withFirestoreTimeout(doc.get(), `bracket.read(${uid})`, TIMEOUT_MS);
  if (!snap.exists) return EMPTY;
  return sanitiseBracket(snap.data());
}

/**
 * Merge the client's bracket into the account's, and return the result.
 *
 * The return value is the point: the caller writes it straight back to its own
 * local store, so a device that has been away comes back holding everything
 * both copies knew.
 */
export async function mergeBracket(uid: string, incoming: BracketState): Promise<BracketState> {
  const doc = await ref(uid);
  const snap = await withFirestoreTimeout(doc.get(), `bracket.merge.read(${uid})`, TIMEOUT_MS);
  const existing = snap.exists ? sanitiseBracket(snap.data()) : EMPTY;
  const merged = mergeBrackets(existing, sanitiseBracket(incoming));
  // Firestore rejects `undefined`. `whiteAt`/`blackAt` are optional by design —
  // absent means "never stamped, fall back to updatedAt" — so they are dropped
  // rather than written as null, which `sanitiseBracket` would read back as
  // "not a number" and discard anyway.
  const payload: Record<string, unknown> = { ...merged };
  if (merged.whiteAt === undefined) delete payload.whiteAt;
  if (merged.blackAt === undefined) delete payload.blackAt;
  await withFirestoreTimeout(doc.set(payload), `bracket.merge.write(${uid})`, TIMEOUT_MS);
  return merged;
}
