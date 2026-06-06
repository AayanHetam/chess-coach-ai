import { NextRequest, NextResponse } from "next/server";
import { callLLM, LLMError } from "@/lib/llmProvider";
import { puzzleHintRequestSchema } from "@/lib/validation/puzzleHintSchemas";
import type {
  HintStage,
  PuzzleHintResponse,
} from "@/lib/validation/puzzleHintSchemas";
import {
  PUZZLE_HINT_BASE_PROMPT,
  PUZZLE_HINT_PROMPT_VERSION,
  buildPuzzleHintSuffix,
  maxTokensForStage,
  tierForStage,
} from "@/lib/prompts/puzzleHintPrompts";
import {
  computeSolutionFingerprint,
  detectSolutionLeak,
  leakFallbackProse,
  parseHintResponse,
} from "@/lib/puzzleHint/responseProcessor";
import { getCachedHint, setCachedHint } from "@/lib/puzzleHint/cache";
import { logger, logErrorToSentry, extractRequestId } from "@/lib/logging";

/**
 * POST /api/puzzle-hint — staged puzzle-coach hint pipeline.
 *
 * Four stages of progressive disclosure: why_wrong → hint → answer →
 * deeper_dive. Each stage has its own prompt + leak constraints. See
 * MASTERMIND_CONTEXT/PR_PUZZLE_COACH_C_HINTS_PIPELINE_PLAN.md for the
 * full design.
 *
 * Why a separate endpoint vs. extending /api/puzzle-chat:
 *   - Conversational vs. pedagogical — different output schemas.
 *   - (puzzleId, stage, userAttemptSan) is a small, cacheable key space.
 *   - Per-stage cost telemetry is cleaner in isolation.
 *
 * v1 is non-streaming JSON. Streaming may land in a follow-up if the
 * 8-12s deeper_dive wait feels too long; the contract is forward-compat
 * (clients that don't know about streaming still receive the same JSON
 * shape from a stream-aware endpoint).
 */

const log = logger.child({ module: "puzzle-hint" });

