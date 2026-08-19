import { intentProbesFromGameEval, type NullMoveProbe } from "./fromGameEval";
import { computeIntentFacts } from "./intentFacts";
import { parseBoolEnv } from "@/env";
import type { GameEval } from "@/types/eval";
import type { IntentFacts } from "./types";

/**
 * Intent facts for the plies a review is going to card.
 *
 * Deliberately narrow: game review cards a handful of moves, so computing
 * facts for all 835 plies of a long game would be waste. Restricting to carded
 * plies is also what keeps Tier 1 affordable — 1.26s per position is ~3.8s for
 * three cards and ~101s for a whole game.
 *
 * Measured on a 55-ply game: Tier 0 over EVERY ply costs 475ms, so restricting
 * to carded plies is about scope rather than speed — those are the moves a
 * review renders, and the cases that matter most get carded anyway. The move
 * that wins a pawn into Qxh7# is a 900cp drop, so it is always a card.
 *
 * Pure and total. It never throws: a review that cannot be analysed returns an
 * empty list, and the caller renders exactly what it rendered before.
 */
export interface ReviewIntent {
  ply: number;
  /** Whose move it was — episode collapsing and byPlayer splits need it. */
  mover: "w" | "b";
  playedSan: string;
  tier: "tier0" | "tier1";
  facts: IntentFacts;
}

export function intentFactsForPlies(params: {
  gameEval: GameEval | undefined;
  moves: string[];
  /** 0-based half-move indices to analyse — the plies about to be carded. */
  plies: number[];
  /** Optional Tier 1 null-move data, keyed by ply. */
  nullMoveProbes?: Map<number, NullMoveProbe>;
  startFen?: string;
}): ReviewIntent[] {
  const { gameEval, moves, plies, nullMoveProbes, startFen } = params;
  if (!gameEval || !moves?.length || !plies?.length) return [];

  try {
    const wanted = new Set(plies);
    // onlyPlies keeps the expensive per-ply work (position facts, SAN/PV
    // conversion, tempting-reply checks) off the ~50 plies a review will
    // never card — measured at 475ms of synchronous serving time for a
    // 55-ply game before the restriction.
    const probes = intentProbesFromGameEval({
      gameEval,
      moves,
      nullMoveProbes,
      startFen,
      onlyPlies: wanted,
    });
    const out: ReviewIntent[] = [];
    for (const { ply, probe, skipped } of probes) {
      if (!wanted.has(ply) || skipped) continue;
      out.push({
        ply,
        mover: probe.fenBefore.split(" ")[1] === "b" ? "b" : "w",
        playedSan: probe.playedSan,
        tier: nullMoveProbes?.has(ply) ? "tier1" : "tier0",
        facts: computeIntentFacts(probe),
      });
    }
    return out;
  } catch {
    // Intent is additive. Losing it must never cost a review its cards.
    return [];
  }
}

/**
 * Is the dark intent computation switched on? Off unless explicitly enabled.
 * Parsed with the shared parseBoolEnv — its `.trim()` is load-bearing: a prod
 * flag saved as `"true\n"` (Vercel's UI appends one to multi-line saves) bit
 * the Mastermind validators before the shared parser existed.
 */
export function isIntentFactsEnabled(
  // Not NodeJS.ProcessEnv: Next augments it to require NODE_ENV, so a caller
  // could not pass a bare { INTENT_FACTS_ENABLED } without inventing one.
  env: Record<string, string | undefined> = process.env,
): boolean {
  return parseBoolEnv(env.INTENT_FACTS_ENABLED);
}
