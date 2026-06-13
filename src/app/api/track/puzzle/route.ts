import { NextResponse, after } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getTrackingEnv } from "@/env";
import { recordPuzzleAttempt } from "@/lib/tracking/domain";
import { readAnonIdFromRequest } from "@/lib/tracking/anonId";

/**
 * POST /api/track/puzzle — record a puzzle attempt (TRK-3).
 *
 * Posted by the client when a user finishes (or gives up on) a puzzle. Attaches
 * uid from the session and the anon_id cookie. Inert + 204 when tracking is off.
 * nodejs runtime so the write path matches the rest of tracking.
 */
export const runtime = "nodejs";

const schema = z.object({
  puzzleId: z.string().min(1).max(120),
  source: z.string().max(40).optional(),
  fen: z.string().max(120).optional(),
  themes: z.array(z.string().max(60)).max(40).optional(),
  rating: z.number().int().min(0).max(4000).optional(),
  userMoves: z.array(z.string().max(12)).max(80).optional(),
  correct: z.boolean().optional(),
  solvedWithoutHint: z.boolean().optional(),
  hintsUsed: z.number().int().min(0).max(20).optional(),
  msToSolve: z.number().int().min(0).optional(),
  attemptIndex: z.number().int().min(1).max(1000).optional(),
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
    recordPuzzleAttempt({
      uid: session?.uid ?? null,
      anonId,
      ...parsed.data,
    }),
  );

  return new NextResponse(null, { status: 204 });
}
