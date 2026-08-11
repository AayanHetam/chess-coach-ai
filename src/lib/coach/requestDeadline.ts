/**
 * Request-level deadline for the coach routes (T1, SILENT_SUBSTITUTION_HANDOFF §4).
 *
 * `vercel.json` caps every API route at `maxDuration: 60`. Every timeout in the
 * pipeline was a COMPONENT timeout — the classifier's, the validators', each
 * grounding fetch's — and nothing tracked wall-clock for the request as a
 * whole. Components can each be within budget while their sum is not.
 *
 * Why that is a correctness problem and not just a latency one: when the
 * function is killed mid-stream the client never receives a `done` event, so
 * it renders a truncated answer as a COMPLETE one (D4), the computed
 * correction is discarded, and `contextId` is lost — which means the next turn
 * re-runs the full flagship analysis instead of taking the cached fast path.
 * A single overrun becomes a cost and latency spiral.
 *
 * This is deliberately a tiny, pure-ish primitive: the value is in having ONE
 * clock that every stage consults, not in the arithmetic.
 */

/**
 * Wall-clock budget for a whole request: the platform's 60s ceiling minus 5s
 * of headroom to stream a degraded answer and close cleanly. Mirrors
 * `CONTRACT_DEADLINE_BUDGET_MS` in contract/contractServing.ts, which is the
 * same idea applied to the enforced-review ladder.
 */
export const REQUEST_DEADLINE_BUDGET_MS = 55_000;

export interface RequestDeadline {
  /** Milliseconds left before the ceiling. Never negative. */
  remainingMs(): number;
  /** True once the budget is exhausted. */
  isExpired(): boolean;
  /**
   * True when at least `costMs` of budget remains — ask BEFORE starting an
   * optional stage, so it is skipped rather than started and then killed.
   */
  hasBudgetFor(costMs: number): boolean;
  /** Aborts at the ceiling. Pass to any call that accepts an AbortSignal. */
  readonly signal: AbortSignal;
  /** Release the internal timer. Safe to call more than once. */
  dispose(): void;
}

export interface CreateRequestDeadlineOpts {
  startMs?: number;
  budgetMs?: number;
  /** Injectable clock, for tests. */
  now?: () => number;
}

export function createRequestDeadline(
  opts: CreateRequestDeadlineOpts = {},
): RequestDeadline {
  const now = opts.now ?? Date.now;
  const startMs = opts.startMs ?? now();
  const budgetMs = opts.budgetMs ?? REQUEST_DEADLINE_BUDGET_MS;
  const controller = new AbortController();

  const remainingMs = () => Math.max(0, startMs + budgetMs - now());

  // Fire the abort at the ceiling. `unref` where available so a pending timer
  // can never hold a serverless invocation open past its own work.
  const timer: ReturnType<typeof setTimeout> | null =
    remainingMs() > 0
      ? setTimeout(() => controller.abort(), remainingMs())
      : null;
  if (timer === null) controller.abort();
  else (timer as unknown as { unref?: () => void }).unref?.();

  let disposed = false;

  return {
    remainingMs,
    isExpired: () => remainingMs() === 0,
    // Strictly greater than: a stage with exactly its cost left would finish
    // at the instant the function is killed, which is the case this exists to
    // avoid.
    hasBudgetFor: (costMs: number) => remainingMs() > costMs,
    signal: controller.signal,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== null) clearTimeout(timer);
    },
  };
}

/**
 * Budget reserved for post-stream puzzle recommendations.
 *
 * `generatePuzzleRecommendations` is a serial Neo4j loop with no internal
 * timeout and no concurrency cap, awaited BEFORE `done` is emitted. It is a
 * nice-to-have that the client currently does not even read, so it must never
 * be the reason a real answer fails to reach the user.
 */
export const PUZZLE_RECS_BUDGET_MS = 8_000;
