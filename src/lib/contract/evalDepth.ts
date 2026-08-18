/**
 * Depth comparability for engine evaluations (T8, SILENT_SUBSTITUTION_HANDOFF §4).
 *
 * Every swing scan in this codebase asks the same question — "how much did the
 * evaluation move across this half-move?" — by subtracting positions[i+1] from
 * positions[i]. That subtraction is only meaningful when both numbers came out
 * of searches of the same size.
 *
 * They frequently did not. `uciEngine.evaluateGame` gives each position a 30s
 * budget and, on a timeout, retries ONCE at `max(8, depth - 4)`, merging the
 * shallower answer into `positions[]` with nothing to distinguish it from its
 * neighbours. `settings.depth` continues to report the depth that was
 * REQUESTED, so the payload as a whole looks like a uniform d16 sweep.
 *
 * A d16 evaluation minus a d12 evaluation of a quiet position routinely
 * differs by 50-150cp on its own — the exact band the scans read as an
 * inaccuracy or a mistake. The user is then told they went wrong on a move
 * where the only thing that changed was how long the engine got to think.
 *
 * The per-line `depth` is the ACHIEVED depth (parsed from the engine's
 * `info depth N`), so the evidence needed to catch this is already in the
 * payload — it was simply never compared across the pair.
 *
 * The rule is about DISAGREEMENT, not about depth being low. A whole game
 * swept at d12 is a valid, internally consistent analysis and its mistakes are
 * real; suppressing those would trade a fabrication for a silent omission,
 * which is the same bug pointing the other way.
 */

/** The shape every caller has in hand; deliberately structural, not nominal. */
interface DepthBearingPosition {
  lines?: Array<{ depth?: number } | undefined> | undefined;
}

/**
 * Achieved search depth of a position's principal line.
 *
 * Returns null for anything that is not a real search result: a missing line,
 * a missing depth, or `depth === 0` — which is both the client-timeout
 * sentinel and the stamp on terminal (checkmate/stalemate) positions. Callers
 * already skip those; this keeps the two concerns from tangling.
 */
export function achievedDepth(
  position: DepthBearingPosition | null | undefined,
): number | null {
  const depth = position?.lines?.[0]?.depth;
  if (typeof depth !== "number" || depth <= 0) return null;
  return depth;
}

/**
 * The depth this sweep ASKED for, when the payload declares one.
 *
 * `evaluateGame` always stamps `settings.depth` with the requested depth, so
 * every production payload carries it. Hand-authored test fixtures and the
 * partial `{positions}` payload the client falls back to mid-sweep do not.
 */
export function requestedDepth(
  gameEval: { settings?: { depth?: number } | undefined } | null | undefined,
): number | null {
  const d = gameEval?.settings?.depth;
  return typeof d === "number" && d > 0 ? d : null;
}

/**
 * True when a before/after pair may be subtracted.
 *
 * Two searches of the same size are always comparable. When they differ, the
 * question is whether one of them is SHORT — and that is only answerable
 * against a declared request. `settings.depth` is that declaration.
 *
 * When no request is declared we admit the pair rather than guess. Inferring
 * the intended depth from the data (say, taking the sweep maximum) would be
 * exactly the move this whole programme exists to remove: substituting a
 * plausible value for a missing one and then acting on it as if it were
 * known. A payload with no `settings` is instead reported by
 * `shallowSearchPlies` so the gap is visible rather than silently assumed.
 */
export function isComparableDepthPair(
  before: DepthBearingPosition | null | undefined,
  after: DepthBearingPosition | null | undefined,
  declaredDepth: number | null,
): boolean {
  const a = achievedDepth(before);
  const b = achievedDepth(after);
  if (a === null || b === null) return false;
  if (a === b) return true;
  // Differing depths with a declared request: at least one search is not the
  // one that was asked for, so the difference between them is partly the
  // engine disagreeing with itself.
  return declaredDepth === null;
}

/**
 * Indices of positions whose search came back shallower than the deepest
 * search in the same sweep — i.e. the ones the engine retried.
 *
 * Used to TELL somebody rather than to gate: the prompt says so, and the log
 * says so. A scan that quietly drops plies is how "no mistakes found" comes to
 * mean "we couldn't tell", and the whole point of this programme is that those
 * two must never render the same way.
 */
export function shallowSearchPlies(
  positions: ReadonlyArray<DepthBearingPosition | null | undefined> | null | undefined,
): { plies: number[]; maxDepth: number; minDepth: number } {
  if (!Array.isArray(positions)) return { plies: [], maxDepth: 0, minDepth: 0 };

  const depths = positions.map(achievedDepth);
  const real = depths.filter((d): d is number => d !== null);
  if (real.length === 0) return { plies: [], maxDepth: 0, minDepth: 0 };

  const maxDepth = Math.max(...real);
  const minDepth = Math.min(...real);
  const plies: number[] = [];
  for (let i = 0; i < depths.length; i++) {
    const d = depths[i];
    if (d !== null && d < maxDepth) plies.push(i);
  }
  return { plies, maxDepth, minDepth };
}
