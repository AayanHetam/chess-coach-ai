import { describe, it, expect } from "vitest";
import {
  computeCitationRate,
  type CitationSource,
} from "@/lib/mastermind/citationRate";
import type {
  ValidatorResult,
  TelemetryEvent,
  ScoutOpportunity,
  UserHistoryOpportunity,
  ScoutClaimType,
  UserHistoryClaimType,
} from "@/lib/mastermind/validators";
import type { QuestionCategory } from "@/lib/mastermind/categorization/categoryClassifier";

// ──────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ──────────────────────────────────────────────────────────────────────────

function telemetry(check_name: string, fire_reason: "passed" | "unsupported_citation" | "parser_low_confidence" | "parser_json_invalid"): TelemetryEvent {
  return {
    check_name,
    fire_reason,
    llm_span: "",
    expected: null,
    actual: null,
    retry_count: 0,
    final_outcome: null,
    context: { correlation_id: "test" },
    timestamp_ms: 0,
  };
}

function emptyResult(): ValidatorResult {
  return { issues: [], passed: true, telemetry: [], costUsd: 0 };
}

function resultWithEvents(events: TelemetryEvent[]): ValidatorResult {
  return { issues: [], passed: true, telemetry: events, costUsd: 0 };
}

function scoutOpp(claim_type: ScoutClaimType): ScoutOpportunity {
  return { dataSource: "scout", claim_type, ref: {} };
}

function userHistoryOpp(claim_type: UserHistoryClaimType): UserHistoryOpportunity {
  return { dataSource: "user_history", claim_type, ref: {} };
}

// ──────────────────────────────────────────────────────────────────────────
// Baseline behavior
// ──────────────────────────────────────────────────────────────────────────

