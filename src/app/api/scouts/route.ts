import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
import { createScoutSnapshot } from "@/lib/scoutSnapshots";
import { SCOUT_SNAPSHOT_MAX_USERNAME_CHARS } from "@/types/scoutSnapshot";

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
  const username = typeof b.username === "string" ? b.username.trim() : "";
  const platformRaw = typeof b.platform === "string" ? b.platform : "";
  const platform: "chess.com" | "lichess" | null =
    platformRaw === "chess.com" || platformRaw === "lichess" ? platformRaw : null;
  const months = typeof b.months === "number" ? b.months : 12;
  const yourUsername =
    typeof b.yourUsername === "string" ? b.yourUsername : null;

  if (!username || username.length > SCOUT_SNAPSHOT_MAX_USERNAME_CHARS) {
    return NextResponse.json({ error: "Invalid username." }, { status: 400 });
  }
  if (!platform) {
    return NextResponse.json({ error: "Invalid platform." }, { status: 400 });
  }
  if (!b.scoutResult || !b.analytics || !b.tree) {
    return NextResponse.json(
      { error: "scoutResult, analytics, and tree are required." },
      { status: 400 }
    );
  }

  try {
    const id = await createScoutSnapshot(
      {
        username,
        platform,
        months,
        yourUsername,
        // Trust caller's shape — server-side trimming handles oversized payloads
        // before write; misshapen data would just fail at read time, which is
        // a degraded but recoverable state.
        scoutResult: b.scoutResult as never,
        analytics: b.analytics as never,
        tree: b.tree as never,
        collisions: (b.collisions as never) ?? null,
      },
      guard.session.uid
    );
    return NextResponse.json({ id });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[scouts POST]", err);
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    console.error("[scouts POST] unexpected", err);
    return NextResponse.json(
      { error: "Failed to create scout snapshot." },
      { status: 500 }
    );
  }
}
