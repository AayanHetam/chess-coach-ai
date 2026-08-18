import type { PositionEval } from "@/types/eval";
import { pickDisplayEval } from "../pickDisplayEval";

/**
 * Collects the evaluations arriving for one position from two racing sources
 * — the local engine's deepening search and Lichess's cloud eval — and pushes
 * one out only when it actually improves on what has already been shown.
 *
 * Needed because the two sources do not arrive in quality order. The local
 * search streams depth 1, 2, 3 … while a cloud answer worth depth 60 can land
 * at any moment in the middle of that. Publishing every update in arrival
 * order would show depth 60, then snap back to the local search's depth 15,
 * 16, 17 … — the numbers on screen jumping backwards while the user reads
 * them. Ordering by `pickDisplayEval` (deeper wins; on equal depth, wider
 * wins) means the displayed evaluation only ever gets better.
 */
export interface BestEvalPublisher {
  /** Consider a new evaluation. Published only if it beats the current best. */
  offer: (candidate: PositionEval | null | undefined) => void;
  /** The best evaluation seen so far, or null if none had any lines. */
  best: () => PositionEval | null;
}

export function createBestEvalPublisher(
  setPartialEval?: (positionEval: PositionEval) => void
): BestEvalPublisher {
  let best: PositionEval | null = null;

  return {
    offer(candidate) {
      const next = pickDisplayEval(best, candidate);
      if (!next || next === best) return;
      best = next;
      setPartialEval?.(next);
    },
    best: () => best,
  };
}
