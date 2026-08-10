/**
 * Contract-mode serving (PR-CI-4) — the single surface route.ts calls when a
 * request's classified category is listed in CONTRACT_CATEGORIES and a
 * CoachContract exists.
 *
 * One flagship verbalizer-4.0 call, streamed through the enforced block gate
 * (enforcedStream.ts): prefix greeting streams immediately, cards burst
 * whole after their referee/ladder pass, [F:] citations never reach the
 * client, headers are server-authoritative.
 *
 * CACHE (plan risk #6): reads/writes ONLY `c4.0|`-prefixed keys
 * (generateContractCacheKey). Legacy keys are never touched. A review is
 * cacheable only when every card shipped VERIFIED content (pass /
 * sentence_drop / edited / regenerated) and the stream closed cleanly —
 * template cards and footnoted raw are degraded artifacts, never cached
 * (same posture as the route's "never cache non-answers" rule).
 *
 * DEADLINE (tech-lead decision #4): ladder LLM stages fit inside
 * maxDuration 60s via requestStartMs + 55s (5s margin).
 */
import { callLLMStream as defaultCallLLMStream } from "@/lib/llmProvider";
import type { CallLLMOptions, LLMMessage, LLMResult, LLMStreamEvent } from "@/lib/llmProvider";
import {
  buildVerbalizerUserTurn,
  getVerbalizerSystemPromptParts,
  maxTokensForInsights,
  selectCardInsights,
  VERBALIZER_PROMPT_VERSION,
} from "@/lib/prompts/verbalizerPrompt";
import type { CoachChatPromptInput } from "@/lib/prompts/coachChatPrompt";
import {
  generateContractCacheKey,
  getCachedResponse,
  setCachedResponse,
} from "@/lib/responseCache";
import { getContractEnv } from "@/env";
import { createEnforcedContractStream } from "./enforcedStream";
import type { EnforcedStreamSummary } from "./enforcedStream";
import type { LadderDeps, LadderStage } from "./ladder";
import type { ArmingTable } from "./armingConfig";
import { CONTRACT_VERSION } from "./types";
import type { CoachContract } from "./types";

/** Route budget for the whole enforced review (maxDuration 60s − 5s). */
export const CONTRACT_DEADLINE_BUDGET_MS = 55_000;

/** Stages whose shipped content is referee-verified (cacheable). */
const VERIFIED_STAGES: ReadonlySet<LadderStage> = new Set<LadderStage>([
  "pass",
  "sentence_drop",
  "edited",
  "regenerated",
]);

/** The additive done.metadata.contract payload (tech-lead decision #5). */
export interface ContractDoneMetadata {
  contractId: string;
  contractVersion: string;
  verbalizerPromptVersion: string;
  refereeMode: string;
  refereeOutcomes: Array<{
    factIdPrefix: string;
    stage: LadderStage;
    errorsInitial: number;
    warnsInitial: number;
  }>;
  citedFactIds: string[];
  citationCoverage: number | null;
  ladderDistribution: Record<LadderStage, number>;
  cached: boolean;
}

export interface ContractServingArgs {
  contract: CoachContract;
  category: string;
  /** SSE text emitter — receives client-bound text deltas. */
  emitText: (delta: string) => void;
  messageText: string | undefined;
  /** Prior user/assistant turns (conversation history pass-through). */
  priorMessages: LLMMessage[];
  promptInput: CoachChatPromptInput;
  correlationId: string;
  uid: string;
  requestStartMs: number;
  cacheInputs: {
    currentFen: string;
    skillLevel: string;
    userMessage: string;
    personaSignature: string;
    moveHistory: string[] | undefined;
  };
  /** Test seams. */
  callLLMStreamImpl?: (opts: CallLLMOptions) => AsyncGenerator<LLMStreamEvent, void, void>;
  ladderDeps?: LadderDeps;
  armingTable?: ArmingTable;
}

export interface ContractServingResult {
  analysisContent: string;
  cached: boolean;
  cacheable: boolean;
  validationIssues: number;
  contractMetadata: ContractDoneMetadata;
  summary: EnforcedStreamSummary | null;
  llmResult: LLMResult | null;
}

