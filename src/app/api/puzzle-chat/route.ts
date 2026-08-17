import { NextRequest, NextResponse } from "next/server";
import { callLLMStream, LLMError, type LLMMessage } from "@/lib/llmProvider";
import { puzzleChatSchema } from "@/lib/validation/puzzleChatSchemas";
import {
  PUZZLE_COACH_BASE_PROMPT,
  PUZZLE_COACH_PROMPT_VERSION,
  buildPuzzleContextSuffix,
  buildTurn0Trigger,
} from "@/lib/prompts/puzzleChatPrompt";
import { logger, logErrorToSentry, extractRequestId } from "@/lib/logging";

/**
 * Puzzle Coach chat endpoint — scoped, interactive, multi-turn coach for
 * one puzzle.
 *
 * Tier policy (Aayan 2026-05-31):
 *   - turnIndex === 0 → flagship (Sonnet). Initial explanation must be
 *     accurate; speed loses to quality on turn 0.
 *   - turnIndex >= 1 → fast (Haiku). Follow-ups are quick and conversational.
 *
 * Always streams SSE; the client side reads deltas and pumps them into
 * the bubble in-place. The base prompt is cached via Anthropic prompt-
 * cache markers so repeat turns within a session are cheap.
 *
 * NO auth gating in v1 — anonymous puzzle-solvers can use the coach.
 * Add session-gated rate-limit later if cost becomes a concern.
 */

const log = logger.child({ module: "puzzle-chat" });

export async function POST(request: NextRequest) {
  const requestId = extractRequestId(request.headers);

  let body: unknown;
  try {
    body = await request.json();
  } catch (err) {
    logErrorToSentry(err, { route: "/api/puzzle-chat", phase: "parse-body", requestId });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = puzzleChatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid puzzle-chat request",
        details: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const {
    puzzle,
    outcome,
    userAttemptSan,
    userRating,
    turnIndex,
    history,
    userMessage,
  } = parsed.data;

  // Turn 0 is server-fired (the client doesn't supply userMessage). Turn ≥1
  // requires a real user message.
  if (turnIndex >= 1 && (!userMessage || userMessage.trim().length === 0)) {
    return NextResponse.json(
      { error: "userMessage is required on turn ≥ 1" },
      { status: 400 },
    );
  }

  // Build the per-puzzle system suffix (uncached; rides after the cached base).
  const systemSuffix = buildPuzzleContextSuffix({
    puzzle,
    outcome,
    userAttemptSan,
    userRating,
    turnIndex,
  });

  // Compose the messages array. The history (prior turns in this session)
  // gets passed verbatim; the new user message goes at the end. On turn 0
  // we synthesise a short trigger so the assistant has something to respond
  // to — the puzzle context is in the system suffix.
  const messages: LLMMessage[] = [
    ...history.map((t) => ({ role: t.role, content: t.content })),
  ];
  if (turnIndex === 0) {
    messages.push({ role: "user", content: buildTurn0Trigger(outcome) });
  } else {
    messages.push({ role: "user", content: userMessage!.trim() });
  }

  // Tier: flagship on turn 0 (accuracy matters), fast on follow-ups (speed
  // matters). Server-driven, not client-supplied.
  const tier: "flagship" | "fast" = turnIndex === 0 ? "flagship" : "fast";

  log.info("puzzle-chat call", {
    requestId,
    puzzleId: puzzle.id,
    turnIndex,
    tier,
    outcome,
    historyLen: history.length,
    promptVersion: PUZZLE_COACH_PROMPT_VERSION,
  });

  // SSE streaming response. Mirrors the wire format of /api/chat?stream=1
  // so the client-side reader logic is identical (parses `data: {type,
  // delta}` events). Final event is `data: [DONE]`.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const startedAt = Date.now();
      let firstTokenAt: number | null = null;
      let totalChars = 0;
      try {
        for await (const ev of callLLMStream({
          tier,
          system: PUZZLE_COACH_BASE_PROMPT,
          systemSuffix,
          messages,
          temperature: 0.6,
          // Tight token budget — terse responses by design. Initial
          // explanation gets a bit more headroom; follow-ups are short.
          maxTokens: turnIndex === 0 ? 600 : 350,
          cacheSystem: true,
          capture: {
            feature: "puzzle-chat",
            requestId,
            promptVersion: PUZZLE_COACH_PROMPT_VERSION,
            fen: puzzle.fen,
            props: { puzzleId: puzzle.id, turnIndex, outcome },
          },
        })) {
          if (ev.type === "text") {
            if (firstTokenAt === null) firstTokenAt = Date.now();
            totalChars += ev.delta.length;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "text", delta: ev.delta })}\n\n`,
              ),
            );
          } else if (ev.type === "done") {
            // Surface model + token-count to the client for telemetry.
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "meta",
                  model: ev.result.model,
                  provider: ev.result.provider,
                  inputTokens: ev.result.inputTokens,
                  outputTokens: ev.result.outputTokens,
                  cacheReadTokens: ev.result.cacheReadTokens,
                  cacheCreationTokens: ev.result.cacheCreationTokens,
                  elapsedMs: ev.result.elapsedMs,
                  ttftMs: firstTokenAt
                    ? firstTokenAt - startedAt
                    : ev.result.elapsedMs,
                })}\n\n`,
              ),
            );
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        log.info("puzzle-chat completed", {
          requestId,
          puzzleId: puzzle.id,
          turnIndex,
          tier,
          totalChars,
          totalMs: Date.now() - startedAt,
          ttftMs: firstTokenAt ? firstTokenAt - startedAt : null,
        });
      } catch (err) {
        const e = err instanceof LLMError ? err : new Error(String(err));
        log.error("puzzle-chat stream failed", {
          requestId,
          message: e.message,
          provider: err instanceof LLMError ? err.provider : undefined,
          status: err instanceof LLMError ? err.status : undefined,
        });
        logErrorToSentry(err, {
          route: "/api/puzzle-chat",
          phase: "stream",
          requestId,
        });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: e.message })}\n\n`,
          ),
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
