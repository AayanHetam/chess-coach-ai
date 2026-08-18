import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { isSameOriginRequest } from "@/lib/auth/sameOriginRequest";
import { callLLM, type LLMProvider } from "@/lib/llmProvider";

/**
 * Admin-only provider connectivity check. POST is the only provider-calling
 * method; GET is a non-calling 405 response.
 *
 * Authorization happens before either probe starts. The response reports only
 * reachability and never returns key metadata, environment configuration,
 * account details, token usage, model names, or upstream error bodies.
 */
export const dynamic = "force-dynamic";

async function probe(provider: LLMProvider): Promise<{ ok: boolean }> {
  try {
    await callLLM({
      tier: "fast",
      system: "You are a health probe. Respond with exactly the word 'pong'.",
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 5,
      temperature: 0,
      forceProvider: provider,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

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

  const [anthropic, openai] = await Promise.all([
    probe("anthropic"),
    probe("openai"),
  ]);
  const ok = anthropic.ok || openai.ok;

  return NextResponse.json(
    { ok, providers: { anthropic, openai } },
    { status: ok ? 200 : 502 }
  );
}
