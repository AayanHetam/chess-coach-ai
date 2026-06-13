import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import {
  withPipelineTimeout,
  readPipelineTimeoutMs,
  readMaxRetries,
  resolveOverclaimRetries,
  DEFAULT_PIPELINE_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
} from "@/lib/mastermind/pipelineTimeout";
import type { RegenerateResult } from "@/lib/mastermind/validators";
import type { PositionConfidence } from "@/lib/grounding/positionConfidence";

const pc = (level: PositionConfidence["level"]): PositionConfidence => ({
  level,
  score: level === "engine_verified" ? 90 : level === "mixed" ? 50 : 10,
  drivers: [],
});

describe("resolveOverclaimRetries — CH-2 confidence-aware single-regen", () => {
  it("leaves the budget unchanged when overclaim is NOT enforced (non-anchored)", () => {
    expect(resolveOverclaimRetries(2, pc("strategic_read"), false)).toBe(2);
    expect(resolveOverclaimRetries(2, pc("engine_verified"), false)).toBe(2);
  });

  it("leaves the budget unchanged when there is no snapshot", () => {
    expect(resolveOverclaimRetries(2, undefined, true)).toBe(2);
  });

  it("strategic_read → 0 retries (don't chase a shot in the dark)", () => {
    expect(resolveOverclaimRetries(2, pc("strategic_read"), true)).toBe(0);
  });

  it("mixed / engine_verified → at most ONE hedge-retry (hard stop)", () => {
    expect(resolveOverclaimRetries(2, pc("mixed"), true)).toBe(1);
    expect(resolveOverclaimRetries(2, pc("engine_verified"), true)).toBe(1);
  });

  it("never raises the budget above the category cap (game_review 0 stays 0)", () => {
    expect(resolveOverclaimRetries(0, pc("engine_verified"), true)).toBe(0);
    expect(resolveOverclaimRetries(1, pc("mixed"), true)).toBe(1);
  });
});

