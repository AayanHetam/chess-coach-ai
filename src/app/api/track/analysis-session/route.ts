import { NextResponse, after } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getTrackingEnv } from "@/env";
import { recordAnalysisSession } from "@/lib/tracking/domain";
import { readAnonIdFromRequest } from "@/lib/tracking/anonId";

/**
 * POST /api/track/analysis-session — record an ended game-analysis session (TRK-3).
 *
 * Posted by the client when an analysis session ends — either the user finished
 * ("completed") or navigated away ("abandoned", typically via sendBeacon on
 * pagehide). We record one row per terminal event (started_at supplied by the
 * client, ended_at stamped server-side), so "% abandoned" is a simple query
 * without needing to track live/open sessions. Inert + 204 when tracking is off.
 */
export const runtime = "nodejs";

const schema = z.object({
  status: z.enum(["completed", "abandoned"]),
  startedAt: z.string().max(40).optional(),
  gamePgn: z.string().max(20_000).optional(),
  movesQueried: z.number().int().min(0).max(10_000).optional(),
  chatTurns: z.number().int().min(0).max(10_000).optional(),
  requestId: z.string().max(64).optional(),
});

export async function POST(request: Request) {
  if (!getTrackingEnv().enabled) return new NextResponse(null, { status: 204 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const session = await getSession();
  const anonId = readAnonIdFromRequest(request);

  after(() =>
    recordAnalysisSession({
      uid: session?.uid ?? null,
      anonId,
      ...parsed.data,
    }),
  );

  return new NextResponse(null, { status: 204 });
}
