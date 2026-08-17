/**
 * Stage B 1.C.B.2 — validatorTelemetry.ts
 *
 * forwardTelemetry takes the validator pipeline's TelemetryEvent[] and a
 * per-turn RouteContext, and emits one log entry per event plus a single
 * `citation_rate_summary` event when citationRate is provided.
 *
 * Level discipline is anchored in PR_1C_STAGE_B_PLAN.md:
 *   - §6.3 per-validator `validator_event` level mapping (fire_reason → level)
 *   - §6.3.1 `citation_rate_summary` discipline (verified 2026-05-22)
 *
 * Routine citation_rate_summary emits at `logger.debug` always plus a
 * 1-in-100 sampled `logger.info` for Sentry trend visibility. Noteworthy
 * turns (below-floor per §11.3 with ≥3 opps; final_outcome=fallback_used;
 * retry_count > 0; any check_name fires >1× in the turn) emit at
 * `logger.info` always. See §6.3.1 for full discipline.
 *
 * All output flows through `src/lib/logging` — JSON lines to Vercel Log
 * Drain in prod, colored to console in dev. Sentry is wired separately
 * via the logger's Sentry integration; this module does not call Sentry
 * directly.
 */

import { logger } from "@/lib/logging";
import type {
  TelemetryEvent,
  FinalOutcome,
  FireReason,
} from "@/lib/mastermind/validators";
import type { QuestionCategory } from "@/lib/mastermind/categorization/categoryClassifier";
import type {
  CitationRateResult,
  CitationSource,
} from "@/lib/mastermind/citationRate";

const log = logger.child({ module: "mastermind-validator" });

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface RouteContext {
  route: "/api/enhanced-analysis" | "/api/chat";
  userId?: string;
  sessionId?: string;
  responseId: string;
  category: QuestionCategory;
  finalOutcome: FinalOutcome | "pipeline_timed_out" | null;
  retryCount: number;
  totalCostUsd: number;
}

export interface CitationRateSummaryOpts {
  citationRate: CitationRateResult;
  /**
   * Actual count of games returned from the Firestore games subcollection
   * read. Null when userHistory source wasn't fetched. Captured per
   * §12.3 T12 — lets us detect whether the 200-default games-query bound
   * is too tight or too loose without sampling Firestore.
   */
  userHistoryGameCount: number | null;
}

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

/**
 * Per-category citation-rate floors per §11.3. Stage B's per-turn
 * noteworthy check uses these — categories without a primary source
 * (concept_explanation — deferred to PR 1.D) or with a null perSource
 * bucket (feature_delta categories — opportunity counter deferred per
 * cleanup_followups) are skipped.
 */
const CATEGORY_CITATION_FLOORS: Partial<Record<QuestionCategory, number>> = {
  opponent_prep: 85,
  improvement_strategy: 50,
  meta_motivational: 20,
  // game_review, position_analysis — feature_delta opportunity counter not
  // shipped; perSource bucket is null and skipped here.
  // concept_explanation — primary source null until PR 1.D.
};

/**
 * Minimum opportunities required for the per-turn floor check to fire.
 * Below this the rate is too volatile to be useful (single-opportunity
 * turns always read 0% or 100%). Hand-tuned; Stage C sweep can refine.
 */
const MIN_OPPORTUNITIES_FOR_FLOOR_CHECK = 3;

/** 1-in-100 routine `info` sample rate per §6.3.1 lock-in. */
const ROUTINE_INFO_SAMPLE_RATE = 0.01;

/** Defensive cap on llm_span per §6.5 (validators truncate upstream too). */
const LLM_SPAN_MAX_CHARS = 200;

const WARNING_FIRE_REASONS = new Set<FireReason>([
  "qualitative_band_flip",
  "numeric_diff_exceeds_threshold",
  "unsupported_citation",
  "regenerate_invoked",
]);

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Forward the pipeline's TelemetryEvent[] + per-turn RouteContext to the
 * structured logger. Emits one entry per validator event plus a single
 * `citation_rate_summary` event when `citationRate` is provided.
 *
 * Pure side-effecting function — no return. Validators never call this
 * directly; the route is the only caller per PR_1B_PLAN.md §9.1.
 */
