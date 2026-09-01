import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "./firebaseAdmin";
import { withFirestoreTimeout } from "./withFirestoreTimeout";
import type { PuzzleRushScores } from "@/lib/puzzleRating";

/**
 * Global Puzzle Rush leaderboard — a denormalized collection, deliberately
 * separate from `users/{uid}.progress.rush` (the per-user synced best-score
 * source of truth). Firestore has no cheap way to sort/limit across every
 * user document, so this collection exists purely to make "top 50 by score"
 * a single, filter-free `orderBy().limit()` — the one query shape guaranteed
 * to need only an auto-created single-field index, never a manually-created
 * composite one.
 *
 * Default-on: every signed-in Rush player gets an entry here under their
 * existing public `handle` (already shown to other players elsewhere in the
 * app), written whenever their personal best changes. No separate opt-in
 * flag — adding a `where(optedIn == true)` filter to the read query would
 * force a composite index, which is exactly the manual-setup step this
 * design avoids.
 */

const COLLECTION = "puzzleRushLeaderboard";
const WRITE_TIMEOUT_MS = 5_000;
const READ_TIMEOUT_MS = 5_000;

export type RushMode = "threeMin" | "fiveMin" | "survivalBest";
export const RUSH_LEADERBOARD_MODES: RushMode[] = [
  "threeMin",
  "fiveMin",
  "survivalBest",
];

export interface LeaderboardEntry {
  handle: string;
  score: number;
}

/** Upsert on every progress sync that carries a rush score. Best-effort —
 *  the caller (PUT /api/progress) must not fail the real save if this does. */
export async function upsertPuzzleRushLeaderboardEntry(
  uid: string,
  handle: string,
  rush: PuzzleRushScores,
): Promise<void> {
  const db = await getAdminFirestore();
  await withFirestoreTimeout(
    db
      .collection(COLLECTION)
      .doc(uid)
      .set(
        {
          handle,
          threeMin: rush.threeMin,
          fiveMin: rush.fiveMin,
          survivalBest: rush.survivalBest,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
    `puzzleRushLeaderboard.upsert(${uid})`,
    WRITE_TIMEOUT_MS,
  );
}

export async function getPuzzleRushLeaderboard(
  mode: RushMode,
  limit = 50,
): Promise<LeaderboardEntry[]> {
  const db = await getAdminFirestore();
  const snap = await withFirestoreTimeout(
    db.collection(COLLECTION).orderBy(mode, "desc").limit(limit).get(),
    `puzzleRushLeaderboard.top(${mode})`,
    READ_TIMEOUT_MS,
  );
  const entries: LeaderboardEntry[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const score = data[mode];
    // A score of 0 is a real, legitimate entry (everyone starts there) —
    // only skip a doc that is missing the field or malformed.
    if (typeof data.handle === "string" && typeof score === "number") {
      entries.push({ handle: data.handle, score });
    }
  }
  return entries;
}
