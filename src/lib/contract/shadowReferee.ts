/**
 * Shadow-referee wiring for the streaming route (PR-CI-3, DARK).
 *
 * maybeCreateShadowRefereeGate() is the ONLY contract-referee surface
 * route.ts touches. With CONTRACT_REFEREE_SHADOW off (default) it returns
 * null before constructing anything — the gate code is not in the path at
 * all and the route's `gate?.push(...)` sites are no-ops. With the flag on,
 * it returns an observer that:
 *
 *  - accumulates the streamed text per [INSIGHT]…[/INSIGHT] block
 *    (InsightBlockGate, shadow mode — the route keeps emitting every delta
 *    itself, so client bytes are untouched by construction);
 *  - on each completed block, anchors the header to its InsightContract and
 *    runs the deterministic blocking-grade referee (refereeInsight), LOG
 *    ONLY;
 *  - launches the bounded Haiku relational-claim parse per matched block —
 *    FIRE-AND-FORGET (documented choice: shadow mode adds zero blocking
 *    waits to the stream; the parse runs concurrent with the next card's
 *    generation and its log line is best-effort — if the stream closes
 *    before Haiku returns, the shadow datapoint is dropped, never the
 *    user's bytes). Hard cap: MAX_RELATIONAL_PARSES_PER_REVIEW.
 *  - on end(), logs unclosed-block partials and a per-review summary
 *    (the standing-KPI precursor: blocks/matched/violations/holdMs), and
 *    hands the SAME summary — plus the flagged spans — to the optional
 *    `onReview` sink so it can be persisted somewhere queryable (CI-5).
 *    The sink is called inside a try/catch: a telemetry bug can no more
 *    break the stream than the referee itself can.
 */
import { logger } from "@/lib/logging";
import { getContractEnv } from "@/env";
import { InsightBlockGate } from "./blockGate";
import { matchInsightForHeader, parseInsightHeader } from "./insightGrammar";
import {
  MAX_RELATIONAL_PARSES_PER_REVIEW,
  refereeInsight,
  refereeInsightRelational,
} from "./referee";
import type { RefereeFinding } from "./referee";
import { armSeverity } from "./armingConfig";
import type { ArmedSeverity } from "./armingConfig";
import type { CoachContract } from "./types";

const log = logger.child({ module: "contract-referee" });

export interface ShadowRefereeGate {
  /** Feed one streamed text delta (call AFTER the route has emitted it). */
  push(delta: string): void;
  /** Stream ended — flush partial-block telemetry + the review summary. */
  end(): void;
}

/**
 * One flagged span, carrying enough context to adjudicate it cold. Span-level
 * review is how every arming decision has been made (see armingConfig's
 * per-check FP evidence), so the sentence travels with the span.
 */
export interface ShadowRefereeSpan {
  check: RefereeFinding["check"];
  category: string;
  /** The referee's OWN severity — shadow truth. */
  severity: RefereeFinding["severity"];
  /**
   * Severity under the CURRENT arming table. "error" ⇒ this fire WOULD have
   * been enforced on the served path had block-gating been armed.
   */
  armed: ArmedSeverity;
  span: string;
  /** The sentence the span sits in (truncated). */
  sentence: string;
  factIdPrefix: string;
  wouldPassWidenedWindow?: boolean;
}

/** Everything contract_referee_shadow_summary logs, plus the flagged spans. */
export interface ShadowRefereeReview {
  contractId: string;
  correlationId: string;
  branch: string;
  blocksSeen: number;
  matched: number;
  unmatched: number;
  malformedHeaders: number;
  /** Referee-severity totals (identical to the summary log line). */
  refereeErrors: number;
  refereeWarns: number;
  /** Totals under the CURRENT arming table — would-be-enforced counts. */
  armedErrors: number;
  armedWarns: number;
  /** Fires per check, e.g. { tactical_keyword: 3, san_whitelist: 1 }. */
  checkCounts: Record<string, number>;
  /** Fires per referee category, e.g. { square_unknown: 2 }. */
  categoryCounts: Record<string, number>;
  maxHoldMs: number;
  p95HoldMs: number;
  relationalLaunched: number;
  spans: ShadowRefereeSpan[];
}

