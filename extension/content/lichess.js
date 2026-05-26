// ─────────────────────────────────────────────────────────────────────────────
// Lichess content script.
//
// Detects we're on a game page (8-char gameId in path), fetches the PGN
// from Lichess's public game-export endpoint, and injects the
// "Analyze with Chess Masti" button into the side panel.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  const { injectButton, watchForPanel } = window.__chessMasti;

  // Lichess game URLs: /<8chars> or /<8chars>/{white,black} or /<12chars>
  // (the 12-char full ID is occasionally surfaced; the first 8 chars are the
  // public game ID and work with the export endpoint).
  function getGameIdFromPath() {
    const m = location.pathname.match(/^\/([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{0,4})?(?:\/(?:white|black))?\/?$/);
    return m ? m[1] : null;
  }

  // Fetch PGN from Lichess's public export endpoint. No auth needed for
  // public games. We strip clock annotations and evaluation tags Lichess
  // sometimes adds (?clocks=false, ?evals=false) so the PGN that lands in
  // chessmasti.com is clean.
  async function fetchPgn(gameId) {
    const url = `https://lichess.org/game/export/${gameId}?clocks=false&evals=false&literate=false`;
    const res = await fetch(url, {
      headers: { Accept: "application/x-chess-pgn" },
    });
    if (!res.ok) {
      throw new Error(`Lichess export returned ${res.status}`);
    }
    return res.text();
  }

  // The Lichess analysis/study sidebar has class .analyse__tools (engine on a
  // game review) or .analyse-cm (the action buttons row). For plain game
  // pages, the side panel is .round__app__table. We try multiple selectors
  // to be resilient to Lichess UI changes — first match wins.
  const SIDEBAR_SELECTORS = [
    ".analyse__tools",
    ".round__app__table",
    ".analyse__side",
    ".analyse-side",
    "main aside",
  ];

  function tryInject() {
    const gameId = getGameIdFromPath();
    if (!gameId) return false;
    for (const selector of SIDEBAR_SELECTORS) {
      const ok = injectButton(selector, () => fetchPgn(gameId));
      if (ok) return true;
    }
    return false;
  }

  // Initial attempt + SPA navigation watcher.
  watchForPanel(tryInject);

  // Lichess uses pushState for navigation; listen for it so we re-inject when
  // the user clicks between games.
  const origPushState = history.pushState;
  history.pushState = function () {
    origPushState.apply(this, arguments);
    // Remove any stale button (might be attached to a previous game's panel
    // that just got swapped out).
    const stale = document.getElementById(window.__chessMasti.BUTTON_ID);
    if (stale && !document.contains(stale)) stale.remove();
    setTimeout(tryInject, 250);
  };
  window.addEventListener("popstate", () => setTimeout(tryInject, 250));
})();
