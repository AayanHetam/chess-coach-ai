import { CallLLMOptions, LLMResult } from "@/lib/llmProvider";
import { PositionFeatureDelta } from "../featureDelta";
import { RoleChange } from "../pieceRoles";
import { ThreatNode } from "../threatTree";
import { validateEvalClaim, ParserCall } from "./evalClaim";
import { validateFeatureDeltaCitations } from "./featureDeltaCitation";
import { regenerateUntilValid, RegenerateResult } from "./regenerate";
import { buildFallbackResponse, CoachTone } from "./fallback";
import { ValidatorResult, TelemetryEvent } from "./types";

export { validateEvalClaim } from "./evalClaim";
export type { EvalClaimOpts, ParserCall } from "./evalClaim";
export { validateFeatureDeltaCitations } from "./featureDeltaCitation";
export type { FeatureCitationOpts } from "./featureDeltaCitation";
export { regenerateUntilValid, buildRetryInstruction } from "./regenerate";
export type { RegenerateOpts, RegenerateResult } from "./regenerate";
export { buildFallbackResponse } from "./fallback";
export type { CoachTone, FallbackOpts } from "./fallback";
export * from "./qualitativeBands";
export * from "./types";
export * from "./telemetry";
export * from "./parserPrompts";

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
}

/**
 * Composed validation pipeline. Runs eval-claim + feature-citation validators
 * against an LLM response; on failure, invokes regenerate with same-tier retry
 * up to maxRetries; on retry exhaustion, returns the template-only fallback.
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
    const issues = [...evalResult.issues, ...citationResult.issues];
    const telemetry: TelemetryEvent[] = [...evalResult.telemetry, ...citationResult.telemetry];
    return {
      issues,
      passed: issues.length === 0,
      telemetry,
      costUsd: evalResult.costUsd + citationResult.costUsd,
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
