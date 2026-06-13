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
import type { QuestionCategory } from "@/lib/mastermind/categorization/categoryClassifier";
import type { PositionConfidence } from "@/lib/grounding/positionConfidence";

const log = logger.child({ module: "mastermind-pipeline-timeout" });

/**
 * Default pipeline timeout (2026-05-26 update from 30s → 45s → 55s).
 *
 * Sized to fit under Vercel's 60s `maxDuration` (vercel.json) with a
 * tight ~5s buffer for post-pipeline route work: synthetic chunk
 * emission, chess.js `validateAIResponse`, `setCachedResponse` +
 * `storeAnalysisContext`, `generatePuzzleRecommendations` (per-mistake
 * internal fetches, 2-8s), `forwardPipelineTelemetryForRoute`, then
 * `done` event + SSE close. The prior 45s default still left long
 * game_review queries (60+ move games where Sonnet flagship alone
 * takes 40-55s) hitting the timeout fallback.
 *
 * Interim until the real-streaming refactor lands — once
 * /api/enhanced-analysis forwards Anthropic chunks directly via
 * callLLMStream, the user sees text within ~1s and this timeout
 * matters less.
 */
export const DEFAULT_PIPELINE_TIMEOUT_MS = 55_000;

/**
 * Per-category timeout budget (2026-05-30 fix-per-category-timeouts).
 *
 * Sized from observed prod latency profiles, leaving 5-10s headroom
 * under Vercel's 60s `maxDuration` for post-pipeline route work
 * (synthetic chunk emission, chess.js validate, puzzle recs, done
 * event). Heavier intents get more budget; lighter intents are
 * tightened so a stalled pipeline doesn't burn the full 55s default.
 *
 * Specific calibration:
 *   - game_review: 50s — Sonnet flagship on 40+ move games is 30-40s
 *     alone, plus parallel validators 5-8s. Single biggest payload.
 *   - opponent_prep: 40s — adds scout fetch but lighter base coach
 *   - improvement_strategy: 40s — multi-position prose, no eval
 *   - position_analysis: 30s — single FEN focus, fast coach call
 *   - concept_explanation: 25s — short explanatory prompts
 *   - meta_motivational: 20s — chat-like, lowest citation floor
 */
export const PIPELINE_TIMEOUT_BY_CATEGORY: Record<QuestionCategory, number> = {
  game_review: 50_000,
  opponent_prep: 40_000,
  improvement_strategy: 40_000,
  position_analysis: 30_000,
  concept_explanation: 25_000,
  meta_motivational: 20_000,
};

/**
 * Resolve the pipeline timeout for a given category. Precedence:
 *   1. `PIPELINE_TIMEOUT_MS` env var (debug/global lockdown override —
 *      e.g. setting to 100 on Preview to force the timeout path)
 *   2. `PIPELINE_TIMEOUT_BY_CATEGORY[category]` (per-intent default)
 *   3. `DEFAULT_PIPELINE_TIMEOUT_MS` (55_000, conservative fallback)
 *
 * Pass `category` whenever it's known at call time (prep.category from
 * Mastermind context, or the route's intent label). Omit when calling
 * from a context without classification — falls through to the env or
 * global default.
 *
 * Env-var override is preserved so an operator can still force a
 * global floor without code changes (e.g. emergency lockdown to 30s
 * across all categories).
 */
export function readPipelineTimeoutMs(category?: QuestionCategory): number {
  const raw = process.env.PIPELINE_TIMEOUT_MS;
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  if (category && PIPELINE_TIMEOUT_BY_CATEGORY[category]) {
    return PIPELINE_TIMEOUT_BY_CATEGORY[category];
  }
  return DEFAULT_PIPELINE_TIMEOUT_MS;
}

/**
 * Per-category retry budget (2026-05-30 fix-per-category-retries).
 *
 * Default validator pipeline `maxRetries` is 2 (regenerate.ts:111). For
 * heavy intents this means up to 3 × Sonnet flagship calls (~36s each
 * on 40+ move game_review) → 108s of LLM time alone, guaranteed to
 * blow past Vercel's 60s function ceiling regardless of how generous
 * the pipeline timeout is.
 *
 * The right per-intent budget falls out of the latency profile:
 *
 *   - game_review: 0 — Sonnet flagship is too expensive to retry under
 *     60s wall. Single shot; validator-rejection → buildFallback.
 *     Trade-off: lose the recovery benefit of retries, gain bounded
 *     latency + no timeout-empty-bubble.
 *   - opponent_prep: 1 — coach ~15-25s leaves room for one retry under
 *     40s budget.
 *   - improvement_strategy: 1 — similar profile to opponent_prep.
 *   - position_analysis: 2 — coach ~10-15s, full retry budget fits.
 *   - concept_explanation: 2 — light prompts.
 *   - meta_motivational: 2 — shortest coach calls.
 */
export const MAX_RETRIES_BY_CATEGORY: Record<QuestionCategory, number> = {
  game_review: 0,
  opponent_prep: 1,
  improvement_strategy: 1,
  position_analysis: 2,
  concept_explanation: 2,
  meta_motivational: 2,
};

/**
 * Default `maxRetries` when no category is provided (or category isn't
 * in the map). Matches regenerate.ts's historical default — preserves
 * pre-2026-05-30 behavior for any caller that hasn't migrated to
 * passing category.
 */
export const DEFAULT_MAX_RETRIES = 2;

/**
 * Resolve the validator-pipeline `maxRetries` for a given category.
 * Pass `category` whenever it's known at call time. Omit to get the
 * legacy default (2).
 *
 * No env-var override here — retries are a per-intent product
 * decision, not an operator debug knob. To globally disable retries
 * in an emergency, set the runValidationPipeline maxRetries directly
 * at the route's call site.
 */
export function readMaxRetries(category?: QuestionCategory): number {
  if (category && MAX_RETRIES_BY_CATEGORY[category] !== undefined) {
    return MAX_RETRIES_BY_CATEGORY[category];
  }
  return DEFAULT_MAX_RETRIES;
}

/**
 * CH-2 — confidence-aware single-regen policy (Aayan's Q3).
 *
 * The overclaim validators (positionalClaim / materialWin) fire on ungrounded
 * "winning" / "dominating" prose and trigger a regenerate. Q3 raised two
 * problems with letting that use the full per-category retry budget:
 *   1. Regenerating an INHERENTLY low-grounding position is a "shot in the
 *      dark" — a retry can't add grounding that isn't there, so it just burns
 *      flagship calls without improving accuracy.
 *   2. Even a fixable overclaim should get at most ONE retry (hard stop), not
 *      the category budget (position_analysis is 2).
 *
 * So, only on the position-anchored path where the overclaim validators
 * actually enforce (`overclaimEnforced`), and using the focused position's
 * verification level:
 *   - strategic_read         → 0: accept the answer; CH-3 surfaces the low
 *     confidence rather than chasing a better answer that doesn't exist.
 *   - mixed / engine_verified → min(categoryBudget, 1): the overclaim is fixable
 *     against real grounding — one hedge-retry, hard stop.
 *
 * When not enforcing, or no snapshot (non-anchored / no focused move), the
 * category budget is returned unchanged — eval/citation/scout/userHistory
 * regen on those paths is unrelated to chess-grounding confidence.
 */
export function resolveOverclaimRetries(
  categoryBudget: number,
  positionConfidence: PositionConfidence | undefined,
  overclaimEnforced: boolean,
): number {
  if (!overclaimEnforced || !positionConfidence) return categoryBudget;
  if (positionConfidence.level === "strategic_read") return 0;
  return Math.min(categoryBudget, 1);
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
