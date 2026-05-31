import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getLLMStats, resetLLMStats } from "@/lib/llmStatsAggregator";

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

/**
 * POST /api/admin/llm-stats
 *
 * Wipes the in-memory aggregator so a clean measurement can start. Useful
 * before a credit-application screenshot or a load test — gives a known
 * t=0 instead of "since last cold start, which could be hours."
 *
 * Process-scoped like the GET. If multiple Vercel function instances are
 * warm, only the instance that serves this POST is cleared; others keep
 * their counts. At current MAU this isn't a problem; if it ever is, the
 * fix is to back the aggregator with an external store (mentioned in the
 * file header).
 */
export async function POST() {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  resetLLMStats();
  return NextResponse.json({
    ok: true,
    notes: {
      scope: "process-local — only this Vercel instance's counters were reset",
      resetAt: new Date().toISOString(),
    },
  });
}
