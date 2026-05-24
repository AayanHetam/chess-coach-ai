/**
 * citationRate — PR 1.C Stage A.9
 *
 * Pure helper that aggregates validator results into per-source +
 * overall citation-rate metrics for the Stage C synthetic-tester gate.
 *
 * **Aggregator, not a validator.** Reads validator output (telemetry +
 * issues) and opportunity arrays from upstream counters; emits per-source
 * + overall rates. Floor enforcement lives in the sweep harness; this
 * helper computes the data.
 *
 * Plan: MASTERMIND_CONTEXT/PR_1C_PIPELINE_DATA_SOURCES_PLAN.md
 *
 * Placement at src/lib/mastermind/citationRate.ts (NOT validators/) per
 * T5 ratified 2026-05-18 — matches `userHistoryAggregates.ts` pattern.
 * Validators check claims; aggregators consume validator output.
 *
 * **Metric computed:** per-claim citation rate (the [§5.3.2](MASTERMIND_CONTEXT/PR_1C_PLAN.md)
 * metric). Of opportunities to cite personalized data in the source(s)
 * relevant to this category, the fraction the coach actually used.
 *
 * **Metric NOT computed:** cross-source coverage rate (orchestrator-style
 * "how many distinct source types did the coach span?"). That's a Phase 2
 * concern per [MASTERMIND_BUILD_PLAN.md §5](MASTERMIND_CONTEXT/MASTERMIND_BUILD_PLAN.md);
 * deferred to a follow-up.
 */

import type {
  ValidatorResult,
  ScoutOpportunity,
  UserHistoryOpportunity,
} from "./validators/types";
import type { QuestionCategory } from "./categorization/categoryClassifier";

// ─────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────

export type CitationSource = "feature_delta" | "scout" | "user_history" | "jhamtani";

export interface CitationRateOpts {
  category: QuestionCategory;
  /**
   * Validator results from the turn. The helper reads each result's
   * telemetry array for `fire_reason: "passed"` events (matched claims)
   * and counts them per source via the `check_name` prefix. Issues
   * (unsupported_citation fires) are NOT counted as citations — they're
   * the not-cited fires.
   */
  validatorResults: ValidatorResult[];
  /**
   * Opportunity counts per source. Each entry is optional; missing
   * (undefined) → that source's perSource bucket is null in the result.
   * Empty array → zero opportunities, contributes 0/0 = 0 rate.
   */
  opportunities: {
    scout?: ScoutOpportunity[];
    userHistory?: UserHistoryOpportunity[];
    // featureDelta + jhamtani slots reserved for future commits.
    // feature_delta opportunity counter NOT shipped in A.9 — see
    // PR_1C_PLAN.md §11.7 + MASTERMIND_CONTEXT/cleanup_followups.md.
    featureDelta?: unknown[];
    jhamtani?: unknown[];
  };
}

export interface CitationRateBucket {
  /** Number of citations the coach made matching this source (passed events). */
  citations: number;
  /** Number of citation opportunities in this source for this turn. */
  opportunities: number;
  /** citations / opportunities × 100. NaN-guarded: zero opportunities → 0 rate. */
  ratePct: number;
}

export interface CitationRateResult {
  category: QuestionCategory;
  /**
   * The primary source for the category, or null when the category has
   * no source mapping in PR 1.C (concept_explanation → null, deferred
   * to PR 1.D). Stage C sweep can use this to look up the per-category
   * floor; floor enforcement lives in the sweep, not this helper.
   */
  primarySource: CitationSource | null;
  /** Per-source breakdown. null = no opportunity counter provided for that source. */
  perSource: Record<CitationSource, CitationRateBucket | null>;
  /** Aggregate across all sources that have opportunity arrays (non-null). */
  overall: CitationRateBucket;
}

// ─────────────────────────────────────────────────────────────────────────
// Category → primary source mapping
// ─────────────────────────────────────────────────────────────────────────

/**
 * Per [PR_1C_PLAN.md §5.3.2](MASTERMIND_CONTEXT/PR_1C_PLAN.md). The
 * primary source is the data source whose citation-rate floor the
 * category is evaluated against. Stage C sweep applies the floor;
 * this constant exposes the mapping.
 */
const CATEGORY_PRIMARY_SOURCE: Record<QuestionCategory, CitationSource | null> = {
  game_review: "feature_delta",
  opponent_prep: "scout",
  position_analysis: "feature_delta",
  concept_explanation: null, // deferred — jhamtani not shipped (PR 1.D)
  improvement_strategy: "user_history",
  meta_motivational: "user_history",
};

// ─────────────────────────────────────────────────────────────────────────
// Citation counting from telemetry
// ─────────────────────────────────────────────────────────────────────────

/**
 * Validator → telemetry check_name prefix that identifies its passing
 * events. Each validator emits check_name=<prefix> + fire_reason="passed"
 * for matched claims (verified in scoutCitation/userHistoryCitation/PR 1.B).
 */
const SOURCE_PASSED_CHECK_NAME: Record<CitationSource, string> = {
  feature_delta: "feature_citation", // PR 1.B emits "feature_citation" for passed
  scout: "scout_citation",
  user_history: "user_history_citation",
  jhamtani: "jhamtani_citation", // not yet emitted; PR 1.D
};

function countCitations(results: ValidatorResult[], checkName: string): number {
  let n = 0;
  for (const r of results) {
    for (const e of r.telemetry) {
      if (e.check_name === checkName && e.fire_reason === "passed") n++;
    }
  }
  return n;
}

function nanGuardedRate(citations: number, opportunities: number): number {
  if (opportunities === 0) return 0;
  return (citations / opportunities) * 100;
}

// ─────────────────────────────────────────────────────────────────────────
// computeCitationRate — public entry point
// ─────────────────────────────────────────────────────────────────────────

export function computeCitationRate(opts: CitationRateOpts): CitationRateResult {
  const { category, validatorResults, opportunities } = opts;

  // Build perSource buckets. Each is null when no opportunity array provided.
  const perSource: Record<CitationSource, CitationRateBucket | null> = {
    feature_delta: null,
    scout: null,
    user_history: null,
    jhamtani: null,
  };

  // Sources to compute: only those with an opportunity array (even if empty).
  const sourceArrays: Array<{ src: CitationSource; arr: unknown[] | undefined }> = [
    { src: "scout", arr: opportunities.scout },
    { src: "user_history", arr: opportunities.userHistory },
    { src: "feature_delta", arr: opportunities.featureDelta },
    { src: "jhamtani", arr: opportunities.jhamtani },
  ];

  let overallCitations = 0;
  let overallOpportunities = 0;

  for (const { src, arr } of sourceArrays) {
    if (arr === undefined) continue; // null/missing — skip entirely
    const citations = countCitations(validatorResults, SOURCE_PASSED_CHECK_NAME[src]);
    const opps = arr.length;
    perSource[src] = {
      citations,
      opportunities: opps,
      ratePct: nanGuardedRate(citations, opps),
    };
    overallCitations += citations;
    overallOpportunities += opps;
  }

  return {
    category,
    primarySource: CATEGORY_PRIMARY_SOURCE[category],
    perSource,
    overall: {
      citations: overallCitations,
      opportunities: overallOpportunities,
      ratePct: nanGuardedRate(overallCitations, overallOpportunities),
    },
  };
}
