import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";

// ─────────────────────────────────────────────────────────────────────
// Mock the logger BEFORE importing validatorTelemetry. The module's
// `log = logger.child(...)` call at import time must receive the mocked
// child so all subsequent log.debug/info/warn/error calls are captured.
// vi.hoisted is required because vi.mock factories are hoisted above
// regular const declarations.
// ─────────────────────────────────────────────────────────────────────

const { mockLog } = vi.hoisted(() => ({
  mockLog: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/logging", () => ({
  logger: {
    child: vi.fn(() => mockLog),
  },
}));

import {
  forwardTelemetry,
  type RouteContext,
  type CitationRateSummaryOpts,
} from "@/lib/mastermind/validatorTelemetry";
import type {
  TelemetryEvent,
  FireReason,
} from "@/lib/mastermind/validators";
import type { CitationRateResult } from "@/lib/mastermind/citationRate";

// ─────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────

function event(
  check_name: string,
  fire_reason: FireReason,
  overrides: Partial<TelemetryEvent> = {},
): TelemetryEvent {
  return {
    check_name,
    fire_reason,
    llm_span: "",
    expected: null,
    actual: null,
    retry_count: 0,
    final_outcome: null,
    context: { correlation_id: "test-corr" },
    timestamp_ms: 1700000000000,
    ...overrides,
  };
}

function routeContext(overrides: Partial<RouteContext> = {}): RouteContext {
  return {
    route: "/api/enhanced-analysis",
    userId: "uid-test",
    sessionId: "sess-test",
    responseId: "resp-test",
    userTier: "free",
    category: "opponent_prep",
    finalOutcome: "passed_initial",
    retryCount: 0,
    totalCostUsd: 0.03,
    ...overrides,
  };
}

function bucketAt(citations: number, opportunities: number) {
  return {
    citations,
    opportunities,
    ratePct: opportunities === 0 ? 0 : (citations / opportunities) * 100,
  };
}

function citationRateResult(
  overrides: Partial<CitationRateResult> = {},
): CitationRateResult {
  return {
    category: "opponent_prep",
    primarySource: "scout",
    perSource: {
      feature_delta: null,
      scout: bucketAt(0, 0),
      user_history: null,
      jhamtani: null,
    },
    overall: bucketAt(0, 0),
    ...overrides,
  };
}

function summary(
  overrides: Partial<CitationRateSummaryOpts> = {},
): CitationRateSummaryOpts {
  return {
    citationRate: citationRateResult(),
    userHistoryGameCount: null,
    ...overrides,
  };
}

