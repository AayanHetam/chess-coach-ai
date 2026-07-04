import { CallLLMOptions, LLMResult } from "@/lib/llmProvider";
import { PositionFeatureDelta } from "../featureDelta";
import { RoleChange } from "../pieceRoles";
import { ThreatNode } from "../threatTree";
import { validateEvalClaim, ParserCall } from "./evalClaim";
import { validateFeatureDeltaCitations } from "./featureDeltaCitation";
import { validateScoutCitation } from "./scoutCitation";
import { validateUserHistoryCitation } from "./userHistoryCitation";
import { validateUserVisibility } from "./userVisibility";
import { validatePositionalClaim } from "./positionalClaim";
import { validateMateInN } from "./mateInN";
import { validateMaterialWin } from "./materialWin";
import { validateRelationalClaim } from "./relationalClaim";
import { regenerateUntilValid, RegenerateResult } from "./regenerate";
import { buildFallbackResponse, CoachTone } from "./fallback";
import { createTelemetryEvent } from "./telemetry";
import { ValidatorResult, TelemetryEvent, ScoutTimeClass } from "./types";
import type { ConfidenceLevel } from "@/lib/grounding/voter";
import type { PositionConfidence } from "@/lib/grounding/positionConfidence";
import type { ScoutAnalytics, Collisions } from "@/types/scout";
import type { UserHistoryGame } from "../userHistoryAggregates";
import type { QuestionCategory } from "../categorization/categoryClassifier";

export { validateEvalClaim } from "./evalClaim";
export type { EvalClaimOpts, ParserCall } from "./evalClaim";
export { validateFeatureDeltaCitations } from "./featureDeltaCitation";
export type { FeatureCitationOpts } from "./featureDeltaCitation";
export { validateScoutCitation, countScoutOpportunities, SCOUT_TOLERANCE } from "./scoutCitation";
export type { ScoutCitationOpts } from "./scoutCitation";
export {
  validateUserHistoryCitation,
  countUserHistoryOpportunities,
  resolveDateRange,
  hoursPlayedTolerance,
  USER_HISTORY_TOLERANCE,
} from "./userHistoryCitation";
export type { UserHistoryCitationOpts } from "./userHistoryCitation";
// Stage 9 — claim-class validators (PR_STAGE9_VALIDATORS_PLAN.md)
export { validateUserVisibility } from "./userVisibility";
export type { UserVisibilityOpts } from "./userVisibility";
export { validatePositionalClaim } from "./positionalClaim";
export type { PositionalClaimOpts } from "./positionalClaim";
export { validateMateInN } from "./mateInN";
export type { MateInNOpts } from "./mateInN";
export { validateMaterialWin } from "./materialWin";
export type { MaterialWinOpts } from "./materialWin";
export { validateRelationalClaim, defaultRelationalParserCall } from "./relationalClaim";
export type { RelationalClaimOpts } from "./relationalClaim";
export { regenerateUntilValid, buildRetryInstruction } from "./regenerate";
export type { RegenerateOpts, RegenerateResult } from "./regenerate";
export { buildFallbackResponse } from "./fallback";
export type { CoachTone, FallbackOpts } from "./fallback";
export * from "./qualitativeBands";
export * from "./types";
export * from "./telemetry";
export * from "./parserPrompts";

/**
 * Optional secondary data sources for the additional citation validators
 * (Stage A.6 / A.8). Each source is independent — present sources trigger
 * their corresponding validator inside the pipeline's `validate` closure;
 * absent sources skip the validator entirely. When `dataSources` itself is
 * undefined, the pipeline produces byte-identical output to the pre-Stage-A.9
 * path (PR 1.B's eval + feature-citation only). See PR_1C_PIPELINE_DATA_SOURCES_PLAN.md
 * §2.3 preservation contract.
 *
 * Slot for jhamtani reserved in the type; not consumed in PR 1.C — PR 1.D
 * wires the corresponding validator. Slot for featureDelta opportunity
 * counter not added (see PR_1C_PLAN.md §11.7).
 */
