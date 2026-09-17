import { createHash } from "crypto";
import { getAdminFirestore } from "@/lib/server/firebaseAdmin";

/**
 * The suppression list — the thing that makes an unsubscribe actually stick.
 *
 * Turning reminders off used to flip `reminderPrefs.enabled` on ONE user
 * document. That is a preference, not a suppression, and it fails in the case
 * that matters: the opt-out is keyed to a uid, while the promise made in the
 * email footer is about an ADDRESS. A second account on the same address, or a
 * fresh signup after a deletion, starts life opted-in and mails a person who
 * already said no. CAN-SPAM §7704(a)(4) is about the address.
 *
 * So the record is keyed by the address, and lives outside the account.
 *
 * WHY HASHED IDS: the list of people who unsubscribed is itself personal data,
 * and a document path shows up in logs, stack traces and console screenshots
 * that a user record does not. SHA-256 over the normalised address is a
 * one-way key that still answers the only question asked of it — "is THIS
 * address suppressed" — without putting anybody's email in a path. It is not a
 * secret (an unsalted email hash is dictionary-attackable), it just stops the
 * address travelling anywhere it did not already travel.
 *
 * WHY DELETION DOES NOT WRITE HERE: an account deletion is an erasure request.
 * Adding the address to a permanent list on the way out would keep a record of
 * a person who asked to be forgotten, to prevent mail we have no way to send
 * them anyway. The suppression list records a choice about email; it is not a
 * tombstone.
 */

const COLLECTION = "emailSuppressions";

/** Same normalisation the auth code uses, so the key matches the account. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** One-way key. See the note above on why the raw address is not the id. */
export function suppressionKey(email: string): string {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

export type SuppressionReason = "unsubscribed" | "bounced" | "complained";

export interface SuppressionRecord {
  reason: SuppressionReason;
  suppressedAt: number;
  /** Domain only — useful for spotting a provider-wide delivery problem. */
  domain: string;
}

/**
 * Record that this address has opted out. Idempotent: re-clicking the link in
 * an old email must not error, and must not move the timestamp, because the
 * original opt-out date is the one that matters if anyone ever asks when.
 */
export async function suppressEmail(
  email: string,
  reason: SuppressionReason = "unsubscribed"
): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) return;
  const db = await getAdminFirestore();
  const ref = db.collection(COLLECTION).doc(suppressionKey(normalized));
  const existing = await ref.get();
  if (existing.exists) return;
  const record: SuppressionRecord = {
    reason,
    suppressedAt: Date.now(),
    domain: normalized.slice(normalized.lastIndexOf("@") + 1),
  };
  await ref.set(record);
}

/**
 * Is this address suppressed?
 *
 * FAILS CLOSED. If Firestore is unreachable we cannot prove the person has not
 * opted out, and the cost of the two answers is not symmetric: a skipped
 * reminder is a missed nudge, a wrongly-sent one is mail to somebody who told
 * us to stop. The caller logs the skip so a sustained outage is visible rather
 * than silently muting the whole cron.
 */
export async function isEmailSuppressed(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return true;
  try {
    const db = await getAdminFirestore();
    const snap = await db
      .collection(COLLECTION)
      .doc(suppressionKey(normalized))
      .get();
    return snap.exists;
  } catch (err) {
    console.error("[emailSuppression] lookup failed, suppressing", err);
    return true;
  }
}

/**
 * Re-subscribe. Needed because the product offers a reminders toggle: someone
 * who unsubscribed by email and later flips that switch back on has asked for
 * mail again, and the suppression must lift or the toggle silently lies.
 */
export async function unsuppressEmail(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  const db = await getAdminFirestore();
  await db.collection(COLLECTION).doc(suppressionKey(normalized)).delete();
}