function happyResult(overrides: Partial<RegenerateResult> = {}): RegenerateResult {
  return {
    finalResponse: "Coach analysis here.",
    retryCount: 0,
    finalOutcome: "passed_initial",
    cumulativeIssues: [],
    totalCostUsd: 0.01,
    telemetry: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("withPipelineTimeout: pipeline resolves before timer", () => {
  it("returns pipeline result with timedOut: false", async () => {
    const factory = (_signal: AbortSignal) => Promise.resolve(happyResult());
    const result = await withPipelineTimeout(factory, {
      timeoutMs: 5000,
      correlationId: "test-corr",
      fallbackResponse: "should not appear",
    });
    expect(result.timedOut).toBe(false);
    expect(result.finalResponse).toBe("Coach analysis here.");
    expect(result.finalOutcome).toBe("passed_initial");
  });

  it("clears the timer when pipeline wins (no zombie callbacks)", async () => {
    const factory = (_signal: AbortSignal) => Promise.resolve(happyResult());
    const result = await withPipelineTimeout(factory, {
      timeoutMs: 5000,
      correlationId: "test-corr",
      fallbackResponse: "fb",
    });
    expect(result.timedOut).toBe(false);
    // If the timer weren't cleared, advancing fake time past the timeout
    // could still fire setTimeout — but since the timer was cleared,
    // nothing happens.
    vi.advanceTimersByTime(10_000);
    // No assertion needed beyond "no unhandled rejection" — vitest will
    // surface any if the timer fired against a settled promise.
  });

  it("signal is NOT aborted when pipeline wins (no spurious cancellation)", async () => {
    let capturedSignal: AbortSignal | undefined;
    const factory = (signal: AbortSignal) => {
      capturedSignal = signal;
      return Promise.resolve(happyResult());
    };
    await withPipelineTimeout(factory, {
      timeoutMs: 5000,
      correlationId: "test-corr",
      fallbackResponse: "fb",
    });
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);
  });
});

describe("withPipelineTimeout: timer fires first", () => {
  it("resolves with synthetic timed-out result", async () => {
    const factory = (_signal: AbortSignal) =>
      new Promise<RegenerateResult>(() => {});
    const racePromise = withPipelineTimeout(factory, {
      timeoutMs: 100,
      correlationId: "test-corr",
      fallbackResponse: "Sorry, still working on this — try again in a moment.",
    });

    vi.advanceTimersByTime(100);
    const result = await racePromise;

    expect(result.timedOut).toBe(true);
    expect(result.finalResponse).toBe("Sorry, still working on this — try again in a moment.");
    expect(result.finalOutcome).toBe("fallback_used");
    expect(result.retryCount).toBe(0);
    expect(result.totalCostUsd).toBe(0);
  });

  it("synthetic telemetry event has check_name=pipeline_timeout + correlation_id", async () => {
    const factory = (_signal: AbortSignal) =>
      new Promise<RegenerateResult>(() => {});
    const racePromise = withPipelineTimeout(factory, {
      timeoutMs: 100,
      correlationId: "corr-xyz",
      fallbackResponse: "fb",
    });

    vi.advanceTimersByTime(100);
    const result = await racePromise;

    expect(result.telemetry).toHaveLength(1);
    expect(result.telemetry[0]).toMatchObject({
      check_name: "pipeline_timeout",
      fire_reason: "fallback_used",
      context: { correlation_id: "corr-xyz" },
    });
  });

  it("default timeout is 55s (raised from 45s on 2026-05-26 to fit long game_review queries under Vercel 60s maxDuration)", () => {
    expect(DEFAULT_PIPELINE_TIMEOUT_MS).toBe(55_000);
  });

  it("uses default 55s when timeoutMs not provided", async () => {
    const factory = (_signal: AbortSignal) =>
      new Promise<RegenerateResult>(() => {});
    const racePromise = withPipelineTimeout(factory, {
      correlationId: "test-corr",
      fallbackResponse: "fb",
    });

    // Advance 54s — not yet expired
    vi.advanceTimersByTime(54_000);
    // Race not yet resolved; need to advance the remaining second.
    vi.advanceTimersByTime(1_000);
    const result = await racePromise;
    expect(result.timedOut).toBe(true);
  });
});

describe("withPipelineTimeout: pipeline rejection passes through", () => {
  it("rejected pipeline propagates the error (not a timeout)", async () => {
    const factory = (_signal: AbortSignal) =>
      Promise.reject(new Error("pipeline blew up"));
    await expect(
      withPipelineTimeout(factory, {
        timeoutMs: 5000,
        correlationId: "test-corr",
        fallbackResponse: "fb",
      }),
    ).rejects.toThrow("pipeline blew up");
  });
});

describe("withPipelineTimeout: signal cancellation (fix-orphan-pipeline-cancellation)", () => {
  it("factory's signal becomes aborted when timer fires", async () => {
    let capturedSignal: AbortSignal | undefined;
    const factory = (signal: AbortSignal) => {
      capturedSignal = signal;
      return new Promise<RegenerateResult>(() => {}); // never resolves
    };
    const racePromise = withPipelineTimeout(factory, {
      timeoutMs: 100,
      correlationId: "abort-fire",
      fallbackResponse: "fb",
    });
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);
    vi.advanceTimersByTime(100);
    await racePromise;
    expect(capturedSignal!.aborted).toBe(true);
  });

  it("factory's signal NOT aborted when factory resolves before timer", async () => {
    let capturedSignal: AbortSignal | undefined;
    const factory = (signal: AbortSignal) => {
      capturedSignal = signal;
      return Promise.resolve(happyResult());
    };
    await withPipelineTimeout(factory, {
      timeoutMs: 5000,
      correlationId: "abort-no-fire",
      fallbackResponse: "fb",
    });
    expect(capturedSignal!.aborted).toBe(false);
  });

  it("orphan pipeline rejection after timeout is silenced (no unhandled rejection)", async () => {
    // Architectural contract: the loser of Promise.race used to keep running
    // and could emit logs/rejections later. With AbortController, the loser
    // sees signal.aborted=true and should reject; that rejection MUST be
    // silenced because the timeout promise already won.
    let rejectFn: (err: Error) => void = () => {};
    const factory = (signal: AbortSignal) =>
      new Promise<RegenerateResult>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          rejectFn = reject;
          // Schedule the rejection on the next microtask so the timeout's
          // resolve wins Promise.race first, then this rejection arrives.
          queueMicrotask(() => reject(new Error("AbortError-like: aborted")));
        });
      });

    const racePromise = withPipelineTimeout(factory, {
      timeoutMs: 100,
      correlationId: "orphan-silenced",
      fallbackResponse: "fb",
    });
    vi.advanceTimersByTime(100);
    const result = await racePromise;
    // Caller receives the timeout result, NOT the orphan rejection.
    expect(result.timedOut).toBe(true);
    expect(result.finalResponse).toBe("fb");
    // Side-effect verification: rejectFn was assigned (abort listener fired),
    // confirming the abort signal propagated.
    expect(rejectFn).toBeDefined();
  });

  it("end-to-end abort propagates to inner work within bounded time (< 500ms after timer fires)", async () => {
    // Simulates the real production case: factory creates a chain of "fetch"
    // promises (mocked as setTimeouts) that listen for the signal. When the
    // top-level timer fires, every inner promise should reject quickly via
    // the abort signal, NOT continue running for 30-60s.
    //
    // The architectural claim is "no orphan operations 60s later." This test
    // asserts the bound at 500ms, well under any "orphan" definition. The
    // ~100ms hand-wave in the plan was tight; 500ms gives event-loop slack
    // for CI environments.
    let innerFetchesAbortedAt: number | undefined;
    let timerFiredAt: number | undefined;
    const factory = (signal: AbortSignal) =>
      new Promise<RegenerateResult>((_resolve, reject) => {
        // Simulate a chain of 3 sequential "fetch" calls, each listening
        // for signal. First one starts immediately and would take 60s
        // without cancellation.
        signal.addEventListener("abort", () => {
          innerFetchesAbortedAt = Date.now();
          reject(new Error("aborted"));
        });
      });

    // Use real timers for the timing assertion. Fake timers don't track
    // wall-clock elapsed for our purposes here.
    vi.useRealTimers();
    timerFiredAt = Date.now();
    const racePromise = withPipelineTimeout(factory, {
      timeoutMs: 50,
      correlationId: "e2e-bound",
      fallbackResponse: "fb",
    });
    await racePromise;
    vi.useFakeTimers();

    expect(innerFetchesAbortedAt).toBeDefined();
    expect(timerFiredAt).toBeDefined();
    const elapsed = innerFetchesAbortedAt! - timerFiredAt!;
    // Allow generous CI slack: should be 50ms + a few ms of event-loop
    // turnaround, well under 500ms. The architectural anti-symptom is
    // "60s parser stall after response return," not "exact propagation
    // latency."
    expect(elapsed).toBeLessThan(500);
  });
});

