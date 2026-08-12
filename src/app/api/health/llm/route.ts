import { NextResponse } from "next/server";
import { callLLM, getProviderStatus, LLMError } from "@/lib/llmProvider";
import { cachedProbe } from "@/lib/health/probeCache";

/**
 * LLM health check — pings both Anthropic and OpenAI in parallel with a
 * 1-token probe. Returns which providers are reachable, how fast each
 * responded, and which one callLLM() would pick for live traffic.
 *
 * Use this any time you suspect the hybrid provider isn't routing the way
 * you expect. Hit it from production AND local dev — the two environments
 * have different env vars.
 *
 *   GET /api/health/llm
 */

export const dynamic = "force-dynamic";

async function probe(
  force: "anthropic" | "openai"
): Promise<{
  ok: boolean;
  provider: string;
  model?: string;
  elapsedMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
  status?: number;
}> {
  try {
    const result = await callLLM({
      tier: "fast",
      system: "You are a health probe. Respond with exactly the word 'pong'.",
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 5,
      temperature: 0,
      forceProvider: force,
    });
    return {
      ok: true,
      provider: result.provider,
      model: result.model,
      elapsedMs: result.elapsedMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  } catch (err) {
    const e = err instanceof LLMError ? err : null;
    return {
      ok: false,
      provider: force,
      error: e ? e.detail : err instanceof Error ? err.message : String(err),
      status: e?.status,
    };
  }
}

export async function GET() {
  const status = getProviderStatus();

  // If neither key is even configured, return early so we don't hit any API.
  if (!status.anthropic.keyValid && !status.openai.keyValid) {
    return NextResponse.json(
      {
        ok: false,
        stage: "no_providers_configured",
        status,
        hint: "Set ANTHROPIC_API_KEY (sk-ant-…) or OPENAI_API_KEY (sk-…) in your environment. On Vercel, add them under Settings → Environment Variables and redeploy.",
      },
      { status: 500 }
    );
  }

  // Probe both providers in parallel (only those with valid keys).
  //
  // Wrapped in a short-lived cache because this endpoint is UNAUTHENTICATED and
  // every call bills a real (if tiny) LLM request: anyone who finds the URL
  // could loop it, burn the account, and trip provider rate limits that then
  // affect real users. A cache rather than a secret header, so the external
  // uptime monitor keeps working with no configuration change — it polls on a
  // longer interval than the TTL and therefore still gets a live probe every
  // time. See lib/health/probeCache.ts.
  const [anthropicRes, openaiRes] = await Promise.all([
    status.anthropic.keyValid
      ? cachedProbe("health:llm:anthropic", () => probe("anthropic"))
      : Promise.resolve({
          value: {
            ok: false,
            provider: "anthropic",
            error: "ANTHROPIC_API_KEY not configured or wrong prefix",
          },
          cached: false,
          ageMs: 0,
        }),
    status.openai.keyValid
      ? cachedProbe("health:llm:openai", () => probe("openai"))
      : Promise.resolve({
          value: {
            ok: false,
            provider: "openai",
            error: "OPENAI_API_KEY not configured or wrong prefix",
          },
          cached: false,
          ageMs: 0,
        }),
  ]);
  const anthropic = anthropicRes.value;
  const openai = openaiRes.value;

  // Which provider would live traffic actually hit? Anthropic first if valid
  // and reachable; otherwise OpenAI.
  const livePath = status.anthropic.keyValid && anthropic.ok
    ? "anthropic"
    : openai.ok
      ? "openai"
      : "none";

  const overallOk = anthropic.ok || openai.ok;

  return NextResponse.json(
    {
      ok: overallOk,
      livePath,
      anthropic,
      openai,
      // Surfaced so a human debugging an outage is never shown a stale verdict
      // as though it were live.
      probeCache: {
        anthropic: { cached: anthropicRes.cached, ageMs: anthropicRes.ageMs },
        openai: { cached: openaiRes.cached, ageMs: openaiRes.ageMs },
      },
      keyStatus: status,
      environment: {
        nodeEnv: process.env.NODE_ENV || "unknown",
        vercelEnv: process.env.VERCEL_ENV || "local",
      },
    },
    { status: overallOk ? 200 : 502 }
  );
}
