/**
 * "Eliminate" — marking squares you have ruled out.
 *
 * The strongest idea borrowed from the Acely reference: crossing out wrong
 * answers is a real exam technique, and ruling out candidate moves is a real
 * calculation technique. Unlike the rest of the format work this changes what
 * the trainer teaches rather than how it looks — it gives the solver somewhere
 * to put "I checked that knight, it doesn't work" so they stop re-checking it.
 *
 * Marks are per-puzzle scratch state, deliberately not persisted: they are
 * working memory for one position, and carrying them to the next puzzle would
 * be actively misleading.
 */

/** Diagonal hatching reads as "crossed out" without hiding the piece. */
export const ELIMINATED_SQUARE_STYLE: React.CSSProperties = {
  background:
    "repeating-linear-gradient(45deg, rgba(248,113,113,0.30) 0px, rgba(248,113,113,0.30) 3px, transparent 3px, transparent 8px)",
};

/** Toggle a square's ruled-out mark. Pure; returns a new set. */
export function toggleEliminated(
  marks: ReadonlySet<string>,
  square: string,
): Set<string> {
  const next = new Set(marks);
  if (next.has(square)) next.delete(square);
  else next.add(square);
  return next;
}

/** Square styles for the board's generic underlay seam. */
export function eliminatedUnderlay(
  marks: ReadonlySet<string>,
): Record<string, React.CSSProperties> {
  const styles: Record<string, React.CSSProperties> = {};
  // forEach rather than for..of: the repo's tsconfig target predates
  // downlevelIteration, so iterating a Set directly won't compile.
  marks.forEach((square) => {
    // Guard the seam: a malformed key would paint a phantom square.
    if (/^[a-h][1-8]$/.test(square)) {
      styles[square] = ELIMINATED_SQUARE_STYLE;
    }
  });
  return styles;
}
