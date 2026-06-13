import { atomWithStorage } from "jotai/utils";
import type { PlacementItem } from "./placementTest";

/**
 * Resumable placement-test state (localStorage). Lets a user who quits mid-test
 * pick up where they left off, and lets the UI render a "finish partial" path.
 * Cleared once the test is finalized (or explicitly restarted).
 */
export interface PlacementSession {
  /** Seed estimate the test started from. */
  seed: number;
  /** Current rolling rating estimate. */
  estimate: number;
  /** Index of the NEXT slot to serve (0..PLACEMENT_LENGTH). */
  itemIndex: number;
  /** Completed item results, in order. */
  history: PlacementItem[];
  /** Puzzle ids already served (so retests / fallbacks don't repeat). */
  seenPuzzleIds: string[];
  startedAt: number;
}

export const placementSessionAtom = atomWithStorage<PlacementSession | null>(
  "chessMastiPlacementSession",
  null
);
