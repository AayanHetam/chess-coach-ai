import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "./firebaseAdmin";
import { withFirestoreTimeout } from "./withFirestoreTimeout";
import type { PuzzleRushScores } from "@/lib/puzzleRating";

/**
 * Global Puzzle Rush leaderboard — a denormalized collection, deliberately
 * separate from `users/{uid}.progress.rush` (the per-user synced best-score
 * source of truth). Firestore has no cheap way to sort/limit across every
 * user document, so this collection exists purely to make "top N by score"
 * a single `orderBy().limit()`.
 *
 * INDEX INVARIANT — every query in this file must be satisfiable by
 * Firestore's automatic single-field indexes; none may require a manually
 * created composite one. That holds for `where(mode, ">", 0).orderBy(mode)`
 * and for `where(mode, ">", score).count()` because the range filter and the
 * ordering are on the SAME field. Introducing a filter or an ordering on a
 * second field would silently break every read in production with a
 * FAILED_PRECONDITION until someone creates the index by hand. Don't.
 *
 * Default-on: every signed-in Rush player with a real score gets an entry
 * here under their existing public `handle` (already shown to other players
 * elsewhere in the app), written whenever their personal best changes. No
 * separate opt-in flag — a `where(optedIn == true)` filter alongside the
 * ordering is exactly the composite index the invariant above rules out.
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

/**
 * Absurdity bounds, not skill limits. The score is whatever the client says it
 * is — there is no server-side replay of the puzzles — so any signed-in
 * account can POST a number. That is tolerable while the number is one a human
 * could have produced; it stops being tolerable at 100000, and MAX-WINS MAKES
 * IT PERMANENT: once published, nothing in the normal flow can lower it again.
 * These bounds are what keeps an unremovable joke entry off the board.
 *
 * Set well above any real result (Chess.com's 3-minute records sit around 70),
 * so no honest player is ever refused. Survival is far looser because it has
 * no clock at all — only three lives — so a patient player really can grind a
 * long way.
 *
 * They do NOT stop someone claiming a plausible score they did not earn. That
 * needs server-side verification of the solved puzzles, which does not exist
 * here; do not read this as anti-cheat.
 */
const MAX_PLAUSIBLE: Record<RushMode, number> = {
  threeMin: 200,
  fiveMin: 350,
  survivalBest: 1000,
};

/**
 * Per-mode maximum of what is already published and what just arrived.
 *
 * An implausible incoming value is dropped for THAT MODE ONLY rather than
 * failing the whole payload: the same request carries the player's other two
 * scores, and one bad field should not cost them a real result. A dropped mode
 * keeps whatever was already published.
 */
function maxWins(
  existing: Partial<Record<RushMode, unknown>> | undefined,
  incoming: PuzzleRushScores
): Record<RushMode, number> {
  const merged = {} as Record<RushMode, number>;
  for (const mode of RUSH_LEADERBOARD_MODES) {
    const prev = existing?.[mode];
    const claimed = incoming[mode];
    const candidate =
      Number.isInteger(claimed) && claimed >= 0 && claimed <= MAX_PLAUSIBLE[mode]
        ? claimed
        : 0;
    merged[mode] = Math.max(
      typeof prev === "number" && Number.isFinite(prev) ? prev : 0,
      candidate
    );
  }
  return merged;
}

/**
 * Upsert on every progress sync that carries a rush score. Best-effort — the
 * callers (PUT /api/progress, POST /api/leaderboards/puzzle-rush/sync) must
 * not fail the real save if this does.
 *
 * Two invariants live here rather than in the callers, so that EVERY write
 * path gets them and a future third caller cannot reintroduce either bug:
 *
 *  1. MAX-WINS, never last-write-wins. `users/{uid}.progress` is a replica
 *     the client merges before pushing, so PUT /api/progress can legitimately
 *     receive a snapshot older than what is already published — most sharply
 *     from a browser that has not hydrated yet, whose local bests are all 0.
 *     A published best that goes DOWN is the worst failure this feature has:
 *     it is indistinguishable from cheating in the other direction, and the
 *     real score is unrecoverable from here. So a write may only ever raise.
 *
 *  2. NEVER PUBLISH AN ALL-ZERO ROW. Every signed-in account pushes progress,
 *     not just Rush players, so an unguarded upsert enrolls people who have
 *     never played — and since the board is ordered by score, a cohort of
 *     zeros IS the board until enough real scores exist to push it out.
 *     A row is only worth existing once some mode is non-zero.
 *
 * @returns the merged scores actually published, or null when nothing was
 *          worth publishing (all-zero) — callers surface this as `synced`.
 */