export interface ValidatorDataSources {
  scout?: {
    scout: ScoutAnalytics;
    collisions?: Collisions;
    opponentUsername: string;
    primaryTimeClass?: ScoutTimeClass;
  };
  userHistory?: {
    games: UserHistoryGame[];
    userName: string;
    nowMs?: number;
  };
  // Forward-compat: jhamtani slot reserved per PR_1C_PLAN.md §6.4 deferral
  // to PR 1.D. The validator doesn't exist yet; field is typed to allow
  // future use without further pipeline edits.
  jhamtani?: unknown;
}

/**
 * Categories where the eval-claim and feature-citation validators apply
 * meaningfully (2026-05-26 position-anchored validator scope). These
 * validators check claims against a SINGLE computed position (current
 * stockfishEval + featureDelta between the move-before / move-after FENs).
 *
 * `position_analysis` is the only category where that single-position
 * frame matches the LLM's expected prose shape ("analyze this position").
 *
 * For other move-focus categories — notably `game_review` — the LLM
 * naturally discusses MULTIPLE historical positions ("after move 23 you
 * were winning, by move 35 it was equal"). The eval validator interprets
 * every band claim as referring to the current position, so historical
 * claims produce systematic false-positive eval_mismatch_qualitative
 * fires. Likewise feature_citation_unsupported fires when the LLM cites
 * a feature change from move 23 against the move-46 computed delta.
 *
 * Production rollback (2026-05-26): on a 46-move "analyze my game" query,
 * the eval + feature validators fired twice in succession, hitting
 * regenerate's maxRetries and substituting the deterministic
 * buildFallbackResponse template for real LLM prose. See
 * MASTERMIND_CONTEXT/cleanup_followups.md.
 *
 * Long-term fix: per-claim position anchoring (parser extracts move-number
 * tags per claim → validator only checks claims about the current move).
 * Tracked as a follow-up; this constant is the short-term safety scope.
 *
 * Scout + userHistory validators continue to run for ALL categories —
 * they check claims against opponent/player history data, not position
 * state, so multi-position prose doesn't break them.
 */
export const POSITION_ANCHORED_VALIDATOR_CATEGORIES: ReadonlySet<QuestionCategory> =
  new Set<QuestionCategory>(["position_analysis"]);

