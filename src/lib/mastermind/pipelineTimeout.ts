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
 */

import { logger } from "@/lib/logging";
import type {
  RegenerateResult,
  TelemetryEvent,
} from "@/lib/mastermind/validators";

const log = logger.child({ module: "mastermind-pipeline-timeout" });

export const DEFAULT_PIPELINE_TIMEOUT_MS = 30_000;

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
 * Race `pipelinePromise` against a `timeoutMs` timer. On timer fire,
 * resolve (NOT reject) with a synthetic PipelineResultWithTimeout that
 * the route can emit gracefully.
 *
 * On pipeline win, clears the timer and returns the result with
 * `timedOut: false` appended.
 */
export async function withPipelineTimeout(
  pipelinePromise: Promise<RegenerateResult>,
  opts: PipelineTimeoutOpts,
): Promise<PipelineResultWithTimeout> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_PIPELINE_TIMEOUT_MS;
  let timerHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<PipelineResultWithTimeout>((resolve) => {
    timerHandle = setTimeout(() => {
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

  const pipelineWrapped = pipelinePromise.then((result) => {
    if (timerHandle) clearTimeout(timerHandle);
    return { ...result, timedOut: false };
  });

  return Promise.race([pipelineWrapped, timeoutPromise]);
}
