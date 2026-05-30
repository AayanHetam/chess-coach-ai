/**
 * Race a promise against a timeout. Resolves to the promise's value if
 * it completes within `timeoutMs`, or to `null` if the timeout fires first.
 *
 * Intended for guarding individual Stockfish position evaluations during
 * a game sweep — when one position hangs, the sweep should not block
 * forever (UI sat at 50% progress staring at a stalled worker before
 * this helper landed). The caller is responsible for any side-effect
 * cleanup (sending `stop` to the engine, releasing the worker) after
 * a timeout — this helper just bounds the wait.
 *
 * NOTE: the underlying promise keeps running after a timeout. It's the
 * caller's job to fire whatever cancellation the producer supports.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const timeoutId = setTimeout(() => resolve(null), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (err) => {
        // Mirror standard Promise.race semantics: a rejection wins the
        // race too. We re-resolve with null after surfacing the error
        // so the caller can decide whether to retry; throwing here
        // would skip cleanup at every callsite.
        clearTimeout(timeoutId);
        console.warn("[withTimeout] underlying promise rejected:", err);
        resolve(null);
      },
    );
  });
}
