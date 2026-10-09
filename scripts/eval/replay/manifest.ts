/**
 * What the replay gate holds the committed results to (pathway 3.7).
 *
 * The frozen files are pinned by digest and row count, so a changed corpus
 * is a deliberate re-pin here and never a silent drift. The story probe's
 * pins are what HEAD's referee and the move oracle give over its eight raw
 * answers today. A server flag's flip PR adds the flag to `flipped` beside
 * a committed run that meets its bar. An acknowledgement lets a known
 * finding pass, and only with a reason. One that matches no finding fails
 * as stale.
 */
import { FOLLOWUP_LEAN_BUDGET } from "@/lib/prompts/followUpPrompt";

/** The server flags whose flip the gate holds to a bar. */
export type FlippableFlag =
  | "COACH_FOLLOWUP_LEAN"
  | "COACH_FOLLOWUP_PROMPT=fielded"
  | "COACH_INTENT_ROUTER";

export interface Acknowledgement {
  /** The results file, repo-relative, as the report names it. */
  file: string;
  /** The turn id ("followup-fielded:12"). */
  turn: string;
  check: "legality" | "routing.ui" | "routing.calls";
  /** The finding's detail exactly as the report prints it. */
  detail: string;
  /** Why it is let through. Required. */
  reason: string;
}

export const REPLAY_TARGETS = {
  // IDEAL_PRODUCT.md, "The bar": "A follow-up under five seconds". The
  // Phase 3 exit: "a committed follow-up run with total p50 under 5 s".
  // Strictly under, on the route's own clock.
  followUpP50Ms: 5000,
  // "The bar": "Median prose per answer at rest of 60 words or fewer, with
  // the board carrying the rest". The Phase 3 exit: "median words at rest
  // of 60 or fewer". The lean budget is that number.
  wordsAtRestMedian: FOLLOWUP_LEAN_BUDGET.words,
  // The Phase 3 exit asks for "a committed follow-up run". Twenty turns
  // per validator wing is the smallest run the bar is read over.
  minTurnsPerWing: 20,
  // "The bar": "a what-if's first evaluation under two" seconds. Held live
  // by tests/e2e/local/coach-what-if.spec.ts on both legs, reported here.
  whatIfFirstLineMs: 2000,
} as const;

export const REPLAY_MANIFEST = {
  storyProbe: {
    file: "scripts/eval/results/followup-story-probe.json",
    sha256: "62d49fc13190ed68fc2e720d6917af58dc354f1baad5512313d665ca83279ac5",
    rows: 4,
    rawIllegal: [
      "07_knight_fork#1 without: 8... Kd7",
      "10_queenless_endgame#2 without: 18... Rf7",
    ] as readonly string[],
    referee: {
      without: { sentences: 67, dropped: 11 },
      with: { sentences: 65, dropped: 0 },
    },
  },
  testerCsv: {
    file: "scripts/synthetic-tester/runs/rmom5mxo6-4cc2b5.csv",
    sha256: "e2a6ba254ceddf7bebb095daa60cfb161b6ca6b00d0981a803c00b826d000017",
    rows: 24,
  },
  engineProbe: {
    file: "scripts/engine/results/evaluate-moves-headless-2026-10-07.json",
    sha256: "0fe5565d67652bed768477acb2bc69b8804efe247e58589037d8b2a408cb394c",
  },
  flipped: [] as readonly FlippableFlag[],
  acknowledged: [] as readonly Acknowledgement[],
};

export type ReplayManifest = typeof REPLAY_MANIFEST;
