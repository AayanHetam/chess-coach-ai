import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * T9 (SILENT_SUBSTITUTION_HANDOFF §4) — INSTRUMENTATION, not a fix.
 *
 * The open question: `contextCache` is a module-level Map with no shared
 * storage, so it lives per warm serverless instance. If /api/chat and
 * /api/enhanced-analysis are separate functions, /api/chat can never see an
 * entry the analysis route wrote — the fast path would never hit and every
 * follow-up would silently be a full flagship re-analysis. It works perfectly
 * in local dev (one process), which is exactly why nobody would notice.
 *
 * The handoff is explicit that this must be MEASURED, not guessed, and that
 * shared storage must not be added on the strength of the hypothesis. These
 * tests only prove the measurement is trustworthy: that the three outcomes are
 * distinguishable, and that `cacheSize` is present — because "cold start" and
 * "this instance cannot see the writer's memory" both produce a miss and are
 * told apart by nothing else.
 */

const { mockLog } = vi.hoisted(() => ({
  mockLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/logging", () => ({
  logger: { child: vi.fn(() => mockLog) },
}));

import {
  getAnalysisContext,
  storeAnalysisContext,
  __getContextCacheStats,
  __resetContextCacheStats,
  type AnalysisContext,
} from "@/lib/analysisContextCache";

function ctx(id: string, createdAt = Date.now()): AnalysisContext {
  return {
    contextId: id,
    gameContext: "g",
    compactGameContext: "c",
    playedMoves: ["e4"],
    systemPrompt: "s",
    initialAnalysis: "a",
    fen: "8/8/8/8/8/8/8/8 w - - 0 1",
    playerColor: "w",
    skillLevel: "intermediate",
    moveCount: 1,
    createdAt,
  } as AnalysisContext;
}

function lookups() {
  return mockLog.info.mock.calls
    .filter((c) => c[0] === "analysis_context_lookup")
    .map((c) => c[1]);
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetContextCacheStats();
});

describe("analysis context cache telemetry", () => {
  it("records a hit when the same instance wrote the entry", () => {
    storeAnalysisContext(ctx("ctx-1"));
    expect(getAnalysisContext("ctx-1")).not.toBeNull();
    expect(lookups()[0].outcome).toBe("hit");
    expect(__getContextCacheStats().hits).toBe(1);
  });

  it("records miss_absent for an id this instance never wrote", () => {
    // This is the shape the cross-function-isolation hypothesis predicts.
    expect(getAnalysisContext("never-written")).toBeNull();
    expect(lookups()[0].outcome).toBe("miss_absent");
    expect(__getContextCacheStats().missesAbsent).toBe(1);
  });

  it("distinguishes an expired entry from an absent one", () => {
    // Genuine TTL expiry is unrelated to the hypothesis, so it must not be
    // counted as evidence for it.
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
    storeAnalysisContext(ctx("ctx-old", threeHoursAgo));
    expect(getAnalysisContext("ctx-old")).toBeNull();
    expect(lookups()[0].outcome).toBe("miss_expired");
    expect(__getContextCacheStats().missesExpired).toBe(1);
    expect(__getContextCacheStats().missesAbsent).toBe(0);
  });

  it("carries cacheSize, which is what separates a cold start from isolation", () => {
    // A miss with cacheSize 0 is a cold instance. A miss with cacheSize > 0
    // means the instance holds OTHER entries but not this one — the finding
    // that would justify shared storage. Without this field both look the same.
    getAnalysisContext("miss-on-empty");
    expect(lookups()[0].cacheSize).toBe(0);

    mockLog.info.mockClear();
    storeAnalysisContext(ctx("ctx-a"));
    getAnalysisContext("some-other-id");
    const l = lookups()[0];
    expect(l.outcome).toBe("miss_absent");
    expect(l.cacheSize).toBe(1);
  });

  it("carries instance age and this instance's write count", () => {
    storeAnalysisContext(ctx("ctx-1"));
    getAnalysisContext("ctx-1");
    const l = lookups()[0];
    expect(typeof l.instanceAgeMs).toBe("number");
    expect(l.writesThisInstance).toBe(1);
  });

  it("emits a paired line on write", () => {
    storeAnalysisContext(ctx("ctx-1"));
    expect(
      mockLog.info.mock.calls.some((c) => c[0] === "analysis_context_stored")
    ).toBe(true);
  });

  it("changes no lookup behaviour — instrumentation only", () => {
    storeAnalysisContext(ctx("ctx-1"));
    expect(getAnalysisContext("ctx-1")?.contextId).toBe("ctx-1");
    expect(getAnalysisContext("nope")).toBeNull();
    const expired = ctx("ctx-exp", Date.now() - 3 * 60 * 60 * 1000);
    storeAnalysisContext(expired);
    expect(getAnalysisContext("ctx-exp")).toBeNull();
  });
});
