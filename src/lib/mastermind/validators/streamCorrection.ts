// Post-stream surgical correction — PR-B of the accuracy program.
//
// The dominant production path (streamed game_review) forwards raw model
// output to the user and runs every validator LOG-ONLY afterward (audit
// §3.1: the enforcement pipeline never executes where users are). This
// module gives that path teeth without adding pre-stream latency:
//
//   stream finishes → error-severity validator fires collected → one cheap
//   Haiku text-edit removes/corrects ONLY the disproven claims → corrected
//   text rides the SSE `done` event as metadata.analysis + corrected:true,
//   which the client already swaps in (AICoachChat done-handler contract).
//
// Only ERROR-severity issues trigger correction — the high-precision
// signals (material claim contradicting Stockfish, Lc0-veto positional
// overclaim, eval mismatch). Warn-level fires stay telemetry-only on this
// path: they are snapshot-anchored (last move) and known to false-positive
// on multi-position game-review prose.
//
// Failure policy: if the edit fails, times out, or returns something that
// no longer resembles the original message, we fall back to appending
// per-issue correction notes — the user still sees WHICH claims the engine
// disproved, instead of silently shipping them.

import { callLLM as defaultCallLLM, type CallLLMOptions, type LLMResult } from "@/lib/llmProvider";

import type { ValidatorIssue } from "./types";

const CORRECTION_TIMEOUT_MS = 10_000;

const STREAM_EDITOR_SYSTEM =
  "You are a precise text editor. You are given a chess coaching message and a list of " +
  "factually FALSE statements it contains (each verified false by a chess engine). " +
  "Return the SAME message with ONLY those false statements removed or minimally corrected. " +
  "Keep every other sentence VERBATIM — same wording, order, formatting, and tone. " +
  "Do NOT add disclaimers, apologies, new analysis, or commentary about the edit. " +
  "Do NOT introduce any new chess claims. If removing a clause leaves a dangling sentence, " +
  "delete the whole sentence. Output only the corrected message.";

export interface StreamCorrectionOpts {
  rawText: string;
  /** Error-severity issues only — callers filter before invoking. */
  issues: ValidatorIssue[];
  correlationId: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** Injection point for tests. */
  callLLMImpl?: (opts: CallLLMOptions) => Promise<LLMResult>;
}

export interface StreamCorrectionResult {
  /** The text to ship (edited, or raw+footnotes on edit failure). */
  correctedText: string;
  /** "edited" = Haiku rewrite; "footnoted" = notes appended after edit failure. */
  mode: "edited" | "footnoted";
  costUsd: number;
}

/** Per-issue correction notes — the no-LLM fallback when the edit fails. */
export function buildIssueFootnotes(issues: ValidatorIssue[]): string {
  const notes = issues
    .slice(0, 5)
    .map((i) => `- "${i.llm_span.slice(0, 120)}" — ${i.detail.slice(0, 200)}`)
    .join("\n");
  return `\n\n---\n*Engine check: the following statement${issues.length === 1 ? "" : "s"} in this analysis could not be verified and may be wrong:*\n${notes}`;
}

function buildEditRequest(rawText: string, issues: ValidatorIssue[], maxTokens?: number): CallLLMOptions {
  const claimList = issues
    .map((issue, i) => `${i + 1}. FALSE: "${issue.llm_span.slice(0, 200)}" — ${issue.detail.slice(0, 300)}`)
    .join("\n");
  return {
    tier: "fast", // Haiku — pure text edit, no chess reasoning
    system: STREAM_EDITOR_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          "Here is the coaching message:",
          "<<<MESSAGE",
          rawText,
          "MESSAGE",
          "",
          "Remove or correct ONLY these false statements, keeping everything else verbatim:",
          claimList,
        ].join("\n"),
      },
    ],
    temperature: 0,
    maxTokens: maxTokens ?? 3000,
  };
}

/** Sanity gate: reject edits that destroyed or bloated the message. */
function editLooksSane(original: string, edited: string): boolean {
  if (!edited || edited.trim().length === 0) return false;
  const ratio = edited.length / Math.max(1, original.length);
  return ratio >= 0.4 && ratio <= 1.3;
}

export async function correctStreamedAnalysis(
  opts: StreamCorrectionOpts,
): Promise<StreamCorrectionResult> {
  const callLLM = opts.callLLMImpl ?? defaultCallLLM;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? CORRECTION_TIMEOUT_MS);
  try {
    const result = await callLLM({
      ...buildEditRequest(opts.rawText, opts.issues, opts.maxTokens),
      signal: controller.signal,
    });
    const edited = result.content?.trim() ?? "";
    if (editLooksSane(opts.rawText, edited)) {
      return { correctedText: edited, mode: "edited", costUsd: estimateHaikuCost(result) };
    }
    return {
      correctedText: opts.rawText + buildIssueFootnotes(opts.issues),
      mode: "footnoted",
      costUsd: estimateHaikuCost(result),
    };
  } catch {
    return {
      correctedText: opts.rawText + buildIssueFootnotes(opts.issues),
      mode: "footnoted",
      costUsd: 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

function estimateHaikuCost(result: LLMResult): number {
  return (result.inputTokens / 1_000_000) * 1.0 + (result.outputTokens / 1_000_000) * 5.0;
}
