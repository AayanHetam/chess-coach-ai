/**
 * "This answer has no engine behind it" (T7, SILENT_SUBSTITUTION_HANDOFF §4).
 *
 * The coach's composer used to unlock whenever the engine was "not currently
 * loading" — which is also true when the engine has not STARTED loading, when
 * this browser cannot run WASM at all, and when `/engines/*` is blocked by a
 * network filter. Stockfish is 7.16 MB and production is never
 * cross-origin-isolated, so on a mid-range Android that window is long and
 * common. The user was invited to ask, and the reply came back in the coach's
 * ordinary confident voice with the engine-backed sections simply not there.
 *
 * Nothing downstream could tell that apart from a game with nothing to say
 * about it. An absent `gameEval` means three things on the server — never
 * computed, still computing, computed and dropped — and all three rendered
 * identically.
 *
 * So the client now states it, and this is the block that puts the statement
 * in front of the model. Returns "" whenever engine data is present, which
 * keeps every ordinary prompt byte-for-byte what it was.
 */

/**
 * @param unavailable the client's `engineDataUnavailable` — true when no
 *   evaluation is ever arriving for this session.
 * @param hasGameEval whether a `gameEval` payload actually reached the server.
 */
export function buildEngineDataNotice(
  unavailable: boolean | undefined,
  hasGameEval: boolean,
): string {
  // Engine data present: nothing to say. Also covers the case where a client
  // sets the flag but sends evals anyway — the data wins over the claim.
  if (hasGameEval) return "";
  if (!unavailable) return "";

  return [
    "## NO ENGINE ANALYSIS AVAILABLE",
    "Stockfish could not run in this user's browser, so there are NO evaluations for this game — not a single one, at any depth.",
    "",
    "This is a statement about the TOOLING, not about the game. It does not mean the game was clean, and it does not mean nothing went wrong.",
    "",
    "Therefore, in this reply:",
    "- Do NOT give a centipawn evaluation, an accuracy percentage, or an estimated rating for anyone.",
    "- Do NOT call any move a blunder, mistake, or inaccuracy. Those are engine judgements and you do not have them.",
    "- Do NOT say the game was well played, or that no serious errors were made. You cannot see that.",
    "- DO say plainly, once and early, that the engine did not load and this answer is based on chess understanding alone.",
    "- DO still help: openings, plans, structures, typical ideas and endgame technique are all yours to talk about.",
  ].join("\n");
}