export interface PipelineOpts {
  initialRequest: CallLLMOptions;
  llmResponse?: string;
  stockfishEval: { cp?: number; mate?: number };
  featureDelta: PositionFeatureDelta;
  pieceRoleDiff: RoleChange[];
  threatTree?: ThreatNode[];
  playerPerspective: "white" | "black";
  fen?: string;
  moveSan?: string;
  correlationId: string;
  coachTone?: CoachTone;
  maxRetries?: number;
  parseCall?: ParserCall;
  callLLM?: (opts: CallLLMOptions) => Promise<LLMResult>;
  /**
   * Optional secondary data sources. When undefined, the pipeline behaves
   * exactly as PR 1.B (eval + feature-citation only). See ValidatorDataSources.
   */
  dataSources?: ValidatorDataSources;
  /**
   * Optional AbortSignal from withPipelineTimeout (2026-05-25 fix-orphan-
   * pipeline-cancellation). When provided, the pipeline propagates it to
   * inner LLM/fetch calls so they unwind cleanly on timeout. Plumbing lands
   * in Commit 2; this commit just accepts the field at the type boundary
   * so route callsites can pass it without tsc errors.
   */
  signal?: AbortSignal;
  /**
   * Optional question category from the classifier (2026-05-26
   * position-anchored validator scope). When provided and NOT in
   * POSITION_ANCHORED_VALIDATOR_CATEGORIES, the eval-claim and
   * feature-citation validators skip (emitting a single skip telemetry
   * event each). When undefined, both validators run unconditionally —
   * preserves byte-identical behavior for all existing callers + tests
   * that pre-date this field.
   */
  category?: QuestionCategory;
  /**
   * Stage 9 — per-position voter snapshot (PR_STAGE9_VALIDATORS_PLAN.md).
   *
   * The four claim-class validators (user_visibility, positional_claim,
   * mate_in_n, material_win) consume this single snapshot. The route is
   * responsible for picking the one snapshot that represents "the current
   * position" — for `position_analysis` requests this is straightforward
   * (the focused move's voter result); for `game_review` the route should
   * pass `voterSnapshot: undefined` so the four validators no-op (a
   * multi-position response can't be validated against a single snapshot
   * without false positives — see plan §"Category gating").
   *
   * When undefined, all four Stage 9 validators short-circuit to null
   * (no issues, no telemetry). Preserves byte-identical behavior for all
   * callers that pre-date this field.
   */
  voterSnapshot?: VoterSnapshot;
  /**
   * Lever 2 relational-claim validator (Phase 2, task 10 position-anchoring fix).
   *
   * When true, the relational-claim validator runs on the coach's output,
   * extracting and verifying attack/capture/defense/pin claims against the
   * chess.js board oracle. Any "contradicted" claim triggers regeneration.
   *
   * NOT gated by runPositionValidators — the relational validator works for
   * both position_analysis and game_review. It uses opts.fen (the primary
   * position anchor) plus opts.relationalFenMap for ply-indexed multi-position
   * responses: claims with a moveRefPly resolve via fenMap[ply] ?? fen so
   * historical references are checked against the board state they describe.
   *
   * When undefined/false, the validator is a no-op. Preserves byte-identical
   * behavior for all existing callers that pre-date this field.
   */
  enableRelationalValidator?: boolean;
  /**
   * Optional ply→FEN map for multi-position responses (game_review).
   * Forwarded to validateRelationalClaim so claims tagged with moveRefPly
   * are verified against the correct board state, not the final FEN.
   * Mirrors the relational scorer's Phase 0.5 fenMap approach.
   * Ignored when enableRelationalValidator is false/absent.
   */
  relationalFenMap?: Record<number, string>;
}

/**
 * Stage 9 — what the four claim-class validators need from the voter to
 * enforce suppression rules against the LLM response.
 *
 * This is intentionally NOT the full VoterResult — it's the per-position
 * subset the validators reference. The route composes this from the same
 * inputs that built compileVoterResult upstream.
 */
export interface VoterSnapshot {
  /** Voter confidence per claim class. Drives all four validator decisions. */
  confidence: {
    user_visibility: ConfidenceLevel;
    positional_plan: ConfidenceLevel;
    mate_in_n: ConfidenceLevel;
    material_win: ConfidenceLevel;
  };
  /** maiaResult.prob_plays_best when Maia consulted; null otherwise. */
  maiaProb: number | null;
  /** User's rating for Maia threshold tuning; null when unknown. */
  userRating: number | null;
  /** Stockfish eval cp, White-positive. */
  sfCp: number | null;
  /** Stockfish forced-mate distance (positive = mate). */
  sfMate: number | null;
  /** Lc0 eval cp, same perspective as sfCp. null when not consulted. */
  lc0Cp: number | null;
  /** Syzygy distance-to-mate. null when not in tablebase range. */
  syzygyDtm: number | null;
  /**
   * Verification-confidence for the position (engine-verified vs judgment).
   * Optional for back-compat with pre-CH callers/test literals; the route's
   * snapshot builders always populate it. Consumed by CH-2 (single-regen
   * decision) and CH-3 (user-facing confidence spectrum).
   */
  positionConfidence?: PositionConfidence;
}

