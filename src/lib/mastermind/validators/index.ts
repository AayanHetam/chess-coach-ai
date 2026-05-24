import { CallLLMOptions, LLMResult } from "@/lib/llmProvider";
import { PositionFeatureDelta } from "../featureDelta";
import { RoleChange } from "../pieceRoles";
import { ThreatNode } from "../threatTree";
import { validateEvalClaim, ParserCall } from "./evalClaim";
import { validateFeatureDeltaCitations } from "./featureDeltaCitation";
import { validateScoutCitation } from "./scoutCitation";
import { validateUserHistoryCitation } from "./userHistoryCitation";
import { regenerateUntilValid, RegenerateResult } from "./regenerate";
import { buildFallbackResponse, CoachTone } from "./fallback";
import { ValidatorResult, TelemetryEvent, ScoutTimeClass } from "./types";
import type { ScoutAnalytics, Collisions } from "@/types/scout";
import type { UserHistoryGame } from "../userHistoryAggregates";

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
    const evalResult = await validateEvalClaim({
      llmResponse: response,
      stockfishEval: opts.stockfishEval,
      playerPerspective: opts.playerPerspective,
      fen: opts.fen,
      moveSan: opts.moveSan,
      correlationId: opts.correlationId,
      parseCall: opts.parseCall,
    });
    const citationResult = await validateFeatureDeltaCitations({
      llmResponse: response,
      featureDelta: opts.featureDelta,
      pieceRoleDiff: opts.pieceRoleDiff,
      threatTree: opts.threatTree,
      playerPerspective: opts.playerPerspective,
      fen: opts.fen,
      moveSan: opts.moveSan,
      correlationId: opts.correlationId,
      parseCall: opts.parseCall,
    });

    // Stage A.9 conditional dispatch — order matters for telemetry sequence.
    // scout runs before user-history per the established ScoutCitation →
    // UserHistoryCitation order. Sequential await per Stage A.9 T1 default.
    let scoutResult: ValidatorResult | null = null;
    if (opts.dataSources?.scout) {
      scoutResult = await validateScoutCitation({
        llmResponse: response,
        scout: opts.dataSources.scout.scout,
        collisions: opts.dataSources.scout.collisions,
        opponentUsername: opts.dataSources.scout.opponentUsername,
        primaryTimeClass: opts.dataSources.scout.primaryTimeClass,
        correlationId: opts.correlationId,
        parseCall: opts.parseCall,
      });
    }

    let userHistoryResult: ValidatorResult | null = null;
    if (opts.dataSources?.userHistory) {
      userHistoryResult = await validateUserHistoryCitation({
        llmResponse: response,
        games: opts.dataSources.userHistory.games,
        userName: opts.dataSources.userHistory.userName,
        nowMs: opts.dataSources.userHistory.nowMs,
        correlationId: opts.correlationId,
        parseCall: opts.parseCall,
      });
    }

    const issues = [
      ...evalResult.issues,
      ...citationResult.issues,
      ...(scoutResult?.issues ?? []),
      ...(userHistoryResult?.issues ?? []),
    ];
    const telemetry: TelemetryEvent[] = [
      ...evalResult.telemetry,
      ...citationResult.telemetry,
      ...(scoutResult?.telemetry ?? []),
      ...(userHistoryResult?.telemetry ?? []),
    ];
    const costUsd =
      evalResult.costUsd +
      citationResult.costUsd +
      (scoutResult?.costUsd ?? 0) +
      (userHistoryResult?.costUsd ?? 0);
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
  });
}
