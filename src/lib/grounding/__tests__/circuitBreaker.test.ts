import { describe, it, expect, beforeEach } from "vitest";
import {
  isCircuitOpen,
  recordSuccess,
  recordFailure,
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