export function forwardTelemetry(
  events: TelemetryEvent[],
  ctx: RouteContext,
  citationRate?: CitationRateSummaryOpts,
): void {
  for (const event of events) {
    emitValidatorEvent(event, ctx);
  }
  if (citationRate) {
    emitCitationRateSummary(citationRate, events, ctx);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Per-validator event emission (§6.2 + §6.3)
// ─────────────────────────────────────────────────────────────────────

function emitValidatorEvent(event: TelemetryEvent, ctx: RouteContext): void {
  const payload = {
    event: "validator_event",
    check_name: event.check_name,
    fire_reason: event.fire_reason,
    retry_count: event.retry_count,
    final_outcome: event.final_outcome,
    correlation_id: event.context.correlation_id,
    user_id: ctx.userId,
    session_id: ctx.sessionId,
    response_id: ctx.responseId,
    route: ctx.route,
    category: ctx.category,
    expected: event.expected,
    actual: event.actual,
    llm_span: truncate(event.llm_span, LLM_SPAN_MAX_CHARS),
    ts_ms: event.timestamp_ms || Date.now(),
  };

  // §6.3 per-fire_reason level mapping.
  if (event.fire_reason === "fallback_used") {
    log.error("mastermind validator fallback", payload);
  } else if (WARNING_FIRE_REASONS.has(event.fire_reason)) {
    log.warn("mastermind validator fired", payload);
  } else {
    // passed, parser_json_invalid, parser_low_confidence
    log.info("mastermind validator event", payload);
  }
}

// ─────────────────────────────────────────────────────────────────────
// citation_rate_summary emission (§6.3.1 — verified-behavior lock)
// ─────────────────────────────────────────────────────────────────────

function emitCitationRateSummary(
  opts: CitationRateSummaryOpts,
  events: TelemetryEvent[],
  ctx: RouteContext,
): void {
  const { citationRate, userHistoryGameCount } = opts;
  const payload = {
    event: "citation_rate_summary",
    correlation_id: ctx.responseId,
    response_id: ctx.responseId,
    route: ctx.route,
    user_id: ctx.userId,
    session_id: ctx.sessionId,
    category: ctx.category,
    primary_source: citationRate.primarySource,
    overall: citationRate.overall,
    per_source: citationRate.perSource,
    user_history_game_count: userHistoryGameCount,
    retry_count: ctx.retryCount,
    final_outcome: ctx.finalOutcome,
    total_cost_usd: ctx.totalCostUsd,
    ts_ms: Date.now(),
  };

  if (isNoteworthy(citationRate, events, ctx)) {
    log.info("citation rate summary (noteworthy)", payload);
    return;
  }

  // Routine: always-debug + sampled-info per §6.3.1 locked discipline.
  log.debug("citation rate summary", payload);
  if (Math.random() < ROUTINE_INFO_SAMPLE_RATE) {
    log.info("citation rate summary (sampled routine)", payload);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Noteworthy detection (§6.3.1 four criteria)
// ─────────────────────────────────────────────────────────────────────

function isNoteworthy(
  citationRate: CitationRateResult,
  events: TelemetryEvent[],
  ctx: RouteContext,
): boolean {
  // 1. fallback_used
  if (ctx.finalOutcome === "fallback_used") return true;
  // 2. retries hit
  if (ctx.retryCount > 0) return true;
  // 3. any check_name fired more than once in the turn
  if (hasMultiFire(events)) return true;
  // 4. below-floor citation rate (with min-opportunities gate)
  if (isBelowFloor(citationRate, ctx.category)) return true;
  return false;
}

function hasMultiFire(events: TelemetryEvent[]): boolean {
  const counts = new Map<string, number>();
  for (const e of events) {
    const n = (counts.get(e.check_name) ?? 0) + 1;
    if (n > 1) return true;
    counts.set(e.check_name, n);
  }
  return false;
}

function isBelowFloor(
  citationRate: CitationRateResult,
  category: QuestionCategory,
): boolean {
  const floor = CATEGORY_CITATION_FLOORS[category];
  if (floor === undefined) return false;
  const primarySource: CitationSource | null = citationRate.primarySource;
  if (!primarySource) return false;
  const bucket = citationRate.perSource[primarySource];
  if (!bucket) return false; // null bucket — source not measured
  if (bucket.opportunities < MIN_OPPORTUNITIES_FOR_FLOOR_CHECK) return false;
  return bucket.ratePct < floor;
}

// ─────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────

function truncate(s: string, n: number): string {
  if (typeof s !== "string") return s;
  return s.length <= n ? s : s.slice(0, n);
}
