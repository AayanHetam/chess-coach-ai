/**
 * T3 (MASTERMIND_CONTEXT/SILENT_SUBSTITUTION_HANDOFF.md §T3) — resolved
 * 2026-08-29 as option A: DECLARE reduced grounding on follow-up turns
 * instead of fetching fresh external evidence for them.
 *
 * The measurement that made the call (option E, run against the tracking DB
 * before deciding): `llm_calls` holds 105 captured calls in its entire
 * history — puzzle-chat 45, enhanced-analysis 31, puzzle-hint 29, and
 * feature:"chat" ZERO. The follow-up path has no observed consented traffic
 * at all, so buying it per-turn chessdb / Maia / tablebase fetches (options
 * B–D) would spend 6–8s fetch ceilings and new failure modes on a path
 * nobody measurably uses. Re-run that query once the AI pause lifts and
 * traffic exists; option B (Lichess tablebase only, ≤7 pieces — exactly
 * decidable and free) is the first upgrade if endgame follow-ups appear.
 *
 * Precision matters here: follow-ups are NOT evidence-free. They carry the
 * review-time contract (engine lines behind each verdict), per-move
 * Stockfish evals, and fresh chess.js facts for positions under discussion.
 * What they do NOT get is a fresh external lookup THIS turn. This note
 * exists so the model treats that gap as something to say out loud, not to
 * paper over with invented numbers.
 */
export const FOLLOWUP_REDUCED_GROUNDING_NOTE = [
  "EVIDENCE SCOPE FOR THIS TURN: you have the review-time evidence above —",
  "engine lines, verdicts, and position facts — but NO fresh external",
  "lookups were made for this turn: no opening-book statistics, no",
  '"players at your level" data, no endgame tablebase verdicts. If an',
  "answer would need one of those, say plainly that it would take a lookup",
  "you don't have here, and reason from the engine evidence instead. Never",
  "invent book percentages, tablebase results, or level-specific claims.",
].join(" ");
