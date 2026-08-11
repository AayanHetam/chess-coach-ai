/**
 * Sentinel guard (PR-CI-5) — the contract-side answer to "cited ≠ true".
 *
 * ── The hazard ─────────────────────────────────────────────────────────────
 * When the client-side Stockfish times out it does not omit the position: it
 * returns a SENTINEL line `{pv: [], depth: 0, cp: 0}`. The builder correctly
 * flags that (`EvalFact.sentinel`, `display: "engine data unavailable"`) —
 * but the numbers DERIVED from it are not flagged, and they are fabrications:
 *
 *   - `cpBeforeFlat` / `cpAfterFlat` take the sentinel's fake `cp: 0`;
 *   - `severityDropCp` is the difference against that fake 0;
 *   - `classification` ("blunder" | "mistake" | "inaccuracy") is a pure
 *     function of that fabricated drop;
 *   - `renderInsightHeader` then prints the fabricated classification in the
 *     SERVER-AUTHORITATIVE header, immediately beside the honest
 *     "engine data unavailable" eval field.
 *
 * The referee validates prose AGAINST the contract. Prose that faithfully
 * repeats "this inaccuracy cost you about 0.8 pawns" is therefore CITED,
 * CONSISTENT, and WRONG — and the referee certifies it. A referee that
 * certifies a fabricated contract is worse than no referee, so the fix has to
 * be on the contract side, before a card exists.
 *
 * ── Why these insights exist at all ────────────────────────────────────────
 * `selectInsights` Scan 1 (TOP MISTAKES) explicitly skips plies touching a
 * sentinel, so a top-mistake insight is sentinel-free by construction. Scan 2
 * (CHESS INTELLIGENCE top-3) does NOT skip sentinels — a faithful
 * reproduction of the legacy route, flagged in that module's own header as
 * "reproduced, not endorsed". So every sentinel-bearing card is an
 * INTEL-ONLY card (`topMistakeRank === null`), and dropping it costs at most
 * a supporting card, never a top mistake. Measured on the vendored fixture
 * set: exactly one card across ten games (03_sentinel_timeout → I3,
 * classification "inaccuracy", severityDropCp 80, evalBefore.sentinel true).
 *
 * ── What this module does NOT do (deliberate scope fence) ──────────────────
 * It does not touch `serialize.ts` (the legacy prompt's unconditional
 * "Classification: BLUNDER" line above "Eval: engine data unavailable") or
 * `selectInsights.ts` Scan 2 itself. Those are the upstream Group-C defects,
 * they are owned elsewhere, and fixing them here would collide. This guard is
 * strictly a SERVING-path refusal: no enforced card is ever built from a
 * sentinel-bearing insight. See the CI-5 report for what remains exposed.
 */
import type { CoachContract, InsightContract } from "./types";

/**
 * True when this insight's severity/classification are derived from a
 * client-timeout sentinel and are therefore fabricated.
 *
 * BOTH ends count. The plan text names `evalAfter`, but the drop is a
 * difference: a sentinel on EITHER side poisons `severityDropCp` and the
 * `classification` computed from it identically. The fixture case is in fact
 * an `evalBefore` sentinel, so guarding only `evalAfter` would have missed
 * the one real instance in the corpus.
 */
export function isSentinelBearingInsight(insight: InsightContract): boolean {
  return insight.evalBefore.sentinel === true || insight.evalAfter.sentinel === true;
}

export interface CardPartition {
  /** Insights safe to card — the enforced card plan. */
  cards: InsightContract[];
  /** Refused: sentinel-derived severity/classification (telemetry + tests). */
  droppedSentinel: InsightContract[];
  /** Refused by the card-worthiness floor (cardWorthiness.ts). Absent from
   * the raw sentinel partition, which knows nothing about worthiness. */
  droppedBelowFloor?: InsightContract[];
  /** Cleared the floor, lost the 5-card cap. */
  droppedOverCap?: InsightContract[];
  /** The floor emptied the plan and the single best moment was restored. */
  headlineRestored?: boolean;
}

/**
 * Split an ordered card plan into servable cards and sentinel refusals.
 *
 * The drop is total (the card is never planned, never prompted, never
 * anchored, never rendered) rather than a fallback to the template card,
 * because the TEMPLATE CARD DOES NOT HELP HERE: `renderInsightHeader` is
 * server-authoritative and prints `insight.classification` verbatim, so a
 * template card for a sentinel insight still ships the fabricated
 * "[INSIGHT:12:b:inaccuracy:engine data unavailable:…]" header. Dropping is
 * the only option that emits nothing false.
 *
 * Monotone by construction: it can only remove cards, so it can never
 * introduce a new claim, and a review whose every card is refused degrades to
 * the zero-card overview branch the verbalizer prompt already handles.
 */
export function partitionSentinelCards(ordered: InsightContract[]): CardPartition {
  const cards: InsightContract[] = [];
  const droppedSentinel: InsightContract[] = [];
  for (const insight of ordered) {
    if (isSentinelBearingInsight(insight)) droppedSentinel.push(insight);
    else cards.push(insight);
  }
  return { cards, droppedSentinel };
}

/** Sentinel-bearing insights anywhere in the contract (not just carded). */
export function sentinelBearingInsights(contract: CoachContract): InsightContract[] {
  return contract.insights.filter(isSentinelBearingInsight);
}
