/**
 * Free-tier daily usage counters (pricing pivot). Premium/trial/comped users
 * are unlimited and never hit this; the gate calls it only for free users.
 *
 * Storage: Firestore collection `usageCounters`, one doc per user-per-UTC-day
 * (`${uid}_${YYYY-MM-DD}`) with a count field per FeatureKey. Resets at UTC
 * midnight simply because the doc id rolls to a new date. A Firestore
 * transaction makes check+consume atomic so two concurrent requests can't both
 * slip past the limit. Any Firestore error FAILS OPEN (allows) — a counter
 * outage must never hard-block users; we log and move on.
 */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/server/firebaseAdmin";
import { FREE_DAILY_LIMITS, type FeatureKey } from "./config";

const COLLECTION = "usageCounters";

/** YYYY-MM-DD in UTC for the given epoch ms. */
export function dateKeyUTC(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export type QuotaResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
};

/**
 * Atomically check + consume one unit of the free daily allowance for a
 * feature. Returns allowed=false (without consuming) once the limit is hit.
 */
export async function checkAndConsumeQuota(
  uid: string,
  feature: FeatureKey,
  nowMs: number = Date.now(),
): Promise<QuotaResult> {
  const limit = FREE_DAILY_LIMITS[feature];
  const day = dateKeyUTC(nowMs);
  const docId = `${uid}_${day}`;
  try {
    const db = await getAdminFirestore();
    const ref = db.collection(COLLECTION).doc(docId);
    return await db.runTransaction(async (txn) => {
      const snap = await txn.get(ref);
      const used =
        (snap.exists ? (snap.data()?.[feature] as number | undefined) : 0) ?? 0;
      if (used >= limit) {
        return { allowed: false, remaining: 0, limit, used };
      }
      txn.set(
        ref,
        {
          uid,
          date: day,
          [feature]: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return { allowed: true, remaining: limit - (used + 1), limit, used: used + 1 };
    });
  } catch (err) {
    console.error(`[quota] check failed for ${feature} (failing open)`, err);
    return { allowed: true, remaining: limit, limit, used: 0 };
  }
}

/** Read-only peek (no consume) — for surfacing remaining counts in UI. */
export async function peekQuota(
  uid: string,
  feature: FeatureKey,
  nowMs: number = Date.now(),
): Promise<QuotaResult> {
  const limit = FREE_DAILY_LIMITS[feature];
  const docId = `${uid}_${dateKeyUTC(nowMs)}`;
  try {
    const db = await getAdminFirestore();
    const snap = await db.collection(COLLECTION).doc(docId).get();
    const used =
      (snap.exists ? (snap.data()?.[feature] as number | undefined) : 0) ?? 0;
    return { allowed: used < limit, remaining: Math.max(0, limit - used), limit, used };
  } catch (err) {
    console.error(`[quota] peek failed for ${feature}`, err);
    return { allowed: true, remaining: limit, limit, used: 0 };
  }
}
