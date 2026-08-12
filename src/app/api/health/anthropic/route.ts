import { NextResponse } from "next/server";
import { cachedProbe } from "@/lib/health/probeCache";

/**
 * Anthropic health check / connectivity diagnostic.
 *
 * Hits Claude Haiku with a 1-token probe to confirm:
 *   - ANTHROPIC_API_KEY is set in this environment
 *   - The key is syntactically valid (starts with "sk-ant-")
 *   - The key successfully authenticates against api.anthropic.com
 *   - The model responds (i.e. account has quota)
 *
 * Use this to sanity-check production vs dev. If this returns ok=true but
 * your Anthropic Console shows no usage, something else in the code path
 * is intercepting the call.
 *
 * GET /api/health/anthropic → returns diagnostic JSON.
 */

export const dynamic = "force-dynamic";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL =
  process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";

/**
 * The billed half of this endpoint, split out so it can be cached.
 *
 * Returns the probe verdict only — `diagnostics` is env-derived, free, and
 * per-request, so it is merged in at response time rather than frozen into the
 * cache alongside a result that may be a minute old.
 */
async function probeAnthropic(): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const startedAt = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY as string,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const elapsedMs = Date.now() - startedAt;
    const bodyText = await response.text().catch(() => "");

    if (!response.ok) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        parsed = bodyText.slice(0, 200);
      }
      return {
        status: 502,
        body: {
          ok: false,
          stage: "anthropic_error",
          status: response.status,
          elapsedMs,
          anthropicResponse: parsed,
        },
      };
    }

    const data = JSON.parse(bodyText);
    return {
      status: 200,
      body: {
        ok: true,
        stage: "live",
        elapsedMs,
        model: data.model,
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
        sampleOutput: data.content?.[0]?.text ?? null,
      },
    };
  } catch (error) {
    return {
      status: 502,
      body: {
        ok: false,
        stage: "network_error",
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function GET() {
  const diagnostics: Record<string, unknown> = {
    keyConfigured: !!ANTHROPIC_API_KEY,
    keyLength: ANTHROPIC_API_KEY?.length ?? 0,
    keyPrefix: ANTHROPIC_API_KEY
      ? `${ANTHROPIC_API_KEY.slice(0, 10)}…${ANTHROPIC_API_KEY.slice(-4)}`
      : null,
    keyPrefixValid: !!ANTHROPIC_API_KEY?.startsWith("sk-ant-"),
    baseUrl: ANTHROPIC_BASE_URL,
    environment: process.env.NODE_ENV || "unknown",
    vercelEnv: process.env.VERCEL_ENV || "local",
  };

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { ok: false, stage: "no_key", diagnostics },
      { status: 500 }
    );
  }

  // Catch the obvious "ssk-ant-" typo explicitly before we even call Anthropic.
  if (!ANTHROPIC_API_KEY.startsWith("sk-ant-")) {
    return NextResponse.json(
      {
        ok: false,
        stage: "invalid_key_prefix",
        error: `Key must start with "sk-ant-" — got "${ANTHROPIC_API_KEY.slice(0, 10)}…"`,
        diagnostics,
      },
      { status: 500 }
    );
  }

  // Cached because this endpoint is UNAUTHENTICATED and every call bills a
  // real Anthropic request — anyone who finds the URL could loop it. A cache
  // rather than a secret header keeps the external uptime monitor working with
  // no configuration change. See lib/health/probeCache.ts.
  const probed = await cachedProbe("health:anthropic", probeAnthropic);

  return NextResponse.json(
    {
      ...probed.value.body,
      // So a human debugging an outage is never shown a stale verdict as live.
      probeCache: { cached: probed.cached, ageMs: probed.ageMs },
      diagnostics,
    },
    { status: probed.value.status }
  );
}
