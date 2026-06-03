// POST /api/games/share — create a public game share.
//
// Auth required: only signed-in users can create shares. The share is
// then public-by-URL via GET /api/games/share/[id] (no auth).
//
// Mirrors the insight creation pattern in src/app/api/insights/route.ts.

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
import { createGameShare } from "@/lib/gameShares";
import {
  GAME_SHARE_MAX_NOTE_CHARS,
  GAME_SHARE_MAX_PGN_CHARS,
  GAME_SHARE_MAX_PLAYER_CHARS,
  GAME_SHARE_MAX_TRANSCRIPT_MESSAGES,
  GAME_SHARE_MAX_TRANSCRIPT_TOTAL_CHARS,
} from "@/types/gameShare";
import type { SavedCoachMessage } from "@/types/game";
import type { GameEval } from "@/types/eval";

export const runtime = "nodejs";

function parseTranscript(raw: unknown): SavedCoachMessage[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > GAME_SHARE_MAX_TRANSCRIPT_MESSAGES) return null;
  const out: SavedCoachMessage[] = [];
  let totalChars = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const m = item as Record<string, unknown>;
    if (m.role !== "user" && m.role !== "coach") return null;
    if (typeof m.content !== "string") return null;
    totalChars += m.content.length;
    if (totalChars > GAME_SHARE_MAX_TRANSCRIPT_TOTAL_CHARS) return null;
    out.push({
      role: m.role,
      content: m.content,
      ply: typeof m.ply === "number" ? m.ply : undefined,
      ts: typeof m.ts === "number" ? m.ts : undefined,
    });
  }
  return out;
}

function clampString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
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
  const pgn = typeof b.pgn === "string" ? b.pgn.trim() : "";

  if (!pgn) {
    return NextResponse.json(
      { error: "pgn is required." },
      { status: 400 }
    );
  }
  if (pgn.length > GAME_SHARE_MAX_PGN_CHARS) {
    return NextResponse.json(
      { error: `pgn must be at most ${GAME_SHARE_MAX_PGN_CHARS} chars.` },
      { status: 400 }
    );
  }

  const note = clampString(b.note, GAME_SHARE_MAX_NOTE_CHARS);
  const white = clampString(b.white, GAME_SHARE_MAX_PLAYER_CHARS);
  const black = clampString(b.black, GAME_SHARE_MAX_PLAYER_CHARS);
  const result = clampString(b.result, 16);
  const date = clampString(b.date, 32);
  const event = clampString(b.event, 200);
  const site = clampString(b.site, 200);
  const timeControl = clampString(b.timeControl, 64);
  const termination = clampString(b.termination, 64);

  let coachTranscript: SavedCoachMessage[] | null = null;
  if (b.coachTranscript !== undefined && b.coachTranscript !== null) {
    const parsed = parseTranscript(b.coachTranscript);
    if (!parsed) {
      return NextResponse.json(
        {
          error: `coachTranscript invalid: max ${GAME_SHARE_MAX_TRANSCRIPT_MESSAGES} messages, ${GAME_SHARE_MAX_TRANSCRIPT_TOTAL_CHARS} total chars, only user/coach roles.`,
        },
        { status: 400 }
      );
    }
    coachTranscript = parsed;
  }

  // evalData passes through as-is if it's an object; we don't deep-validate
  // the GameEval shape here since it's produced by our own client.
  const evalData =
    b.evalData && typeof b.evalData === "object"
      ? (b.evalData as GameEval)
      : null;

  try {
    const id = await createGameShare(
      {
        pgn,
        white,
        black,
        result,
        date,
        event,
        site,
        timeControl,
        termination,
        evalData,
        coachTranscript,
        note,
      },
      guard.session.uid
    );
    return NextResponse.json({ id });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[gameShares POST]", err);
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    console.error("[gameShares POST] unexpected", err);
    return NextResponse.json(
      { error: "Failed to create game share." },
      { status: 500 }
    );
  }
}
