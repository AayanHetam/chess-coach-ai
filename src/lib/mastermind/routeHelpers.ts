/**
 * Stage B 1.C.B.5 — shared route helpers.
 *
 * Houses the helpers that both /api/enhanced-analysis and /api/chat
 * consume: per-turn move-context derivation, classifier+sources prep,
 * and pipeline-telemetry forwarding. Pulled out of enhanced-analysis's
 * route file during 1.C.B.5 so the chat route can reuse them without
 * duplicating ~250 LOC. The route files still own their request-shape
 * mapping (which inputs become which moveHistory/fen/etc.).
 *
 * See PR_1C_STAGE_B_PLAN.md §3 + §3.7 for the canonical design;
 * §3.7.9 insertion-point B+F describe the call surface.
 */

import { Chess } from "chess.js";
import { logger } from "@/lib/logging";
import {
  classifyQuestion,
  DEFAULT_LOW_CONFIDENCE_CATEGORY,
  type QuestionCategory,
} from "@/lib/mastermind/categorization/categoryClassifier";
import { fetchDataSources, type FetchedDataSources } from "@/lib/mastermind/wireValidators";
import { computeCitationRate } from "@/lib/mastermind/citationRate";
import {
  forwardTelemetry,
  type RouteContext,
} from "@/lib/mastermind/validatorTelemetry";
import {
  countScoutOpportunities,
  countUserHistoryOpportunities,
  type RegenerateResult,
} from "@/lib/mastermind/validators";
import type { PipelineResultWithTimeout } from "@/lib/mastermind/pipelineTimeout";

const log = logger.child({ module: "mastermind-route-helpers" });

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

/**
 * Minimal Stockfish-eval shape needed by the helpers. Both routes' raw
 * gameEval inputs satisfy this; we don't depend on the route's full
 * GameEvalInput shape.
 */
export interface MastermindGameEval {
  positions?: Array<{
    lines?: Array<{ cp?: number; mate?: number; depth?: number }>;
  }>;
}

export interface MastermindMoveContext {
  fenBefore: string;
  fenAfter: string;
  moveSan?: string;
  stockfishEval: { cp?: number; mate?: number };
}

export interface MastermindPrepResult {
  /** null when FD source fetch threw — caller falls back to flag-off. */
  dataSources: FetchedDataSources | null;
  category: QuestionCategory;
  classifierConfidence: number;
  moveCtx: MastermindMoveContext;
  prepMs: number;
}

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * Categories where the user's question has no specific move focus. The
 * feature-delta validator is no-op'd via empty featureDelta for these.
 * Per Aayan's 1.C.B.5 directive: "These categories don't have a move
 * focus and forcing the feature-delta validator to evaluate against an
 * arbitrary 'last move' delta is chess nonsense."
 */
export const NON_MOVE_FOCUS_CATEGORIES: ReadonlySet<QuestionCategory> =
  new Set<QuestionCategory>([
    "opponent_prep",
    "improvement_strategy",
    "meta_motivational",
  ]);

// ─────────────────────────────────────────────────────────────────────
// Move-context derivation
// ─────────────────────────────────────────────────────────────────────

function fenAtHalfMove(moveHistory: string[], halfMoveIdx: number): string {
  const g = new Chess();
  for (let i = 0; i < halfMoveIdx; i++) {
    try {
      g.move(moveHistory[i]);
    } catch {
      break;
    }
  }
  return g.fen();
}

/**
 * Derive the Mastermind pipeline's per-turn move context. Category-aware
 * per Stage B 1.C.B.5: opponent_prep / improvement_strategy /
 * meta_motivational return degraded mode (fenBefore === fenAfter),
 * making featureDelta a no-op. Other categories use last-move-as-anchor
 * when moveHistory is non-empty; fen-as-anchor when position-only;
 * starting FEN as fully-degraded fallback.
 */
