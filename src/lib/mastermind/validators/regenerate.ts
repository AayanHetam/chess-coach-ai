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
  /**
   * Optional AbortSignal (2026-05-25 fix-orphan-pipeline-cancellation).
   * Propagated into each callLLM(...) invocation so in-flight requests
   * abort on timeout. Also checked before each retry attempt — if the
   * signal aborts mid-loop we exit immediately rather than spawning a
   * fresh retry that would also abort.
   */
  signal?: AbortSignal;
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
const SONNET_CACHE_WRITE_PER_M = 3.75; // 1.25× base input for 5-min TTL
const HAIKU_INPUT_PER_M = 1.0;
const HAIKU_OUTPUT_PER_M = 5.0;
const HAIKU_CACHE_READ_PER_M = 0.1;
const HAIKU_CACHE_WRITE_PER_M = 1.25; // 1.25× base input for 5-min TTL

/**
 * Per Anthropic's Messages API docs, `input_tokens` is the uncached portion
 * (tokens after the last cache breakpoint), NOT the total. Total billable
 * input = input_tokens + cache_read_input_tokens + cache_creation_input_tokens.
 * Each component is priced independently. Exercised indirectly via
 * `regenerateUntilValid`'s totalCostUsd in unit tests.
 */
function defaultEstimateCost(result: LLMResult): number {
  const isFast = result.model.includes("haiku");
  const inP = isFast ? HAIKU_INPUT_PER_M : SONNET_INPUT_PER_M;
  const outP = isFast ? HAIKU_OUTPUT_PER_M : SONNET_OUTPUT_PER_M;
  const cacheReadP = isFast ? HAIKU_CACHE_READ_PER_M : SONNET_CACHE_READ_PER_M;
  const cacheWriteP = isFast ? HAIKU_CACHE_WRITE_PER_M : SONNET_CACHE_WRITE_PER_M;
  const inputUncached = result.inputTokens / 1_000_000;
  const cacheReadM = (result.cacheReadTokens ?? 0) / 1_000_000;
  const cacheWriteM = (result.cacheCreationTokens ?? 0) / 1_000_000;
  const output = result.outputTokens / 1_000_000;
  return (
    inputUncached * inP +
    cacheReadM * cacheReadP +
    cacheWriteM * cacheWriteP +
    output * outP
  );
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

// ─────────────────────────────────────────────────────────────────────────
// Surgical correction (feat/adaptive-coach)
//
// When the ONLY validation failures are relational_claim_contradicted
// (chess.js oracle disproving a "X attacks Y" / "captures Z" style phrase),
// regenerating the WHOLE flagship (Sonnet) analysis is overkill: a 2nd Sonnet
// call (~20s) routinely overruns the 50s shared deadline → timeout fallback.
//
// Instead, do a CHEAP, FAST (Haiku) targeted rewrite: hand the model its own
// previous response plus the exact false phrases (rawText) and the oracle's
// reason, and ask it to remove/correct ONLY those phrases while copying
// everything else verbatim. This is pure text-editing (no chess reasoning),
// so the fast tier is sufficient (~4s) and fits the budget.
//
// The surgical output is re-validated through the SAME deterministic gate, so
// the truthfulness floor is unchanged: if Haiku botches the edit (leaves the
// claim, or invents a new one), re-validation fails and we fall through to the
// existing full-regen / buildFallback path.
// ─────────────────────────────────────────────────────────────────────────

const SURGICAL_EDITOR_SYSTEM =
  "You are a precise text editor. You are given a chess coaching message and a list of " +
  "factually FALSE statements it contains (each verified false by a chess engine). " +
  "Return the SAME message with ONLY those false statements removed or minimally corrected. " +
  "Keep every other sentence VERBATIM — same wording, order, formatting, and tone. " +
  "Do NOT add disclaimers, apologies, new analysis, or commentary about the edit. " +
  "Do NOT introduce any new chess claims. If removing a clause leaves a dangling sentence, " +
  "delete the whole sentence. Output only the corrected message.";

/**
 * Build the FAST-tier (Haiku) surgical-correction request: the model's prior
 * response plus the specific contradicted spans + oracle reasons, with an
 * editor system prompt. Deliberately does NOT carry the initialRequest's coach
 * system / systemSuffix / cacheSystem — a fresh, small editor prompt is cheaper
 * and keeps the model in find-and-edit mode rather than coach mode.
 *
 * `maxTokens` mirrors the source request so the (mostly verbatim) message is
 * never truncated below its original length.
 */
export function buildSurgicalCorrectionRequest(
  prevResponse: string,
  relationalIssues: ValidatorIssue[],
  maxTokens?: number,
): CallLLMOptions {
  const claimList = relationalIssues
    .map((issue, i) => {
      const reason = (issue.actual as { reason?: string } | null)?.reason ?? "";
      return `${i + 1}. FALSE: "${issue.llm_span}" — ${reason}`;
    })
    .join("\n");

  const user = [
    "Here is the coaching message:",
    "<<<MESSAGE",
    prevResponse,
    "MESSAGE",
    "",
    "Remove or correct ONLY these false statements, keeping everything else verbatim:",
    claimList,
  ].join("\n");

  return {
    tier: "fast", // Haiku — text edit, no chess reasoning
    system: SURGICAL_EDITOR_SYSTEM,
    messages: [{ role: "user", content: user }],
    temperature: 0, // deterministic edit, not creative
    maxTokens: maxTokens ?? 3000, // must fit the full message; mirror source cap
  };
}

/**
 * True only when EVERY failing issue is a relational contradiction. Strict by
 * design: surgical edit fires only when the entire failure set is the cheap,
 * find-and-remove case, so we never paper over an eval/citation/overclaim
 * failure that genuinely needs flagship regeneration.
 */
function isRelationalDominant(issues: ValidatorIssue[]): boolean {
  if (issues.length === 0) return false;
  return issues.every((i) => i.check_name === "relational_claim_contradicted");
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
    // Abort check before each attempt: if the upstream timeout already
    // fired, exit the retry loop immediately rather than spawning a
    // fresh LLM call that will just abort too. The buildFallback path
    // below still runs (synchronous; no LLM call) so the caller gets a
    // well-formed RegenerateResult.
    if (opts.signal?.aborted) break;

    const requestForThisAttempt: CallLLMOptions = {
      ...opts.initialRequest,
      messages,
      signal: opts.signal,
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

    // SURGICAL CORRECTION: when every failing issue is a relational
    // contradiction, attempt a cheap FAST-tier (Haiku) text-edit BEFORE
    // spending a flagship regen. Pure find-and-remove of the false phrases
    // (no chess reasoning) → ~4s, which fits the shared deadline that a 2nd
    // Sonnet call (~20s) would overrun. finalResponse holds the most recent
    // LLM output, so it is exactly the text to hand back for editing.
    if (!opts.signal?.aborted && isRelationalDominant(validation.issues)) {
      const surgicalReq: CallLLMOptions = {
        ...buildSurgicalCorrectionRequest(
          finalResponse,
          validation.issues,
          opts.initialRequest.maxTokens,
        ),
        signal: opts.signal,
      };
      const surgicalResult = await callLLM(surgicalReq);
      totalCostUsd += estimateCost(surgicalResult);

      const surgicalValidation = await opts.validate(surgicalResult.content);
      telemetry.push(...surgicalValidation.telemetry);
      totalCostUsd += surgicalValidation.costUsd;

      if (surgicalValidation.passed) {
        // Re-validation through the SAME deterministic gate cleared it →
        // truthfulness floor unchanged. Surface as passed_after_retry.
        telemetry.push(
          createTelemetryEvent({
            check_name: "regenerate",
            fire_reason: "passed",
            retry_count: retry,
            final_outcome: "passed_after_retry",
            context: baseContext,
          })
        );
        return {
          finalResponse: surgicalResult.content,
          retryCount: retry,
          finalOutcome: "passed_after_retry",
          cumulativeIssues,
          totalCostUsd,
          telemetry,
        };
      }
      // Surgical edit still contradicted (left the claim, or invented a new
      // one) → record and fall through to the existing full-regen / fallback
      // path unchanged.
      cumulativeIssues.push(...surgicalValidation.issues);

      // Deadline may have expired during the surgical edit + re-validation.
      // Short-circuit to buildFallback rather than launching a doomed
      // flagship retry (there is otherwise no abort check between the
      // surgical block and the fall-through full-regen this iteration).
      if (opts.signal?.aborted) break;
    }

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
