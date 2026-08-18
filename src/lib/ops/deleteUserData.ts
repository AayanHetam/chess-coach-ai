/**
 * Account deletion — the tooling behind the privacy promise.
 *
 * `/privacy` says: "Email chessmastiprivacy@gmail.com and we'll delete your
 * account and saved games within seven days." That promise was satisfiable
 * only by hand, from memory, against two different databases — so the real
 * risk was never refusing to delete, it was deleting INCOMPLETELY and
 * believing the job was done.
 *
 * This module therefore does two things in a deliberate order:
 *
 *   1. `planUserDeletion` — READ ONLY. Enumerates every surface and counts
 *      what is there. Nothing is destroyed. This is what you run first.
 *   2. `executeUserDeletion` — performs it, and reports per-surface counts.
 *
 * `UNTOUCHED_SURFACES` is exported and printed by the CLI on purpose. A
 * deletion tool that quietly covers 90% of the data is worse than no tool at
 * all, because it converts "I should check" into "the script handled it".
 * Anything this does not delete is named out loud, every run.
 *
 * NOTE ON pg_cron: the Supabase retention job satisfies the OTHER privacy
 * sentence — "tracking data deleted automatically after at most one year". It
 * runs inside Supabase Postgres and cannot reach Firestore, where accounts and
 * saved games live. The two promises need two mechanisms; this is the second.
 */
import { getAdminFirestore } from "@/lib/server/firebaseAdmin";
import { purgeUserData } from "@/lib/tracking/purge";

/** `users/{uid}/<name>` subcollections, and any nested collection to recurse. */
const USER_SUBCOLLECTIONS: Array<{ name: string; nested?: string[] }> = [
  { name: "games" },
  { name: "chats", nested: ["messages"] },
  { name: "puzzleSessions" },
];

/** Top-level collections carrying a `sharerUid` back-reference. */
const SHARED_ARTIFACT_COLLECTIONS = ["gameShares", "scouts", "insights"];

/**
 * Data this tool does NOT remove. Printed on every run — see the module note.
 * If you add a new store keyed by uid, add it here or above, not neither.
 */
export const UNTOUCHED_SURFACES = [
  "Firebase Auth identity (if any) — Firestore `users/{uid}` is the account doc this app reads; a separate Auth record is not deleted here.",
  "`cmip_applications` — intern applications, keyed by EMAIL not uid. Delete by hand if the person applied.",
  "`intern_allowlist` / `intern_flags` (Supabase) — intern-programme rows, keyed by email.",
  "`anon_id`-only tracking rows — pre-signin activity is not linkable to the uid, so it cannot be targeted; it ages out via the one-year retention job instead.",
  "Vercel/CDN logs and any third-party analytics — retention is governed by their own policies.",
];

export interface SurfaceCount {
  surface: string;
  count: number;
}

export interface DeletionPlan {
  uid: string;
  email: string | null;
  accountExists: boolean;
  surfaces: SurfaceCount[];
  totalDocs: number;
}

export interface DeletionResult extends DeletionPlan {
  deleted: SurfaceCount[];
  supabase: Awaited<ReturnType<typeof purgeUserData>> | null;
  errors: string[];
}

/** Resolve an email to a uid using the same field the auth code writes. */
export async function findUidByEmail(email: string): Promise<string | null> {
  const db = await getAdminFirestore();
  const snap = await db
    .collection("users")
    .where("email", "==", email.toLowerCase().trim())
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}

/**
 * Count everything that would be deleted. READ ONLY — safe to run against
 * production, and the thing to run before `--confirm`.
 */
export async function planUserDeletion(uid: string): Promise<DeletionPlan> {
  const db = await getAdminFirestore();
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const surfaces: SurfaceCount[] = [];

  surfaces.push({ surface: "users/{uid}", count: userSnap.exists ? 1 : 0 });

  for (const sub of USER_SUBCOLLECTIONS) {
    const docs = await userRef.collection(sub.name).get();
    surfaces.push({ surface: `users/{uid}/${sub.name}`, count: docs.size });
    for (const nested of sub.nested ?? []) {
      let n = 0;
      for (const d of docs.docs) {
        n += (await d.ref.collection(nested).get()).size;
      }
      surfaces.push({
        surface: `users/{uid}/${sub.name}/*/${nested}`,
        count: n,
      });
    }
  }

  for (const coll of SHARED_ARTIFACT_COLLECTIONS) {
    const snap = await db.collection(coll).where("sharerUid", "==", uid).get();
    surfaces.push({ surface: `${coll} (sharerUid)`, count: snap.size });
  }

  const email =
    (userSnap.exists ? (userSnap.data()?.email as string | undefined) : null) ??
    null;

  return {
    uid,
    email,
    accountExists: userSnap.exists,
    surfaces,
    totalDocs: surfaces.reduce((a, s) => a + s.count, 0),
  };
}

/**
 * Perform the deletion. Order matters: shared artifacts and subcollections
 * first, the account doc LAST — so an interrupted run leaves an account that
 * still resolves rather than orphaned data pointing at a uid that is gone.
 */
export async function executeUserDeletion(
  uid: string
): Promise<DeletionResult> {
  const plan = await planUserDeletion(uid);
  const db = await getAdminFirestore();
  const userRef = db.collection("users").doc(uid);
  const deleted: SurfaceCount[] = [];
  const errors: string[] = [];

  const delDocs = async (
    label: string,
    refs: FirebaseFirestore.DocumentReference[]
  ) => {
    let n = 0;
    for (const ref of refs) {
      try {
        await ref.delete();
        n++;
      } catch (e) {
        errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    deleted.push({ surface: label, count: n });
  };

  for (const coll of SHARED_ARTIFACT_COLLECTIONS) {
    const snap = await db.collection(coll).where("sharerUid", "==", uid).get();
    await delDocs(
      `${coll} (sharerUid)`,
      snap.docs.map((d) => d.ref)
    );
  }

  for (const sub of USER_SUBCOLLECTIONS) {
    const docs = await userRef.collection(sub.name).get();
    for (const nested of sub.nested ?? []) {
      const nestedRefs: FirebaseFirestore.DocumentReference[] = [];
      for (const d of docs.docs) {
        const ns = await d.ref.collection(nested).get();
        nestedRefs.push(...ns.docs.map((x) => x.ref));
      }
      await delDocs(`users/{uid}/${sub.name}/*/${nested}`, nestedRefs);
    }
    await delDocs(
      `users/{uid}/${sub.name}`,
      docs.docs.map((d) => d.ref)
    );
  }

  let supabase: DeletionResult["supabase"] = null;
  try {
    supabase = await purgeUserData(uid);
  } catch (e) {
    errors.push(
      `supabase purge: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  // Account doc last — see the note above.
  await delDocs("users/{uid}", plan.accountExists ? [userRef] : []);

  return { ...plan, deleted, supabase, errors };
}