export function deriveMastermindMoveContext(
  category: QuestionCategory,
  moveHistory: string[] | undefined,
  fen: string | undefined,
  gameEval: MastermindGameEval | undefined,
): MastermindMoveContext {
  if (NON_MOVE_FOCUS_CATEGORIES.has(category)) {
    const anchor =
      fen ||
      (moveHistory && moveHistory.length > 0
        ? fenAtHalfMove(moveHistory, moveHistory.length)
        : STARTING_FEN);
    return {
      fenBefore: anchor,
      fenAfter: anchor,
      stockfishEval: {},
    };
  }

  if (moveHistory && moveHistory.length > 0) {
    const lastIdx = moveHistory.length;
    const fenBefore = fenAtHalfMove(moveHistory, lastIdx - 1);
    const fenAfter = fenAtHalfMove(moveHistory, lastIdx);
    const evalAfter = gameEval?.positions?.[lastIdx];
    return {
      fenBefore,
      fenAfter,
      moveSan: moveHistory[lastIdx - 1],
      stockfishEval: {
        cp: evalAfter?.lines?.[0]?.cp,
        mate: evalAfter?.lines?.[0]?.mate,
      },
    };
  }
  if (fen) {
    const eval0 = gameEval?.positions?.[0];
    return {
      fenBefore: fen,
      fenAfter: fen,
      stockfishEval: {
        cp: eval0?.lines?.[0]?.cp,
        mate: eval0?.lines?.[0]?.mate,
      },
    };
  }
  return {
    fenBefore: STARTING_FEN,
    fenAfter: STARTING_FEN,
    stockfishEval: {},
  };
}

// ─────────────────────────────────────────────────────────────────────
// Pre-LLM prep — classifier + source fetch
// ─────────────────────────────────────────────────────────────────────

export interface PrepareMastermindOpts {
  userMessage: string;
  moveHistory?: string[];
  fen?: string;
  gameEval?: MastermindGameEval;
  pv?: string[];
  playerPerspective: "white" | "black";
  correlationId: string;
  uid: string;
  userName: string;
  opponentUsername?: string;
  opponentPlatform?: "lichess" | "chess.com";
}

/**
 * Classifier-first pre-LLM prep per 1.C.B.5 restructure. Classifier
 * resolves the category, which drives deriveMastermindMoveContext's
 * degraded-vs-anchored choice; then fetchDataSources runs against the
 * right fenBefore/fenAfter. ~200ms latency cost vs the prior fully-
 * concurrent prep — chess correctness is the bigger win.
 *
 * Failure independence: classifier throw → defaults to meta_motivational;
 * fetchDataSources throw (FD failure per §3.2) → `dataSources: null`
 * and route falls back to flag-off for the turn.
 */
