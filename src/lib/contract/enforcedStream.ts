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
import { isSentinelBearingInsight } from "./sentinelGuard";
import { selectCardInsightsDetailed } from "@/lib/prompts/verbalizerPrompt";
import type { CoachContract, InsightContract } from "./types";

const log = logger.child({ module: "contract-enforce" });

export const TRUNCATION_FOOTNOTE =
  "\n\n*The analysis was cut short by a length limit — the last card above may be incomplete.*";

const UNVERIFIED_CARD_FOOTNOTE =
  "\n\n*Engine check unavailable for this card — it could not be matched to the verified analysis and was served unverified.*";

/**
 * Replaces a card the model wrote about a ply whose engine analysis timed
 * out. Honest register (plan §12 A1 + the founder's 2026-08-10 policy:
 * unverified claims are dropped or rewritten, never hedged) — the card's
 * severity and classification would both have been derived from the timeout
 * sentinel's fake cp:0. See sentinelGuard.ts.
 */
export const SENTINEL_REFUSAL_NOTE =
  "\n\n*One moment in this game couldn't be checked — the engine analysis timed out on that move, so I've left it out rather than guess at it.*\n\n";

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
  /** Cards refused because their severity/classification came from a
   * client-timeout sentinel (PR-CI-5 sentinel guard). */
  sentinelCardsRefused: number;
  /** Model-emitted blocks that named a refused sentinel ply and were
   * replaced by SENTINEL_REFUSAL_NOTE rather than shipped. */
  sentinelBlocksRefused: number;
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
  /** Blocks the model wrote for a refused sentinel ply (replaced by the note). */
  let sentinelBlocksRefused = 0;
  let costUsd = 0;
  let firstCardEmitMs: number | null = null;

  /** Insights not yet claimed by a header match — order fallback anchor.
   * Sentinel-bearing insights are already refused by the card plan. */
  const cardPlan = selectCardInsightsDetailed(contract);
  const expectedQueue: InsightContract[] = cardPlan.cards;
  const sentinelCardsRefused = cardPlan.droppedSentinel.length;
  if (sentinelCardsRefused > 0) {
    log.warn("contract_enforce_sentinel_cards_refused", {
      contractId: contract.contractId,
      correlationId: opts.correlationId,
      refused: cardPlan.droppedSentinel.map((i) => i.factIdPrefix),
    });
  }
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

  /**
   * "sentinel_refused" — the block is about a ply whose engine data timed
   * out; its severity/classification are fabricated, so neither a
   * server-authoritative header nor the model's own copy of one may ship.
   * "unanchored" — an off-plan card the model invented: fail-visible raw.
   */
  type BlockAnchor =
    | { kind: "insight"; insight: InsightContract }
    | { kind: "sentinel_refused"; factIdPrefix: string }
    | { kind: "unanchored" };

  const anchorBlock = (block: CompletedBlock): BlockAnchor => {
    const fields = parseInsightHeader(block.headerRaw);
    if (fields) {
      const match = matchInsightForHeader(fields, contract);
      // SENTINEL REFUSAL (PR-CI-5): matchInsightForHeader searches EVERY
      // contract insight, including the sentinel-bearing ones the card plan
      // refused. Anchoring to one would hand the block a server-authoritative
      // header carrying a fabricated classification — the exact thing the
      // guard exists to prevent. Falling through to the expected queue is not
      // safe either: the model wrote this body ABOUT the sentinel ply, so
      // re-heading it as a different card would mislabel real prose. The
      // block is therefore replaced by an honest one-line note.
      // See sentinelGuard.ts.
      if (match && isSentinelBearingInsight(match.insight)) {
        log.warn("contract_enforce_sentinel_anchor_refused", {
          contractId: contract.contractId,
          correlationId: opts.correlationId,
          factIdPrefix: match.insight.factIdPrefix,
        });
        return { kind: "sentinel_refused", factIdPrefix: match.insight.factIdPrefix };
      }
      if (match && !claimed.has(match.insight.factIdPrefix)) {
        claimed.add(match.insight.factIdPrefix);
        return { kind: "insight", insight: match.insight };
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
      return { kind: "insight", insight: next };
    }
    return { kind: "unanchored" };
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
        const anchor = anchorBlock(block);
        enqueue(async () => {
          // Flush any held stripper tail BEFORE the card burst (order).
          emitTracked(stripper.flush());
          if (anchor.kind === "sentinel_refused") {
            sentinelBlocksRefused += 1;
            // Honest register (plan §12 A1): say what happened, ship no
            // fabricated classification, and never re-head the prose as a
            // different card.
            emitTracked(SENTINEL_REFUSAL_NOTE);
            return;
          }
          if (anchor.kind === "unanchored") {
            unanchoredBlocks += 1;
            emitTracked(stripCitations(block.text) + UNVERIFIED_CARD_FOOTNOTE);
            return;
          }
          const insight = anchor.insight;
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
        sentinelCardsRefused,
        sentinelBlocksRefused,
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
        sentinelCardsRefused,
        sentinelBlocksRefused,
        costUsd: Number(costUsd.toFixed(4)),
        firstCardEmitMs,
      });
      return summary;
    },
  };
}
