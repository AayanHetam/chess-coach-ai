import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireSession } from "@/lib/auth/session";
import { getAdminFirestore, AdminConfigError } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

const SUBCOLLECTION = "games";

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
      .orderBy("createdAt", "desc")
      .get();
    const games = snap.docs.map((d) => ({ ...d.data(), firestoreId: d.id }));
    return NextResponse.json({ games });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[games GET]", err);
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    console.error("[games GET] unexpected", err);
    return NextResponse.json({ error: "Failed to load games." }, { status: 500 });
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

  try {
    const db = await getAdminFirestore();
    const ref = db
      .collection("users")
      .doc(guard.session.uid)
      .collection(SUBCOLLECTION);
    const doc = await ref.add(
      stripUndefined({
        ...(body as Record<string, unknown>),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    );
    return NextResponse.json({ firestoreId: doc.id }, { status: 201 });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[games POST]", err);
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    console.error("[games POST] unexpected", err);
    return NextResponse.json({ error: "Failed to save game." }, { status: 500 });
  }
}
