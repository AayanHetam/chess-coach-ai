/**
 * Enforced contract stream (PR-CI-4) — the serving orchestrator that turns
 * the CI-3 InsightBlockGate "enforce" mode + the CI-4 failure ladder into
 * block-gated pipelined streaming (plan §5):
 *
 *  - prefix text before the first [INSIGHT: forwards immediately (TTFT
 *    unchanged), passed through a streaming-safe [F:] citation stripper;
 *  - each completed card becomes an async LADDER TASK on a strict FIFO
 *    chain: cards emit in pedagogical order, whole-card bursts
 *    (founder-approved Q2), while the flagship keeps generating the next
 *    card concurrently — only the final card pays visible referee latency;
 *  - headers are SERVER-AUTHORITATIVE: whatever the model wrote, the
 *    shipped header is renderInsightHeader(contract insight);
 *  - stream end with an unclosed block flushes everything + the truncation
 *    footnote, unrefereed raw (plan risk #5 — content is never swallowed);
 *  - a block that anchors to NO contract insight (an off-plan card the
 *    model invented) ships fail-visible: citation-stripped raw + an
 *    unverified footnote — never silently dropped, never verified-washed.
 */
import { logger } from "@/lib/logging";
import type { ContractCitationGranularity, ContractRefereeMode } from "@/env";
import type { ArmingTable } from "./armingConfig";
import { InsightBlockGate } from "./blockGate";
import type { CompletedBlock } from "./blockGate";
import { CitationStripper, stripCitations } from "./citations";
import { matchInsightForHeader, parseInsightHeader } from "./insightGrammar";
import { DEFAULT_LADDER_BUDGETS, runInsightLadder } from "./ladder";
import type { LadderBudgets, LadderCardResult, LadderDeps, LadderStage } from "./ladder";
import { selectCardInsights } from "@/lib/prompts/verbalizerPrompt";
import type { CoachContract, InsightContract } from "./types";

const log = logger.child({ module: "contract-enforce" });

export const TRUNCATION_FOOTNOTE =
  "\n\n*The analysis was cut short by a length limit — the last card above may be incomplete.*";

const UNVERIFIED_CARD_FOOTNOTE =
  "\n\n*Engine check unavailable for this card — it could not be matched to the verified analysis and was served unverified.*";

export interface EnforcedStreamOpts {
  contract: CoachContract;
  /** Client-bound TEXT emitter (the route wraps it in the SSE text event). */
  emit: (text: string) => void;
  correlationId: string;
  refereeMode: ContractRefereeMode;
  citationGranularity: ContractCitationGranularity;
  /** Hard wall-clock deadline for LLM ladder stages (epoch ms). */
  deadlineAtMs: number;
  regenSystem: { stable: string; perUser: string };
  armingTable?: ArmingTable;
  deps?: LadderDeps;
}

export interface EnforcedStreamSummary {
  cards: LadderCardResult[];
  /** Everything emitted to the client, concatenated (the cacheable text). */
  finalText: string;
  ladderDistribution: Record<LadderStage, number>;
  /** Mean pre-ladder citation coverage across anchored cards (null = none). */
  citationCoverageMean: number | null;
  /** Union of valid cited fact ids across shipped cards (CMIP payload). */
  citedFactIds: string[];
  errorsInitialTotal: number;
  warnsInitialTotal: number;
  unclosedBlock: boolean;
  unanchoredBlocks: number;
  budgets: LadderBudgets;
  costUsd: number;
  /** ms from stream start to the first card burst reaching the client. */
  firstCardEmitMs: number | null;
}

export interface EnforcedContractStream {
  push(delta: string): void;
  /** Stream ended — drains the ladder chain, returns the review summary. */
  end(): Promise<EnforcedStreamSummary>;
}

