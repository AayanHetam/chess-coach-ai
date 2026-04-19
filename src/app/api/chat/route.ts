import { NextRequest, NextResponse } from "next/server";
import {
  getAnalysisContext,
  buildCondensedContext,
} from "@/lib/analysisContextCache";
import { validateAIResponse } from "@/lib/aiResponseValidator";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

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
    const { messages, contextId, userMessage, conversationHistory } = body;

    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured. Please set OPENAI_API_KEY in .env.local." },
        { status: 500 }
      );
    }

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

      // Call gpt-4o-mini for speed (follow-ups don't need gpt-4o depth)
      const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: chatMessages,
          temperature: 0.7,
          max_tokens: 1500,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenAI chat API error:", response.status, errorText);
        return NextResponse.json(
          { error: `OpenAI API error: ${response.status}` },
          { status: 502 }
        );
      }

      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content || "I couldn't generate a response.";

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

    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: body.model || "gpt-4o-mini",
        messages,
        temperature: body.temperature ?? 0.7,
        max_tokens: body.max_tokens ?? 1500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      return NextResponse.json(
        { error: `OpenAI API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
