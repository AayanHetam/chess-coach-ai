import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { callLLM, type LLMProvider } from "@/lib/llmProvider";

/**
 * Admin-only provider connectivity check.
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

export async function GET() {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

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
