/**
 * Human-readable label for a puzzle's theme list.
 *
 * Lifted out of PuzzleDrillMenu when the session rail needed the same
 * formatting — the rail labels every queued puzzle by theme, so two components
 * were about to carry identical copies of this.
 *
 * The skipped ids are structural tags the corpus attaches to almost every
 * puzzle ("short", "oneMove", "crushing"); they describe the shape of the
 * solution rather than the motif, so they make useless labels.
 */
const STRUCTURAL_THEMES = ["short", "oneMove", "crushing"];

export function prettyTheme(themes: string[] | undefined): string {
  if (!themes || themes.length === 0) return "Tactics";
  const t =
    themes.find((x) => !STRUCTURAL_THEMES.includes(x)) ?? themes[0];
  // camelCase → "Title Case"
  return t
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}
