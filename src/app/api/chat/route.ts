import { NextRequest, NextResponse } from "next/server";
import {
  getAnalysisContext,
  buildCondensedContext,
} from "@/lib/analysisContextCache";
import { validateAIResponse } from "@/lib/aiResponseValidator";
import { chatSchema, validateRequest } from "@/lib/validation/schemas";
import {
  callLLM,
  callLLMStream,
  LLMError,
  type LLMMessage,
} from "@/lib/llmProvider";
import { requireSession } from "@/lib/auth/session";
import { logger, extractRequestId } from "@/lib/logging";
// ── Stage B (PR 1.C) Mastermind validator pipeline imports ──────────
// All flag-gated by getMastermindEnv().validatorsEnabled. Flag-off path
// remains byte-identical to today.
import { getMastermindEnv } from "@/env";
import {
  runValidationPipeline,
  POSITION_ANCHORED_VALIDATOR_CATEGORIES,
} from "@/lib/mastermind/validators";
import {
  withPipelineTimeout,
  readPipelineTimeoutMs,
  type PipelineResultWithTimeout,
} from "@/lib/mastermind/pipelineTimeout";
import {
  prepareMastermindContext,
  forwardPipelineTelemetryForRoute,
} from "@/lib/mastermind/routeHelpers";

const log = logger.child({ module: "chat" });

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
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
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

      // Stage B insertion (§3.7.9 chat-equivalent of A): single env read.
      const { validatorsEnabled } = getMastermindEnv();
      const requestId = extractRequestId(request.headers);

      // ── Stage B flag-on wing for /api/chat fast path ────────────────
      // Per §3.4: chat path uses degraded mode (no scout — chat fast-path
      // has no opponent context; userHistory stays enabled for
      // improvement_strategy / meta_motivational follow-ups).
      // Per Q3 ratified default: no-contextId fallback path stays
      // unchanged (handled outside this block).
      if (validatorsEnabled) {
        const playerPerspective: "white" | "black" =
          (context.playerColor === "b" || context.playerColor === "black") ? "black" : "white";
        const prep = await prepareMastermindContext({
          userMessage,
          moveHistory: context.playedMoves,
          fen: context.fen,
          // (γ-route, 2026-05-23): gameEval is now persisted into
          // AnalysisContext at /api/enhanced-analysis store-sites and
          // threaded through here. Legacy cache entries created before
          // this change have gameEval: undefined; in that case the (β)
          // skip path in validateEvalClaim emits a no_stockfish_eval
          // telemetry event rather than firing false-positive
          // eval_mismatch_* events.
          gameEval: context.gameEval,
          playerPerspective,
          correlationId: requestId,
          uid: guard.session.uid,
          // analysisContext doesn't carry a userName today — fall back
          // to session uid for detectUserColor matching (single-identifier
          // MVP per Stage A.7 detectUserColor design).
          userName: guard.session.uid,
          // §3.4: skip scout in chat fast-path; opponent context isn't
          // typically set on chat requests.
          opponentUsername: undefined,
          opponentPlatform: undefined,
        });

        if (prep.dataSources) {
          // Capture narrowed dataSources locally so the factory closure
          // below preserves the non-null type (TS loses control-flow
          // narrowing across function boundaries).
          const dataSources = prep.dataSources;
          let pipelineResult: PipelineResultWithTimeout;
          try {
            pipelineResult = await withPipelineTimeout(
              (signal) =>
                runValidationPipeline({
                  initialRequest: {
                    tier: "fast",
                    system: systemText,
                    messages: nonSystemMessages,
                    temperature: 0.7,
                    maxTokens: 3000,
                    cacheSystem: true,
                  },
                  stockfishEval: prep.moveCtx.stockfishEval,
                  featureDelta: dataSources.featureDelta,
                  pieceRoleDiff: dataSources.pieceRoleDiff,
                  threatTree: dataSources.threatTree,
                  playerPerspective,
                  fen: prep.moveCtx.fenAfter,
                  moveSan: prep.moveCtx.moveSan,
                  correlationId: requestId,
                  category: prep.category,
                  // §10.4 + §3.4: chat retry budget is tighter than
                  // enhanced-analysis (1 retry max) to keep follow-up
                  // latency in chat tolerance.
                  maxRetries: 1,
                  dataSources: {
                    scout: dataSources.scout,
                    userHistory: dataSources.userHistory,
                  },
                  signal,
                }),
              {
                correlationId: requestId,
                timeoutMs: readPipelineTimeoutMs(),
                fallbackResponse:
                  "Still thinking — the deep-validation pass took longer than expected. Try asking again.",
              },
            );
          } catch (err) {
            const e = err instanceof LLMError ? err : new Error(String(err));
            log.error("Mastermind pipeline failed for chat", { message: e.message });
            return NextResponse.json(
              { error: `LLM API error: ${e.message}` },
              { status: 502 },
            );
          }

          const rawContent = pipelineResult.finalResponse || "I couldn't generate a response.";
          const validation = validateAIResponse(rawContent, context.fen);

          forwardPipelineTelemetryForRoute({
            pipelineResult,
            dataSources: prep.dataSources,
            category: prep.category,
            routeKind: "/api/chat",
            userId: guard.session.uid,
            sessionId: contextId,
            responseId: requestId,
          });

          // 2026-05-26 fix-game-review-false-positives: chess.js
          // disclaimer skipped for non-position-anchored categories
          // (mirrors enhanced-analysis flag-on behavior). The validator
          // still runs above for observability (logged via validation
          // object); we just don't annotate user-visible prose with the
          // generic "may be inaccurate" footnote when false positives
          // are systematic.
          const usePositionAnchoredAnnotation =
            POSITION_ANCHORED_VALIDATOR_CATEGORIES.has(prep.category);
          return NextResponse.json({
            gameAnalysis: {
              analysis:
                usePositionAnchoredAnnotation && !validation.isValid
                  ? validation.correctedResponse
                  : rawContent,
              position: context.fen,
              validationScore: validation.score,
              cached: false,
              fastPath: true,
              pipeline: {
                finalOutcome: pipelineResult.finalOutcome,
                retryCount: pipelineResult.retryCount,
                totalCostUsd: pipelineResult.totalCostUsd,
                category: prep.category,
                classifierConfidence: prep.classifierConfidence,
                prepMs: prep.prepMs,
                timedOut: pipelineResult.timedOut,
                // Stage C telemetry expose (Follow-up B, 2026-05-23): preview
                // env only. Mirrors the /api/enhanced-analysis extension from
                // Follow-up A. Production responses do not include the
                // telemetry array — events still emit through the structured
                // logger to Vercel Log Drain on every env.
                ...(process.env.VERCEL_ENV === "preview"
                  ? { telemetry: pipelineResult.telemetry }
                  : {}),
              },
            },
          });
        }
        // prep.dataSources === null → FD failure; fall through to flag-off
        // callLLM below for this turn (§3.2 contract).
      }

      // Fast tier (Haiku primary, gpt-4o-mini fallback)
      // maxTokens here is the OUTPUT cap; raised so answers about long games
      // (many moves discussed) don't get truncated mid-explanation.
      let llmResult;
      try {
        llmResult = await callLLM({
          tier: "fast",
          system: systemText,
          messages: nonSystemMessages,
          temperature: 0.7,
          maxTokens: 3000,
          cacheSystem: true,
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

    // Opt-in SSE streaming. When ?stream=1 is set on the URL, the fallback
    // path streams text deltas from Anthropic (or falls back to OpenAI as a
    // single-chunk pseudo-stream). Existing JSON callers unaffected.
    const wantsStream =
      request.nextUrl.searchParams.get("stream") === "1";

    const fbCallOptions = {
      tier: "fast" as const,
      system: fallbackSystem || "You are a helpful chess coach.",
      messages:
        fallbackMessages.length > 0
          ? fallbackMessages
          : ([{ role: "user", content: "Hello" }] as LLMMessage[]),
      temperature: parsed.data.temperature ?? 0.7,
      maxTokens: parsed.data.max_tokens ?? 3000,
    };

    if (wantsStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const ev of callLLMStream(fbCallOptions)) {
              const payload =
                ev.type === "text"
                  ? { type: "text", delta: ev.delta }
                  : { type: "done" };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
              );
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("LLM stream call failed:", msg);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "error", error: msg })}\n\n`
              )
            );
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    let fbResult;
    try {
      fbResult = await callLLM(fbCallOptions);
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
