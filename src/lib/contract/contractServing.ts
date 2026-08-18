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
import type {
  CallLLMOptions,
  LLMMessage,
  LLMResult,
  LLMStreamEvent,
} from "@/lib/llmProvider";
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

/**
 * Budget for FLAGSHIP GENERATION alone (PR-CI-5).
 *
 * The ladder deadline above bounds the referee. It does NOT bound the model,
 * and at game_review scale the model is the long pole: the CI-5 gate run
 * measured 16-20s for a 1-card review, ~53s for 4 cards, and **76-83s for the
 * 7-card fixture** — generation only, with the ladder passing every card.
 * Past `maxDuration: 60s` Vercel kills the function mid-stream: no `done`
 * event, no metadata, no cache write, and a client left hanging on a partial
 * review. That is the one failure mode the plan's "never a timeout"
 * guarantee (§9 risks 7/8) is supposed to exclude, and the ladder deadline
 * cannot prevent it because the time is spent before the ladder is reached.
 *
 * So generation gets its own abort. On expiry the stream closes normally:
 * completed cards have already been refereed and flushed, an unclosed block
 * flushes with the existing truncation footnote (plan risk #5 — content is
 * never swallowed), a `done` event is still sent, and the review is marked
 * NOT cacheable. A short honest review beats a killed request.
 *
 * 45s leaves ~10s inside the 55s ladder budget for the final card's referee
 * tail, the done metadata, and puzzle recommendations.
 *
 * This is a SAFETY NET, not the fix. A 7-card game review genuinely does not
 * fit 60s; making it fit is a `maxDuration` bump or a card-count decision,
 * both founder-gated (plan §7 CI-5 open item / tech-lead decision #4).
 */
export const CONTRACT_GENERATION_BUDGET_MS = 45_000;

/**
 * Appended when generation was cut by the budget between cards (an unclosed
 * block already gets enforcedStream's TRUNCATION_FOOTNOTE). Honest register,
 * per the founder's 2026-08-10 policy.
 */
export const GENERATION_BUDGET_NOTE =
  "\n\n*I ran out of time before I could cover the rest of this game — the moments above are the ones that mattered most.*";

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
  /** Cards refused by the CI-5 sentinel guard (fabricated classification). */
  sentinelCardsRefused: number;
  /** How a ZERO-CARD review's overview resolved; null when it had cards. */
  overviewOutcome: "pass" | "sentence_drop" | "templated" | null;
  /** Contract-global violations found in that overview. */
  overviewViolations: number;
  /** Generation was cut by CONTRACT_GENERATION_BUDGET_MS (review is short). */
  generationTruncated: boolean;
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
  callLLMStreamImpl?: (
    opts: CallLLMOptions
  ) => AsyncGenerator<LLMStreamEvent, void, void>;
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
  args: ContractServingArgs
): Promise<ContractServingResult> {
  const env = getContractEnv();
  const { contract } = args;
  const cacheKey = generateContractCacheKey(
    args.cacheInputs.currentFen,
    args.cacheInputs.skillLevel,
    args.cacheInputs.userMessage,
    args.cacheInputs.personaSignature,
    args.cacheInputs.moveHistory
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
        sentinelCardsRefused: 0,
        // A zero-card review is never cached (allVerified requires cards), so
        // a cache hit is by construction a carded one.
        overviewOutcome: null,
        overviewViolations: 0,
        generationTruncated: false,
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
  // Generation budget (see CONTRACT_GENERATION_BUDGET_MS): abort the model,
  // not the request, so an over-long game review degrades into a short honest
  // review with a proper `done` event instead of a Vercel-killed stream.
  const generationController = new AbortController();
  const generationBudgetLeftMs =
    args.requestStartMs + CONTRACT_GENERATION_BUDGET_MS - Date.now();
  let generationTruncated = false;
  const generationTimer = setTimeout(
    () => {
      generationTruncated = true;
      generationController.abort();
    },
    Math.max(0, generationBudgetLeftMs)
  );
  try {
    for await (const evt of callLLMStream({
      tier: "flagship",
      system: systemParts.stable,
      systemSuffix: systemParts.perUser,
      messages: [...args.priorMessages, { role: "user", content: userTurn }],
      temperature: 0.7,
      maxTokens: maxTokensForInsights(cardCount),
      cacheSystem: true,
      signal: generationController.signal,
    })) {
      if (evt.type === "text") {
        stream.push(evt.delta);
      } else {
        llmResult = evt.result;
      }
    }
  } catch (err) {
    if (!generationTruncated) {
      // Fail-visible: drain what was already held (never blank), then let the
      // route's uniform error handling take over (same contract as legacy).
      clearTimeout(generationTimer);
      await stream.end();
      throw err;
    }
    // Deliberate budget cut — NOT an error. Fall through to the normal end:
    // held cards flush, an unclosed block gets its truncation footnote, and
    // the route still sends `done`.
  } finally {
    clearTimeout(generationTimer);
  }

  const summary = await stream.end();
  let analysisContent = summary.finalText || "No analysis generated.";
  if (generationTruncated && !summary.unclosedBlock) {
    // Cut cleanly between cards — the block gate had nothing to footnote, so
    // say it here rather than end mid-review with no signal.
    args.emitText(GENERATION_BUDGET_NOTE);
    analysisContent += GENERATION_BUDGET_NOTE;
  }

  const allVerified =
    summary.cards.length > 0 &&
    summary.cards.every((c) => VERIFIED_STAGES.has(c.stage)) &&
    !summary.unclosedBlock &&
    summary.unanchoredBlocks === 0 &&
    // A truncated review is an incomplete artifact — never cache it, or the
    // next identical request serves a permanently short game review.
    !generationTruncated;
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
      sentinelCardsRefused: summary.sentinelCardsRefused,
      // Zero-card reviews: how the (now refereed) overview resolved, so a
      // dogfood flag on a card-less review is triageable. null = had cards.
      overviewOutcome: summary.overviewOutcome,
      overviewViolations: summary.overviewViolations,
      generationTruncated,
      cached: false,
    },
    summary,
    llmResult,
  };
}
