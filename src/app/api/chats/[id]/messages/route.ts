import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireSession } from "@/lib/auth/session";
import { getAdminFirestore, AdminConfigError } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

const SUBCOLLECTION = "chats";
const MESSAGES = "messages";
const PREVIEW_LEN = 140;

type RouteContext = { params: Promise<{ id: string }> };

function buildPreview(content: string): string {
  // Strip in-content markers like [PRACTICE:fork:Forks] before previewing.
  const stripped = content
    .replace(/\[(PRACTICE|CONTINUATION|MAIA_CONTINUATION|Correct|correct):[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > PREVIEW_LEN
    ? stripped.slice(0, PREVIEW_LEN - 1) + "…"
    : stripped;
}

export async function POST(request: Request, { params }: RouteContext) {
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
  const { role, content } = body as { role?: string; content?: string };
  if (role !== "user" && role !== "assistant") {
    return NextResponse.json({ error: "role must be 'user' or 'assistant'." }, { status: 400 });
  }
  if (typeof content !== "string" || content.length === 0) {
    return NextResponse.json({ error: "content is required." }, { status: 400 });
  }
  if (content.length > 50000) {
    return NextResponse.json({ error: "content too large." }, { status: 413 });
  }

  try {
    const db = await getAdminFirestore();
    const chatRef = db
      .collection("users")
      .doc(guard.session.uid)
      .collection(SUBCOLLECTION)
      .doc(id);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    const msgRef = await chatRef.collection(MESSAGES).add({
      role,
      content,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Touch parent: bump updatedAt, increment count, update preview from the
    // last assistant message (so list view shows the AI's most recent reply).
    const parentUpdates: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      messageCount: FieldValue.increment(1),
    };
    if (role === "assistant") {
      parentUpdates.preview = buildPreview(content);
    }
    await chatRef.update(parentUpdates);

    return NextResponse.json({ firestoreId: msgRef.id }, { status: 201 });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[chats messages POST]", err);
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    console.error("[chats messages POST] unexpected", err);
    return NextResponse.json({ error: "Failed to save message." }, { status: 500 });
  }
}
