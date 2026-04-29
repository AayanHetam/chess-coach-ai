import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireSession } from "@/lib/auth/session";
import { getAdminFirestore, AdminConfigError } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

const SUBCOLLECTION = "games";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing game id." }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Body must be an object." }, { status: 400 });
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
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }
    await ref.update({
      ...(body as Record<string, unknown>),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[games PATCH]", err);
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    console.error("[games PATCH] unexpected", err);
    return NextResponse.json({ error: "Failed to update game." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing game id." }, { status: 400 });

  try {
    const db = await getAdminFirestore();
    await db
      .collection("users")
      .doc(guard.session.uid)
      .collection(SUBCOLLECTION)
      .doc(id)
      .delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[games DELETE]", err);
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    console.error("[games DELETE] unexpected", err);
    return NextResponse.json({ error: "Failed to delete game." }, { status: 500 });
  }
}
