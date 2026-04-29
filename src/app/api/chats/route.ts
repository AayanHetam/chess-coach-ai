import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireSession } from "@/lib/auth/session";
import { getAdminFirestore, AdminConfigError } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

const SUBCOLLECTION = "chats";
const MAX_CHATS_PER_USER = 50;

function stripUndefined<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      result[k] = stripUndefined(v);
    }
    return result as T;
  }
  return value;
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
      .orderBy("updatedAt", "desc")
      .limit(MAX_CHATS_PER_USER)
      .get();
    const chats = snap.docs.map((d) => ({ ...d.data(), firestoreId: d.id }));
    return NextResponse.json({ chats });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[chats GET]", err);
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    console.error("[chats GET] unexpected", err);
    return NextResponse.json({ error: "Failed to load chats." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Body must be an object." }, { status: 400 });
  }

  const { title, coachId, gameRef } = body as {
    title?: string;
    coachId?: string;
    gameRef?: Record<string, unknown> | null;
  };

  try {
    const db = await getAdminFirestore();
    const collRef = db
      .collection("users")
      .doc(guard.session.uid)
      .collection(SUBCOLLECTION);

    // Prune oldest beyond cap before adding (LRU by updatedAt).
    const existingSnap = await collRef.orderBy("updatedAt", "desc").get();
    if (existingSnap.size >= MAX_CHATS_PER_USER) {
      const overflow = existingSnap.docs.slice(MAX_CHATS_PER_USER - 1);
      await Promise.all(
        overflow.map((doc) => db.recursiveDelete(doc.ref))
      );
    }

    const doc = await collRef.add(
      stripUndefined({
        title: title ?? "New chat",
        coachId: coachId ?? null,
        gameRef: gameRef ?? null,
        messageCount: 0,
        preview: "",
        titleSource: "fallback",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    );
    return NextResponse.json({ firestoreId: doc.id }, { status: 201 });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[chats POST]", err);
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    console.error("[chats POST] unexpected", err);
    return NextResponse.json({ error: "Failed to create chat." }, { status: 500 });
  }
}
