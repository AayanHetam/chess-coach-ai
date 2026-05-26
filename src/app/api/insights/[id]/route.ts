import { NextResponse } from "next/server";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
import { getInsight } from "@/lib/insights";

export const runtime = "nodejs";

// Public-by-URL: no auth required to read. Anyone with the ID can view.
// viewCount is incremented as a side effect inside getInsight().
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || typeof id !== "string" || id.length > 64) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const insight = await getInsight(id);
    if (!insight) {
      return NextResponse.json({ error: "Insight not found." }, { status: 404 });
    }
    return NextResponse.json(insight);
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[insights GET]", err);
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    console.error("[insights GET] unexpected", err);
    return NextResponse.json(
      { error: "Failed to load insight." },
      { status: 500 }
    );
  }
}
