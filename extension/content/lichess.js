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

  // Lichess top-nav insertion specs.
  //
  // The DONATE button on the right side of Lichess's nav links to /patron
  // (the donation page). The magnifying-glass search button has historically
  // been a button or anchor inside the same actions cluster (.site-buttons
  // or similar). We try multiple combos because Lichess restyles
  // periodically, with floating as the ultimate fallback.
  const TOPNAV_SPECS = [
    // Slot ourselves immediately after the DONATE link
    { anchor: 'a[href="/patron"]', position: "afterend" },
    { anchor: 'a[href*="/patron"]', position: "afterend" },
    // Slot ourselves immediately before the search button
    { anchor: '#topnav-search, .site-search-button, .site-search', position: "beforebegin" },
    { anchor: 'button[data-icon="?"]', position: "beforebegin" }, // Lichess uses icon-font glyphs
    // Last-ditch: just append to whatever right-side actions cluster we can find
    { anchor: ".site-buttons", position: "beforeend" },
  ];

  // PGN getter — uses the current path's gameId at click time, so if the
  // user navigates between games without a full reload, the button still
  // fetches the right PGN.
  function getPgnForCurrentGame() {
    const gameId = getGameIdFromPath();
    if (!gameId) throw new Error("Not on a Lichess game URL");
    return fetchPgn(gameId);
  }

  // Only inject if we're on a game URL. watchForPanel handles the rest:
  // topnav first, floating fallback, permanent re-inject observer.
  if (getGameIdFromPath()) {
    cm.watchForPanel(TOPNAV_SPECS, getPgnForCurrentGame);
  } else {
    console.log("[Chess Masti] not on a Lichess game URL, idle");
  }

  // SPA navigation between Lichess games re-renders the nav, which the
  // permanent MutationObserver in shared.js catches and re-injects against.
  // No explicit pushState/popstate hooks needed.
})();
