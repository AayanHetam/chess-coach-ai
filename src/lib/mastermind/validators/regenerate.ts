import { callLLM as defaultCallLLM, CallLLMOptions, LLMResult, LLMMessage } from "@/lib/llmProvider";
import { createTelemetryEvent } from "./telemetry";
import {
  ValidatorResult,
  ValidatorIssue,
  TelemetryEvent,
  FinalOutcome,
} from "./types";

export interface RegenerateOpts {
  initialRequest: CallLLMOptions;
  validate: (response: string) => Promise<ValidatorResult>;
  buildFallback: (issues: ValidatorIssue[]) => Promise<string>;
  maxRetries?: number;
  callLLM?: (opts: CallLLMOptions) => Promise<LLMResult>;
  estimateCost?: (result: LLMResult) => number;
  correlationId: string;
  context?: {
    fen?: string;
    move_san?: string;
    player_perspective?: "white" | "black";
  };
}

export interface RegenerateResult {
  finalResponse: string;
  retryCount: number;
  finalOutcome: FinalOutcome;
  cumulativeIssues: ValidatorIssue[];
  totalCostUsd: number;
  telemetry: TelemetryEvent[];
}

const SONNET_INPUT_PER_M = 3.0;
const SONNET_OUTPUT_PER_M = 15.0;
const SONNET_CACHE_READ_PER_M = 0.3;
const HAIKU_INPUT_PER_M = 1.0;
const HAIKU_OUTPUT_PER_M = 5.0;
const HAIKU_CACHE_READ_PER_M = 0.1;

function defaultEstimateCost(result: LLMResult): number {
  const isFast = result.model.includes("haiku");
  const inP = isFast ? HAIKU_INPUT_PER_M : SONNET_INPUT_PER_M;
  const outP = isFast ? HAIKU_OUTPUT_PER_M : SONNET_OUTPUT_PER_M;
  const cacheP = isFast ? HAIKU_CACHE_READ_PER_M : SONNET_CACHE_READ_PER_M;
  const cacheRead = result.cacheReadTokens ?? 0;
  const inputUncached = (result.inputTokens - cacheRead) / 1_000_000;
  const cacheReadM = cacheRead / 1_000_000;
  const output = result.outputTokens / 1_000_000;
  return inputUncached * inP + cacheReadM * cacheP + output * outP;
}

/**
 * Build the retry user-turn payload. Eval mismatches surface first, then
 * citation issues, per Aayan PR_1B_PLAN.md §7.3. No "may be inaccurate"
 * apology — the response is going to be regenerated, not amended.
 */
export function buildRetryInstruction(issues: ValidatorIssue[]): string {
  const ordered = [...issues].sort((a, b) => priorityOf(a) - priorityOf(b));
  const lines = ordered.map((issue, i) => {
    const expected = JSON.stringify(issue.expected);
    const actual = JSON.stringify(issue.actual);
    return `${i + 1}. [${issue.check_name}] ${issue.detail} Your text: "${issue.llm_span.slice(0, 200)}". Expected: ${expected}. Got: ${actual}.`;
  });

  return [
    "Your previous analysis had the following validation failures:",
    "",
    ...lines,
    "",
    "Regenerate the analysis. Do not repeat these errors. Maintain coaching tone; do not add disclaimers or apologies.",
  ].join("\n");
}

function priorityOf(issue: ValidatorIssue): number {
  if (issue.check_name.startsWith("eval_mismatch")) return 0;
  if (issue.check_name === "feature_citation_unsupported") return 1;
  return 2;
}

/**
 * Regenerate state machine. Initial call → validate → retry up to maxRetries
 * → fallback. Same-tier retries (Sonnet → Sonnet, Haiku → Haiku) per PR 1.B
 * spec; cost ceiling discussion is Interpretation A (BUILD_PLAN §9.4 / PR_1B
 * §10.3) — overhead-only, retries are replacements not additions.
 */
export async function regenerateUntilValid(opts: RegenerateOpts): Promise<RegenerateResult> {
  const maxRetries = opts.maxRetries ?? 2;
  const callLLM = opts.callLLM ?? defaultCallLLM;
  const estimateCost = opts.estimateCost ?? defaultEstimateCost;

  const baseContext = {
    fen: opts.context?.fen,
    move_san: opts.context?.move_san,
    player_perspective: opts.context?.player_perspective,
    correlation_id: opts.correlationId,
  } as const;

  const telemetry: TelemetryEvent[] = [];
  const cumulativeIssues: ValidatorIssue[] = [];
  let totalCostUsd = 0;
  let retry = 0;
  let messages: LLMMessage[] = [...opts.initialRequest.messages];
  let finalResponse = "";

  while (retry <= maxRetries) {
    const requestForThisAttempt: CallLLMOptions = {
      ...opts.initialRequest,
      messages,
    };
    const llmResult = await callLLM(requestForThisAttempt);
    totalCostUsd += estimateCost(llmResult);
    finalResponse = llmResult.content;

    const validation = await opts.validate(finalResponse);
    telemetry.push(...validation.telemetry);
    totalCostUsd += validation.costUsd;

    if (validation.passed) {
      const outcome: FinalOutcome = retry === 0 ? "passed_initial" : "passed_after_retry";
      telemetry.push(
        createTelemetryEvent({
          check_name: "regenerate",
          fire_reason: "passed",
          retry_count: retry,
          final_outcome: outcome,
          context: baseContext,
        })
      );
      return {
        finalResponse,
        retryCount: retry,
        finalOutcome: outcome,
        cumulativeIssues,
        totalCostUsd,
        telemetry,
      };
    }

    cumulativeIssues.push(...validation.issues);

    if (retry === maxRetries) break;

    telemetry.push(
      createTelemetryEvent({
        check_name: "regenerate",
        fire_reason: "regenerate_invoked",
        retry_count: retry,
        expected: { passing_validation: true },
        actual: { issues: validation.issues.length },
        context: baseContext,
      })
    );

    messages = [
      ...messages,
      { role: "assistant", content: finalResponse },
      { role: "user", content: buildRetryInstruction(validation.issues) },
    ];
    retry++;
  }

  const fallbackResponse = await opts.buildFallback(cumulativeIssues);
  telemetry.push(
    createTelemetryEvent({
      check_name: "regenerate",
      fire_reason: "fallback_used",
      retry_count: retry,
      final_outcome: "fallback_used",
      context: baseContext,
    })
  );

  return {
    finalResponse: fallbackResponse,
    retryCount: retry,
    finalOutcome: "fallback_used",
    cumulativeIssues,
    totalCostUsd,
    telemetry,
  };
}