/**
 * Composed validation pipeline. Runs eval-claim + feature-citation validators
 * against an LLM response; on failure, invokes regenerate with same-tier retry
 * up to maxRetries; on retry exhaustion, returns the template-only fallback.
 *
 * Stage A.9 (2026-05-18): optional `dataSources` field adds scout + user-history
 * validators conditionally. The PR 1.B contract — byte-identical output when
 * `dataSources` is undefined — is preserved and enforced via pipeline.test.ts's
 * preservation-contract test. See PR_1C_PIPELINE_DATA_SOURCES_PLAN.md §2.3.
 *
 * Library-only: PR 1.C's route handler injects parser and callLLM concretely
 * and forwards the returned telemetry to the logger. Validators never call
 * the logger themselves — see PR_1B_PLAN.md §9.1.
 */
export async function runValidationPipeline(opts: PipelineOpts): Promise<RegenerateResult> {
  const validate = async (response: string): Promise<ValidatorResult> => {
    // Validators run in parallel (2026-05-26 parallel-validator-pipeline):
    // each is independent — reads its own slice of opts (stockfishEval,
    // featureDelta, dataSources.scout, dataSources.userHistory) and emits
    // its own ValidatorResult. Sequential awaits added 12-32s of latency
    // (3-8s × 4 parser calls) on top of the flagship coach call, pushing
    // pipeline total past Vercel's 60s maxDuration on heavy game_review
    // queries. Parallel dispatch cuts validator-chain latency to the
    // slowest single call (~3-8s).
    //
    // Output order is fixed (eval → feature → scout → userHistory) by
    // concatenating in source order regardless of completion order, so
    // the preservation contract (pipeline.test.ts:199-232) holds.
    //
    // Conditional validators (scout, userHistory) resolve to null when
    // their dataSource isn't present — same shape the sequential path
    // produced — so the concat logic below is unchanged.
    //
    // Position-anchored validator scope (2026-05-26 fix-game-review-
    // false-positives): when a category is supplied AND it's not in
    // POSITION_ANCHORED_VALIDATOR_CATEGORIES, the eval and featureDelta
    // validators short-circuit with a single "skip_non_anchored_category"
    // telemetry event each and no issues. The parser calls aren't made
    // (cost = 0, latency = 0). This prevents systematic false-positive
    // rejections on multi-position discussion (game_review) and on
    // no-position-focus prose (concept_explanation, opponent_prep,
    // improvement_strategy, meta_motivational). When category is
    // undefined, both validators run unconditionally — preserves
    // byte-identical behavior for existing callers and tests pre-dating
    // this field.
    const runPositionValidators =
      opts.category === undefined ||
      POSITION_ANCHORED_VALIDATOR_CATEGORIES.has(opts.category);

    const skipContext = {
      fen: opts.fen,
      move_san: opts.moveSan,
      player_perspective: opts.playerPerspective,
      correlation_id: opts.correlationId,
    } as const;

    const evalPromise: Promise<ValidatorResult> = runPositionValidators
      ? validateEvalClaim({
          llmResponse: response,
          stockfishEval: opts.stockfishEval,
          playerPerspective: opts.playerPerspective,
          fen: opts.fen,
          moveSan: opts.moveSan,
          correlationId: opts.correlationId,
          parseCall: opts.parseCall,
          signal: opts.signal,
        })
      : Promise.resolve({
          issues: [],
          passed: true,
          telemetry: [
            createTelemetryEvent({
              check_name: "eval_claim",
              fire_reason: "skip_non_anchored_category",
              expected: { category: opts.category },
              context: skipContext,
            }),
          ],
          costUsd: 0,
        });

    const citationPromise: Promise<ValidatorResult> = runPositionValidators
      ? validateFeatureDeltaCitations({
          llmResponse: response,
          featureDelta: opts.featureDelta,
          pieceRoleDiff: opts.pieceRoleDiff,
          threatTree: opts.threatTree,
          playerPerspective: opts.playerPerspective,
          fen: opts.fen,
          moveSan: opts.moveSan,
          correlationId: opts.correlationId,
          parseCall: opts.parseCall,
          signal: opts.signal,
        })
      : Promise.resolve({
          issues: [],
          passed: true,
          telemetry: [
            createTelemetryEvent({
              check_name: "feature_citation",
              fire_reason: "skip_non_anchored_category",
              expected: { category: opts.category },
              context: skipContext,
            }),
          ],
          costUsd: 0,
        });

    const scoutPromise: Promise<ValidatorResult | null> = opts.dataSources?.scout
      ? validateScoutCitation({
          llmResponse: response,
          scout: opts.dataSources.scout.scout,
          collisions: opts.dataSources.scout.collisions,
          opponentUsername: opts.dataSources.scout.opponentUsername,
          primaryTimeClass: opts.dataSources.scout.primaryTimeClass,
          correlationId: opts.correlationId,
          parseCall: opts.parseCall,
          signal: opts.signal,
        })
      : Promise.resolve(null);

    const userHistoryPromise: Promise<ValidatorResult | null> = opts.dataSources?.userHistory
      ? validateUserHistoryCitation({
          llmResponse: response,
          games: opts.dataSources.userHistory.games,
          userName: opts.dataSources.userHistory.userName,
          nowMs: opts.dataSources.userHistory.nowMs,
          correlationId: opts.correlationId,
          parseCall: opts.parseCall,
          signal: opts.signal,
        })
      : Promise.resolve(null);

    // ─── Stage 9: claim-class validators ────────────────────────────────
    // Four pure string-scan validators that enforce the suppression rules
    // the voter emits into the prompt. All four run in parallel; each
    // short-circuits to null when voterSnapshot is undefined (preservation
    // contract: callers that pre-date Stage 9 see byte-identical output).
    //
    // Category gating: same scope as the existing eval-claim and
    // feature-citation validators (POSITION_ANCHORED_VALIDATOR_CATEGORIES).
    // A non-position-focused response (game_review's multi-position prose,
    // concept_explanation's general teaching prose) can't be validated against
    // a single voter snapshot without systematic false positives.
    //
    // We gate on `runPositionValidators` here rather than relying solely on the
    // route to pass voterSnapshot: undefined. The route's snapshot is built
    // whenever a focused move exists (moveCtx.moveSan), which is true for
    // category=concept_explanation too (it is NOT in NON_MOVE_FOCUS_CATEGORIES)
    // — so a route-only contract would let the four Stage 9 validators enforce
    // against concept_explanation. Folding the category scope into `snap`
    // guarantees the documented "same scope as eval/citation" invariant for
    // every current and future caller. (category===undefined keeps the snapshot
    // — byte-identical for pre-Stage-9 callers/tests.)
    const snap = runPositionValidators ? opts.voterSnapshot : undefined;
    const stage9Context = {
      fen: opts.fen,
      moveSan: opts.moveSan,
      playerPerspective: opts.playerPerspective,
      correlationId: opts.correlationId,
    } as const;

    const userVisibilityPromise: Promise<ValidatorResult | null> = snap
      ? Promise.resolve(validateUserVisibility({
          llmResponse: response,
          maiaProb: snap.maiaProb,
          userRating: snap.userRating,
          ...stage9Context,
        }))
      : Promise.resolve(null);

    const positionalClaimPromise: Promise<ValidatorResult | null> = snap
      ? Promise.resolve(validatePositionalClaim({
          llmResponse: response,
          positional_plan: snap.confidence.positional_plan,
          sfCp: snap.sfCp,
          lc0Cp: snap.lc0Cp,
          ...stage9Context,
        }))
      : Promise.resolve(null);

    const mateInNPromise: Promise<ValidatorResult | null> = snap
      ? Promise.resolve(validateMateInN({
          llmResponse: response,
          syzygyDtm: snap.syzygyDtm,
          sfMate: snap.sfMate,
          mate_in_n: snap.confidence.mate_in_n,
          ...stage9Context,
        }))
      : Promise.resolve(null);

    const materialWinPromise: Promise<ValidatorResult | null> = snap
      ? Promise.resolve(validateMaterialWin({
          llmResponse: response,
          material_win: snap.confidence.material_win,
          sfCp: snap.sfCp,
          ...stage9Context,
        }))
      : Promise.resolve(null);

    // ─── Lever 2: relational-claim validator (Phase 2, task 10 fix) ────
    // NOT gated by runPositionValidators — the relational validator works
    // for game_review as well as position_analysis. It receives the primary
    // FEN (opts.fen) plus an optional fenMap (opts.relationalFenMap) so
    // per-claim ply anchoring is applied: claims with a moveRefPly resolve
    // to fenMap[ply] ?? fen before oracle verification.
    //
    // Preserves byte-identical behavior when enableRelationalValidator is
    // absent/false — all existing callers and tests are unaffected.
    const relationalClaimPromise: Promise<ValidatorResult | null> =
      opts.enableRelationalValidator && opts.fen
        ? validateRelationalClaim({
            llmResponse: response,
            fen: opts.fen,
            fenMap: opts.relationalFenMap,
            correlationId: opts.correlationId,
            parseCall: opts.parseCall,
            signal: opts.signal,
          })
        : Promise.resolve(null);

    const [
      evalResult,
      citationResult,
      scoutResult,
      userHistoryResult,
      userVisResult,
      positionalResult,
      mateResult,
      materialResult,
      relationalResult,
    ] = await Promise.all([
      evalPromise,
      citationPromise,
      scoutPromise,
      userHistoryPromise,
      userVisibilityPromise,
      positionalClaimPromise,
      mateInNPromise,
      materialWinPromise,
      relationalClaimPromise,
    ]);

    const issues = [
      ...evalResult.issues,
      ...citationResult.issues,
      ...(scoutResult?.issues ?? []),
      ...(userHistoryResult?.issues ?? []),
      ...(userVisResult?.issues ?? []),
      ...(positionalResult?.issues ?? []),
      ...(mateResult?.issues ?? []),
      ...(materialResult?.issues ?? []),
      ...(relationalResult?.issues ?? []),
    ];
    const telemetry: TelemetryEvent[] = [
      ...evalResult.telemetry,
      ...citationResult.telemetry,
      ...(scoutResult?.telemetry ?? []),
      ...(userHistoryResult?.telemetry ?? []),
      ...(userVisResult?.telemetry ?? []),
      ...(positionalResult?.telemetry ?? []),
      ...(mateResult?.telemetry ?? []),
      ...(materialResult?.telemetry ?? []),
      ...(relationalResult?.telemetry ?? []),
    ];
    const costUsd =
      evalResult.costUsd +
      citationResult.costUsd +
      (scoutResult?.costUsd ?? 0) +
      (userHistoryResult?.costUsd ?? 0) +
      (userVisResult?.costUsd ?? 0) +
      (positionalResult?.costUsd ?? 0) +
      (mateResult?.costUsd ?? 0) +
      (materialResult?.costUsd ?? 0) +
      (relationalResult?.costUsd ?? 0);
    return {
      issues,
      passed: issues.length === 0,
      telemetry,
      costUsd,
    };
  };

  const buildFallback = async () =>
    buildFallbackResponse({
      stockfishEval: opts.stockfishEval,
      featureDelta: opts.featureDelta,
      pieceRoleDiff: opts.pieceRoleDiff,
      threatTree: opts.threatTree,
      playerPerspective: opts.playerPerspective,
      moveSan: opts.moveSan,
      coachTone: opts.coachTone,
    });

  return regenerateUntilValid({
    initialRequest: opts.initialRequest,
    validate,
    buildFallback,
    maxRetries: opts.maxRetries,
    callLLM: opts.callLLM,
    correlationId: opts.correlationId,
    context: {
      fen: opts.fen,
      move_san: opts.moveSan,
      player_perspective: opts.playerPerspective,
    },
    signal: opts.signal,
  });
}