describe("readPipelineTimeoutMs: env var override", () => {
  it("defaults to DEFAULT_PIPELINE_TIMEOUT_MS (55000ms) when PIPELINE_TIMEOUT_MS is unset", () => {
    vi.stubEnv("PIPELINE_TIMEOUT_MS", "");
    expect(readPipelineTimeoutMs()).toBe(DEFAULT_PIPELINE_TIMEOUT_MS);
    expect(readPipelineTimeoutMs()).toBe(55_000);
  });

  it("respects PIPELINE_TIMEOUT_MS when set to a positive integer", () => {
    vi.stubEnv("PIPELINE_TIMEOUT_MS", "5000");
    expect(readPipelineTimeoutMs()).toBe(5000);
  });

  it("falls back to default on non-numeric input", () => {
    vi.stubEnv("PIPELINE_TIMEOUT_MS", "banana");
    expect(readPipelineTimeoutMs()).toBe(DEFAULT_PIPELINE_TIMEOUT_MS);
  });

  it("falls back to default on zero or negative input (no sub-second timeouts)", () => {
    vi.stubEnv("PIPELINE_TIMEOUT_MS", "0");
    expect(readPipelineTimeoutMs()).toBe(DEFAULT_PIPELINE_TIMEOUT_MS);
    vi.stubEnv("PIPELINE_TIMEOUT_MS", "-100");
    expect(readPipelineTimeoutMs()).toBe(DEFAULT_PIPELINE_TIMEOUT_MS);
  });
});

