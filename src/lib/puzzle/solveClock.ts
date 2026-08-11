/**
 * Solve-clock formatting for the puzzle toolbar.
 *
 * Pure and separate from the ticking hook so the display rules — which are the
 * part that can be wrong in a way a user notices — are testable without fake
 * timers.
 */

/**
 * Format elapsed milliseconds as a clock.
 *
 * `M:SS` under an hour, `H:MM:SS` beyond it. No leading zero on the first
 * unit: a solve timer that reads "00:07" looks like a countdown about to
 * expire, which is the opposite of the calm this is meant to convey.
 *
 * Negative or non-finite input clamps to zero rather than rendering "NaN:aN" —
 * clock drift and a paused-then-resumed tab can both produce one.
 */
export function formatSolveClock(elapsedMs: number): string {
  const safe = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const total = Math.floor(safe / 1000);
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  return `${minutes}:${ss}`;
}
