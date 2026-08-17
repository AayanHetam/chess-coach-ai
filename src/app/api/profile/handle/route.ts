/**
 * Handles — claim one, or check whether it's free.
 *
 *   GET  /api/profile/handle?handle=lazerwizard  → advisory availability
 *   POST /api/profile/handle { handle }          → atomic claim
 *
 * Both are session-gated. Availability is deliberately NOT public: handles are
 * public once claimed, but an unauthenticated availability endpoint is a free
 * oracle for enumerating which ones exist, and the same endpoint is a sign-in
 * identifier. Signed-in users can already see handles, so this leaks nothing
 * new to them.
 */

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { claimHandle, isHandleAvailable } from "@/lib/server/handles";
import { checkHandle } from "@/lib/auth/handle";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  const raw = new URL(request.url).searchParams.get("handle") ?? "";
  const check = checkHandle(raw);
  if (!check.ok) {
    return NextResponse.json({
      available: false,
      problem: check.problem,
      message: check.message,
    });
  }

  const available = await isHandleAvailable(raw, guard.session.uid);
  return NextResponse.json({
    available,
    // Advisory only — the claim transaction is the real gate, and a handle
    // free at this instant can be taken a millisecond later. The UI must
    // render this as a hint, never as a reservation.
    message: available ? undefined : "That handle is taken.",
  });
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

  const raw = (body as { handle?: unknown })?.handle;
  if (typeof raw !== "string") {
    return NextResponse.json(
      { error: "A handle is required." },
      { status: 400 }
    );
  }

  const result = await claimHandle(guard.session.uid, raw);
  switch (result.status) {
    case "ok":
    case "unchanged":
      return NextResponse.json({
        status: result.status,
        handle: result.handle,
      });
    case "taken":
      // 409, not 400: the request was well-formed and simply lost the race.
      return NextResponse.json(
        { status: "taken", error: "That handle is taken." },
        { status: 409 }
      );
    case "invalid":
      return NextResponse.json(
        { status: "invalid", error: result.message },
        { status: 400 }
      );
  }
}
