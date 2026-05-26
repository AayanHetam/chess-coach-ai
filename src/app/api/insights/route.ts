import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
import { createInsight } from "@/lib/insights";
import {
  INSIGHT_MAX_COACH_CONTENT_CHARS,
  INSIGHT_MAX_FEN_CHARS,
  INSIGHT_MAX_PGN_CHARS,
} from "@/types/insights";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be an object." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const fen = typeof b.fen === "string" ? b.fen.trim() : "";
  const coachContent =
    typeof b.coachContent === "string" ? b.coachContent : "";
  const pgn = typeof b.pgn === "string" ? b.pgn : null;
  const coachContextId =
    typeof b.coachContextId === "string" ? b.coachContextId : null;

  if (!fen || fen.length > INSIGHT_MAX_FEN_CHARS) {
    return NextResponse.json(
      { error: "fen is required and must be at most 200 chars." },
      { status: 400 }
    );
  }
  if (!coachContent || coachContent.length > INSIGHT_MAX_COACH_CONTENT_CHARS) {
    return NextResponse.json(
      {
        error: `coachContent is required and must be at most ${INSIGHT_MAX_COACH_CONTENT_CHARS} chars.`,
      },
      { status: 400 }
    );
  }
  if (pgn && pgn.length > INSIGHT_MAX_PGN_CHARS) {
    return NextResponse.json(
      { error: `pgn must be at most ${INSIGHT_MAX_PGN_CHARS} chars.` },
      { status: 400 }
    );
  }

  try {
    const id = await createInsight(
      { fen, pgn, coachContent, coachContextId },
      guard.session.uid
    );
    return NextResponse.json({ id });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[insights POST]", err);
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    console.error("[insights POST] unexpected", err);
    return NextResponse.json(
      { error: "Failed to create insight." },
      { status: 500 }
    );
  }
}
