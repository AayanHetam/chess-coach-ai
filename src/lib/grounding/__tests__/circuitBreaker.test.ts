import { describe, it, expect, beforeEach } from "vitest";
import {
  isCircuitOpen,
  recordSuccess,
  recordFailure,
  recordFanOut,
  __resetCircuitBreakers,
  BREAKER_THRESHOLD,
  BREAKER_COOLDOWN_MS,
} from "../circuitBreaker";

const KEY = "chessdb";
const T0 = 1_000_000;

beforeEach(() => {
  __resetCircuitBreakers();
});

describe("circuitBreaker", () => {
  it("is closed for an unknown key", () => {
    expect(isCircuitOpen("never-seen", T0)).toBe(false);
  });

  it("stays closed below the failure threshold", () => {
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) recordFailure(KEY, T0);
    expect(isCircuitOpen(KEY, T0)).toBe(false);
  });

  it("opens at exactly THRESHOLD consecutive failures, for COOLDOWN_MS", () => {
    for (let i = 0; i < BREAKER_THRESHOLD; i++) recordFailure(KEY, T0);
    expect(isCircuitOpen(KEY, T0)).toBe(true);
    expect(isCircuitOpen(KEY, T0 + BREAKER_COOLDOWN_MS - 1)).toBe(true);
    // At/after the cooldown boundary it is half-open (closed) for a trial.
    expect(isCircuitOpen(KEY, T0 + BREAKER_COOLDOWN_MS)).toBe(false);
  });

  it("a success resets the failure count (closes the breaker)", () => {
    recordFailure(KEY, T0);
    recordFailure(KEY, T0);
    recordSuccess(KEY);
    recordFailure(KEY, T0); // back to 1, not 3
    expect(isCircuitOpen(KEY, T0)).toBe(false);
  });

  it("half-open trial failure re-opens for another cooldown", () => {
    for (let i = 0; i < BREAKER_THRESHOLD; i++) recordFailure(KEY, T0);
    const trialAt = T0 + BREAKER_COOLDOWN_MS;
    expect(isCircuitOpen(KEY, trialAt)).toBe(false); // trial allowed
    recordFailure(KEY, trialAt); // trial fails
    expect(isCircuitOpen(KEY, trialAt)).toBe(true);
    expect(isCircuitOpen(KEY, trialAt + BREAKER_COOLDOWN_MS)).toBe(false);
  });

  it("half-open trial success closes the breaker", () => {
    for (let i = 0; i < BREAKER_THRESHOLD; i++) recordFailure(KEY, T0);
    const trialAt = T0 + BREAKER_COOLDOWN_MS;
    recordSuccess(KEY);
    expect(isCircuitOpen(KEY, trialAt)).toBe(false);
    recordFailure(KEY, trialAt); // single fresh failure, count is 1
    expect(isCircuitOpen(KEY, trialAt)).toBe(false);
  });

  it("tracks keys independently", () => {
    for (let i = 0; i < BREAKER_THRESHOLD; i++) recordFailure("lc0", T0);
    expect(isCircuitOpen("lc0", T0)).toBe(true);
    expect(isCircuitOpen("maia", T0)).toBe(false);
  });
});

/**
 * Pathway 4.8a: the review sends up to a dozen fetches to one source, so its
 * fan-out is one breaker event. It is a failure only when every fetch timed
 * out, so one congested review cannot trip the breaker alone.
 */
describe("recordFanOut", () => {
  const TIMEOUT = 6000;
  const timedOut = { value: null, elapsedMs: TIMEOUT };

  it("counts a fan-out where every fetch timed out as one failure", () => {
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) {
      recordFanOut(KEY, [timedOut, timedOut, timedOut], TIMEOUT, T0);
    }
    // Two fan-outs of three timeouts each are two failures, not six.
    expect(isCircuitOpen(KEY, T0)).toBe(false);
    recordFanOut(KEY, [timedOut, timedOut, timedOut], TIMEOUT, T0);
    expect(isCircuitOpen(KEY, T0)).toBe(true);
  });

  it("counts any answer as a success, even beside timeouts", () => {
    recordFailure(KEY, T0);
    recordFailure(KEY, T0);
    recordFanOut(
      KEY,
      [timedOut, { value: { score_cp: 30 }, elapsedMs: 5900 }, timedOut],
      TIMEOUT,
      T0
    );
    recordFailure(KEY, T0); // back to 1, not 3
    expect(isCircuitOpen(KEY, T0)).toBe(false);
  });

  it("counts fast nulls as a success (no data, or the source unconfigured)", () => {
    recordFailure(KEY, T0);
    recordFailure(KEY, T0);
    recordFanOut(KEY, [timedOut, { value: null, elapsedMs: 40 }], TIMEOUT, T0);
    recordFailure(KEY, T0);
    expect(isCircuitOpen(KEY, T0)).toBe(false);
  });

  it("counts a fan-out whose fetches threw as a failure, as a thrown fetch always was", () => {
    for (let i = 0; i < BREAKER_THRESHOLD; i++) {
      recordFanOut(
        KEY,
        [{ value: null, elapsedMs: 5, threw: true }],
        TIMEOUT,
        T0
      );
    }
    expect(isCircuitOpen(KEY, T0)).toBe(true);
  });

  it("does nothing for an empty fan-out", () => {
    recordFailure(KEY, T0);
    recordFailure(KEY, T0);
    recordFanOut(KEY, [], TIMEOUT, T0);
    // Not reset by a success: one more failure opens it.
    recordFailure(KEY, T0);
    expect(isCircuitOpen(KEY, T0)).toBe(true);
  });
});
