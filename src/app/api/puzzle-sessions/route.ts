import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import {
  getAdminFirestore,
  AdminConfigError,
} from "@/lib/server/firebaseAdmin";

/**
 * Puzzle session history — cross-device store for signed-in users.
 *
 *   GET  /api/puzzle-sessions  → { sessions } (newest first, capped)
 *   POST /api/puzzle-sessions  → save one closed session (idempotent by id)
 *
 * Backed by the user's own Firestore subcollection
 * `users/{uid}/puzzleSessions`. Anonymous users get a 401 and stay on the
 * client-side localStorage store (the client treats this as best-effort).
 */

export const runtime = "nodejs";

const SUBCOLLECTION = "puzzleSessions";
const MAX_SESSIONS = 50;

const puzzleContextSchema = z.object({
  id: z.string().min(1).max(64),
  fen: z.string().min(8).max(120),
  solution: z.array(z.string().min(2).max(8)).min(1).max(40),
  rating: z.number().int().min(0).max(4000).optional(),
  themes: z.array(z.string().min(1).max(60)).max(40).default([]),
});

const resultSchema = z.object({
  id: z.string().min(1).max(64),
  ratingBefore: z.number().int().min(0).max(4000),
  ratingAfter: z.number().int().min(0).max(4000),
  solved: z.boolean(),
  theme: z.string().min(1).max(60),
  timeMs: z.number().int().min(0),
  puzzle: puzzleContextSchema,
});

const sessionSchema = z.object({
  id: z.string().min(3).max(80),
  startedAt: z.number().int().min(0),
  endedAt: z.number().int().min(0),
  endReason: z.enum(["finished", "idle", "closed"]),
  ratingStart: z.number().int().min(0).max(4000),
  ratingEnd: z.number().int().min(0).max(4000),
  results: z.array(resultSchema).min(1).max(300),
});

export async function POST(request: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid session." },
      { status: 400 },
    );
  }

  try {
    const db = await getAdminFirestore();
    // Doc id == client session id → reposting the same session (Finish then
    // tab-close) overwrites rather than duplicating.
    await db
      .collection("users")
      .doc(guard.session.uid)
      .collection(SUBCOLLECTION)
      .doc(parsed.data.id)
      .set({ ...parsed.data, savedAt: Date.now() });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[puzzle-sessions]", err);
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    console.error("[puzzle-sessions] write failed", err);
    return NextResponse.json({ error: "Save failed." }, { status: 500 });
  }
}

export async function GET() {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  try {
    const db = await getAdminFirestore();
    const snap = await db
      .collection("users")
      .doc(guard.session.uid)
      .collection(SUBCOLLECTION)
      .orderBy("startedAt", "desc")
      .limit(MAX_SESSIONS)
      .get();
    const sessions = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id,
        startedAt: data.startedAt,
        endedAt: data.endedAt,
        endReason: data.endReason,
        ratingStart: data.ratingStart,
        ratingEnd: data.ratingEnd,
        results: data.results ?? [],
      };
    });
    return NextResponse.json({ sessions });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[puzzle-sessions]", err);
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    console.error("[puzzle-sessions] read failed", err);
    return NextResponse.json({ error: "Load failed." }, { status: 500 });
  }
}