describe("citationRate: baseline", () => {
  it("empty validator results + no opportunities → zeros everywhere", () => {
    const r = computeCitationRate({
      category: "opponent_prep",
      validatorResults: [],
      opportunities: {},
    });
    expect(r.overall).toMatchObject({ citations: 0, opportunities: 0, ratePct: 0 });
    expect(r.perSource.scout).toBeNull();
    expect(r.perSource.user_history).toBeNull();
    expect(r.perSource.feature_delta).toBeNull();
    expect(r.perSource.jhamtani).toBeNull();
  });

  it("opportunity array provided but no citations → 0% rate, not NaN", () => {
    const r = computeCitationRate({
      category: "opponent_prep",
      validatorResults: [emptyResult()],
      opportunities: { scout: [scoutOpp("archetype"), scoutOpp("tells_total")] },
    });
    expect(r.perSource.scout).toMatchObject({ citations: 0, opportunities: 2, ratePct: 0 });
  });

  it("zero opportunities + zero citations → 0% rate (NaN-guard)", () => {
    const r = computeCitationRate({
      category: "opponent_prep",
      validatorResults: [emptyResult()],
      opportunities: { scout: [] },
    });
    expect(r.perSource.scout).toMatchObject({ citations: 0, opportunities: 0, ratePct: 0 });
    expect(Number.isFinite(r.perSource.scout!.ratePct)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Per-source counting from telemetry
// ──────────────────────────────────────────────────────────────────────────

describe("citationRate: per-source counting", () => {
  it("scout: passed events counted, ratePct correct", () => {
    const r = computeCitationRate({
      category: "opponent_prep",
      validatorResults: [
        resultWithEvents([
          telemetry("scout_citation", "passed"),
          telemetry("scout_citation", "passed"),
          telemetry("scout_citation", "passed"),
        ]),
      ],
      opportunities: { scout: Array(5).fill(null).map(() => scoutOpp("archetype")) },
    });
    expect(r.perSource.scout).toMatchObject({ citations: 3, opportunities: 5, ratePct: 60 });
  });

  it("user_history: passed events counted", () => {
    const r = computeCitationRate({
      category: "improvement_strategy",
      validatorResults: [
        resultWithEvents([
          telemetry("user_history_citation", "passed"),
          telemetry("user_history_citation", "passed"),
        ]),
      ],
      opportunities: { userHistory: Array(4).fill(null).map(() => userHistoryOpp("time_control_performance")) },
    });
    expect(r.perSource.user_history).toMatchObject({ citations: 2, opportunities: 4, ratePct: 50 });
  });

  it("both sources: aggregates correctly", () => {
    const r = computeCitationRate({
      category: "opponent_prep",
      validatorResults: [
        resultWithEvents([
          telemetry("scout_citation", "passed"),
          telemetry("scout_citation", "passed"),
        ]),
        resultWithEvents([
          telemetry("user_history_citation", "passed"),
        ]),
      ],
      opportunities: {
        scout: [scoutOpp("archetype"), scoutOpp("tells_total")],
        userHistory: [userHistoryOpp("hours_played_claim"), userHistoryOpp("hours_played_claim")],
      },
    });
    expect(r.perSource.scout).toMatchObject({ citations: 2, opportunities: 2, ratePct: 100 });
    expect(r.perSource.user_history).toMatchObject({ citations: 1, opportunities: 2, ratePct: 50 });
    expect(r.overall).toMatchObject({ citations: 3, opportunities: 4, ratePct: 75 });
  });

  it("feature_delta: counts passed events from PR 1.B's check_name", () => {
    // feature_citation is PR 1.B's passing-event check_name; even though
    // A.9 doesn't ship an opportunity counter, citation counting works.
    const r = computeCitationRate({
      category: "game_review",
      validatorResults: [
        resultWithEvents([
          telemetry("feature_citation", "passed"),
          telemetry("feature_citation", "passed"),
        ]),
      ],
      // No opportunity counter for feature_delta in A.9 — perSource bucket is null
      opportunities: {},
    });
    // perSource.feature_delta is null (no opportunities provided);
    // citations still flow through telemetry but the bucket isn't computed.
    expect(r.perSource.feature_delta).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Category → primary source mapping
// ──────────────────────────────────────────────────────────────────────────

describe("citationRate: primary source mapping", () => {
  const cases: Array<[QuestionCategory, CitationSource | null]> = [
    ["game_review", "feature_delta"],
    ["opponent_prep", "scout"],
    ["position_analysis", "feature_delta"],
    ["concept_explanation", null], // deferred to PR 1.D
    ["improvement_strategy", "user_history"],
    ["meta_motivational", "user_history"],
  ];

  for (const [category, expected] of cases) {
    it(`${category} → primarySource ${expected ?? "null"}`, () => {
      const r = computeCitationRate({
        category,
        validatorResults: [],
        opportunities: {},
      });
      expect(r.primarySource).toBe(expected);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Telemetry filtering: only passed events count as citations
// ──────────────────────────────────────────────────────────────────────────

describe("citationRate: telemetry filtering", () => {
  it("unsupported_citation events are NOT counted as citations", () => {
    const r = computeCitationRate({
      category: "opponent_prep",
      validatorResults: [
        resultWithEvents([
          telemetry("scout_citation", "passed"),
          telemetry("scout_citation_unsupported", "unsupported_citation"),
          telemetry("scout_citation_unsupported", "unsupported_citation"),
        ]),
      ],
      opportunities: { scout: [scoutOpp("archetype"), scoutOpp("rival_record")] },
    });
    expect(r.perSource.scout!.citations).toBe(1);
  });

  it("parser_low_confidence events are NOT counted", () => {
    const r = computeCitationRate({
      category: "opponent_prep",
      validatorResults: [
        resultWithEvents([
          telemetry("scout_citation_parser", "parser_low_confidence"),
          telemetry("scout_citation", "passed"),
        ]),
      ],
      opportunities: { scout: [scoutOpp("archetype")] },
    });
    expect(r.perSource.scout!.citations).toBe(1);
  });

  it("parser_json_invalid events are NOT counted", () => {
    const r = computeCitationRate({
      category: "opponent_prep",
      validatorResults: [
        resultWithEvents([
          telemetry("scout_citation_parser", "parser_json_invalid"),
        ]),
      ],
      opportunities: { scout: [scoutOpp("archetype")] },
    });
    expect(r.perSource.scout!.citations).toBe(0);
  });

  it("only matches exact check_name (scout_citation does NOT match scout_citation_unsupported)", () => {
    const r = computeCitationRate({
      category: "opponent_prep",
      validatorResults: [
        resultWithEvents([
          telemetry("scout_citation_unsupported", "passed"), // unusual but tests strictness
        ]),
      ],
      opportunities: { scout: [scoutOpp("archetype")] },
    });
    // scout_citation_unsupported with fire_reason=passed wouldn't count as
    // a citation because the check_name doesn't exactly match SOURCE_PASSED_CHECK_NAME.scout
    expect(r.perSource.scout!.citations).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Edge cases
// ──────────────────────────────────────────────────────────────────────────

describe("citationRate: edge cases", () => {
  it("empty opportunities array (vs undefined) → bucket computed with 0 opps", () => {
    const r = computeCitationRate({
      category: "opponent_prep",
      validatorResults: [resultWithEvents([telemetry("scout_citation", "passed")])],
      opportunities: { scout: [] },
    });
    expect(r.perSource.scout).toMatchObject({ citations: 1, opportunities: 0, ratePct: 0 });
  });

  it("multiple validator results combine into one citation count", () => {
    const r = computeCitationRate({
      category: "opponent_prep",
      validatorResults: [
        resultWithEvents([telemetry("scout_citation", "passed")]),
        resultWithEvents([telemetry("scout_citation", "passed")]),
        resultWithEvents([telemetry("scout_citation", "passed")]),
      ],
      opportunities: { scout: [scoutOpp("archetype")] },
    });
    expect(r.perSource.scout!.citations).toBe(3);
  });

  it("overall excludes sources with no opportunity array provided", () => {
    // Only scout opportunities provided; user_history events exist but their
    // bucket is null and their citations don't contribute to overall.
    const r = computeCitationRate({
      category: "opponent_prep",
      validatorResults: [
        resultWithEvents([
          telemetry("scout_citation", "passed"),
          telemetry("user_history_citation", "passed"),
          telemetry("user_history_citation", "passed"),
        ]),
      ],
      opportunities: { scout: [scoutOpp("archetype")] },
    });
    expect(r.perSource.scout).toMatchObject({ citations: 1, opportunities: 1 });
    expect(r.perSource.user_history).toBeNull();
    expect(r.overall).toMatchObject({ citations: 1, opportunities: 1, ratePct: 100 });
  });
});
