// ─────────────────────────────────────────────────────────────────────────────
// Chess.com content script.
//
// Chess.com doesn't expose a public per-game PGN endpoint that works
// anonymously, so we extract from the DOM. The moves panel is the most
// stable surface across game/live, game/daily, and analysis pages. If
// extraction fails (chess.com redesign, unsupported page), the button
// still works — it just opens chessmasti.com/analysis without a PGN and
// the user can paste manually.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  const { injectButton, watchForPanel } = window.__chessMasti;

  function isGameLikePath() {
    return /^\/(game|analysis|play|live|daily)\/?/.test(location.pathname);
  }

  // Best-effort PGN extraction. Tries several DOM strategies in order of
  // reliability; first non-empty result wins. Each strategy is wrapped in
  // try/catch so a chess.com redesign of one selector doesn't kill the
  // others.
  function extractPgn() {
    // Strategy 1: chess.com sometimes exposes a hidden <textarea> or input
    // with the PGN inside the share modal. Selector candidates seen in the
    // wild: input.share-menu-tab-pgn-textarea, .share-menu-tab-pgn textarea
    try {
      const el = document.querySelector(
        ".share-menu-tab-pgn-textarea, .share-menu-tab-pgn textarea"
      );
      if (el && el.value && el.value.trim()) return el.value.trim();
    } catch {}

    // Strategy 2: scrape moves from the moves list and reconstruct PGN.
    // Selectors observed: .move-list-wrapper, .move-list, .moves-list, plus
    // each move in a span with .node-highlight-content or .move-text-component.
    try {
      const moveNodes = document.querySelectorAll(
        ".node .node-highlight-content, .move-text-component, .move .node"
      );
      if (moveNodes.length === 0) return null;
      const moves = [];
      moveNodes.forEach((n) => {
        const text = (n.textContent || "").trim();
        if (text) moves.push(text);
      });
      if (moves.length === 0) return null;
      // Build PGN move text. Chess.com's UI usually shows just the SAN; we
      // pair them as White/Black moves with move numbers.
      const lines = [];
      for (let i = 0; i < moves.length; i += 2) {
        const moveNum = Math.floor(i / 2) + 1;
        const white = moves[i];
        const black = moves[i + 1];
        lines.push(
          black ? `${moveNum}. ${white} ${black}` : `${moveNum}. ${white}`
        );
      }
      return lines.join(" ");
    } catch {}

    return null;
  }

  async function getPgn() {
    const pgn = extractPgn();
    if (!pgn) {
      throw new Error("Could not extract PGN from this page");
    }
    return pgn;
  }

  // Chess.com sidebar candidates. The right-rail area where existing share /
  // download buttons live. Multiple selectors for resilience.
  const SIDEBAR_SELECTORS = [
    ".board-layout-sidebar",
    ".sidebar-component",
    ".game-controls-component",
    "aside",
  ];

  function tryInject() {
    if (!isGameLikePath()) return false;
    for (const selector of SIDEBAR_SELECTORS) {
      const ok = injectButton(selector, getPgn);
      if (ok) return true;
    }
    return false;
  }

  watchForPanel(tryInject);

  // Chess.com is also an SPA — handle pushState navigation.
  const origPushState = history.pushState;
  history.pushState = function () {
    origPushState.apply(this, arguments);
    const stale = document.getElementById(window.__chessMasti.BUTTON_ID);
    if (stale && !document.contains(stale)) stale.remove();
    setTimeout(tryInject, 250);
  };
  window.addEventListener("popstate", () => setTimeout(tryInject, 250));
})();
