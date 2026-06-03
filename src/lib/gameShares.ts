// ─────────────────────────────────────────────────────────────────────────────
// Server-side helpers for the `gameShares` Firestore collection.
//
// Top-level collection (not nested under a user) because game shares are
// public-by-URL: anyone with the ID can view, the document tracks the sharer
// only for analytics. Reads increment viewCount as a side effect.
//
// Pattern mirrors src/lib/insights.ts — same public-by-URL model, same
// fire-and-forget viewCount increment.
//
// Use only from server-side code (route handlers, never client components).
// ─────────────────────────────────────────────────────────────────────────────

import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/server/firebaseAdmin";
import type {
  GameShareCreateRequest,
  GameShareRecord,
} from "@/types/gameShare";
import type { SavedCoachMessage } from "@/types/game";
import type { GameEval } from "@/types/eval";

const COLLECTION = "gameShares";

function sanitizeCoachTranscript(
  raw: unknown
): SavedCoachMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const out: SavedCoachMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    if (m.role !== "user" && m.role !== "coach") continue;
    if (typeof m.content !== "string") continue;
    out.push({
      role: m.role,
      content: m.content,
      ply: typeof m.ply === "number" ? m.ply : undefined,
      ts: typeof m.ts === "number" ? m.ts : undefined,
    });
  }
  return out.length > 0 ? out : null;
}

export async function createGameShare(
  data: GameShareCreateRequest,
  sharerUid: string | null
): Promise<string> {
  const db = await getAdminFirestore();
  const ref = db.collection(COLLECTION).doc();
  await ref.set({
    pgn: data.pgn,
    white: data.white ?? null,
    black: data.black ?? null,
    result: data.result ?? null,
    date: data.date ?? null,
    event: data.event ?? null,
    site: data.site ?? null,
    timeControl: data.timeControl ?? null,
    termination: data.termination ?? null,
    evalData: data.evalData ?? null,
    coachTranscript: data.coachTranscript ?? null,
    note: data.note ?? null,
    sharerUid,
    createdAt: FieldValue.serverTimestamp(),
    viewCount: 0,
  });
  return ref.id;
}

export async function getGameShare(
  id: string
): Promise<GameShareRecord | null> {
  const db = await getAdminFirestore();
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const raw = snap.data() ?? {};
  // Fire-and-forget viewCount increment — don't block the read on the write.
  ref.update({ viewCount: FieldValue.increment(1) }).catch((err) => {
    console.error("[gameShares] viewCount increment failed for", id, err);
  });
  const createdAtMs =
    raw.createdAt && typeof raw.createdAt.toMillis === "function"
      ? raw.createdAt.toMillis()
      : Date.now();
  return {
    id,
    pgn: String(raw.pgn ?? ""),
    white: raw.white ?? null,
    black: raw.black ?? null,
    result: raw.result ?? null,
    date: raw.date ?? null,
    event: raw.event ?? null,
    site: raw.site ?? null,
    timeControl: raw.timeControl ?? null,
    termination: raw.termination ?? null,
    evalData: (raw.evalData ?? null) as GameEval | null,
    coachTranscript: sanitizeCoachTranscript(raw.coachTranscript),
    note: raw.note ?? null,
    sharerUid: raw.sharerUid ?? null,
    createdAt: createdAtMs,
    viewCount: typeof raw.viewCount === "number" ? raw.viewCount : 0,
  };
}
