/**
 * /puzzles — the functional, ELO-wired puzzle drill.
 *
 * Thin re-export of the polished Puzzle Coach surface (kept at
 * /preview/puzzles as an alias). Promoted to a top-level route because it now
 * feeds the single puzzle rating, seeds from the user's level + weak themes,
 * and resumes the last puzzle on return.
 */
export { default } from "./preview/puzzles";
