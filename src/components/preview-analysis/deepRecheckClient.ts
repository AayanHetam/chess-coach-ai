/**
 * The browser half of the deep re-check (COACH_CLAIM_VERIFIER): the review's
 * own Stockfish, asked to take the flagged moments to depth 20 before the
 * first coach turn (coach/deepRecheck.ts decides which, and when to stop).
 *
 * Budget, measured (docs/coach-accuracy-notes.md): Stockfish 17 Lite (WASM,
 * one thread — this engine) reached depth 20 in 0.4–3.6 s per position, mean
 * 1.6 s, on a 2024 laptop; Game B's three card moments took ~10 s. Slower
 * devices finish fewer; what does not finish stays at depth 16, labelled.
 * No engine runs on the server, so none of this spends Vercel time.
 */
import type { UciEngine } from "@/lib/engine/uciEngine";
import type { PositionEval } from "@/types/eval";
import type { RecheckEngine } from "@/lib/coach/deepRecheck";

/** The whole pass-2 budget before the first coach turn. */
export const RECHECK_BUDGET_MS = 15_000;
/** One position's cap. */
export const RECHECK_PER_POSITION_MS = 6_000;
export const RECHECK_DEPTH = 20;

/** The review engine as pass 2 uses it, with a way to call the pass off. */
export interface UciRecheckEngine extends RecheckEngine {
  /**
   * Call the pass off (a new game, or the page going away): the search in
   * flight is stopped now, and nothing after this starts or stops a search.
   * The engine's only stop clears its whole queue, so a cap that fired later
   * could cut into the next game's review.
   */
  cancel(): void;
}

/**
 * A capped search on the review engine. The cloud eval is off on purpose: a
 * Lichess answer would be a different engine at a different depth under this
 * engine's name. On the cap the search is stopped and whatever depth it
 * reached comes back (runDeepRecheck keeps only depth-20 results).
 */
export function uciRecheckEngine(
  engine: UciEngine,
  name: string
): UciRecheckEngine {
  let cancelled = false;
  let searching = false;
  const stop = () => {
    void engine.stopAllCurrentJobs().catch(() => {
      /* superseded by the next command: the search is over either way */
    });
  };
  return {
    name,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      if (searching) stop();
    },
    async evaluate(fen, depth, capMs) {
      if (cancelled) return null;
      let latest: PositionEval | null = null;
      searching = true;
      const timer = setTimeout(() => {
        if (!cancelled) stop();
      }, capMs);
      try {
        const result = await engine.evaluatePositionWithUpdate({
          fen,
          depth,
          multiPv: 3,
          allowCloud: false,
          setPartialEval: (p) => {
            latest = p;
          },
        });
        return result ?? latest;
      } catch {
        return latest;
      } finally {
        searching = false;
        clearTimeout(timer);
      }
    },
  };
}
