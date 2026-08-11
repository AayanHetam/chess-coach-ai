import { describe, expect, it } from "vitest";
import { isBreakerFailure } from "../voterSnapshot";
import { FETCH_TIMEOUT_MS as CHESSDB_TIMEOUT_MS } from "../chessdb";
import { FETCH_TIMEOUT_MS as LC0_TIMEOUT_MS } from "../lc0";

/**
 * T2 (SILENT_SUBSTITUTION_HANDOFF §4) — the grounding circuit breaker could
 * never trip.
 *
 * `fetchWithBreaker` classified outcomes as "threw = failure, resolved =
 * success". But every grounding client wraps its aborting fetch in
 * `catch { return null }`, so a TIMEOUT reaches the breaker as a successfully
 * resolved null: `recordSuccess` ran, the consecutive-failure counter reset,
 * and the breaker stayed shut. During an outage every turn paid the full ~8s
 * ceiling, forever.
 *
 * The existing suite "proved" the breaker worked by mocking a REJECTION — a
 * shape production cannot produce. This file pins the real distinction, which
 * is about elapsed time, not about how the value arrived:
 *
 *   fast null → healthy "no data" (unconfigured source, or no entry for this
 *               FEN). Must NOT trip: it costs nothing and the source is up.
 *   slow null → a timeout wearing a null's clothes. MUST trip.
 */
describe("isBreakerFailure — classifies on elapsed time, not on how it arrived", () => {
  const T = 6000;

  it("does not count a value, however slow", () => {
    // A slow but successful response is a latency problem, not an outage.
    expect(isBreakerFailure({ ok: true }, T, T)).toBe(false);
    expect(isBreakerFailure(0, T, T)).toBe(false);
    expect(isBreakerFailure("", T, T)).toBe(false);
  });

  it("does not count a fast null (healthy 'no data')", () => {
    expect(isBreakerFailure(null, 0, T)).toBe(false);
    expect(isBreakerFailure(null, 12, T)).toBe(false);
    expect(isBreakerFailure(null, T * 0.5, T)).toBe(false);
  });

  it("counts a null that consumed the whole budget (the production timeout shape)", () => {
    expect(isBreakerFailure(null, T, T)).toBe(true);
    expect(isBreakerFailure(null, T + 250, T)).toBe(true);
  });

  it("counts a null at the 90% attribution threshold, not below it", () => {
    expect(isBreakerFailure(null, T * 0.9, T)).toBe(true);
    expect(isBreakerFailure(null, T * 0.9 - 1, T)).toBe(false);
  });

  it("treats undefined like null (clients differ in which they return)", () => {
    expect(isBreakerFailure(undefined, T, T)).toBe(true);
    expect(isBreakerFailure(undefined, 5, T)).toBe(false);
  });

  it("scales with each source's own budget", () => {
    // Lc0 is allowed 8s and chessdb 6s, so 6s is a timeout for chessdb but
    // merely slow for Lc0. A single hardcoded threshold would misclassify one
    // of them — which is why the timeout is threaded per source.
    expect(CHESSDB_TIMEOUT_MS).not.toBe(LC0_TIMEOUT_MS);
    expect(isBreakerFailure(null, 6000, CHESSDB_TIMEOUT_MS)).toBe(true);
    expect(isBreakerFailure(null, 6000, LC0_TIMEOUT_MS)).toBe(false);
  });
});
