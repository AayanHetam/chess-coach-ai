import { Chess } from "chess.js";
import { hasTrackingConsent } from "@/lib/tracking/consent";
import { NextRequest, NextResponse } from "next/server";
import {
  getAnalysisContext,
  buildCondensedContext,
} from "@/lib/analysisContextCache";
import { buildFenPositionFacts } from "@/lib/mastermind/positionFacts";
import { renderContractCompact } from "@/lib/contract/followUp";
import { buildRelationalFacts } from "@/lib/relational/relationalFactsBuilder";
import { validateAIResponse } from "@/lib/aiResponseValidator";
import { chatSchema, validateRequest } from "@/lib/validation/schemas";
import {
  callLLM,
  callLLMStream,
  LLMError,
  type LLMMessage,
} from "@/lib/llmProvider";
import { recordLLMCall } from "@/lib/llmStatsAggregator";
import { requireSession } from "@/lib/auth/session";
import { gateFeature } from "@/lib/billing/gate";
import {
  logger,
  logErrorToSentry,
  extractRequestId,
} from "@/lib/logging";
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
  // Conversation capture is consent-gated (privacy policy: AI-conversation
  // records are stored only with consent). Resolved once per request.
  const trackingConsent = hasTrackingConsent(request);
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  // Same `reportFatal` helper as /api/enhanced-analysis: fire a structured
  // Sentry event from each fatal catch block without re-deriving the
  // abort-vs-real-error guard at every site. AbortError is the user
  // closing the connection mid-stream — filter it; everything else
  // (LLMError, FD failures, validator pipeline blowups) gets paged.
  const reportFatal = (
    err: unknown,
    phase: string,
    extra?: Record<string, unknown>
  ) => {
    const e = err instanceof Error ? err : new Error(String(err));
    if (e.name === "AbortError") return;
    logErrorToSentry(err, {
      route: "/api/chat",
      requestId: extractRequestId(request.headers),
      phase,
      ...extra,
    });
  };
  try {
    const body = await request.json();

    const parsed = validateRequest(chatSchema, body);
    if (!parsed.success) return parsed.response;
    // Gate AFTER validation so a malformed request doesn't burn the free-tier
    // allowance. Re-checked every call (no tier in the contextId cache key).
    const gate = await gateFeature(guard.session.uid, "coach_chat", {
      surface: "coach_chat",
    });
    if (!gate.ok) return gate.response;
    const {
      messages,
      contextId,
      userMessage,
      conversationHistory,
      fen: clientFen,
      moveIndex,
    } = parsed.data;

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

      // System prompt split:
      //   - cached prefix:  context.systemPromptStable (persona-stable across
      //     users who share a personalityId). Falls back to the full joined
      //     systemPrompt for legacy cache entries created before the split
      //     landed.
      //   - uncached suffix: context.systemPromptSuffix (the per-user tail —
      //     username, rating, coaching prefs) + the per-turn condensed game
      //     context. Both vary per call so they ride uncached.
      // When the new fields are absent (legacy contextId) we send everything
      // as the cacheable block — the worst case is just that two users with
      // different names share a cache miss, same behaviour as before.
      // ── Position under discussion ────────────────────────────────────
      // The client sends the FEN currently displayed on its board. Before
      // this, every follow-up was grounded and validated against the
      // analysis-time final position (context.fen) — navigate to move 12,
      // ask "what should I play here?", and the answer (plus all validators)
      // referenced move 40's board. Invalid/absent client FENs fall back to
      // the stored context.
      let activeFen = context.fen;
      if (clientFen) {
        try {
          activeFen = new Chess(clientFen).fen();
        } catch {
          // unparseable client FEN — keep context.fen
        }
      }

      // Per-turn oracle facts for the active position. The v3.4+ system
      // prompt forbids any attack/capture/pin/fork claim not present in a
      // VERIFIED POSITION FACTS block, but this path never injected one —
      // the constraint was unsatisfiable on every follow-up turn, forcing
      // the model to either break its own rules or refuse tactical talk
      // (audit §3.4). buildRelationalFacts is a pure chess.js computation.
      let perTurnFacts = "";
      try {
        const boardFacts = buildFenPositionFacts(activeFen);
        const relational = buildRelationalFacts(activeFen);
        perTurnFacts = [boardFacts, relational.summary].filter(Boolean).join("\n\n");
      } catch {
        // oracle failure — proceed without per-turn facts (legacy behavior)
      }

      // PR-CI-6a — follow-up grounding. When the review above was served
      // through the enforced contract path, the SAME facts that survived the
      // referee ride into this turn: engine lines behind each verdict, the
      // tactical vocabulary each insight licenses, and the claim classes a
      // degraded source forbids. Absent (legacy-served review, or a context
      // cached before this landed) it renders to "" and the turn behaves
      // exactly as before.
      const contractBlock = context.compactContract
        ? renderContractCompact(context.compactContract)
        : "";

      const cachedSystemPrompt = context.systemPromptStable ?? context.systemPrompt;
      const condensedContext = [buildCondensedContext(context), contractBlock, perTurnFacts]
        .filter(Boolean)
        .join("\n\n");
      const uncachedSuffix = context.systemPromptStable
        ? `${context.systemPromptSuffix ?? ""}\n\n${condensedContext}`.trim()
        : condensedContext;

      const nonSystemMessages: LLMMessage[] = [];

      // The initial deep analysis as the first assistant message — gives the
      // LLM full continuity without re-sending the raw game data.
      nonSystemMessages.push({
        role: "assistant",
        content: context.initialAnalysis,
      });

      // Prior conversation turns (excluding the initial analysis which is
      // already injected above).
      if (conversationHistory && Array.isArray(conversationHistory)) {
        // D1 (SILENT_SUBSTITUTION_HANDOFF §3 Group D): this used to skip the
        // FIRST assistant entry positionally, on the assumption that it was the
        // initial analysis already injected above. On the live client the first
        // assistant entry is a GREETING, not the analysis — so the greeting was
        // dropped and the raw, uncorrected analysis sailed through and landed
        // as the model's most recent statement, directly after the corrected
        // copy. The model then defends the uncorrected line.
        //
        // De-dupe on content identity instead: drop whichever entry actually IS
        // the initial analysis, wherever it sits, and only once. The client now
        // swaps in the corrected text (D1 client half), so a matching entry is
        // the corrected one — this is belt-and-braces for older clients and for
        // any entry that slipped through unchanged.
        const canonical = context.initialAnalysis?.trim();
        let droppedCanonical = false;
        for (const msg of conversationHistory) {
          if (
            !droppedCanonical &&
            msg.role === "assistant" &&
            canonical &&
            typeof msg.content === "string" &&
            msg.content.trim() === canonical
          ) {
            droppedCanonical = true;
            continue;
          }
          if (msg.role && msg.content) {
            nonSystemMessages.push({
              role: msg.role as "user" | "assistant",
              content: msg.content,
            });
          }
        }
      }

      // Current user message
      nonSystemMessages.push({ role: "user", content: userMessage });

      const systemText = cachedSystemPrompt;

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
        // Anchor the pipeline to the viewed ply when the client supplies
        // moveIndex (position after half-move k = gameEval.positions[k], so
        // slicing the history to k keeps eval indexing aligned). Without it,
        // the pipeline stays last-move-anchored (legacy behavior).
        const effectiveMoveHistory =
          typeof moveIndex === "number" &&
          Array.isArray(context.playedMoves) &&
          moveIndex <= context.playedMoves.length
            ? context.playedMoves.slice(0, moveIndex)
            : context.playedMoves;
        const prep = await prepareMastermindContext({
          userMessage,
          moveHistory: effectiveMoveHistory,
          fen: activeFen,
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
                    systemSuffix: uncachedSuffix,
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
                timeoutMs: readPipelineTimeoutMs(prep.category),
                fallbackResponse:
                  "Still thinking — the deep-validation pass took longer than expected. Try asking again.",
              },
            );
          } catch (err) {
            const e = err instanceof LLMError ? err : new Error(String(err));
            log.error("Mastermind pipeline failed for chat", { message: e.message });
            reportFatal(err, "non-stream:mastermind-pipeline");
            return NextResponse.json(
              { error: `LLM API error: ${e.message}` },
              { status: 502 },
            );
          }

          const rawContent = pipelineResult.finalResponse || "I couldn't generate a response.";
          const validation = validateAIResponse(rawContent, activeFen);

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
          //
          // 2026-05-30 fix-fallback-prose-disclaimer: extend the gate to
          // also suppress on `pipelineResult.finalOutcome === "fallback_used"`.
          // buildFallbackResponse prose cites pre-move position state by
          // design (role changes from featureDelta), while validateAIResponse
          // checks against post-move FEN → systematic false positive.
          const isFallbackUsed =
            pipelineResult.finalOutcome === "fallback_used";
          const usePositionAnchoredAnnotation =
            !isFallbackUsed &&
            POSITION_ANCHORED_VALIDATOR_CATEGORIES.has(prep.category);
          return NextResponse.json({
            gameAnalysis: {
              analysis:
                usePositionAnchoredAnnotation && !validation.isValid
                  ? validation.correctedResponse
                  : rawContent,
              position: activeFen,
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
          systemSuffix: uncachedSuffix,
          messages: nonSystemMessages,
          temperature: 0.7,
          maxTokens: 3000,
          cacheSystem: true,
          capture: {
            feature: "chat",
            consent: trackingConsent,
            uid: guard.session.uid,
            isIntern: guard.session.isIntern,
            fen: activeFen,
            props: { path: "fast", contextId: contextId ?? null },
          },
        });
      } catch (err) {
        const e = err instanceof LLMError ? err : new Error(String(err));
        console.error("LLM chat call failed:", e.message);
        reportFatal(err, "non-stream:fast-path", {
          provider: e instanceof LLMError ? e.provider : undefined,
          status: e instanceof LLMError ? e.status : undefined,
        });
        return NextResponse.json(
          { error: `LLM API error: ${e.message}` },
          { status: 502 }
        );
      }
      recordLLMCall(llmResult);
      const rawContent = llmResult.content || "I couldn't generate a response.";

      // Light validation against the position under discussion
      const validation = validateAIResponse(rawContent, activeFen);

      return NextResponse.json({
        gameAnalysis: {
          analysis: validation.isValid ? rawContent : validation.correctedResponse,
          position: activeFen,
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
      // Clamp to Anthropic's valid range [0, 1]. chatSchema accepts up to 2
      // (OpenAI's range); forwarding 1.5 to Anthropic 400s the request, which
      // is a user-facing failure in single-provider mode (audit §3.8).
      temperature: Math.max(0, Math.min(1, parsed.data.temperature ?? 0.7)),
      maxTokens: parsed.data.max_tokens ?? 3000,
      capture: {
        feature: "chat",
        consent: trackingConsent,
        uid: guard.session.uid,
        isIntern: guard.session.isIntern,
        props: { path: "fallback" },
      },
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
            reportFatal(err, "stream:fallback");
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
      reportFatal(err, "non-stream:fallback", {
        provider: e instanceof LLMError ? e.provider : undefined,
        status: e instanceof LLMError ? e.status : undefined,
      });
      return NextResponse.json(
        { error: `LLM API error: ${e.message}` },
        { status: 502 }
      );
    }

    recordLLMCall(fbResult);
    // Return in OpenAI-compatible format so the client doesn't need changes
    return NextResponse.json({
      choices: [
        { message: { role: "assistant", content: fbResult.content || "" } },
      ],
    });
  } catch (error) {
    console.error("Chat API error:", error);
    reportFatal(error, "non-stream:uncaught");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
