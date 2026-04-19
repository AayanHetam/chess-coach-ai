import { NextRequest, NextResponse } from "next/server";
import {
  getAnalysisContext,
  buildCondensedContext,
} from "@/lib/analysisContextCache";
import { validateAIResponse } from "@/lib/aiResponseValidator";
import { chatSchema, validateRequest } from "@/lib/validation/schemas";
import { callLLM, LLMError, type LLMMessage } from "@/lib/llmProvider";

/**
 * Lightweight chat endpoint for follow-up messages.
 *
 * Two modes:
 * 1. **With contextId** (fast path): Uses cached analysis context from a prior
 *    /api/enhanced-analysis call. Sends a condensed context + conversation history
 *    to gpt-4o-mini for near-instant responses (2-5 seconds).
 *
 * 2. **Without contextId** (fallback): Plain passthrough to OpenAI, same as before.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const parsed = validateRequest(chatSchema, body);
    if (!parsed.success) return parsed.response;
    const { messages, contextId, userMessage, conversationHistory } = parsed.data;

    // API-key presence is validated inside callLLM(); both Anthropic and
    // OpenAI are accepted, with automatic fallback from one to the other.

    // === FAST PATH: Context-cached follow-up ===
    if (contextId && userMessage) {
      const context = getAnalysisContext(contextId);
      if (!context) {
        // Context expired or not found — tell client to fall back to full analysis
        return NextResponse.json(
          { error: "context_expired", message: "Analysis context expired. Re-analyzing." },
          { status: 404 }
        );
      }

      // Build lightweight message array
      const chatMessages: Array<{ role: string; content: string }> = [];

      // System prompt (cached from initial analysis, includes player info + personality)
      chatMessages.push({ role: "system", content: context.systemPrompt });

      // Condensed game context as a system message (instead of 10K tokens of move-by-move)
      chatMessages.push({
        role: "system",
        content: buildCondensedContext(context),
      });

      // The initial deep analysis as the first assistant message
      // This gives the LLM full continuity without re-sending the raw game data
      chatMessages.push({
        role: "assistant",
        content: context.initialAnalysis,
      });

      // Prior conversation turns (excluding the initial analysis which is already above)
      if (conversationHistory && Array.isArray(conversationHistory)) {
        // Skip the first assistant message (it's the initial analysis, already injected above)
        let skippedFirst = false;
        for (const msg of conversationHistory) {
          if (msg.role === "assistant" && !skippedFirst) {
            skippedFirst = true;
            continue;
          }
          if (msg.role && msg.content) {
            chatMessages.push({ role: msg.role, content: msg.content });
          }
        }
      }

      // Current user message
      chatMessages.push({ role: "user", content: userMessage });

      // Extract system messages and user/assistant messages for the unified provider
      const systemText = chatMessages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n\n");
      const nonSystemMessages: LLMMessage[] = chatMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      // Fast tier (Haiku primary, gpt-4o-mini fallback)
      let llmResult;
      try {
        llmResult = await callLLM({
          tier: "fast",
          system: systemText,
          messages: nonSystemMessages,
          temperature: 0.7,
          maxTokens: 1500,
        });
      } catch (err) {
        const e = err instanceof LLMError ? err : new Error(String(err));
        console.error("LLM chat call failed:", e.message);
        return NextResponse.json(
          { error: `LLM API error: ${e.message}` },
          { status: 502 }
        );
      }
      const rawContent = llmResult.content || "I couldn't generate a response.";

      // Light validation against the cached FEN
      const validation = validateAIResponse(rawContent, context.fen);

      return NextResponse.json({
        gameAnalysis: {
          analysis: validation.isValid ? rawContent : validation.correctedResponse,
          position: context.fen,
          validationScore: validation.score,
          cached: false,
          fastPath: true,
        },
      });
    }

    // === FALLBACK: Plain passthrough (no context) ===
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 }
      );
    }

    // Separate system messages from user/assistant messages for the unified provider
    const fallbackSystem = messages
      .filter((m: { role: string }) => m.role === "system")
      .map((m: { content: string }) => m.content)
      .join("\n\n");
    const fallbackMessages: LLMMessage[] = messages
      .filter((m: { role: string }) => m.role === "user" || m.role === "assistant")
      .map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    let fbResult;
    try {
      fbResult = await callLLM({
        tier: "fast",
        system: fallbackSystem || "You are a helpful chess coach.",
        messages:
          fallbackMessages.length > 0
            ? fallbackMessages
            : [{ role: "user", content: "Hello" }],
        temperature: parsed.data.temperature ?? 0.7,
        maxTokens: parsed.data.max_tokens ?? 1500,
      });
    } catch (err) {
      const e = err instanceof LLMError ? err : new Error(String(err));
      console.error("LLM fallback call failed:", e.message);
      return NextResponse.json(
        { error: `LLM API error: ${e.message}` },
        { status: 502 }
      );
    }

    // Return in OpenAI-compatible format so the client doesn't need changes
    return NextResponse.json({
      choices: [
        { message: { role: "assistant", content: fbResult.content || "" } },
      ],
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
