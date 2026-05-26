import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
import { createInsight } from "@/lib/insights";
import {
  INSIGHT_MAX_COACH_CONTENT_CHARS,
  INSIGHT_MAX_FEN_CHARS,
  INSIGHT_MAX_PGN_CHARS,
  INSIGHT_MAX_TRANSCRIPT_MESSAGES,
  INSIGHT_MAX_TRANSCRIPT_TOTAL_CHARS,
  type InsightKind,
  type ShareableMessage,
} from "@/types/insights";

export const runtime = "nodejs";

function parseTranscript(raw: unknown): ShareableMessage[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > INSIGHT_MAX_TRANSCRIPT_MESSAGES) return null;
  const out: ShareableMessage[] = [];
  let totalChars = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const m = item as Record<string, unknown>;
    if (m.role !== "user" && m.role !== "assistant") return null;
    if (typeof m.content !== "string") return null;
    totalChars += m.content.length;
    if (totalChars > INSIGHT_MAX_TRANSCRIPT_TOTAL_CHARS) return null;
    out.push({
      role: m.role,
      content: m.content,
      fen: typeof m.fen === "string" ? m.fen : undefined,
    });
  }
  return out;
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
  const kind: InsightKind = b.kind === "transcript" ? "transcript" : "single";

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

  let transcript: ShareableMessage[] | undefined;
  if (kind === "transcript") {
    const parsed = parseTranscript(b.transcript);
    if (!parsed) {
      return NextResponse.json(
        {
          error: `transcript is required when kind=transcript: max ${INSIGHT_MAX_TRANSCRIPT_MESSAGES} messages, ${INSIGHT_MAX_TRANSCRIPT_TOTAL_CHARS} total chars, only user/assistant roles.`,
        },
        { status: 400 }
      );
    }
    transcript = parsed;
  }

  try {
    const id = await createInsight(
      { fen, pgn, coachContent, coachContextId, kind, transcript },
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
