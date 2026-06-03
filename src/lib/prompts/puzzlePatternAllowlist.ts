/**
 * Pattern-name allowlist for the Puzzle Coach.
 *
 * The puzzle coach is bound to use ONLY these pattern names when describing
 * a puzzle's tactical motif. Anything else is post-filtered out of the
 * model's output (defense-in-depth so the model can't invent a name like
 * "queen-rook fork to e5" — only the catalog names below are admissible).
 *
 * Source: Lichess puzzle theme taxonomy (CC0). Names are kebab-cased to
 * match `ChessPuzzle.themes[]` strings emitted by the puzzle DB + the
 * `puzzles.ts` shape used across the codebase.
 *
 * If the Tactical Grounding Program (`MASTERMIND_CONTEXT/
 * PR_TACTICAL_DETECTOR_PLAN.md`) ships Stage 5, the structurally-detected
 * motif names will be a subset of this list — keep the two vocabularies in
 * sync to avoid the recommender drift Aayan called out 2026-05-30.
 */

export const PUZZLE_PATTERN_ALLOWLIST = [
  // Core tactical motifs (Stage 5 detector covers the first 8)
  "fork",
  "pin",
  "skewer",
  "discovered-attack",
  "discovered-check",
  "removed-defender",
  "hanging-piece",
  "trapped-piece",
  "back-rank-mate",
  // Mate patterns (additive — narration only)
  "mate",
  "mate-in-1",
  "mate-in-2",
  "mate-in-3",
  "mate-in-4",
  "mate-in-5",
  "smothered-mate",
  "back-rank",
  "boden-mate",
  "double-bishop-mate",
  "anastasia-mate",
  "arabian-mate",
  // Move-quality / position labels
  "advantage",
  "crushing",
  "equality",
  "endgame",
  "middlegame",
  "opening",
  "short",
  "long",
  "very-long",
  // Tactical patterns
  "double-attack",
  "deflection",
  "decoy",
  "interference",
  "clearance",
  "attraction",
  "sacrifice",
  "zugzwang",
  "x-ray-attack",
  "intermezzo",
  "underpromotion",
  // Endgame motifs
  "pawn-endgame",
  "rook-endgame",
  "queen-endgame",
  "bishop-endgame",
  "knight-endgame",
  "queen-rook-endgame",
  "opposite-colored-bishops",
  "same-colored-bishops",
  "promotion",
  "advanced-pawn",
  "passed-pawn",
  // Attack patterns
  "kingside-attack",
  "queenside-attack",
  "exposed-king",
  "attacking-f2-f7",
  "castling",
  "en-passant",
  "capturing-defender",
  "defensive-move",
  "quiet-move",
] as const;

export type PuzzlePatternName = (typeof PUZZLE_PATTERN_ALLOWLIST)[number];

const ALLOWLIST_SET: ReadonlySet<string> = new Set(PUZZLE_PATTERN_ALLOWLIST);

/** O(1) check whether a kebab-cased pattern name is in the catalog. */
export function isAllowedPatternName(name: string): name is PuzzlePatternName {
  return ALLOWLIST_SET.has(name.toLowerCase());
}

/**
 * Phrases the model is forbidden from using *unless* the corresponding
 * allowlist motif is in scope (themes the puzzle was tagged with, or the
 * model has already been told about). Post-filter strips matches.
 *
 * Kept conservative — only the bread-and-butter tactical vocabulary. Words
 * like "advantage" or "endgame" are NOT forbidden because they're generic
 * positional vocabulary that doesn't carry a hallucination risk.
 */
export const FORBIDDEN_WITHOUT_BACKING = [
  "fork",
  "pin",
  "skewer",
  "discovered attack",
  "discovered check",
  "removes the defender",
  "removed defender",
  "hanging piece",
  "trapped piece",
  "back rank",
  "smothered mate",
  "boden's mate",
  "anastasia",
  "deflection",
  "decoy",
  "interference",
  "zugzwang",
  "x-ray",
] as const;

/**
 * Map a Lichess puzzle theme tag (any of the 70+) to its allowlist entry.
 * Themes that don't map (rare meta-themes like "master-vs-master") are
 * dropped — the LLM gets a smaller, cleaner backing set.
 */
export function normalizeThemes(themes: string[]): PuzzlePatternName[] {
  const out: PuzzlePatternName[] = [];
  for (const raw of themes) {
    if (!raw) continue;
    const k = raw.trim().toLowerCase().replace(/_/g, "-");
    if (isAllowedPatternName(k)) {
      out.push(k);
    }
  }
  return out;
}
