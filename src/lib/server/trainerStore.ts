// What the player has already learnt, on the account.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
//
// Two layers of earned work were living only in localStorage:
//
//   THE REVIEW SCHEDULE — months of SM-2 evidence about one player. Losing it
//   does not just lose the dates; it loses the record that the line was ever
//   learnt, so the trainer offers it again from scratch.
//
//   THE REPAIRED LIST — the lines already put through three clean runs, which
//   `isRepaired` reads to stop re-offering a drill that is done.
//
// Both are exactly the thing "we don't make them do it again" is about, and
// both were one cleared cache from gone. `bracketStore.ts` did this for the
// repertoire; this does it for the work done against it.
//
// ONE DOCUMENT, both layers. They are written by the same event — finishing a
// session writes a card and marks the line repaired — so splitting them across
// two documents would let a device end up with a schedule for a line its own
// history says was never repaired.
//
// THE MERGE RUNS HERE, not on the client, because two devices posting at once
// would otherwise each overwrite the other. `mergeCards` and `mergeRepaired`
// carry the reasoning for their grain.
// ─────────────────────────────────────────────────────────────────────────────

import { getAdminFirestore } from '@/lib/server/firebaseAdmin';
import { withFirestoreTimeout } from '@/lib/server/withFirestoreTimeout';
import {
  ACCOUNT_CARD_BYTES,
  mergeCards,
  sanitiseCards,
  trimCards,
  type ReviewCard,
} from '@/lib/learn/reviewSchedule';
import {
  mergeRepaired,
  sanitiseRepaired,
  type RepairedLine,
} from '@/lib/learn/trainerProgress';

const USERS = 'users';
const SUB = 'trainer';
const DOC = 'progress';

/**
 * Eight seconds, matching bracketStore.ts and courseProgress.ts.
 *
 * The first Firestore call on a cold serverless instance pays gRPC channel and
 * token setup, measured at over 3s in production, so the 3s default flaked.
 */
const TIMEOUT_MS = 8_000;

export interface TrainerProgress {
  cards: ReviewCard[];
  repaired: RepairedLine[];
}

export const EMPTY_PROGRESS: TrainerProgress = { cards: [], repaired: [] };

const ref = async (uid: string) => {
  const db = await getAdminFirestore();
  return db.collection(USERS).doc(uid).collection(SUB).doc(DOC);
};

/** Sanitised on the way OUT as well as in: the document may predate a guard. */
function sanitise(data: unknown): TrainerProgress {
  const d = (data ?? {}) as { cards?: unknown; repaired?: unknown };
  return { cards: sanitiseCards(d.cards), repaired: sanitiseRepaired(d.repaired) };
}

export async function readTrainerProgress(uid: string): Promise<TrainerProgress> {
  const doc = await ref(uid);
  const snap = await withFirestoreTimeout(doc.get(), `trainer.read(${uid})`, TIMEOUT_MS);
  if (!snap.exists) return EMPTY_PROGRESS;
  return sanitise(snap.data());
}

/**
 * Merge the device's progress into the account's, and return the result.
 *
 * The return value is the point: the caller writes it straight back to its own
 * local store, so a device that has been away comes back holding everything
 * both copies knew.
 *
 * The account is trimmed to `ACCOUNT_CARD_BYTES`, which is deliberately larger
 * than the device budget. `reviewSchedule.ts` explains why that inequality is
 * load-bearing and not a round number: reversed, a card trimmed here would be
 * pushed back up by the device that still holds it, forever.
 */
export async function mergeTrainerProgress(
  uid: string,
  incoming: TrainerProgress
): Promise<TrainerProgress> {
  const doc = await ref(uid);
  const snap = await withFirestoreTimeout(doc.get(), `trainer.merge.read(${uid})`, TIMEOUT_MS);
  const existing = snap.exists ? sanitise(snap.data()) : EMPTY_PROGRESS;
  const clean = sanitise(incoming);
  const merged: TrainerProgress = {
    cards: trimCards(mergeCards(existing.cards, clean.cards), ACCOUNT_CARD_BYTES),
    repaired: mergeRepaired(existing.repaired, clean.repaired),
  };
  await withFirestoreTimeout(
    doc.set({ ...merged, updatedAt: Date.now() }),
    `trainer.merge.write(${uid})`,
    TIMEOUT_MS
  );
  return merged;
}
