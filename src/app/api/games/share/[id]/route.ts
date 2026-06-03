// GET /api/games/share/[id] — fetch a public game share.
//
// Public-by-URL: no auth required. Anyone with the ID can view.
// viewCount is incremented as a side effect inside getGameShare().
//
// Mirrors the insight GET pattern in src/app/api/insights/[id]/route.ts.

import { NextResponse } from "next/server";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
import { getGameShare } from "@/lib/gameShares";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || typeof id !== "string" || id.length > 64) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const share = await getGameShare(id);
    if (!share) {
      return NextResponse.json(
        { error: "Game share not found." },
        { status: 404 }
      );
    }
    return NextResponse.json(share);
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[gameShares GET]", err);
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    console.error("[gameShares GET] unexpected", err);
    return NextResponse.json(
      { error: "Failed to load game share." },
      { status: 500 }
    );
  }
}