export interface ShadowRefereeGateOpts {
  contract: CoachContract | null | undefined;
  correlationId: string;
  /** Streaming-branch tag for log aggregation (e.g. "stream-flagoff"). */
  branch: string;
  /**
   * Optional sink for the per-review summary, called once from end() AFTER
   * the summary log line. Synchronous and wrapped in try/catch here — a sink
   * must schedule its own work (e.g. via after()) and never block or throw.
   * Absent ⇒ byte-for-byte the pre-CI-5 behaviour.
   */
  onReview?: (review: ShadowRefereeReview) => void;
}

const MAX_LOGGED_FINDINGS = 8;
/** Persisted-span caps — a pathological review must not write an unbounded row. */
const MAX_PERSISTED_SPANS = 40;
const SPAN_MAX_CHARS = 240;
const SENTENCE_MAX_CHARS = 400;

function isTerminator(c: string): boolean {
  return c === "." || c === "!" || c === "?";
}

/**
 * The sentence of `text` containing `span`. Bounded by newlines (block prose
 * is line-broken) and by sentence terminators followed by whitespace, so
 * decimal evals ("+1.38") and SAN don't split a sentence. Empty when the span
 * can't be located (defensive — findings always quote from the text).
 */
export function sentenceContaining(text: string, span: string): string {
  if (!span) return "";
  const idx = text.indexOf(span);
  if (idx < 0) return "";
  let start = 0;
  for (let i = idx - 1; i >= 0; i--) {
    const c = text[i];
    if (c === "\n") {
      start = i + 1;
      break;
    }
    if (isTerminator(c) && /\s/.test(text[i + 1] ?? " ")) {
      start = i + 1;
      break;
    }
  }
  let end = text.length;
  for (let i = idx + span.length; i < text.length; i++) {
    const c = text[i];
    if (c === "\n") {
      end = i;
      break;
    }
    if (isTerminator(c) && /\s/.test(text[i + 1] ?? " ")) {
      end = i + 1;
      break;
    }
  }
  return text.slice(start, end).trim().slice(0, SENTENCE_MAX_CHARS);
}

/**
 * Returns null unless CONTRACT_REFEREE_SHADOW is on AND a contract exists
 * for this request (game-review path). Never throws; internal callbacks are
 * try/caught by the gate so a referee bug can never break streaming.
 */