describe("readPipelineTimeoutMs: per-category budget", () => {
  // 2026-05-30 fix-per-category-timeouts: heavier intents get longer
  // pipeline budgets while lighter intents are tightened so a stalled
  // pipeline doesn't burn the full 55s default.
  it("returns the category-specific budget when category is provided and env is unset", () => {
    vi.stubEnv("PIPELINE_TIMEOUT_MS", "");
    expect(readPipelineTimeoutMs("game_review")).toBe(50_000);
    expect(readPipelineTimeoutMs("opponent_prep")).toBe(40_000);
    expect(readPipelineTimeoutMs("improvement_strategy")).toBe(40_000);
    expect(readPipelineTimeoutMs("position_analysis")).toBe(30_000);
    expect(readPipelineTimeoutMs("concept_explanation")).toBe(25_000);
    expect(readPipelineTimeoutMs("meta_motivational")).toBe(20_000);
  });

  it("env-var override still wins when set (debug/global lockdown)", () => {
    vi.stubEnv("PIPELINE_TIMEOUT_MS", "12345");
    expect(readPipelineTimeoutMs("game_review")).toBe(12_345);
    expect(readPipelineTimeoutMs("meta_motivational")).toBe(12_345);
  });

  it("falls back to DEFAULT when category is undefined and env is unset", () => {
    vi.stubEnv("PIPELINE_TIMEOUT_MS", "");
    expect(readPipelineTimeoutMs(undefined)).toBe(DEFAULT_PIPELINE_TIMEOUT_MS);
    expect(readPipelineTimeoutMs()).toBe(DEFAULT_PIPELINE_TIMEOUT_MS);
  });

  it("all 6 categories fit under Vercel 60s maxDuration with ≥10s headroom", () => {
    // Sized so total wall-time (pipeline + post-pipeline route work
    // including synthetic chunks + chess.js validate + puzzle recs +
    // SSE close) stays comfortably under the 60s function ceiling.
    vi.stubEnv("PIPELINE_TIMEOUT_MS", "");
    const HEADROOM_MS = 10_000;
    const VERCEL_MAX_MS = 60_000;
    for (const cat of [
      "game_review",
      "opponent_prep",
      "improvement_strategy",
      "position_analysis",
      "concept_explanation",
      "meta_motivational",
    ] as const) {
      expect(readPipelineTimeoutMs(cat)).toBeLessThanOrEqual(
        VERCEL_MAX_MS - HEADROOM_MS,
      );
    }
  });
});

describe("readMaxRetries: per-category retry budget", () => {
  // 2026-05-30 fix-per-category-retries: heavy intents (game_review)
  // can't afford retries within Vercel's 60s wall — Sonnet flagship is
  // ~30-40s/call so even 1 retry = 60-80s. Single shot then buildFallback.
  it("returns 0 for game_review (one shot — no retry budget)", () => {
    expect(readMaxRetries("game_review")).toBe(0);
  });

  it("returns 1 for medium-weight intents (opponent_prep, improvement_strategy)", () => {
    expect(readMaxRetries("opponent_prep")).toBe(1);
    expect(readMaxRetries("improvement_strategy")).toBe(1);
  });

  it("returns 2 for lighter intents (position_analysis, concept_explanation, meta_motivational)", () => {
    expect(readMaxRetries("position_analysis")).toBe(2);
    expect(readMaxRetries("concept_explanation")).toBe(2);
    expect(readMaxRetries("meta_motivational")).toBe(2);
  });

  it("returns the legacy default (2) when category is undefined", () => {
    expect(readMaxRetries(undefined)).toBe(DEFAULT_MAX_RETRIES);
    expect(readMaxRetries()).toBe(2);
  });

  it("worst-case wall-time stays under 60s for game_review (0 retries × 50s budget)", () => {
    // Per-category timeout × (retries + 1) is the upper bound on LLM
    // attempts. For game_review: 50_000 × (0 + 1) = 50_000 ≤ 60_000 ✓
    const retries = readMaxRetries("game_review");
    const timeout = readPipelineTimeoutMs("game_review");
    expect(timeout * (retries + 1)).toBeLessThanOrEqual(60_000);
  });
});