beforeEach(() => {
  Object.values(mockLog).forEach((fn) => fn.mockClear());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────
// §6.3 per-validator event level mapping
// ─────────────────────────────────────────────────────────────────────

describe("forwardTelemetry: per-validator level mapping (§6.3)", () => {
  it("fire_reason=passed → info", () => {
    forwardTelemetry(
      [event("eval_check", "passed")],
      routeContext(),
    );
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        event: "validator_event",
        fire_reason: "passed",
      }),
    );
  });

  it("fire_reason=parser_low_confidence → info", () => {
    forwardTelemetry(
      [event("scout_citation_parser", "parser_low_confidence")],
      routeContext(),
    );
    expect(mockLog.info).toHaveBeenCalled();
    expect(mockLog.warn).not.toHaveBeenCalled();
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it("fire_reason=parser_json_invalid → info", () => {
    forwardTelemetry(
      [event("scout_citation_parser", "parser_json_invalid")],
      routeContext(),
    );
    expect(mockLog.info).toHaveBeenCalled();
  });

  it.each<FireReason>([
    "qualitative_band_flip",
    "numeric_diff_exceeds_threshold",
    "unsupported_citation",
    "regenerate_invoked",
  ])("fire_reason=%s → warn", (reason) => {
    forwardTelemetry([event("test_check", reason)], routeContext());
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ fire_reason: reason }),
    );
  });

  it("fire_reason=fallback_used → error", () => {
    forwardTelemetry(
      [event("test_check", "fallback_used")],
      routeContext(),
    );
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ fire_reason: "fallback_used" }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// §6.5 PII discipline — llm_span truncation
// ─────────────────────────────────────────────────────────────────────

describe("forwardTelemetry: PII discipline", () => {
  it("llm_span truncated to 200 chars in payload", () => {
    const longSpan = "x".repeat(500);
    forwardTelemetry(
      [event("eval_check", "passed", { llm_span: longSpan })],
      routeContext(),
    );
    const payload = mockLog.info.mock.calls[0][1];
    expect((payload as { llm_span: string }).llm_span.length).toBe(200);
  });

  it("llm_span shorter than cap passes through unchanged", () => {
    const shortSpan = "Black is winning";
    forwardTelemetry(
      [event("eval_check", "passed", { llm_span: shortSpan })],
      routeContext(),
    );
    const payload = mockLog.info.mock.calls[0][1];
    expect((payload as { llm_span: string }).llm_span).toBe(shortSpan);
  });
});

// ─────────────────────────────────────────────────────────────────────
// §6.2 payload shape — context fields stamped
// ─────────────────────────────────────────────────────────────────────

describe("forwardTelemetry: payload shape (§6.2)", () => {
  it("stamps route + user_id + session_id + response_id + category onto every event", () => {
    forwardTelemetry(
      [event("eval_check", "passed")],
      routeContext({
        route: "/api/chat",
        userId: "uid-X",
        sessionId: "sess-X",
        responseId: "resp-X",
        category: "improvement_strategy",
      }),
    );
    const payload = mockLog.info.mock.calls[0][1];
    expect(payload).toMatchObject({
      route: "/api/chat",
      user_id: "uid-X",
      session_id: "sess-X",
      response_id: "resp-X",
      category: "improvement_strategy",
      user_tier: "free",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// §6.3.1 citation_rate_summary — routine vs noteworthy
// ─────────────────────────────────────────────────────────────────────

describe("citation_rate_summary: routine (§6.3.1)", () => {
  it("routine summary emits at debug always", () => {
    // Math.random > sample rate → no info sample
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    forwardTelemetry([], routeContext(), summary());

    expect(mockLog.debug).toHaveBeenCalledWith(
      "citation rate summary",
      expect.objectContaining({ event: "citation_rate_summary" }),
    );
    expect(mockLog.info).not.toHaveBeenCalled();
  });

  it("routine summary emits at info when 1-in-100 sample hits", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.005); // < 0.01

    forwardTelemetry([], routeContext(), summary());

    expect(mockLog.debug).toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith(
      "citation rate summary (sampled routine)",
      expect.objectContaining({ event: "citation_rate_summary" }),
    );
  });

  it("userHistoryGameCount surfaced in citation_rate_summary payload", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    forwardTelemetry(
      [],
      routeContext(),
      summary({ userHistoryGameCount: 87 }),
    );

    const payload = mockLog.debug.mock.calls[0][1];
    expect((payload as { user_history_game_count: number }).user_history_game_count).toBe(87);
  });

  it("userHistoryGameCount=null surfaced when source not fetched", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    forwardTelemetry([], routeContext(), summary());

    const payload = mockLog.debug.mock.calls[0][1];
    expect((payload as { user_history_game_count: number | null }).user_history_game_count).toBeNull();
  });
});

describe("citation_rate_summary: noteworthy triggers (§6.3.1)", () => {
  it("noteworthy=true when finalOutcome=fallback_used → info, no debug", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    forwardTelemetry(
      [],
      routeContext({ finalOutcome: "fallback_used" }),
      summary(),
    );

    expect(mockLog.info).toHaveBeenCalledWith(
      "citation rate summary (noteworthy)",
      expect.objectContaining({ event: "citation_rate_summary" }),
    );
    expect(mockLog.debug).not.toHaveBeenCalled();
  });

  it("noteworthy=true when retryCount > 0", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    forwardTelemetry(
      [],
      routeContext({ retryCount: 1, finalOutcome: "passed_after_retry" }),
      summary(),
    );

    expect(mockLog.info).toHaveBeenCalledWith(
      "citation rate summary (noteworthy)",
      expect.any(Object),
    );
    expect(mockLog.debug).not.toHaveBeenCalled();
  });

  it("noteworthy=true when any check_name fires more than once", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    forwardTelemetry(
      [event("scout_citation", "passed"), event("scout_citation", "passed")],
      routeContext(),
      summary(),
    );

    // One info from each validator_event + one info from citation_rate_summary (noteworthy)
    const noteworthyCall = mockLog.info.mock.calls.find(
      (c) => c[0] === "citation rate summary (noteworthy)",
    );
    expect(noteworthyCall).toBeDefined();
    expect(mockLog.debug).not.toHaveBeenCalled();
  });

  it("single-fire check_name (twice with DIFFERENT names) is not multi-fire", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    forwardTelemetry(
      [event("scout_citation", "passed"), event("user_history_citation", "passed")],
      routeContext(),
      summary(),
    );

    // No noteworthy info call for citation_rate_summary.
    const noteworthyCall = mockLog.info.mock.calls.find(
      (c) => c[0] === "citation rate summary (noteworthy)",
    );
    expect(noteworthyCall).toBeUndefined();
    expect(mockLog.debug).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// §11.3 per-category floor table — noteworthy on below-floor
// ─────────────────────────────────────────────────────────────────────

describe("citation_rate_summary: below-floor noteworthy (§11.3 floors)", () => {
  it("opponent_prep + scout 80% with 5 opps + 85% floor → noteworthy", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    forwardTelemetry(
      [],
      routeContext({ category: "opponent_prep" }),
      summary({
        citationRate: citationRateResult({
          category: "opponent_prep",
          primarySource: "scout",
          perSource: {
            feature_delta: null,
            scout: bucketAt(4, 5), // 80%
            user_history: null,
            jhamtani: null,
          },
        }),
      }),
    );

    expect(mockLog.info).toHaveBeenCalledWith(
      "citation rate summary (noteworthy)",
      expect.any(Object),
    );
    expect(mockLog.debug).not.toHaveBeenCalled();
  });

  it("opponent_prep + scout 90% with 5 opps + 85% floor → routine", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    forwardTelemetry(
      [],
      routeContext({ category: "opponent_prep" }),
      summary({
        citationRate: citationRateResult({
          category: "opponent_prep",
          primarySource: "scout",
          perSource: {
            feature_delta: null,
            scout: bucketAt(9, 10), // 90%
            user_history: null,
            jhamtani: null,
          },
        }),
      }),
    );

    expect(mockLog.debug).toHaveBeenCalled();
    expect(mockLog.info).not.toHaveBeenCalled();
  });

  it("opps < 3 suppresses below-floor (single-opp noise)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    forwardTelemetry(
      [],
      routeContext({ category: "opponent_prep" }),
      summary({
        citationRate: citationRateResult({
          category: "opponent_prep",
          primarySource: "scout",
          perSource: {
            feature_delta: null,
            scout: bucketAt(0, 1), // 0%, 1 opp — would be below floor but suppressed
            user_history: null,
            jhamtani: null,
          },
        }),
      }),
    );

    expect(mockLog.debug).toHaveBeenCalled();
    expect(mockLog.info).not.toHaveBeenCalled();
  });

  it("improvement_strategy + user_history 30% with 5 opps + 50% floor → noteworthy", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    forwardTelemetry(
      [],
      routeContext({ category: "improvement_strategy" }),
      summary({
        citationRate: citationRateResult({
          category: "improvement_strategy",
          primarySource: "user_history",
          perSource: {
            feature_delta: null,
            scout: null,
            user_history: bucketAt(3, 10), // 30%
            jhamtani: null,
          },
        }),
      }),
    );

    expect(mockLog.info).toHaveBeenCalledWith(
      "citation rate summary (noteworthy)",
      expect.any(Object),
    );
  });

  it("meta_motivational + user_history 10% with 5 opps + 20% floor → noteworthy", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    forwardTelemetry(
      [],
      routeContext({ category: "meta_motivational" }),
      summary({
        citationRate: citationRateResult({
          category: "meta_motivational",
          primarySource: "user_history",
          perSource: {
            feature_delta: null,
            scout: null,
            user_history: bucketAt(1, 10), // 10%
            jhamtani: null,
          },
        }),
      }),
    );

    expect(mockLog.info).toHaveBeenCalledWith(
      "citation rate summary (noteworthy)",
      expect.any(Object),
    );
  });

  it("game_review (feature_delta primary, null bucket) → floor check skipped, routine", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    forwardTelemetry(
      [],
      routeContext({ category: "game_review" }),
      summary({
        citationRate: citationRateResult({
          category: "game_review",
          primarySource: "feature_delta",
          perSource: {
            feature_delta: null, // opportunity counter not shipped
            scout: null,
            user_history: null,
            jhamtani: null,
          },
        }),
      }),
    );

    // Null bucket means no floor check fires; goes routine.
    expect(mockLog.debug).toHaveBeenCalled();
    expect(mockLog.info).not.toHaveBeenCalled();
  });

  it("concept_explanation (primarySource: null) → floor check skipped, routine", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    forwardTelemetry(
      [],
      routeContext({ category: "concept_explanation" }),
      summary({
        citationRate: citationRateResult({
          category: "concept_explanation",
          primarySource: null, // deferred to PR 1.D
          perSource: {
            feature_delta: null,
            scout: null,
            user_history: null,
            jhamtani: null,
          },
        }),
      }),
    );

    expect(mockLog.debug).toHaveBeenCalled();
    expect(mockLog.info).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// No citationRate provided → only validator events forwarded
// ─────────────────────────────────────────────────────────────────────

describe("forwardTelemetry: no citationRate", () => {
  it("emits validator events only when citationRate omitted", () => {
    forwardTelemetry(
      [event("eval_check", "passed")],
      routeContext(),
      // no citationRate
    );

    expect(mockLog.info).toHaveBeenCalledTimes(1);
    expect(mockLog.debug).not.toHaveBeenCalled();
  });
});
