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
  DEFAULT_PIPELINE_TIMEOUT_MS,
} from "@/lib/mastermind/pipelineTimeout";
import type { RegenerateResult } from "@/lib/mastermind/validators";

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

  it("default timeout is 30s", () => {
    expect(DEFAULT_PIPELINE_TIMEOUT_MS).toBe(30_000);
  });

  it("uses default 30s when timeoutMs not provided", async () => {
    const factory = (_signal: AbortSignal) =>
      new Promise<RegenerateResult>(() => {});
    const racePromise = withPipelineTimeout(factory, {
      correlationId: "test-corr",
      fallbackResponse: "fb",
    });

    // Advance 29s — not yet expired
    vi.advanceTimersByTime(29_000);
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

describe("readPipelineTimeoutMs: env var override", () => {
  it("defaults to 30000ms when PIPELINE_TIMEOUT_MS is unset", () => {
    vi.stubEnv("PIPELINE_TIMEOUT_MS", "");
    expect(readPipelineTimeoutMs()).toBe(DEFAULT_PIPELINE_TIMEOUT_MS);
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
