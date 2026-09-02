import { NextRequest, NextResponse } from "next/server";
import {
  callLLMStream,
  LLMError,
  PUBLIC_LLM_ERROR,
  toSafeLLMError,
  type LLMMessage,
} from "@/lib/llmProvider";
import { puzzleChatSchema } from "@/lib/validation/puzzleChatSchemas";
import {
  PUZZLE_COACH_BASE_PROMPT,
  PUZZLE_COACH_PROMPT_VERSION,
  buildPuzzleContextSuffix,
  buildTurn0Trigger,
} from "@/lib/prompts/puzzleChatPrompt";
import { logger, logErrorToSentry, extractRequestId } from "@/lib/logging";
import { analyzeMateClaim, applyMateCorrection } from "@/lib/tactics/mateClaim";
import { aiRefusal } from "@/lib/coach/aiGate";
import { clientIp, rateLimited } from "@/lib/http/ipRateLimit";

/**
 * Puzzle Coach chat endpoint — scoped, interactive, multi-turn coach for
 * one puzzle.
 *
 * Tier policy (Aayan 2026-05-31), unchanged in substance:
 *   - the initial explanation → flagship (Sonnet). It must be accurate;
 *     speed loses to quality there.
 *   - every follow-up → fast (Haiku). Quick and conversational.
 *
 * Always streams SSE; the client side reads deltas and pumps them into
 * the bubble in-place. The base prompt is cached via Anthropic prompt-
 * cache markers so repeat turns within a session are cheap.
 *
 * NO auth gating — anonymous puzzle-solvers can use the coach. That is a
 * deliberate product choice, and it makes the request body the ENTIRE cost
 * surface, so two things have to be true here that were not before
 * (2026-09-01):
 *
 *   1. The caller must not be able to pick the expensive model. `turnIndex`
 *      is a client field, and selecting Sonnet on `turnIndex === 0` meant
 *      anyone could send 0 forever and pin flagship. The tier is now derived
 *      from what the server can actually see — history and userMessage — so
 *      flagship is reachable only on a genuinely initial turn, which is also
 *      the smallest possible prompt. Sonnet with a 32-turn history is now
 *      unreachable by construction rather than by convention.
 *   2. There must be some brake at all. The throttle below is the same
 *      per-instance courtesy limiter puzzle-hint uses — honest about being
 *      best-effort on serverless (see lib/http/ipRateLimit), not a security
 *      control. It stops the trivial single-source script; a real limiter
 *      still needs a shared store.
 */

const log = logger.child({ module: "puzzle-chat" });

/** Matches puzzle-hint's budget: this route is the more expensive of the two. */
const CHAT_RATE_LIMIT = { windowMs: 60_000, max: 20 };

