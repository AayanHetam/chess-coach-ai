import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireSession } from "@/lib/auth/session";
import { getAdminFirestore, AdminConfigError } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

const SUBCOLLECTION = "chats";
const MESSAGES = "messages";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing chat id." }, { status: 400 });

  try {
    const db = await getAdminFirestore();
    const ref = db
      .collection("users")
      .doc(guard.session.uid)
      .collection(SUBCOLLECTION)
      .doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }
    const msgsSnap = await ref
      .collection(MESSAGES)
      .orderBy("createdAt", "asc")
      .get();
    const messages = msgsSnap.docs.map((d) => ({ ...d.data(), firestoreId: d.id }));
    return NextResponse.json({
      chat: { ...snap.data(), firestoreId: snap.id },
      messages,
    });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[chats GET id]", err);
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    console.error("[chats GET id] unexpected", err);
    return NextResponse.json({ error: "Failed to load chat." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing chat id." }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Body must be an object." }, { status: 400 });
  }

  // Whitelist editable fields (title, titleSource).
  const { title, titleSource } = body as { title?: string; titleSource?: string };
  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (typeof title === "string") {
    updates.title = title.slice(0, 80);
  }
  if (
    titleSource === "manual" ||
    titleSource === "llm" ||
    titleSource === "pgn" ||
    titleSource === "fallback"
  ) {
    updates.titleSource = titleSource;
  }

  try {
    const db = await getAdminFirestore();
    const ref = db
      .collection("users")
      .doc(guard.session.uid)
      .collection(SUBCOLLECTION)
      .doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }
    await ref.update(updates);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[chats PATCH id]", err);
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    console.error("[chats PATCH id] unexpected", err);
    return NextResponse.json({ error: "Failed to update chat." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing chat id." }, { status: 400 });

  try {
    const db = await getAdminFirestore();
    const ref = db
      .collection("users")
      .doc(guard.session.uid)
      .collection(SUBCOLLECTION)
      .doc(id);
    await db.recursiveDelete(ref);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[chats DELETE id]", err);
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    console.error("[chats DELETE id] unexpected", err);
    return NextResponse.json({ error: "Failed to delete chat." }, { status: 500 });
  }
}
