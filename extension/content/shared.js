// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers for the "Analyze with Chess Masti" content scripts.
//
// Runs in the isolated content-script world. Both lichess.js and chesscom.js
// load this first and then use the globals it exposes via window.__chessMasti.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  // Avoid double-init if Chrome re-injects (SPA navigation, etc.)
  if (window.__chessMasti) return;

  const CHESSMASTI_BASE = "https://chessmasti.com";
  const BUTTON_ID = "chess-masti-analyze-btn";

  function buildAnalysisUrl(pgn) {
    if (!pgn || !pgn.trim()) return `${CHESSMASTI_BASE}/analysis`;
    return `${CHESSMASTI_BASE}/analysis?pgn=${encodeURIComponent(pgn)}`;
  }

  // Open chessmasti.com in a new tab. Use window.open over location.href so
  // the user keeps their game tab as a reference.
  function openAnalysis(pgn) {
    const url = buildAnalysisUrl(pgn);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // Build the branded button as an inline-styled element so we don't have to
  // ship CSS or fight the host site's stylesheet. Brand orange #FF6B35 from
  // the chessmasti.com design system.
  function makeButton(getPgn) {
    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.textContent = "♟ Analyze with Chess Masti";
    Object.assign(btn.style, {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      padding: "8px 14px",
      margin: "6px 0",
      width: "100%",
      borderRadius: "8px",
      border: "none",
      background: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
      color: "#ffffff",
      fontWeight: "700",
      fontSize: "13px",
      letterSpacing: "0.2px",
      cursor: "pointer",
      boxShadow: "0 4px 12px rgba(255, 107, 53, 0.32)",
      transition: "transform 0.12s ease, box-shadow 0.12s ease",
      fontFamily:
        "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    });
    btn.addEventListener("mouseenter", () => {
      btn.style.transform = "translateY(-1px)";
      btn.style.boxShadow = "0 6px 16px rgba(255, 107, 53, 0.42)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "translateY(0)";
      btn.style.boxShadow = "0 4px 12px rgba(255, 107, 53, 0.32)";
    });
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.disabled = true;
      btn.textContent = "Loading PGN…";
      try {
        const pgn = await getPgn();
        openAnalysis(pgn);
      } catch (err) {
        console.error("[Chess Masti] PGN extraction failed:", err);
        // Graceful fallback — open analysis page without PGN so the user can
        // paste manually rather than getting stuck.
        openAnalysis(null);
      } finally {
        btn.disabled = false;
        btn.textContent = "♟ Analyze with Chess Masti";
      }
    });
    return btn;
  }

  // Idempotent injection: if a button is already in the DOM, do nothing.
  function injectButton(targetSelector, getPgn) {
    if (document.getElementById(BUTTON_ID)) return true;
    const target = document.querySelector(targetSelector);
    if (!target) return false;
    target.appendChild(makeButton(getPgn));
    return true;
  }

  // SPA navigation watcher. Both Lichess and Chess.com are SPAs and re-render
  // the panel without a full page load. We re-attempt injection on DOM
  // mutations until the panel exists. Caller passes a try-injection callback
  // that returns true on success.
  function watchForPanel(tryInject, { timeoutMs = 30000 } = {}) {
    if (tryInject()) return;
    const observer = new MutationObserver(() => {
      if (tryInject()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), timeoutMs);
  }

  window.__chessMasti = {
    buildAnalysisUrl,
    openAnalysis,
    makeButton,
    injectButton,
    watchForPanel,
    BUTTON_ID,
  };
})();
