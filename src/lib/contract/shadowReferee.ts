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
 *    (the standing-KPI precursor: blocks/matched/violations/holdMs).
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
import type { CoachContract } from "./types";

const log = logger.child({ module: "contract-referee" });

export interface ShadowRefereeGate {
  /** Feed one streamed text delta (call AFTER the route has emitted it). */
  push(delta: string): void;
  /** Stream ended — flush partial-block telemetry + the review summary. */
  end(): void;
}

export interface ShadowRefereeGateOpts {
  contract: CoachContract | null | undefined;
  correlationId: string;
  /** Streaming-branch tag for log aggregation (e.g. "stream-flagoff"). */
  branch: string;
}

const MAX_LOGGED_FINDINGS = 8;

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
      });
      totalErrors += result.errorCount;
      totalWarns += result.warnCount;
      maxHoldMs = Math.max(maxHoldMs, result.elapsedMs);
      holdMsSamples.push(result.elapsedMs);
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
    },
  };
}
