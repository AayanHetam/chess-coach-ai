// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers for the "Analyze with Chess Masti" content scripts.
//
// Runs in the isolated content-script world. Both lichess.js and chesscom.js
// load this first and then use the globals it exposes via window.__chessMasti.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  // Avoid double-init if Chrome re-injects (SPA navigation, etc.)
  if (window.__chessMasti) {
    console.log("[Chess Masti] shared.js already initialized, skipping");
    return;
  }
  console.log("[Chess Masti] shared.js loaded on", location.href);

  const CHESSMASTI_BASE = "https://chessmasti.com";
  const BUTTON_ID = "chess-masti-analyze-btn";
  const FALLBACK_INJECTION_DELAY_MS = 6000;

  function buildAnalysisUrl(pgn) {
    if (!pgn || !pgn.trim()) return `${CHESSMASTI_BASE}/analysis`;
    return `${CHESSMASTI_BASE}/analysis?pgn=${encodeURIComponent(pgn)}`;
  }

  function openAnalysis(pgn) {
    const url = buildAnalysisUrl(pgn);
    console.log("[Chess Masti] opening analysis URL:", url.slice(0, 100) + (url.length > 100 ? "…" : ""));
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // Build the branded button. We keep two styling modes:
  //   - sidebar: full-width, looks like it belongs in the host site's panel
  //   - floating: fixed top-right of the page, always visible — used as a
  //     guaranteed fallback when no sidebar selector matches
  function makeButton(getPgn, mode) {
    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.textContent = "♟ Analyze with Chess Masti";
    const baseStyle = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
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
      borderRadius: "8px",
    };
    if (mode === "floating") {
      Object.assign(btn.style, baseStyle, {
        position: "fixed",
        top: "16px",
        right: "16px",
        zIndex: "2147483647", // max — sit above any host site overlay
        padding: "10px 16px",
      });
    } else {
      Object.assign(btn.style, baseStyle, {
        padding: "8px 14px",
        margin: "6px 0",
        width: "100%",
      });
    }
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
        openAnalysis(null);
      } finally {
        btn.disabled = false;
        btn.textContent = "♟ Analyze with Chess Masti";
      }
    });
    return btn;
  }

  function injectButton(targetSelector, getPgn) {
    if (document.getElementById(BUTTON_ID)) {
      console.log("[Chess Masti] button already in DOM, skipping");
      return true;
    }
    const target = document.querySelector(targetSelector);
    console.log(
      "[Chess Masti] selector",
      JSON.stringify(targetSelector),
      target ? "✓ matched" : "✗ no match"
    );
    if (!target) return false;
    target.appendChild(makeButton(getPgn, "sidebar"));
    console.log("[Chess Masti] sidebar button injected into", targetSelector);
    return true;
  }

  // Floating-button fallback: always works, ignores host site DOM completely.
  // Triggered after N seconds of no sidebar selector matching, so the user
  // always gets the button even if Lichess/Chess.com restructures their markup.
  function injectFloatingButton(getPgn) {
    if (document.getElementById(BUTTON_ID)) return true;
    document.body.appendChild(makeButton(getPgn, "floating"));
    console.log("[Chess Masti] floating fallback button injected");
    return true;
  }

  // SPA navigation watcher. Two reliability problems we're solving here:
  //
  // 1. Lichess (and chess.com) are SPAs that re-render their sidebar after
  //    initial page load — when analysis data arrives, when the user
  //    navigates, etc. A button injected once gets wiped. Solution: keep
  //    the MutationObserver alive permanently and re-inject whenever the
  //    button goes missing.
  //
  // 2. Sidebar selectors are fragile — they match what looks like a panel
  //    but might be a hidden tool bar, or get removed on re-render. For
  //    now we DEFAULT to the floating button (always works, always
  //    visible) and skip sidebar integration. Once the end-to-end click
  //    flow is verified working, we'll polish back to sidebar integration
  //    with better selectors.
  //
  // tryInject is kept as an argument for forward compat but is currently
  // not called — fallbackGetPgn drives the floating button.
  function watchForPanel(_tryInject, fallbackGetPgn) {
    if (!fallbackGetPgn) {
      console.error("[Chess Masti] watchForPanel: no fallback getPgn — bailing");
      return;
    }
    function ensure() {
      if (document.getElementById(BUTTON_ID)) return;
      injectFloatingButton(fallbackGetPgn);
    }
    // Initial inject as soon as document.body is available.
    if (document.body) {
      ensure();
    } else {
      window.addEventListener("DOMContentLoaded", ensure, { once: true });
    }
    // Permanent observer — re-injects if the host site's SPA wipes the
    // button on re-render. Throttled via a short cooldown so we don't
    // hammer on every minor mutation.
    let cooldown = false;
    const observer = new MutationObserver(() => {
      if (cooldown) return;
      if (document.getElementById(BUTTON_ID)) return;
      cooldown = true;
      setTimeout(() => {
        cooldown = false;
      }, 250);
      ensure();
    });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      window.addEventListener("DOMContentLoaded", () => {
        observer.observe(document.body, { childList: true, subtree: true });
      }, { once: true });
    }
    // Disconnect after 5 minutes — sanity cap so a long-lived tab doesn't
    // hold the observer forever. The button will already be re-injecting
    // itself successfully by then or the page is idle.
    setTimeout(() => observer.disconnect(), 5 * 60 * 1000);
  }

  window.__chessMasti = {
    buildAnalysisUrl,
    openAnalysis,
    makeButton,
    injectButton,
    injectFloatingButton,
    watchForPanel,
    BUTTON_ID,
  };
  console.log("[Chess Masti] shared.js init complete");
})();