export function createEnforcedContractStream(
  opts: EnforcedStreamOpts,
): EnforcedContractStream {
  const { contract, emit } = opts;
  const now = opts.deps?.now ?? Date.now;
  const t0 = now();
  const budgets = DEFAULT_LADDER_BUDGETS();
  const stripper = new CitationStripper();
  const cards: LadderCardResult[] = [];
  const citedUnion = new Set<string>();
  let finalText = "";
  let unclosedBlock = false;
  let unanchoredBlocks = 0;
  let costUsd = 0;
  let firstCardEmitMs: number | null = null;

  /** Insights not yet claimed by a header match — order fallback anchor. */
  const expectedQueue: InsightContract[] = selectCardInsights(contract);
  const claimed = new Set<string>();

  const userRating = contract.game.userRating;
  const playerPerspective: "white" | "black" =
    contract.game.playerColor === "b" ? "black" : "white";

  const emitTracked = (text: string) => {
    if (!text) return;
    finalText += text;
    emit(text);
  };

  // Strict FIFO: every emission rides this chain, so card order is
  // pedagogical order even though ladders are async.
  let chain: Promise<void> = Promise.resolve();
  const enqueue = (task: () => void | Promise<void>) => {
    chain = chain.then(task).catch((err) => {
      // A ladder bug must never break the stream (blockGate posture).
      log.error("contract_enforce_task_failed", {
        contractId: contract.contractId,
        correlationId: opts.correlationId,
        err: err instanceof Error ? err.message : String(err),
      });
    });
  };

  const anchorBlock = (block: CompletedBlock): InsightContract | null => {
    const fields = parseInsightHeader(block.headerRaw);
    if (fields) {
      const match = matchInsightForHeader(fields, contract);
      if (match && !claimed.has(match.insight.factIdPrefix)) {
        claimed.add(match.insight.factIdPrefix);
        return match.insight;
      }
    }
    // Malformed or unmatched header — fall back to the next expected card
    // (the card plan dictates order, so positional anchoring is sound).
    const next = expectedQueue.find((i) => !claimed.has(i.factIdPrefix));
    if (next) {
      claimed.add(next.factIdPrefix);
      log.warn("contract_enforce_order_anchored", {
        contractId: contract.contractId,
        correlationId: opts.correlationId,
        headerRaw: block.headerRaw.slice(0, 120),
        anchoredTo: next.factIdPrefix,
      });
      return next;
    }
    return null;
  };

  let pendingBlock: CompletedBlock | null = null;

  const gate = new InsightBlockGate({
    mode: "enforce",
    truncationFootnote: TRUNCATION_FOOTNOTE,
    // The gate calls forward() for raw text AND for completed block text
    // (right after onBlock). We intercept: block text is replaced by the
    // ladder result; raw text streams through the citation stripper.
    forward: (text) => {
      if (pendingBlock && text === pendingBlock.text) {
        const block = pendingBlock;
        pendingBlock = null;
        const insight = anchorBlock(block);
        enqueue(async () => {
          // Flush any held stripper tail BEFORE the card burst (order).
          emitTracked(stripper.flush());
          if (!insight) {
            unanchoredBlocks += 1;
            emitTracked(stripCitations(block.text) + UNVERIFIED_CARD_FOOTNOTE);
            return;
          }
          const result = await runInsightLadder(
            block.body,
            {
              insight,
              contract,
              refereeOpts: {
                userRating,
                correlationId: opts.correlationId,
                playerPerspective,
              },
              refereeMode: opts.refereeMode,
              citationGranularity: opts.citationGranularity,
              deadlineAtMs: opts.deadlineAtMs,
              budgets,
              regenSystem: opts.regenSystem,
              deps: opts.deps,
            },
            opts.armingTable,
          );
          cards.push(result);
          costUsd += result.costUsd;
          for (const id of result.citedFactIds) citedUnion.add(id);
          emitTracked(result.finalText);
          if (firstCardEmitMs === null) firstCardEmitMs = now() - t0;
          log.info("contract_enforce_card", {
            contractId: contract.contractId,
            correlationId: opts.correlationId,
            factIdPrefix: result.factIdPrefix,
            stage: result.stage,
            errorsInitial: result.errorsInitial,
            warnsInitial: result.warnsInitial,
            citationCoverage: Number(result.citationCoverage.toFixed(2)),
            editsUsed: result.editsUsed,
            regensUsed: result.regensUsed,
            elapsedMs: result.elapsedMs,
            deadlineBreached: result.deadlineBreached,
          });
        });
      } else {
        const raw = text;
        enqueue(() => {
          emitTracked(stripper.push(raw));
        });
      }
    },
    onBlock: (block) => {
      pendingBlock = block;
    },
    onUnclosedBlock: () => {
      unclosedBlock = true;
    },
  });

  return {
    push(delta: string): void {
      gate.push(delta);
    },
    async end(): Promise<EnforcedStreamSummary> {
      gate.end();
      enqueue(() => {
        emitTracked(stripper.flush());
      });
      await chain;

      const distribution: Record<LadderStage, number> = {
        pass: 0,
        sentence_drop: 0,
        edited: 0,
        regenerated: 0,
        templated: 0,
        passthrough_footnoted: 0,
      };
      for (const c of cards) distribution[c.stage] += 1;
      const coverages = cards.map((c) => c.citationCoverage);
      const summary: EnforcedStreamSummary = {
        cards,
        finalText,
        ladderDistribution: distribution,
        citationCoverageMean:
          coverages.length > 0
            ? coverages.reduce((a, b) => a + b, 0) / coverages.length
            : null,
        citedFactIds: Array.from(citedUnion),
        errorsInitialTotal: cards.reduce((a, c) => a + c.errorsInitial, 0),
        warnsInitialTotal: cards.reduce((a, c) => a + c.warnsInitial, 0),
        unclosedBlock,
        unanchoredBlocks,
        budgets,
        costUsd,
        firstCardEmitMs,
      };
      log.info("contract_enforce_summary", {
        contractId: contract.contractId,
        correlationId: opts.correlationId,
        cards: cards.length,
        ladderDistribution: distribution,
        citationCoverageMean: summary.citationCoverageMean,
        errorsInitialTotal: summary.errorsInitialTotal,
        unclosedBlock,
        unanchoredBlocks,
        costUsd: Number(costUsd.toFixed(4)),
        firstCardEmitMs,
      });
      return summary;
    },
  };
}
