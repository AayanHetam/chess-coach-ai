// Unit tests for runStreamingStage9Validators — the helper bundles the
// four Stage 9 validators for the streaming branches' log-only call sites.
//
// These tests verify the bundling + logging contract; the per-validator
// logic is covered by the individual validator test files. A full
// route-integration test (asserting wiring across all 4 streaming
// branches) would mirror streamingGroundingValidation.test.ts's mock
// surface — out of scope for this PR; tracked as a v2 follow-up.

import { describe, it, expect, vi } from "vitest";
import { runStreamingStage9Validators } from "@/lib/mastermind/validators/streamingStage9";
import type { VoterSnapshot } from "@/lib/mastermind/validators";

const CORR = "test-stream-1";

function snapshot(overrides: Partial<VoterSnapshot> = {}): VoterSnapshot {
  return {
    confidence: {
      user_visibility: "HIGH",
      positional_plan: "HIGH",
      mate_in_n: "HIGH",
      material_win: "HIGH",
    },
    maiaProb: 0.65,
    userRating: 1500,
    sfCp: 220,
    sfMate: null,
    lc0Cp: 240,
    syzygyDtm: null,
    ...overrides,
  };
}

function mockLogger() {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
}

describe("runStreamingStage9Validators — bundling contract", () => {
  it("returns all four validator results when no errors", () => {
    const log = mockLogger();
    const result = runStreamingStage9Validators({
      llmResponse: "Solid positional move.",
      voterSnapshot: snapshot(),
      correlationId: CORR,
      branch: "stream-test",
      log: log as never,
    });
    expect(result).not.toBeNull();
    expect(result?.userVis).toBeDefined();
    expect(result?.positional).toBeDefined();
    expect(result?.mate).toBeDefined();
    expect(result?.material).toBeDefined();
  });

  it("does NOT log when all validators pass", () => {
    const log = mockLogger();
    runStreamingStage9Validators({
      llmResponse: "Solid positional move.",
      voterSnapshot: snapshot(),
      correlationId: CORR,
      branch: "stream-test",
      log: log as never,
    });
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe("runStreamingStage9Validators — per-validator logging", () => {
  it("logs stage9_user_visibility_failed when userVisibility fires", () => {
    const log = mockLogger();
    runStreamingStage9Validators({
      llmResponse: "The obvious move was Nf3.",
      voterSnapshot: snapshot({
        confidence: { user_visibility: "NONE", positional_plan: "HIGH", mate_in_n: "HIGH", material_win: "HIGH" },
        maiaProb: 0.05,
      }),
      correlationId: CORR,
      branch: "stream-test",
      log: log as never,
    });
    expect(log.warn).toHaveBeenCalledWith(
      "stage9_user_visibility_failed",
      expect.objectContaining({
        issues: ["obvious"],
        maia_prob: 0.05,
        user_rating: 1500,
        correlationId: CORR,
        branch: "stream-test",
      }),
    );
  });

  it("logs stage9_positional_claim_failed with any_escalated flag", () => {
    const log = mockLogger();
    runStreamingStage9Validators({
      llmResponse: "White is dominating.",
      voterSnapshot: snapshot({
        confidence: { user_visibility: "HIGH", positional_plan: "NONE", mate_in_n: "HIGH", material_win: "HIGH" },
        sfCp: 40,
        lc0Cp: -80,  // Lc0 vetoes
      }),
      correlationId: CORR,
      branch: "stream-test",
      log: log as never,
    });
    expect(log.warn).toHaveBeenCalledWith(
      "stage9_positional_claim_failed",
      expect.objectContaining({
        issues: ["dominating"],
        positional_plan: "NONE",
        any_escalated: true,
      }),
    );
  });

  it("logs stage9_mate_claim_failed", () => {
    const log = mockLogger();
    runStreamingStage9Validators({
      llmResponse: "There was mate in 5.",
      voterSnapshot: snapshot({
        confidence: { user_visibility: "HIGH", positional_plan: "HIGH", mate_in_n: "NONE", material_win: "HIGH" },
      }),
      correlationId: CORR,
      branch: "stream-test",
      log: log as never,
    });
    expect(log.warn).toHaveBeenCalledWith(
      "stage9_mate_claim_failed",
      expect.objectContaining({
        mate_in_n: "NONE",
      }),
    );
  });

  it("logs stage9_material_win_failed with any_escalated flag when |sfCp| < 100", () => {
    const log = mockLogger();
    runStreamingStage9Validators({
      llmResponse: "White is winning material.",
      voterSnapshot: snapshot({
        confidence: { user_visibility: "HIGH", positional_plan: "HIGH", mate_in_n: "HIGH", material_win: "NONE" },
        sfCp: 30,  // engine contradicts
      }),
      correlationId: CORR,
      branch: "stream-test",
      log: log as never,
    });
    expect(log.warn).toHaveBeenCalledWith(
      "stage9_material_win_failed",
      expect.objectContaining({
        material_win: "NONE",
        any_escalated: true,
      }),
    );
  });

  it("logs all four fires when all four validators trip on one response", () => {
    const log = mockLogger();
    runStreamingStage9Validators({
      llmResponse: "Obviously White is dominating, with mate in 5 and winning material.",
      voterSnapshot: snapshot({
        confidence: {
          user_visibility: "NONE",
          positional_plan: "NONE",
          mate_in_n: "NONE",
          material_win: "NONE",
        },
        maiaProb: 0.05,
        sfCp: 30,
      }),
      correlationId: CORR,
      branch: "stream-test",
      log: log as never,
    });
    const fireKeys = log.warn.mock.calls.map((c: unknown[]) => c[0]);
    expect(fireKeys).toContain("stage9_user_visibility_failed");
    expect(fireKeys).toContain("stage9_positional_claim_failed");
    expect(fireKeys).toContain("stage9_mate_claim_failed");
    expect(fireKeys).toContain("stage9_material_win_failed");
  });
});

describe("runStreamingStage9Validators — branch tagging", () => {
  it("includes branch tag in every log call", () => {
    const log = mockLogger();
    const branch = "stream-flagon-pipeline";
    runStreamingStage9Validators({
      llmResponse: "Obviously White is dominating.",
      voterSnapshot: snapshot({
        confidence: {
          user_visibility: "NONE",
          positional_plan: "NONE",
          mate_in_n: "HIGH",
          material_win: "HIGH",
        },
        maiaProb: 0.05,
      }),
      correlationId: CORR,
      branch,
      log: log as never,
    });
    for (const call of log.warn.mock.calls) {
      const payload = call[1] as { branch: string };
      expect(payload.branch).toBe(branch);
    }
  });
});
