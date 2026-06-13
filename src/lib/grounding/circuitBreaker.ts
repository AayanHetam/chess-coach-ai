// Per-source circuit breaker for the Stage 9 async-grounding fetches.
//
// Problem (review follow-up): when a grounding source (chessdb / Lc0 / Maia /
// Syzygy) is down, every turn re-issues the fetch and pays its full per-source
// timeout (5-8s) before failing open. On a warm instance handling a burst of
// turns during an outage that is pure wasted latency on each one.
//
// This breaker stops a single warm instance from re-paying a dead source's
// timeout on every turn. After THRESHOLD consecutive FAILURES (thrown errors —
// a source that *responds* with "no data" is healthy, not a failure) the
// breaker opens for COOLDOWN_MS and the source is skipped (snapshot field stays
// null, exactly as a fail-open would leave it). The first call after the
// cooldown is a half-open trial: success closes the breaker, failure re-opens
// it for another cooldown.
//
// State is module-level, so it is per warm serverless instance and resets on
// cold start — which is the right scope: it only needs to dampen repeated
// timeouts within one instance's lifetime, never to coordinate globally.

export const BREAKER_THRESHOLD = 3;
export const BREAKER_COOLDOWN_MS = 30_000;

interface BreakerState {
  /** Consecutive thrown-error count; reset to 0 on any successful response. */
  fails: number;
  /** Epoch ms until which the breaker is open, or null when closed. */
  openUntil: number | null;
}

const breakers = new Map<string, BreakerState>();

/** True when `key`'s breaker is open at `nowMs` (caller should skip the fetch). */
export function isCircuitOpen(key: string, nowMs: number): boolean {
  const b = breakers.get(key);
  return b?.openUntil != null && nowMs < b.openUntil;
}

/** Record a healthy response (got data OR a clean "no data"): closes the breaker. */
export function recordSuccess(key: string): void {
  breakers.set(key, { fails: 0, openUntil: null });
}

/** Record a thrown failure (timeout / network / 5xx): opens at THRESHOLD. */
export function recordFailure(key: string, nowMs: number): void {
  const fails = (breakers.get(key)?.fails ?? 0) + 1;
  breakers.set(key, {
    fails,
    openUntil: fails >= BREAKER_THRESHOLD ? nowMs + BREAKER_COOLDOWN_MS : null,
  });
}

/** Test-only: clear all breaker state. */
export function __resetCircuitBreakers(): void {
  breakers.clear();
}
