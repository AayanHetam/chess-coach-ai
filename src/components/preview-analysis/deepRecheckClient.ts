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

/**
 * A capped search on the review engine. The cloud eval is off on purpose: a
 * Lichess answer would be a different engine at a different depth under this
 * engine's name. On the cap the search is stopped and whatever depth it
 * reached comes back (runDeepRecheck keeps only depth-20 results).
 */
export function uciRecheckEngine(
  engine: UciEngine,
  name: string
): RecheckEngine {
  return {
    name,
    async evaluate(fen, depth, capMs) {
      let latest: PositionEval | null = null;
      const timer = setTimeout(() => {
        void engine.stopAllCurrentJobs();
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
        clearTimeout(timer);
      }
    },
  };
}
