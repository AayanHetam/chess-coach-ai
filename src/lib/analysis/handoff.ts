/**
 * Handing a game to /analysis without putting it in the URL.
 *
 * `?pgn=` already works, but a chess.com PGN carries per-move clock comments
 * (`{[%clk 0:09:57.3]}`) and url-encoding inflates it further — a 40-move game
 * lands around 4-5KB. That is an ugly address bar, it is re-sent to the server
 * on every navigation because /analysis has getServerSideProps, and it is close
 * enough to real-world URL limits to fail somewhere unpredictable.
 *
 * So the PGN goes in sessionStorage and the URL carries a flag. This mirrors
 * the existing `lichess-review-pgn` handoff in AnalysisImpl, generalised.
 *
 * sessionStorage, not localStorage: a handoff should die with the tab. A stale
 * PGN surviving a browser restart and loading itself over whatever the user
 * opened next is a genuinely confusing bug.
 */

export const ANALYSIS_HANDOFF_KEY = "cm-analysis-handoff";
/** Query flag that tells /analysis to look in storage. */
export const ANALYSIS_HANDOFF_PARAM = "handoff";

/**
 * Stage a PGN for /analysis.
 *
 * Returns false when storage is unavailable (Safari private mode, disabled
 * storage) so the caller can fall back to `?pgn=` rather than navigating to a
 * page that will find nothing.
 */
export function stageGameForAnalysis(pgn: string): boolean {
  if (typeof window === "undefined") return false;
  if (!pgn.trim()) return false;
  try {
    window.sessionStorage.setItem(ANALYSIS_HANDOFF_KEY, pgn);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read and clear the staged PGN. Clearing on read is what stops a refresh from
 * re-loading the same game over whatever the user has since navigated to.
 */
export function consumeStagedGame(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const pgn = window.sessionStorage.getItem(ANALYSIS_HANDOFF_KEY);
    window.sessionStorage.removeItem(ANALYSIS_HANDOFF_KEY);
    return pgn && pgn.trim() ? pgn : null;
  } catch {
    return null;
  }
}

/**
 * The URL to send the user to, given whether staging worked.
 *
 * The `?pgn=` fallback keeps the feature working when storage is blocked —
 * a long URL is worse than a short one, but both are better than a dead button.
 */
export function analysisHref(pgn: string, staged: boolean): string {
  return staged
    ? `/analysis?${ANALYSIS_HANDOFF_PARAM}=1`
    : `/analysis?pgn=${encodeURIComponent(pgn)}`;
}
