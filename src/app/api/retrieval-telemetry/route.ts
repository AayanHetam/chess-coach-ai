import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logging";

/**
 * Retrieval telemetry — click + solve events for concept-first reinforcements.
 *
 * Server-side retrieval events (the query itself) are emitted by
 * conceptRetrieval.getReinforcements. This endpoint captures the downstream
 * user-action signals needed for the A3 pilot: did the student click a
 * reinforcement, and did they solve the next same-concept probe?
 *
 * MVP: structured log only. A future writer can fan out to Firestore or a
 * dedicated analytics sink; the shape is stable so downstream consumers do
 * not need to change when that swap happens.
 */
const log = logger.child({ module: "retrieval-telemetry" });

const schema = z.object({
  anchorFen: z.string().min(10),
  detectedConcepts: z.array(z.string()).default([]),
  puzzleId: z.string().optional(),
  clickedIndex: z.number().int().min(0).optional(),
  event: z.enum(["click", "solve", "skip"]),
  solvedNext: z.boolean().optional(),
  userId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid telemetry payload", details: parsed.error.issues },
        { status: 400 }
      );
    }
    log.info("retrieval_user_event", parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Telemetry failed", message: error.message },
      { status: 500 }
    );
  }
}
