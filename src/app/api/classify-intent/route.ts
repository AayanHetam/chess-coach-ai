import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  callLLM,
  PUBLIC_LLM_ERROR,
  getProviderStatus,
  toSafeLLMError,
} from "@/lib/llmProvider";
import { requireSession } from "@/lib/auth/session";
import { aiDisabledResponse, isAiDisabled } from "@/lib/coach/aiAvailability";

/**
 * Intent Classifier
 *
 * A lightweight LLM call (Claude Haiku) that classifies the user's message
 * into one of a small set of actionable intents. This replaces brittle
 * keyword/regex heuristics for practice acceptance, off-topic detection, etc.
 *
 * The classifier is the first step in AICoachChat.handleSendMessage. Based on
 * the returned intent, the client either:
 *   - Fires the practice-fetch flow (accept_practice)
 *   - Acknowledges the decline (decline_practice)
 *   - Replies with a canned on-topic redirect (off_topic) — no big LLM call
 *   - Hands off to /api/enhanced-analysis or /api/chat (chess_question)
 *
 * If this endpoint fails (network, API error, invalid JSON), the client
 * falls back to the legacy regex heuristics so the chat keeps working.
 */

const schema = z.object({
  userMessage: z.string().min(1).max(4000),
  // Last few turns (most-recent-last) for context. We cap at 6 to keep cost down.
  recentMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      })
    )
    .max(6)
    .optional()
    .default([]),
});

// The four actionable intents. Anything chess-related that isn't a
// practice accept/decline is lumped into `chess_question` and routed to
// the main analysis LLM.
const INTENTS = [
  "accept_practice",
  "decline_practice",
  "off_topic",
  "chess_question",
] as const;
type Intent = (typeof INTENTS)[number];

interface ClassifierResult {
  intent: Intent;
  theme: string | null;
  reason: string;
}

const SYSTEM_PROMPT = `You are an intent classifier for a chess coaching chatbot. Given the user's latest message and the recent conversation, output ONE JSON object — nothing else.

Categories (choose exactly one):
- "accept_practice": The user is accepting a practice / puzzle offer that the assistant ALREADY made in the immediately preceding turn. Look for affirmations like "yes", "sure", "let's do it", "ok practice", "sounds good". If the assistant did NOT just offer practice, this is NOT accept_practice.
- "decline_practice": The user is explicitly declining a practice offer ("no thanks", "not right now", "maybe later").
- "off_topic": The user is asking about something unrelated to chess, the game being analyzed, coaching, or chess-adjacent topics (openings, tactics, players, etc.). Examples: "what's the weather", "who won the super bowl", "write me a poem about cats".
- "chess_question": Everything else — analysis requests ("analyze my game"), specific questions about moves/positions, greetings, thanks, general chess chit-chat, opening questions, follow-ups. When in doubt, choose this.

When intent is "accept_practice", also extract the tactical theme the assistant offered (e.g., "fork", "pin", "back-rank-mate", "skewer", "mate"). Use the theme name from the assistant's offer. If no clear theme was offered, set theme to null.

For all other intents, set theme to null.

Output format (strict JSON, no prose, no markdown fences):
{"intent": "accept_practice" | "decline_practice" | "off_topic" | "chess_question", "theme": string | null, "reason": "one short sentence"}`;

function buildUserPrompt(
  userMessage: string,
  recentMessages: Array<{ role: string; content: string }>
): string {
  const context = recentMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-4)
    .map((m) => {
      const role = m.role === "assistant" ? "COACH" : "USER";
      // Trim long messages to keep the classifier cheap; first/last 200 chars preserve context.
      const trimmed =
        m.content.length > 500
          ? `${m.content.slice(0, 300)}\n...[trimmed]...\n${m.content.slice(-200)}`
          : m.content;
      return `${role}: ${trimmed}`;
    })
    .join("\n\n");

  return `Recent conversation:
${context || "(no prior turns — this is the first user message)"}

Latest user message to classify:
USER: ${userMessage}

Respond with one JSON object only.`;
}

function parseClassifierOutput(raw: string): ClassifierResult | null {
  // Strip accidental markdown fences / prose.
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Find the first {...} block (LLM sometimes prepends a sentence).
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as Partial<ClassifierResult>;
    if (!parsed.intent || !INTENTS.includes(parsed.intent as Intent)) {
      return null;
    }
    return {
      intent: parsed.intent as Intent,
      theme:
        typeof parsed.theme === "string" && parsed.theme.trim()
          ? parsed.theme.trim().toLowerCase()
          : null,
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
    };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  // AI is switched off on purpose (see lib/coach/aiAvailability). Refuse
  // BEFORE any work, auth or spend, and with a code that says "off", not
  // "broken" — the difference decides whether the user retries forever.
  if (isAiDisabled()) return aiDisabledResponse();
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  // Ensure at least one provider is usable; callLLM itself double-checks.
  const status = getProviderStatus();
  if (!status.anthropic.keyValid && !status.openai.keyValid) {
    return NextResponse.json(
      {
        error: "No LLM provider configured",
        detail:
          "Set ANTHROPIC_API_KEY (must start with sk-ant-) or OPENAI_API_KEY (sk-…) in the environment.",
      },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { userMessage, recentMessages } = parsed.data;

    let llmResult;
    try {
      llmResult = await callLLM({
        tier: "fast",
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildUserPrompt(userMessage, recentMessages),
          },
        ],
        temperature: 0, // Deterministic classification
        maxTokens: 150,
      });
    } catch (err) {
      const e = toSafeLLMError(err);
      console.error("Intent classifier LLM call failed:", e.message);
      return NextResponse.json(
        { error: PUBLIC_LLM_ERROR.message, code: PUBLIC_LLM_ERROR.code },
        { status: 502 }
      );
    }

    const result = parseClassifierOutput(llmResult.content);

    if (!result) {
      console.warn(
        "Intent classifier returned unparseable output:",
        llmResult.content.slice(0, 200)
      );
      // Fail safe: default to chess_question so the user's message still gets a real answer.
      return NextResponse.json({
        intent: "chess_question",
        theme: null,
        reason: "classifier output unparseable — defaulting to chess_question",
        fallback: true,
        provider: llmResult.provider,
      });
    }

    return NextResponse.json({ ...result, provider: llmResult.provider });
  } catch (error) {
    const safeError = toSafeLLMError(error);
    console.error("Intent classifier provider request failed", {
      provider: safeError.provider,
      status: safeError.status,
      code: safeError.code,
    });
    return NextResponse.json(
      { error: PUBLIC_LLM_ERROR.message, code: PUBLIC_LLM_ERROR.code },
      { status: 502 }
    );
  }
}
