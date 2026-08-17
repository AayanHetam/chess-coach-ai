import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { callLLM } from "@/lib/llmProvider";

/**
 * Admin-only Anthropic connectivity check.
 *
 * Authorization is resolved before the provider client is touched so an
 * anonymous or non-admin request can never spend provider tokens. Responses
 * deliberately omit key metadata and upstream error details.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  try {
    await callLLM({
      tier: "fast",
      system: "You are a health probe. Respond with exactly the word 'pong'.",
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 5,
      temperature: 0,
      forceProvider: "anthropic",
    });
    return NextResponse.json({ ok: true, provider: "anthropic" });
  } catch {
    return NextResponse.json(
      { ok: false, provider: "anthropic" },
      { status: 502 }
    );
  }
}
