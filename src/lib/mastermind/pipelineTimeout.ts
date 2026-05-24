/**
 * Stage B 1.C.B.5 — withPipelineTimeout
 *
 * Top-level timeout wrapper for runValidationPipeline. On timeout the
 * helper resolves (rather than rejects) with a synthetic
 * PipelineResultWithTimeout, so route handlers can emit a graceful
 * `done` event with `metadata.pipeline.timedOut: true` instead of an
 * SSE `error` or 502.
 *
 * Different from wireValidators.ts's internal `withTimeout`: that's a
 * per-source 3s timeout that REJECTS on expiry (caller catches and
 * marks the source as failed). This module is route-level, defaults to
 * 30s, and never rejects — the timer always resolves with a fallback
 * payload so the user sees a response rather than a connection drop.
 *
 * See PR_1C_STAGE_B_PLAN.md §10.3.1 case "Flag on, pipeline times out
 * at 30s" — was deferred from 1.C.B.4 (see 1.C.B.4 commit body
 * deviation #2); lands here in 1.C.B.5 as a shared helper consumed by
 * both /api/enhanced-analysis and /api/chat.
 *
 * Factory API (2026-05-25 fix-orphan-pipeline-cancellation): caller
 * passes a factory `(signal) => Promise<RegenerateResult>` instead of a
 * pre-constructed promise. On timeout, the AbortController fires
 * `controller.abort()` BEFORE resolving the synthetic result, so the
 * underlying pipeline's in-flight LLM/fetch calls receive the abort
 * signal and unwind. Without cancellation, Promise.race only selected
 * the winner — the loser kept running, producing orphan logs that
 * landed against subsequent requests (production rollback Finding 1
 * + Finding 2 root cause).
 */

import { logger } from "@/lib/logging";
import type {
  RegenerateResult,
  TelemetryEvent,
} from "@/lib/mastermind/validators";

const log = logger.child({ module: "mastermind-pipeline-timeout" });

export const DEFAULT_PIPELINE_TIMEOUT_MS = 30_000;

/**
 * Read `PIPELINE_TIMEOUT_MS` env var if set; fall back to the 30s default.
 * Debug-only env var — primarily for engineered timeout reproduction on
 * Preview deploys. Default preserves current production behavior. Removable
 * post-verification if not useful as a permanent debug tool.
 */
export function readPipelineTimeoutMs(): number {
  const raw = process.env.PIPELINE_TIMEOUT_MS;
  if (!raw) return DEFAULT_PIPELINE_TIMEOUT_MS;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_PIPELINE_TIMEOUT_MS;
  return parsed;
}

/**
 * Pipeline result extended with a `timedOut` discriminant. `finalOutcome`
 * stays in the existing FinalOutcome union ("fallback_used" on timeout)
 * for compatibility with downstream telemetry; the route maps `timedOut`
 * to RouteContext.finalOutcome="pipeline_timed_out" before forwarding to
 * the logger. See validatorTelemetry.ts's RouteContext type — it already
 * accepts "pipeline_timed_out" per §6.1.
 */
export type PipelineResultWithTimeout = RegenerateResult & {
  timedOut: boolean;
};

export interface PipelineTimeoutOpts {
  /** Override the 30s default — primarily for tests. */
  timeoutMs?: number;
  /** Correlation ID for the timeout warn log + synthetic telemetry event. */
  correlationId: string;
  /**
   * Text the route emits to the user when the timer fires. Caller supplies
   * something category-appropriate (e.g., buildFallbackResponse output or
   * a stock "still working on it" string). Helper does NOT construct text
   * on its own — that's the route's responsibility per §3.4 / §8.
   */
  fallbackResponse: string;
}

/**
 * Factory function the caller provides. Receives the AbortSignal created
 * by withPipelineTimeout. Caller's pipeline should pass the signal down
 * to any LLM/fetch calls so they abort cleanly on timeout.
 */
export type PipelineFactory = (signal: AbortSignal) => Promise<RegenerateResult>;

/**
 * Race the pipeline (produced by `factory`) against a `timeoutMs` timer.
 * On timer fire:
 *   1. Aborts the controller (signal propagates down to in-flight fetches)
 *   2. Logs the timeout
 *   3. Resolves (NOT rejects) with a synthetic PipelineResultWithTimeout
 *
 * On pipeline win: clears the timer and returns the result with
 * `timedOut: false` appended.
 *
 * The factory pattern (vs accepting a pre-constructed promise) is
 * required so we can pass the AbortSignal into the pipeline. Without
 * it, the loser of Promise.race kept running in the background,
 * producing orphan LLM calls that polluted logs and wasted spend
 * (production rollback root cause).
 */
export async function withPipelineTimeout(
  factory: PipelineFactory,
  opts: PipelineTimeoutOpts,
): Promise<PipelineResultWithTimeout> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_PIPELINE_TIMEOUT_MS;
  const controller = new AbortController();
  let timerHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<PipelineResultWithTimeout>((resolve) => {
    timerHandle = setTimeout(() => {
      // Abort BEFORE logging/resolving so the in-flight pipeline starts
      // unwinding immediately. The route's response return + telemetry
      // emission proceeds synchronously while the orphan chain unwinds
      // in the background.
      controller.abort();
      log.warn("Mastermind pipeline timed out", {
        correlation_id: opts.correlationId,
        timeout_ms: timeoutMs,
      });
      const timeoutEvent: TelemetryEvent = {
        check_name: "pipeline_timeout",
        fire_reason: "fallback_used",
        llm_span: "",
        expected: null,
        actual: null,
        retry_count: 0,
        final_outcome: "fallback_used",
        context: { correlation_id: opts.correlationId },
        timestamp_ms: Date.now(),
      };
      resolve({
        finalResponse: opts.fallbackResponse,
        retryCount: 0,
        finalOutcome: "fallback_used",
        cumulativeIssues: [],
        totalCostUsd: 0,
        telemetry: [timeoutEvent],
        timedOut: true,
      });
    }, timeoutMs);
  });

  // Construct the pipeline promise lazily, passing the signal. The
  // factory must pass `signal` down to any LLM/fetch calls inside.
  const pipelinePromise = factory(controller.signal);

  const pipelineWrapped = pipelinePromise.then(
    (result) => {
      if (timerHandle) clearTimeout(timerHandle);
      return { ...result, timedOut: false };
    },
    (err) => {
      // Pipeline rejected. If we already aborted (timeout fired first),
      // the rejection is the abort propagating — swallow it; the timeout
      // promise already resolved with the fallback. Otherwise let the
      // rejection propagate to the caller's try/catch.
      if (controller.signal.aborted) {
        // Return a never-resolving promise so Promise.race picks the
        // timeout result; the actual rejection is silenced.
        return new Promise<PipelineResultWithTimeout>(() => {});
      }
      if (timerHandle) clearTimeout(timerHandle);
      throw err;
    },
  );

  return Promise.race([pipelineWrapped, timeoutPromise]);
}
