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
import type {
  InsightCreateRequest,
  InsightRecord,
  ShareableMessage,
} from "@/types/insights";

const COLLECTION = "insights";

function sanitizeTranscript(raw: unknown): ShareableMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ShareableMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (typeof m.content !== "string") continue;
    out.push({
      role: m.role,
      content: m.content,
      fen: typeof m.fen === "string" ? m.fen : undefined,
    });
  }
  return out.length > 0 ? out : null;
}

export async function createInsight(
  data: InsightCreateRequest,
  sharerUid: string | null
): Promise<string> {
  const db = await getAdminFirestore();
  const ref = db.collection(COLLECTION).doc();
  const kind = data.kind === "transcript" ? "transcript" : "single";
  await ref.set({
    fen: data.fen,
    pgn: data.pgn ?? null,
    coachContent: data.coachContent,
    coachContextId: data.coachContextId ?? null,
    kind,
    transcript: kind === "transcript" ? data.transcript ?? null : null,
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
  const kind = raw.kind === "transcript" ? "transcript" : "single";
  return {
    id,
    fen: String(raw.fen ?? ""),
    pgn: raw.pgn ?? null,
    coachContent: String(raw.coachContent ?? ""),
    coachContextId: raw.coachContextId ?? null,
    kind,
    transcript: kind === "transcript" ? sanitizeTranscript(raw.transcript) : null,
    sharerUid: raw.sharerUid ?? null,
    createdAt: createdAtMs,
    viewCount: typeof raw.viewCount === "number" ? raw.viewCount : 0,
  };
}
