import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  queryPuzzleFeed,
  getThemeCatalogue,
  getCorpusSummary,
} from "@/lib/puzzle-feed/loadPuzzles";
import { logger, logErrorToSentry, extractRequestId } from "@/lib/logging";

/**
 * Static-CSV-backed puzzle feed. No Neo4j dependency; works in any deploy
 * once `outputFileTracingIncludes` ships the CSV to the serverless function
 * (configured in next.config.ts).
 *
 * Used by /preview/puzzles to keep a rotating queue of puzzles. The
 * Neo4j-backed /api/chess-puzzles-dataset is preferred when configured;
 * this feed is the "just works in dev + fallback" path.
 *
 * POST  /api/puzzle-feed              — query puzzles with filters
 * GET   /api/puzzle-feed?command=themes — list available themes + counts
 * GET   /api/puzzle-feed?command=stats  — corpus summary
 */

const log = logger.child({ module: "puzzle-feed" });

const queryBodySchema = z.object({
  themes: z.array(z.string().min(1).max(48)).max(20).optional(),
  ratingMin: z.number().int().min(400).max(3000).optional(),
  ratingMax: z.number().int().min(400).max(3000).optional(),
  excludeIds: z.array(z.string().min(1).max(64)).max(200).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  randomize: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const requestId = extractRequestId(request.headers);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = queryBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const result = await queryPuzzleFeed(parsed.data);
    return NextResponse.json({
      puzzles: result.puzzles,
      totalAvailable: result.totalAvailable,
      source: "static-csv",
    });
  } catch (err) {
    log.error("puzzle-feed query failed", {
      requestId,
      message: err instanceof Error ? err.message : String(err),
    });
    logErrorToSentry(err, { route: "/api/puzzle-feed", phase: "query", requestId });
    return NextResponse.json(
      {
        error: "puzzle-feed unavailable",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const command = searchParams.get("command") || "stats";
  try {
    if (command === "themes") {
      const themes = await getThemeCatalogue();
      return NextResponse.json({
        themes,
        count: themes.length,
        source: "static-csv",
      });
    }
    if (command === "stats") {
      const summary = await getCorpusSummary();
      return NextResponse.json({ ...summary, source: "static-csv" });
    }
    return NextResponse.json(
      { error: `Unknown command: ${command}` },
      { status: 400 },
    );
  } catch (err) {
    log.error("puzzle-feed GET failed", {
      command,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error: "puzzle-feed unavailable",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }
}
