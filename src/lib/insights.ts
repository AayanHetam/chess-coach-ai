// ─────────────────────────────────────────────────────────────────────────────
// Server-side helpers for the `insights` Firestore collection.
//
// Top-level collection (not nested under a user) because insights are public-
// by-URL: anyone with the ID can view, the document tracks the sharer only
// for analytics. Reads increment viewCount as a side effect.
//
// Use only from server-side code (route handlers, never client components).
// ─────────────────────────────────────────────────────────────────────────────

import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/server/firebaseAdmin";
import type { InsightCreateRequest, InsightRecord } from "@/types/insights";

const COLLECTION = "insights";

export async function createInsight(
  data: InsightCreateRequest,
  sharerUid: string | null
): Promise<string> {
  const db = await getAdminFirestore();
  const ref = db.collection(COLLECTION).doc();
  await ref.set({
    fen: data.fen,
    pgn: data.pgn ?? null,
    coachContent: data.coachContent,
    coachContextId: data.coachContextId ?? null,
    sharerUid,
    createdAt: FieldValue.serverTimestamp(),
    viewCount: 0,
  });
  return ref.id;
}

export async function getInsight(id: string): Promise<InsightRecord | null> {
  const db = await getAdminFirestore();
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const raw = snap.data() ?? {};
  // Fire-and-forget viewCount increment — don't block the read on the write.
  ref.update({ viewCount: FieldValue.increment(1) }).catch(err => {
    // Log but don't propagate — increment failure shouldn't fail the read.
    console.error("[insights] viewCount increment failed for", id, err);
  });
  const createdAtMs =
    raw.createdAt && typeof raw.createdAt.toMillis === "function"
      ? raw.createdAt.toMillis()
      : Date.now();
  return {
    id,
    fen: String(raw.fen ?? ""),
    pgn: raw.pgn ?? null,
    coachContent: String(raw.coachContent ?? ""),
    coachContextId: raw.coachContextId ?? null,
    sharerUid: raw.sharerUid ?? null,
    createdAt: createdAtMs,
    viewCount: typeof raw.viewCount === "number" ? raw.viewCount : 0,
  };
}
