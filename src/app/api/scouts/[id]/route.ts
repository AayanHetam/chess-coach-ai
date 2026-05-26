import { NextResponse } from "next/server";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
import { getScoutSnapshot } from "@/lib/scoutSnapshots";

export const runtime = "nodejs";

// Public-by-URL: no auth required to read. Anyone with the ID can view.
// viewCount is incremented as a side effect inside getScoutSnapshot().
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || typeof id !== "string" || id.length > 64) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const snap = await getScoutSnapshot(id);
    if (!snap) {
      return NextResponse.json(
        { error: "Scout snapshot not found." },
        { status: 404 }
      );
    }
    return NextResponse.json(snap);
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[scouts GET]", err);
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    console.error("[scouts GET] unexpected", err);
    return NextResponse.json(
      { error: "Failed to load scout snapshot." },
      { status: 500 }
    );
  }
}
