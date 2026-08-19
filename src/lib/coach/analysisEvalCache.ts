/**
 * What a revisited game remembers (T10, SILENT_SUBSTITUTION_HANDOFF §4).
 *
 * `/analysis` caches a completed Stockfish sweep in `sessionStorage` so
 * reopening the same game does not re-run a 60-second analysis. It used to
 * store `PositionEval[]` — the positions and nothing else.
 *
 * `GameEval` carries three more things the SERVER reads:
 *
 *   - `accuracy` and `estimatedElo`, which the prompt renders as
 *     "Accuracy: …" / "Estimated Elo: …". Restoring positions alone drops
 *     both, so on a revisit the coach silently stops knowing how well the
 *     game was played and the reply quality falls back to generic;
 *   - `settings.depth`, which is what T8's mixed-depth guard keys on. With no
 *     declared depth that guard deliberately fails open — so a revisited game
 *     was the ONE case where the fabricated-mistake protection could not run.
 *
 * None of that announced itself. The board looked identical, the coach still
 * answered, and the answer was quietly built from less.
 *
 * The wrinkle this module exists for is the format change: entries written by
 * the old code are a bare array. Discarding them would throw away a valid
 * sweep and force a re-analysis, so they are read for what they do have.
 */
import type { GameEval, PositionEval } from "@/types/eval";

export interface RestoredEval {
  positions: PositionEval[];
  /**
   * The full sweep, or null for a legacy entry that only had positions.
   * Null is honest here: it means "this really is all we stored", which the
   * caller forwards as the degraded payload it is.
   */
  gameEval: GameEval | null;
}

/**
 * Parse a sessionStorage entry.
 *
 * @param expectedPositions positions the current game requires
 *   (`allMoves.length + 1`). A mismatch means the entry belongs to a different
 *   game or a different point in it; restoring it would silently describe the
 *   wrong game.
 */
export function parseCachedEval(
  raw: string,
  expectedPositions: number,
): RestoredEval | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  // Legacy shape: a bare PositionEval[].
  if (Array.isArray(parsed)) {
    if (parsed.length !== expectedPositions) return null;
    return { positions: parsed as PositionEval[], gameEval: null };
  }

  const ge = parsed as GameEval | null | undefined;
  if (!ge || !Array.isArray(ge.positions)) return null;
  if (ge.positions.length !== expectedPositions) return null;
  return { positions: ge.positions, gameEval: ge };
}