export function maybeCreateShadowRefereeGate(
  opts: ShadowRefereeGateOpts,
): ShadowRefereeGate | null {
  if (!getContractEnv().refereeShadowEnabled) return null;
  const contract = opts.contract;
  if (!contract) return null;

  const { correlationId, branch } = opts;
  const userRating = contract.game.userRating;
  const playerPerspective: "white" | "black" =
    contract.game.playerColor === "b" ? "black" : "white";

  let matched = 0;
  let unmatched = 0;
  let malformedHeaders = 0;
  let totalErrors = 0;
  let totalWarns = 0;
  let maxHoldMs = 0;
  const holdMsSamples: number[] = [];
  let relationalLaunched = 0;
  // CI-5 persistence accumulators. Only populated when a sink is attached —
  // with no sink these stay empty and cost one branch per finding.
  const sink = opts.onReview;
  let armedErrors = 0;
  let armedWarns = 0;
  const checkCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  const spans: ShadowRefereeSpan[] = [];

  const gate = new InsightBlockGate({
    mode: "shadow",
    onBlock: (block) => {
      const fields = parseInsightHeader(block.headerRaw);
      if (!fields) {
        malformedHeaders += 1;
        log.warn("contract_referee_shadow_malformed_header", {
          contractId: contract.contractId,
          correlationId,
          branch,
          headerRaw: block.headerRaw.slice(0, 120),
        });
        return;
      }
      const match = matchInsightForHeader(fields, contract);
      if (!match) {
        unmatched += 1;
        log.warn("contract_referee_shadow_unmatched_block", {
          contractId: contract.contractId,
          correlationId,
          branch,
          moveNumber: fields.moveNumber,
          color: fields.color,
          playedMove: fields.playedMove,
        });
        return;
      }
      matched += 1;
      // Referee the FULL block text (header echoes are claims too — same
      // footprint as the PR-CI-2 BEFORE baseline).
      const result = refereeInsight(block.text, match.insight, {
        userRating,
        correlationId,
        playerPerspective,
        contract, // contract-global eval_display (fix 7) + SAN/square (fix A) pools
      });
      totalErrors += result.errorCount;
      totalWarns += result.warnCount;
      maxHoldMs = Math.max(maxHoldMs, result.elapsedMs);
      holdMsSamples.push(result.elapsedMs);
      if (sink) {
        for (const f of result.findings) {
          checkCounts[f.check] = (checkCounts[f.check] ?? 0) + 1;
          categoryCounts[f.category] = (categoryCounts[f.category] ?? 0) + 1;
          const armed = armSeverity(f);
          if (armed === "error") armedErrors += 1;
          else if (armed === "warn") armedWarns += 1;
          if (spans.length < MAX_PERSISTED_SPANS) {
            spans.push({
              check: f.check,
              category: f.category,
              severity: f.severity,
              armed,
              span: f.span.slice(0, SPAN_MAX_CHARS),
              sentence: sentenceContaining(block.text, f.span),
              factIdPrefix: result.factIdPrefix,
              ...(f.wouldPassWidenedWindow !== undefined
                ? { wouldPassWidenedWindow: f.wouldPassWidenedWindow }
                : {}),
            });
          }
        }
      }
      log.info("contract_referee_shadow_block", {
        contractId: contract.contractId,
        correlationId,
        branch,
        factIdPrefix: result.factIdPrefix,
        playedSanMatches: match.playedSanMatches,
        errorCount: result.errorCount,
        warnCount: result.warnCount,
        holdMs: result.elapsedMs,
        findings: result.findings.slice(0, MAX_LOGGED_FINDINGS).map((f) => ({
          check: f.check,
          severity: f.severity,
          category: f.category,
          span: f.span.slice(0, 60),
          ...(f.wouldPassWidenedWindow !== undefined
            ? { wouldPassWidenedWindow: f.wouldPassWidenedWindow }
            : {}),
        })),
      });
      // Check 6 — bounded, fire-and-forget (see module doc for the
      // no-blocking-waits rationale).
      if (relationalLaunched < MAX_RELATIONAL_PARSES_PER_REVIEW) {
        relationalLaunched += 1;
        void refereeInsightRelational(block.text, match.insight, { correlationId })
          .then((rel) => {
            log.info("contract_referee_shadow_relational", {
              contractId: contract.contractId,
              correlationId,
              branch,
              factIdPrefix: rel.factIdPrefix,
              contradictions: rel.findings.length,
              costUsd: rel.costUsd,
              findings: rel.findings.slice(0, MAX_LOGGED_FINDINGS).map((f) => ({
                category: f.category,
                span: f.span.slice(0, 60),
              })),
            });
          })
          .catch((err: unknown) => {
            log.warn("contract_referee_shadow_relational_failed", {
              contractId: contract.contractId,
              correlationId,
              branch,
              err: err instanceof Error ? err.message : String(err),
            });
          });
      }
    },
    onUnclosedBlock: (partial) => {
      log.warn("contract_referee_shadow_unclosed_block", {
        contractId: contract.contractId,
        correlationId,
        branch,
        headerRaw: partial.headerRaw?.slice(0, 120) ?? null,
        partialLength: partial.text.length,
      });
    },
  });

  return {
    push(delta: string): void {
      gate.push(delta);
    },
    end(): void {
      gate.end();
      const sorted = [...holdMsSamples].sort((a, b) => a - b);
      const p95 =
        sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : 0;
      log.info("contract_referee_shadow_summary", {
        contractId: contract.contractId,
        correlationId,
        branch,
        blocksSeen: gate.blocksSeen,
        matched,
        unmatched,
        malformedHeaders,
        totalErrors,
        totalWarns,
        maxHoldMs,
        p95HoldMs: p95,
        relationalLaunched,
      });
      if (!sink) return;
      // Telemetry only, and last: everything above (including the summary log)
      // has already happened, so a sink bug can lose the row but nothing else.
      try {
        sink({
          contractId: contract.contractId,
          correlationId,
          branch,
          blocksSeen: gate.blocksSeen,
          matched,
          unmatched,
          malformedHeaders,
          refereeErrors: totalErrors,
          refereeWarns: totalWarns,
          armedErrors,
          armedWarns,
          checkCounts,
          categoryCounts,
          maxHoldMs,
          p95HoldMs: p95,
          relationalLaunched,
          spans,
        });
      } catch (err) {
        log.warn("contract_referee_shadow_sink_failed", {
          contractId: contract.contractId,
          correlationId,
          branch,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}
