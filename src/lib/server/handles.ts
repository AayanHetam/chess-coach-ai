import { getAdminFirestore } from "./firebaseAdmin";
import { withFirestoreTimeout } from "./withFirestoreTimeout";
import { checkHandle, canonicalHandle } from "../auth/handle";

/**
 * Claiming a handle, atomically.
 *
 * Firestore has no unique-column constraint, so uniqueness is enforced by a
 * RESERVATION DOCUMENT whose id IS the canonical handle:
 *
 *   handles/{canonical}  ->  { uid, display, claimedAt }
 *
 * The claim runs in a transaction that CREATES that document. Two people
 * racing for the same handle cannot both succeed, because the second create
 * fails on a document that now exists. A read-then-write would happily hand
 * the same handle to both — and a handle is a sign-in credential here, so a
 * duplicate is not a cosmetic bug, it is two people pointing at one identity.
 *
 * The user document keeps `handle` (display form) and `handleLower`
 * (canonical) so ordinary reads never need a join. The reservation doc is the
 * source of truth for uniqueness; the user doc is a denormalised copy, and
 * both are written in the SAME transaction so they cannot disagree.
 */

/**
 * Exported so `createUser` can reserve a handle in the SAME transaction that
 * creates the user, rather than importing the string twice and drifting.
 */
export const HANDLES = "handles";
const USERS = "users";

export type ClaimResult =
  | { status: "ok"; handle: string; canonical: string }
  | { status: "taken" }
  | { status: "invalid"; message: string }
  | { status: "unchanged"; handle: string };

export interface HandleReservation {
  uid: string;
  display: string;
  claimedAt: number;
}

/**
 * Is this handle free? Advisory only — the transaction is the real gate.
 *
 * Used for the "checking…" hint as the user types. A free answer here can
 * still lose the race to a claim a millisecond later, which is exactly why
 * the UI must never treat it as a promise.
 */
export async function isHandleAvailable(
  raw: string,
  forUid?: string
): Promise<boolean> {
  const check = checkHandle(raw);
  if (!check.ok || !check.canonical) return false;
  const db = await getAdminFirestore();
  const snap = await withFirestoreTimeout(
    db.collection(HANDLES).doc(check.canonical).get(),
    "handles.isAvailable"
  );
  if (!snap.exists) return true;
  // Their own handle is "available" to them, so re-submitting an unchanged
  // form is not reported as a conflict with themselves.
  return (
    forUid !== undefined && (snap.data() as HandleReservation)?.uid === forUid
  );
}

export async function getUidByHandle(raw: string): Promise<string | null> {
  const canonical = canonicalHandle(raw ?? "");
  if (!canonical) return null;
  const db = await getAdminFirestore();
  const snap = await withFirestoreTimeout(
    db.collection(HANDLES).doc(canonical).get(),
    "handles.getUid"
  );
  if (!snap.exists) return null;
  return (snap.data() as HandleReservation)?.uid ?? null;
}

/**
 * Claim `raw` for `uid`, releasing any handle they previously held.
 *
 * Idempotent: re-claiming your own current handle returns `unchanged` rather
 * than failing, so a double-submit is not an error the user has to understand.
 */
export async function claimHandle(
  uid: string,
  raw: string,
  now: number = Date.now()
): Promise<ClaimResult> {
  const check = checkHandle(raw);
  if (!check.ok || !check.canonical || !check.display) {
    return {
      status: "invalid",
      message: check.message ?? "That handle won't work.",
    };
  }
  const { canonical, display } = check;

  const db = await getAdminFirestore();
  const handleRef = db.collection(HANDLES).doc(canonical);
  const userRef = db.collection(USERS).doc(uid);

  return withFirestoreTimeout(
    db.runTransaction(async (tx): Promise<ClaimResult> => {
      // ALL reads before any write — Firestore transactions require it.
      const [handleSnap, userSnap] = await Promise.all([
        tx.get(handleRef),
        tx.get(userRef),
      ]);

      if (handleSnap.exists) {
        const owner = (handleSnap.data() as HandleReservation)?.uid;
        if (owner !== uid) return { status: "taken" };
        // Already theirs. Still refresh the display form so changing only the
        // capitalisation works.
        const current = (userSnap.data() as { handle?: string })?.handle;
        if (current === display)
          return { status: "unchanged", handle: display };
        tx.update(userRef, { handle: display });
        tx.update(handleRef, { display });
        return { status: "ok", handle: display, canonical };
      }

      const previous = (userSnap.data() as { handleLower?: string })
        ?.handleLower;

      // The old reservation is read HERE, while we are still in the read
      // phase. Firestore rejects any read issued after the first write in a
      // transaction, so fetching this alongside the writes below would throw
      // on every handle CHANGE while first-time claims kept working — a bug
      // that only appears once someone renames.
      const prevRef =
        previous && previous !== canonical
          ? db.collection(HANDLES).doc(previous)
          : null;
      const prevSnap = prevRef ? await tx.get(prevRef) : null;

      // ── writes from here ──────────────────────────────────────────────
      tx.create(handleRef, {
        uid,
        display,
        claimedAt: now,
      } satisfies HandleReservation);
      tx.update(userRef, { handle: display, handleLower: canonical });

      // Release the old reservation only if it was really theirs. Deleting on
      // the strength of the user doc alone would let a stale (or hand-written)
      // handleLower free somebody else's handle — an identity theft primitive
      // triggered by writing a field on your own profile.
      if (
        prevRef &&
        prevSnap?.exists &&
        (prevSnap.data() as HandleReservation)?.uid === uid
      ) {
        tx.delete(prevRef);
      }

      return { status: "ok", handle: display, canonical };
    }),
    "handles.claim"
  );
}
