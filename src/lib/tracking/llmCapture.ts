import { after } from "next/server";
import type { CallLLMOptions, LLMResult } from "@/lib/llmProvider";
import { getTrackingEnv } from "@/env";
import { logger } from "@/lib/logging";
import { getTrackingSupabase } from "./supabase";

/**
 * Full prompt+response capture (TRK-2). The eval-data goldmine.
 *
 * Hooked INSIDE callLLM/callLLMStream (src/lib/llmProvider.ts) — the single
 * choke point that holds both the full prompt (system + suffix + messages) and
 * the response. A call is captured only when its CallLLMOptions carries a
 * `capture` context; provider/diagnostic calls without it are skipped.
 *
 * Same hard rules as the event firehose: gated on TRACKING_ENABLED, and the
 * write can never throw or reject into the AI hot path.
 *
 * CONSENT (2026-08-11): these rows hold full conversation content, which the
 * published privacy policy promises is stored "only with your consent". The
 * /api/track* endpoints enforce that at their boundary, but this hook does not
 * sit behind them — so every caller must resolve consent itself and pass it in.
 * `consent` is REQUIRED and un-defaulted on purpose: a route that forgets it
 * fails to compile rather than silently capturing a non-consenting user.
 */

const log = logger.child({ module: "tracking-llm" });

/** Per-call context the route supplies; merged with the prompt/result by the hook. */
export interface LLMCaptureContext {
  /** 'enhanced-analysis' | 'chat' | 'puzzle-hint' | 'puzzle-chat' | ... */
  feature: string;
  /**
   * Result of hasTrackingConsent(request) for THIS request. Required: no
   * default, so omitting it is a type error rather than a silent capture.
   */
  consent: boolean;
  uid?: string | null;
  anonId?: string | null;
  isIntern?: boolean;
  requestId?: string | null;
  promptVersion?: string | null;
  fen?: string | null;
  gamePgn?: string | null;
  /** Feature-specific extras (puzzleId, stage, contextId, branch, ...). */
  props?: Record<string, unknown>;
}

interface CaptureInput {
  ctx: LLMCaptureContext;
  opts: CallLLMOptions;
  result: LLMResult | null;
  status: "ok" | "error";
  errorMessage?: string;
}

/**
 * Run a side-effect after the response flushes. Uses Next's after() inside a
 * request scope (so serverless keeps the worker alive until the insert lands);
 * outside a request (tests, scripts) after() throws — fall back to a detached
 * fire-and-forget that can't surface.
 */
export function safeAfter(fn: () => Promise<void> | void): void {
  try {
    after(fn);
  } catch {
    void Promise.resolve()
      .then(fn)
      .catch(() => undefined);
  }
}

/**
 * Insert one llm_calls row. No-op when TRACKING_ENABLED is off. Never throws.
 * Exported so it can be unit-tested directly (captureLLMCall just schedules it).
 */
export async function recordLLMCallFull(input: CaptureInput): Promise<void> {
  if (!getTrackingEnv().enabled) return;
  const { ctx, opts, result, status, errorMessage } = input;
  // Conversation content is consent-gated (see the module header). Fail closed.
  if (!ctx.consent) return;
  try {
    const systemPrompt = opts.systemSuffix
      ? `${opts.system}\n\n${opts.systemSuffix}`
      : opts.system;

    const supabase = await getTrackingSupabase();
    const { error } = await supabase.from("llm_calls").insert({
      uid: ctx.uid ?? null,
      anon_id: ctx.anonId ?? null,
      is_intern: ctx.isIntern ?? false,
      request_id: ctx.requestId ?? null,
      feature: ctx.feature,
      tier: opts.tier,
      provider: result?.provider ?? "none",
      model: result?.model ?? "none",
      prompt_version: ctx.promptVersion ?? null,
      system_prompt: systemPrompt,
      messages: opts.messages,
      response_text: result?.content ?? null,
      input_tokens: result?.inputTokens ?? null,
      output_tokens: result?.outputTokens ?? null,
      cache_creation_tokens: result?.cacheCreationTokens ?? null,
      cache_read_tokens: result?.cacheReadTokens ?? null,
      elapsed_ms: result?.elapsedMs ?? null,
      primary_error: result?.primaryError ?? null,
      fen: ctx.fen ?? null,
      game_pgn: ctx.gamePgn ?? null,
      status,
      error: errorMessage ?? null,
      props: ctx.props ?? {},
    });
    if (error) {
      log.warn("llm_calls insert failed", {
        feature: ctx.feature,
        error: error.message,
      });
    }
  } catch (err) {
    log.warn("recordLLMCallFull threw (swallowed — capture must not break AI calls)", {
      feature: ctx.feature,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Schedule a capture write. Safe to call synchronously from the provider hot
 * path: returns immediately, never throws, and the insert finishes after the
 * response via safeAfter().
 */
export function captureLLMCall(input: CaptureInput): void {
  try {
    safeAfter(() => recordLLMCallFull(input));
  } catch {
    // safeAfter already guards; this is belt-and-suspenders.
  }
}