export async function serveContractAnalysis(
  args: ContractServingArgs,
): Promise<ContractServingResult> {
  const env = getContractEnv();
  const { contract } = args;
  const cacheKey = generateContractCacheKey(
    args.cacheInputs.currentFen,
    args.cacheInputs.skillLevel,
    args.cacheInputs.userMessage,
    args.cacheInputs.personaSignature,
    args.cacheInputs.moveHistory,
  );

  const cachedText = getCachedResponse(cacheKey);
  if (cachedText) {
    args.emitText(cachedText);
    return {
      analysisContent: cachedText,
      cached: true,
      cacheable: false,
      validationIssues: 0,
      contractMetadata: {
        contractId: contract.contractId,
        contractVersion: CONTRACT_VERSION,
        verbalizerPromptVersion: VERBALIZER_PROMPT_VERSION,
        refereeMode: env.refereeMode,
        refereeOutcomes: [],
        citedFactIds: [],
        citationCoverage: null,
        ladderDistribution: {
          pass: 0,
          sentence_drop: 0,
          edited: 0,
          regenerated: 0,
          templated: 0,
          passthrough_footnoted: 0,
        },
        cached: true,
      },
      summary: null,
      llmResult: null,
    };
  }

  const systemParts = getVerbalizerSystemPromptParts(args.promptInput);
  const userTurn = buildVerbalizerUserTurn({
    contract,
    messageText: args.messageText,
  });
  const cardCount = selectCardInsights(contract).length;

  const stream = createEnforcedContractStream({
    contract,
    emit: args.emitText,
    correlationId: args.correlationId,
    refereeMode: env.refereeMode,
    citationGranularity: env.citationGranularity,
    deadlineAtMs: args.requestStartMs + CONTRACT_DEADLINE_BUDGET_MS,
    regenSystem: systemParts,
    armingTable: args.armingTable,
    deps: args.ladderDeps,
  });

  const callLLMStream = args.callLLMStreamImpl ?? defaultCallLLMStream;
  let llmResult: LLMResult | null = null;
  try {
    for await (const evt of callLLMStream({
      tier: "flagship",
      system: systemParts.stable,
      systemSuffix: systemParts.perUser,
      messages: [...args.priorMessages, { role: "user", content: userTurn }],
      temperature: 0.7,
      maxTokens: maxTokensForInsights(cardCount),
      cacheSystem: true,
      capture: {
        feature: "enhanced-analysis",
        uid: args.uid,
        requestId: args.correlationId,
        promptVersion: VERBALIZER_PROMPT_VERSION,
        props: { branch: "stream-contract-enforced", category: args.category },
      },
    })) {
      if (evt.type === "text") {
        stream.push(evt.delta);
      } else {
        llmResult = evt.result;
      }
    }
  } catch (err) {
    // Fail-visible: drain what was already held (never blank), then let the
    // route's uniform error handling take over (same contract as legacy).
    await stream.end();
    throw err;
  }

  const summary = await stream.end();
  const analysisContent = summary.finalText || "No analysis generated.";

  const allVerified =
    summary.cards.length > 0 &&
    summary.cards.every((c) => VERIFIED_STAGES.has(c.stage)) &&
    !summary.unclosedBlock &&
    summary.unanchoredBlocks === 0;
  if (allVerified) {
    // Referee-verified content — full score under the cache's ≥0.8 gate.
    setCachedResponse(cacheKey, analysisContent, 1.0);
  }

  return {
    analysisContent,
    cached: false,
    cacheable: allVerified,
    validationIssues: summary.errorsInitialTotal,
    contractMetadata: {
      contractId: contract.contractId,
      contractVersion: CONTRACT_VERSION,
      verbalizerPromptVersion: VERBALIZER_PROMPT_VERSION,
      refereeMode: env.refereeMode,
      refereeOutcomes: summary.cards.map((c) => ({
        factIdPrefix: c.factIdPrefix,
        stage: c.stage,
        errorsInitial: c.errorsInitial,
        warnsInitial: c.warnsInitial,
      })),
      citedFactIds: summary.citedFactIds,
      citationCoverage: summary.citationCoverageMean,
      ladderDistribution: summary.ladderDistribution,
      cached: false,
    },
    summary,
    llmResult,
  };
}
