import { NextResponse } from "next/server";

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

  const startedAt = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-20250514",
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
      return NextResponse.json(
        {
          ok: false,
          stage: "anthropic_error",
          status: response.status,
          elapsedMs,
          anthropicResponse: parsed,
          diagnostics,
        },
        { status: 502 }
      );
    }

    const data = JSON.parse(bodyText);
    return NextResponse.json({
      ok: true,
      stage: "live",
      elapsedMs,
      model: data.model,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
      sampleOutput: data.content?.[0]?.text ?? null,
      diagnostics,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        stage: "network_error",
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        diagnostics,
      },
      { status: 502 }
    );
  }
}