export async function upsertPuzzleRushLeaderboardEntry(
  uid: string,
  handle: string,
  rush: PuzzleRushScores
): Promise<Record<RushMode, number> | null> {
  // An all-zero payload is provably a no-op under max-wins: it can only ever
  // lose to what is already stored. Answering before opening a transaction
  // matters because PUT /api/progress calls this on every debounced push from
  // every signed-in account, and most of them have never played Rush — this
  // is the difference between a Firestore read per push and none.
  if (RUSH_LEADERBOARD_MODES.every((mode) => rush[mode] === 0)) return null;

  // A row with no name is a row nobody can read. Callers already skip accounts
  // with no handle at all; this catches the blank-ish ones they cannot see.
  const displayHandle = handle.trim();
  if (!displayHandle) return null;

  const db = await getAdminFirestore();
  const ref = db.collection(COLLECTION).doc(uid);

  // A transaction, not a bare merge-set: max-wins is read-then-write, and two
  // concurrent syncs for one uid (the Rush screen and the debounced progress
  // push overlap by design) would otherwise race and the loser could publish
  // the lower value.
  return withFirestoreTimeout(
    db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);

      // An excluded row stays gone. Deleting it would not be enough: the
      // score still sits in the player's own progress and in their browser,
      // so the next sync would simply publish it again and max-wins would
      // take it back. The exclusion has to live where the write happens.
      if (snap.exists && snap.data()?.excluded === true) return null;

      const merged = maxWins(
        snap.exists ? (snap.data() as Record<string, unknown>) : undefined,
        rush
      );

      // Reachable whenever every claimed score was dropped as implausible: the
      // early return above only knows the claim was non-zero, not that any of
      // it survived. Without this, a doc of pure zeros would be created for
      // exactly the accounts that deserve it least.
      if (RUSH_LEADERBOARD_MODES.every((mode) => merged[mode] === 0)) {
        return null;
      }

      tx.set(
        ref,
        {
          handle: displayHandle,
          ...merged,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return merged;
    }),
    `puzzleRushLeaderboard.upsert(${uid})`,
    WRITE_TIMEOUT_MS
  );
}

export async function getPuzzleRushLeaderboard(
  mode: RushMode,
  limit = 50
): Promise<LeaderboardEntry[]> {
  const db = await getAdminFirestore();
  const snap = await withFirestoreTimeout(
    db
      .collection(COLLECTION)
      // A leaderboard ranks achievements, and 0 is the absence of one. The
      // filter belongs in the QUERY rather than in the loop below because a
      // player who has only ever run 3-minute mode still carries
      // fiveMin: 0 — dropping those after the fact would silently return
      // fewer rows than `limit` and, on the quieter modes, an empty board
      // that looks like a failed read.
      .where(mode, ">", 0)
      .orderBy(mode, "desc")
      .limit(limit)
      .get(),
    `puzzleRushLeaderboard.top(${mode})`,
    READ_TIMEOUT_MS
  );
  const entries: LeaderboardEntry[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const score = data[mode];
    const handle = typeof data.handle === "string" ? data.handle.trim() : "";
    if (handle && typeof score === "number" && score > 0) {
      entries.push({ handle, score });
    }
  }
  return entries;
}

/**
 * 1-based rank for `score` in `mode`, or null when there is no rank to show.
 *
 * Counts how many published scores beat it rather than searching the top N:
 * most players sit outside any window worth rendering, and "you're 214th" is
 * the difference between a board that is about you and a board that is about
 * ten strangers. Ties share the better rank — two players on 30 are both 4th
 * — which is how every sport does it and, unlike an index into the sorted
 * page, does not depend on Firestore's arbitrary tiebreak between equal
 * scores.
 */
export async function getPuzzleRushRank(
  mode: RushMode,
  score: number
): Promise<number | null> {
  if (!Number.isFinite(score) || score <= 0) return null;
  const db = await getAdminFirestore();
  const agg = await withFirestoreTimeout(
    db.collection(COLLECTION).where(mode, ">", score).count().get(),
    `puzzleRushLeaderboard.rank(${mode})`,
    READ_TIMEOUT_MS
  );
  return agg.data().count + 1;
}

/**
 * Every mode's rank at once, for the scores given.
 *
 * The board is read per mode but a player's STANDING is not: they switch modes
 * to compare, and a rank that only exists for whichever mode happened to be
 * selected during the last write disappears the moment they look at another
 * one. Three count aggregations cost a handful of reads, so there is no reason
 * to make the caller choose.
 */
export async function getPuzzleRushRanks(
  scores: PuzzleRushScores
): Promise<Record<RushMode, number | null>> {
  const ranked = await Promise.all(
    RUSH_LEADERBOARD_MODES.map((mode) =>
      getPuzzleRushRank(mode, scores[mode]).then((rank) => [mode, rank] as const)
    )
  );
  return Object.fromEntries(ranked) as Record<RushMode, number | null>;
}

/**
 * Takes an entry off the board for good — a forged score, or one published in
 * error.
 *
 * Zeroes the scores AND marks the row excluded, because those do different
 * jobs: the zeroes hide it from the board (every read filters to score > 0),
 * and the flag stops it coming back. Deleting the document would do neither —
 * the player's own progress still holds the score, so their next sync would
 * republish it.
 *
 * Reversing this means clearing `excluded` by hand, which is deliberate: it
 * should take a decision, not a stray click.
 */
export async function excludePuzzleRushLeaderboardEntry(
  uid: string
): Promise<void> {
  const db = await getAdminFirestore();
  const zeroed = Object.fromEntries(
    RUSH_LEADERBOARD_MODES.map((mode) => [mode, 0])
  );
  await withFirestoreTimeout(
    db
      .collection(COLLECTION)
      .doc(uid)
      .set(
        { ...zeroed, excluded: true, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      ),
    `puzzleRushLeaderboard.exclude(${uid})`,
    WRITE_TIMEOUT_MS
  );
}
