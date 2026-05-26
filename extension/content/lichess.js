// ─────────────────────────────────────────────────────────────────────────────
// Lichess content script.
//
// Detects we're on a game page (8-char gameId in path), fetches the PGN
// from Lichess's public game-export endpoint, and injects the
// "Analyze with Chess Masti" button into the side panel — falling back
// to a floating top-right button if no sidebar selector matches.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  const cm = window.__chessMasti;
  if (!cm) {
    console.error("[Chess Masti] lichess.js: shared.js not loaded — bailing");
    return;
  }
  console.log("[Chess Masti] lichess.js init, path:", location.pathname);

  // Lichess game URLs: /<8chars> or /<8chars>/{white,black}, and /<12chars>
  // (the 12-char full ID is occasionally surfaced; the first 8 chars are the
  // public game ID and work with the export endpoint).
  function getGameIdFromPath() {
    const m = location.pathname.match(/^\/([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{0,4})?(?:\/(?:white|black))?\/?$/);
    return m ? m[1] : null;
  }

  async function fetchPgn(gameId) {
    const url = `https://lichess.org/game/export/${gameId}?clocks=false&evals=false&literate=false`;
    console.log("[Chess Masti] fetching PGN:", url);
    const res = await fetch(url, {
      headers: { Accept: "application/x-chess-pgn" },
    });
    if (!res.ok) {
      throw new Error(`Lichess export returned ${res.status}`);
    }
    const text = await res.text();
    console.log("[Chess Masti] PGN fetched, length:", text.length);
    return text;
  }

  // Sidebar selectors — multiple candidates in case Lichess restyles. First
  // match wins. The MutationObserver in shared.js re-tries on DOM changes,
  // and after 6s of no match the floating-button fallback fires.
  const SIDEBAR_SELECTORS = [
    // Analysis page (game review with engine eval) — most likely for the
    // canonical /<gameId> URL after the game finishes
    ".analyse__tools",
    ".analyse__side",
    ".analyse__panels",
    ".analyse__moves",
    // Older / live-game container names
    ".round__app__table",
    ".analyse-side",
    // Last-ditch generic fallback within the main column
    "main aside",
    "aside.lichess-rail",
  ];

  function tryInject() {
    const gameId = getGameIdFromPath();
    if (!gameId) {
      console.log("[Chess Masti] no Lichess game ID in path, not injecting");
      return false;
    }
    for (const selector of SIDEBAR_SELECTORS) {
      const ok = cm.injectButton(selector, () => fetchPgn(gameId));
      if (ok) return true;
    }
    return false;
  }

  // Fallback PGN getter for the floating button — uses the current path's
  // gameId at click time, so if the user navigates between games without a
  // full reload, the floating button still fetches the right PGN.
  function fallbackGetPgn() {
    const gameId = getGameIdFromPath();
    if (!gameId) throw new Error("Not on a Lichess game URL");
    return fetchPgn(gameId);
  }

  // Initial attempt + watcher + floating fallback if all selectors miss.
  cm.watchForPanel(tryInject, fallbackGetPgn);

  // Lichess uses pushState for navigation; listen so we re-inject when
  // the user clicks between games.
  const origPushState = history.pushState;
  history.pushState = function () {
    origPushState.apply(this, arguments);
    const stale = document.getElementById(cm.BUTTON_ID);
    if (stale && !document.contains(stale)) stale.remove();
    setTimeout(tryInject, 250);
  };
  window.addEventListener("popstate", () => setTimeout(tryInject, 250));
})();
