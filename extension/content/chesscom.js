// ─────────────────────────────────────────────────────────────────────────────
// Chess.com content script.
//
// Chess.com doesn't expose a public per-game PGN endpoint that works
// anonymously, so we extract from the DOM. The moves panel is the most
// stable surface across game/live, game/daily, and analysis pages.
// Falls back to a floating top-right button if no sidebar selector matches.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  const cm = window.__chessMasti;
  if (!cm) {
    console.error("[Chess Masti] chesscom.js: shared.js not loaded — bailing");
    return;
  }
  console.log("[Chess Masti] chesscom.js init, path:", location.pathname);

  function isGameLikePath() {
    return /^\/(game|analysis|play|live|daily)\/?/.test(location.pathname);
  }

  // Best-effort PGN extraction.
  function extractPgn() {
    // Strategy 1: hidden textarea in share modal (if open)
    try {
      const el = document.querySelector(
        ".share-menu-tab-pgn-textarea, .share-menu-tab-pgn textarea"
      );
      if (el && el.value && el.value.trim()) {
        console.log("[Chess Masti] PGN from share-menu textarea, len:", el.value.length);
        return el.value.trim();
      }
    } catch {}

    // Strategy 2: scrape moves from the moves list and reconstruct PGN.
    try {
      const moveNodes = document.querySelectorAll(
        ".node .node-highlight-content, .move-text-component, .move .node"
      );
      if (moveNodes.length === 0) {
        console.log("[Chess Masti] no move nodes found via primary selectors");
        return null;
      }
      const moves = [];
      moveNodes.forEach((n) => {
        const text = (n.textContent || "").trim();
        if (text) moves.push(text);
      });
      if (moves.length === 0) return null;
      const lines = [];
      for (let i = 0; i < moves.length; i += 2) {
        const moveNum = Math.floor(i / 2) + 1;
        const white = moves[i];
        const black = moves[i + 1];
        lines.push(black ? `${moveNum}. ${white} ${black}` : `${moveNum}. ${white}`);
      }
      const pgn = lines.join(" ");
      console.log("[Chess Masti] PGN built from DOM scrape, moves:", moves.length);
      return pgn;
    } catch (err) {
      console.error("[Chess Masti] DOM scrape failed:", err);
    }

    return null;
  }

  async function getPgn() {
    const pgn = extractPgn();
    if (!pgn) throw new Error("Could not extract PGN from this Chess.com page");
    return pgn;
  }

  // Chess.com top-nav insertion specs.
  //
  // Chess.com's header has a row of icons on the right (notifications,
  // messages, friend requests) and the user avatar at the far right. We
  // try to slot ourselves into that cluster — first by inserting before
  // the search/notification cluster, then by falling back to whatever
  // header-right container we can find. Floating fallback if none match.
  const TOPNAV_SPECS = [
    // Chess.com common header right-side cluster selectors (one of these
    // likely matches current markup)
    { anchor: ".header-component-right", position: "afterbegin" },
    { anchor: ".header-component-actions", position: "afterbegin" },
    { anchor: 'header [class*="nav-action"]', position: "beforebegin" },
    // Fallback to first <header>'s last child
    { anchor: "header > nav", position: "beforeend" },
    { anchor: "header", position: "beforeend" },
  ];

  // Only inject on chess.com game-like URLs.
  if (isGameLikePath()) {
    cm.watchForPanel(TOPNAV_SPECS, getPgn);
  } else {
    console.log("[Chess Masti] not on a chess.com game-like path, idle");
  }

  // SPA navigation between chess.com games re-renders the page, which the
  // permanent MutationObserver in shared.js catches and re-injects against.
})();