export async function POST(request: NextRequest) {
  const requestId = extractRequestId(request.headers);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = puzzleHintRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid puzzle-hint request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { puzzle, userAttemptSan, stage, userRating } = parsed.data;

  // Cache lookup — cold containers miss; warm containers serve fast.
  const cached = getCachedHint({
    puzzleId: puzzle.id,
    stage,
    userAttemptSan: userAttemptSan ?? null,
    promptVersion: PUZZLE_HINT_PROMPT_VERSION,
  });
  if (cached) {
    log.info("puzzle-hint cache hit", {
      requestId,
      puzzleId: puzzle.id,
      stage,
    });
    return NextResponse.json({
      ...cached,
      meta: { ...cached.meta, cacheHit: true },
    } satisfies PuzzleHintResponse);
  }

  const tier = tierForStage(stage);
  const maxTokens = maxTokensForStage(stage);
  const systemSuffix = buildPuzzleHintSuffix(parsed.data);

  // Stages that must not reveal the solution.
  const guarded = stage === "why_wrong" || stage === "hint";
  const fingerprint = guarded
    ? computeSolutionFingerprint(puzzle.fen, puzzle.solution)
    : null;

  log.info("puzzle-hint request", {
    requestId,
    puzzleId: puzzle.id,
    stage,
    tier,
    userAttemptSan,
    promptVersion: PUZZLE_HINT_PROMPT_VERSION,
  });

  try {
    const startedAt = Date.now();

    // First attempt.
    const first = await callLLM({
      tier,
      system: PUZZLE_HINT_BASE_PROMPT,
      systemSuffix,
      messages: [
        {
          role: "user",
          content: `Please produce the ${stage} response now.`,
        },
      ],
      temperature: stage === "deeper_dive" ? 0.6 : 0.5,
      maxTokens,
      cacheSystem: true,
    });

    let parsedResp = parseHintResponse(first.content);
    let leakRetry = false;
    let leakFallback = false;
    let usedResult = first;

    // Leak validator: if the protected stages leaked the solution, retry
    // once with a stricter explicit warning. If that still leaks, return
    // a generic fallback.
    if (guarded && fingerprint && detectSolutionLeak(parsedResp.prose, fingerprint)) {
      log.warn("puzzle-hint leak detected on first attempt", {
        requestId,
        puzzleId: puzzle.id,
        stage,
        firstSan: fingerprint.firstSan,
      });
      leakRetry = true;
      const retry = await callLLM({
        tier,
        system: PUZZLE_HINT_BASE_PROMPT,
        systemSuffix: `${systemSuffix}\n\n# Retry — your previous response leaked the solution\n\nYour earlier reply mentioned the move "${fingerprint.firstSan}" or its destination square "${fingerprint.firstDestSquare}". That is NOT allowed at this stage. Rewrite WITHOUT mentioning the solution move, the piece it captures, or the square it lands on. Stay focused on the student's wrong attempt and its consequences.`,
        messages: [
          {
            role: "user",
            content: `Please produce the ${stage} response now, without leaking the solution this time.`,
          },
        ],
        temperature: 0.4,
        maxTokens,
      });
      const retryParsed = parseHintResponse(retry.content);
      if (detectSolutionLeak(retryParsed.prose, fingerprint)) {
        log.warn("puzzle-hint leak survived retry — falling back", {
          requestId,
          puzzleId: puzzle.id,
          stage,
          firstSan: fingerprint.firstSan,
        });
        leakFallback = true;
        parsedResp = {
          prose: leakFallbackProse(stage),
          mentions: [],
          showMoves: undefined,
        };
      } else {
        parsedResp = retryParsed;
      }
      usedResult = retry;
    }

    const response: PuzzleHintResponse = {
      stage,
      prose: parsedResp.prose,
      mentions: parsedResp.mentions,
      showMoves: parsedResp.showMoves,
      meta: {
        model: usedResult.model,
        provider: usedResult.provider,
        inputTokens: usedResult.inputTokens,
        outputTokens: usedResult.outputTokens,
        elapsedMs: Date.now() - startedAt,
        cacheHit: false,
        leakRetry,
        leakFallback,
      },
    };

    // Only cache responses we'd be happy serving again. Fallback prose
    // is generic and not useful to memoise.
    if (!leakFallback) {
      setCachedHint(
        {
          puzzleId: puzzle.id,
          stage,
          userAttemptSan: userAttemptSan ?? null,
          promptVersion: PUZZLE_HINT_PROMPT_VERSION,
        },
        response,
      );
    }

    log.info("puzzle-hint completed", {
      requestId,
      puzzleId: puzzle.id,
      stage,
      tier,
      leakRetry,
      leakFallback,
      mentionsCount: response.mentions.length,
      elapsedMs: response.meta.elapsedMs,
      inputTokens: response.meta.inputTokens,
      outputTokens: response.meta.outputTokens,
    });

    return NextResponse.json(response);
  } catch (err) {
    const e = err instanceof LLMError ? err : new Error(String(err));
    log.error("puzzle-hint failed", {
      requestId,
      message: e.message,
      stage,
      provider: err instanceof LLMError ? err.provider : undefined,
      status: err instanceof LLMError ? err.status : undefined,
    });
    logErrorToSentry(err, {
      route: "/api/puzzle-hint",
      requestId,
      stage,
    });
    return NextResponse.json(
      { error: "puzzle-hint failed", message: e.message },
      { status: 500 },
    );
  }
}

/** Telemetry route — cheap health probe + cache-state inspection. */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    promptVersion: PUZZLE_HINT_PROMPT_VERSION,
    stages: ["why_wrong", "hint", "answer", "deeper_dive"] satisfies HintStage[],
  });
}
