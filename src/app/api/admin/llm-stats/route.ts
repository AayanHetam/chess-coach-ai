import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getLLMStats } from "@/lib/llmStatsAggregator";

export const runtime = "nodejs";

/**
 * GET /api/admin/llm-stats
 *
 * Returns a snapshot of the in-memory LLM token + cache aggregator. Admin-
 * only because raw token counts hint at conversation volume across the
 * full user base, which the user-facing surface doesn't otherwise expose.
 *
 * The data is process-scoped — cold starts and Vercel function instance
 * cycling reset it. The `startedAt` field surfaces that explicitly so a
 * dashboard can show "since 14:32 on this instance" instead of pretending
 * to be a long-running rollup.
 *
 * cacheHitRate: cacheReadTokens / (cacheReadTokens + cacheCreationTokens)
 * for Anthropic only. Returns null until at least one cache-eligible call
 * has been served.
 */
export async function GET() {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  const snapshot = getLLMStats();
  return NextResponse.json({
    snapshot,
    notes: {
      scope: "process-local — resets on Vercel cold start",
      generatedAt: new Date().toISOString(),
    },
  });
}