export async function POST(request: NextRequest) {
  // AI is switched off on purpose (see lib/coach/aiAvailability). Refuse
  // BEFORE any work, auth or spend, and with a code that says "off", not
  // "broken" — the difference decides whether the user retries forever.
  { const refusal = await aiRefusal(); if (refusal) return refusal; }
  const requestId = extractRequestId(request.headers);

  // Before parsing: the body is unbounded work on an unauthenticated route.
  if (rateLimited("puzzle-chat", clientIp(request), CHAT_RATE_LIMIT)) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (err) {
    logErrorToSentry(err, {
      route: "/api/puzzle-chat",
      phase: "parse-body",
      requestId,
    });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = puzzleChatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid puzzle-chat request",
        details: parsed.error.issues,
      },
      { status: 400 }
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

  // THE INITIAL TURN IS A SERVER OBSERVATION, NOT A CLIENT ASSERTION.
  // It is the auto-fired explanation: no prior turns and no typed message.
  // The real client only ever calls it that way (PuzzleCoachPanel fires
  // turn 0 exactly when `turns.length === 0` and passes no userMessage), so
  // deriving it changes nothing legitimate — but it makes "flagship with a
  // 32-turn history" unreachable, because flagship now REQUIRES an empty one.
  const typedMessage = userMessage?.trim() ?? "";
  const isInitialTurn = history.length === 0 && typedMessage.length === 0;

  if (!isInitialTurn && typedMessage.length === 0) {
    return NextResponse.json(
      { error: "userMessage is required on a follow-up turn" },
      { status: 400 }
    );
  }

  // The client's turnIndex survives only as a depth hint for the prompt, and
  // it cannot claim to be initial once history exists.
  const effectiveTurnIndex = isInitialTurn ? 0 : Math.max(1, turnIndex);

  // Build the per-puzzle system suffix (uncached; rides after the cached base).
  const systemSuffix = buildPuzzleContextSuffix({
    puzzle,
    outcome,
    userAttemptSan,
    userRating,
    turnIndex: effectiveTurnIndex,
  });

  // Compose the messages array. The history (prior turns in this session)
  // gets passed verbatim; the new user message goes at the end. On turn 0
  // we synthesise a short trigger so the assistant has something to respond
  // to — the puzzle context is in the system suffix.
  const messages: LLMMessage[] = [
    ...history.map((t) => ({ role: t.role, content: t.content })),
  ];
  if (isInitialTurn) {
    messages.push({ role: "user", content: buildTurn0Trigger(outcome) });
  } else {
    messages.push({ role: "user", content: typedMessage });
  }

  // Tier: flagship on the initial explanation (accuracy matters), fast on
  // follow-ups (speed matters). Derived from `isInitialTurn`, so the caller
  // cannot select it — and the flagship branch is the one with no history.
  const tier: "flagship" | "fast" = isInitialTurn ? "flagship" : "fast";

  log.info("puzzle-chat call", {
    requestId,
    puzzleId: puzzle.id,
    turnIndex: effectiveTurnIndex,
    claimedTurnIndex: turnIndex,
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
      // Full text, kept so the mate-claim check has something to inspect at
      // the end of the stream. Deltas alone can split a SAN token in half.
      let accumulated = "";
      try {
        for await (const ev of callLLMStream({
          tier,
          system: PUZZLE_COACH_BASE_PROMPT,
          systemSuffix,
          messages,
          temperature: 0.6,
          // Tight token budget — terse responses by design. Initial
          // explanation gets a bit more headroom; follow-ups are short.
          maxTokens: isInitialTurn ? 600 : 350,
          cacheSystem: true,
        })) {
          if (ev.type === "text") {
            if (firstTokenAt === null) firstTokenAt = Date.now();
            totalChars += ev.delta.length;
            accumulated += ev.delta;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "text", delta: ev.delta })}\n\n`
              )
            );
          } else if (ev.type === "done") {
            // Mate-claim enforcement. Deltas already went out — we can't
            // un-send them — so the correction rides the terminal meta event
            // and the client swaps the bubble's text on completion. Same shape
            // as correctStreamedAnalysis on the analysis path, minus the LLM
            // rewrite: the `#` → `+` swap is deterministic, so a second model
            // call would only add latency and a second chance to be wrong.
            const { text: correctedText, corrections } = applyMateCorrection(
              accumulated,
              analyzeMateClaim(puzzle.fen, puzzle.solution)
            );
            if (corrections.length > 0) {
              log.warn("puzzle-chat false mate claim corrected", {
                requestId,
                puzzleId: puzzle.id,
                turnIndex: effectiveTurnIndex,
                claimed: corrections.map((c) => c.claimed),
              });
            }
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
                  // Only sent when something actually changed, so the client
                  // can treat its presence as "replace the bubble".
                  ...(corrections.length > 0 ? { correctedText } : {}),
                })}\n\n`
              )
            );
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        log.info("puzzle-chat completed", {
          requestId,
          puzzleId: puzzle.id,
          turnIndex: effectiveTurnIndex,
          tier,
          totalChars,
          totalMs: Date.now() - startedAt,
          ttftMs: firstTokenAt ? firstTokenAt - startedAt : null,
        });
      } catch (err) {
        const e = toSafeLLMError(err);
        log.error("puzzle-chat stream failed", {
          requestId,
          message: e.message,
          provider: err instanceof LLMError ? err.provider : undefined,
          status: err instanceof LLMError ? err.status : undefined,
        });
        logErrorToSentry(e, {
          route: "/api/puzzle-chat",
          phase: "stream",
          requestId,
        });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: PUBLIC_LLM_ERROR.message, code: PUBLIC_LLM_ERROR.code })}\n\n`
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