export async function prepareMastermindContext(
  opts: PrepareMastermindOpts,
): Promise<MastermindPrepResult> {
  const t0 = Date.now();

  const classifierResult = await classifyQuestion({
    question: opts.userMessage,
  }).catch((err) => {
    log.warn("mastermind classifier failed", {
      err: err instanceof Error ? err.message : String(err),
      correlation_id: opts.correlationId,
    });
    return {
      category: DEFAULT_LOW_CONFIDENCE_CATEGORY,
      confidence: 0,
      rationale: "classifier_call_threw",
    };
  });

  // Boundary contract observability: positions.length should be
  // moveHistory.length + 1 (positions[0] = starting state, positions[N] =
  // after the Nth move). The route silently degrades to the (β) skip path
  // on violation, which is the right protective behavior — but the next
  // such violation should surface in monitoring rather than being
  // invisible. Only check for move-focused categories where positions is
  // actually consumed; NON_MOVE_FOCUS categories degrade by design and
  // would generate noise here. See MASTERMIND_CONTEXT/cleanup_followups.md
  // off-by-one entry.
  if (
    opts.moveHistory &&
    opts.moveHistory.length > 0 &&
    opts.gameEval?.positions &&
    !NON_MOVE_FOCUS_CATEGORIES.has(classifierResult.category) &&
    opts.gameEval.positions.length !== opts.moveHistory.length + 1
  ) {
    log.warn(
      "gameEval positions/moveHistory shape mismatch — see MASTERMIND_CONTEXT/cleanup_followups.md off-by-one entry",
      {
        expected_positions_length: opts.moveHistory.length + 1,
        actual_positions_length: opts.gameEval.positions.length,
        move_history_length: opts.moveHistory.length,
        category: classifierResult.category,
        correlation_id: opts.correlationId,
      },
    );
  }

  const moveCtx = deriveMastermindMoveContext(
    classifierResult.category,
    opts.moveHistory,
    opts.fen,
    opts.gameEval,
  );

  const dataSources = await fetchDataSources({
    fenBefore: moveCtx.fenBefore,
    fenAfter: moveCtx.fenAfter,
    pv: opts.pv,
    moveHistory: opts.moveHistory,
    playerPerspective: opts.playerPerspective,
    correlationId: opts.correlationId,
    uid: opts.uid,
    userName: opts.userName,
    opponentUsername: opts.opponentUsername,
    opponentPlatform: opts.opponentPlatform,
  })
    .then((ds) => ds as FetchedDataSources | null)
    .catch((err) => {
      log.warn(
        "mastermind fetchDataSources failed (likely invalid FEN); flag-off fallback for this turn",
        {
          err: err instanceof Error ? err.message : String(err),
          correlation_id: opts.correlationId,
        },
      );
      return null;
    });

  return {
    dataSources,
    category: classifierResult.category,
    classifierConfidence: classifierResult.confidence,
    moveCtx,
    prepMs: Date.now() - t0,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Pipeline telemetry forwarding (§3.7.9 insertion F)
// ─────────────────────────────────────────────────────────────────────

export interface ForwardTelemetryArgs {
  pipelineResult: RegenerateResult | PipelineResultWithTimeout;
  dataSources: FetchedDataSources;
  category: QuestionCategory;
  routeKind: "/api/enhanced-analysis" | "/api/chat";
  userId: string | undefined;
  sessionId: string | undefined;
  responseId: string;
}

/**
 * Build RouteContext + compute citationRate + forward to validatorTelemetry.
 * Maps PipelineResultWithTimeout.timedOut=true → RouteContext.finalOutcome=
 * "pipeline_timed_out" per §6.1 + §3.7.10 B resolution.
 */
export function forwardPipelineTelemetryForRoute(
  args: ForwardTelemetryArgs,
): void {
  const userHistoryGameCount = args.dataSources.userHistory?.games.length ?? null;

  const citationRate = computeCitationRate({
    category: args.category,
    validatorResults: [
      {
        issues: args.pipelineResult.cumulativeIssues,
        passed: args.pipelineResult.finalOutcome !== "fallback_used",
        telemetry: args.pipelineResult.telemetry,
        costUsd: args.pipelineResult.totalCostUsd,
      },
    ],
    opportunities: {
      scout: args.dataSources.scout
        ? countScoutOpportunities(
            args.dataSources.scout.scout,
            args.dataSources.scout.collisions,
          )
        : undefined,
      userHistory: args.dataSources.userHistory
        ? countUserHistoryOpportunities(
            args.dataSources.userHistory.games,
            args.dataSources.userHistory.userName,
          )
        : undefined,
    },
  });

  const timedOut =
    "timedOut" in args.pipelineResult && args.pipelineResult.timedOut === true;

  const ctx: RouteContext = {
    route: args.routeKind,
    userId: args.userId,
    sessionId: args.sessionId,
    responseId: args.responseId,
    userTier: "free",
    category: args.category,
    finalOutcome: timedOut ? "pipeline_timed_out" : args.pipelineResult.finalOutcome,
    retryCount: args.pipelineResult.retryCount,
    totalCostUsd: args.pipelineResult.totalCostUsd,
  };

  forwardTelemetry(args.pipelineResult.telemetry, ctx, {
    citationRate,
    userHistoryGameCount,
  });
}
