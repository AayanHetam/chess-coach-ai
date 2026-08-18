import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { isSameOriginRequest } from "@/lib/auth/sameOriginRequest";
import { callLLM } from "@/lib/llmProvider";

/**
 * Admin-only Anthropic connectivity check. POST is the only provider-calling
 * method; GET is a non-calling 405 response.
 *
 * Authorization is resolved before the provider client is touched so an
 * anonymous or non-admin request can never spend provider tokens. Responses
 * deliberately omit key metadata and upstream error details.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } }
  );
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-site request rejected." },
      { status: 403 }
    );
  }

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
