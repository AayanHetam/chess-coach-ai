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
    if (!pgn || !pgn.trim()) return `${CHESSMASTI_BASE}/analysis?autoAnalyze=1`;
    // autoAnalyze=1 tells chessmasti.com to kick off the Stockfish analysis
    // immediately and then auto-send "analyze my game" to the coach once
    // analysis completes — so the extension-driven flow feels like one click.
    return `${CHESSMASTI_BASE}/analysis?pgn=${encodeURIComponent(pgn)}&autoAnalyze=1`;
  }

  function openAnalysis(pgn) {
    const url = buildAnalysisUrl(pgn);
    console.log("[Chess Masti] opening analysis URL:", url.slice(0, 100) + (url.length > 100 ? "…" : ""));
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // Build the branded button. Three styling modes:
  //   - topnav: small inline pill, sized to slot into the host site's top
  //     navigation bar (between Donate and Search on Lichess, etc.)
  //   - sidebar: full-width, looks like it belongs in the host site's panel
  //   - floating: fixed top-right of the page, always visible — used as a
  //     guaranteed fallback when no topnav/sidebar slot can be found
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
      letterSpacing: "0.2px",
      cursor: "pointer",
      transition: "transform 0.12s ease, box-shadow 0.12s ease",
      fontFamily:
        "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    };
    if (mode === "topnav") {
      Object.assign(btn.style, baseStyle, {
        padding: "6px 12px",
        fontSize: "12px",
        borderRadius: "6px",
        margin: "0 6px",
        boxShadow: "0 2px 6px rgba(255, 107, 53, 0.28)",
        verticalAlign: "middle",
        lineHeight: "1.4",
        // Match Lichess/chess.com nav height so we don't blow out the row.
        height: "28px",
      });
    } else if (mode === "floating") {
      Object.assign(btn.style, baseStyle, {
        position: "fixed",
        top: "16px",
        right: "16px",
        zIndex: "2147483647", // max — sit above any host site overlay
        padding: "10px 16px",
        fontSize: "13px",
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(255, 107, 53, 0.32)",
      });
    } else {
      Object.assign(btn.style, baseStyle, {
        padding: "8px 14px",
        margin: "6px 0",
        width: "100%",
        fontSize: "13px",
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(255, 107, 53, 0.32)",
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
  // Triggered when no topnav/sidebar slot can be found.
  function injectFloatingButton(getPgn) {
    if (document.getElementById(BUTTON_ID)) return true;
    document.body.appendChild(makeButton(getPgn, "floating"));
    console.log("[Chess Masti] floating fallback button injected");
    return true;
  }

  // Top-nav injection. Caller supplies an array of "insertion specs" — each
  // spec describes how to find the right slot in the host site's nav bar
  // and where to put the button relative to that slot. First successful
  // insertion wins.
  //
  // Spec shape:
  //   {
  //     anchor:    'a[href*="patron"]',  // CSS selector for the reference element
  //     position:  'afterend',           // 'beforebegin' | 'afterend'
  //     parentSel: '.site-buttons',       // optional: anchor must be inside this
  //   }
  function injectTopnavButton(specs, getPgn) {
    if (document.getElementById(BUTTON_ID)) {
      console.log("[Chess Masti] topnav button already present, skipping");
      return true;
    }
    for (const spec of specs) {
      try {
        const anchor = document.querySelector(spec.anchor);
        if (!anchor) {
          console.log("[Chess Masti] topnav anchor", JSON.stringify(spec.anchor), "✗ no match");
          continue;
        }
        if (spec.parentSel && !anchor.closest(spec.parentSel)) {
          console.log(
            "[Chess Masti] topnav anchor",
            JSON.stringify(spec.anchor),
            "matched but not inside",
            spec.parentSel
          );
          continue;
        }
        const btn = makeButton(getPgn, "topnav");
        anchor.insertAdjacentElement(spec.position, btn);
        console.log(
          "[Chess Masti] topnav button inserted",
          spec.position,
          JSON.stringify(spec.anchor)
        );
        return true;
      } catch (err) {
        console.warn("[Chess Masti] topnav spec failed:", spec, err);
      }
    }
    return false;
  }

  // SPA navigation watcher. Three reliability problems we're solving here:
  //
  // 1. Lichess (and chess.com) are SPAs that re-render their nav and sidebar
  //    after initial page load. A button injected once gets wiped. Solution:
  //    keep the MutationObserver alive permanently and re-inject whenever
  //    the button goes missing.
  //
  // 2. Selectors are fragile — they might match a hidden element or get
  //    restructured. We try topnav first (visible, native-feeling), then
  //    fall back to floating (uglier but always works).
  //
  // 3. Throttle to 250ms so we don't hammer the DOM on every minor mutation.
  //
  // topnavSpecs is the array of insertion-spec objects (see injectTopnavButton).
  // fallbackGetPgn is the click handler if we have to fall back to floating.
  function watchForPanel(topnavSpecs, fallbackGetPgn) {
    if (!fallbackGetPgn) {
      console.error("[Chess Masti] watchForPanel: no fallback getPgn — bailing");
      return;
    }
    function ensure() {
      if (document.getElementById(BUTTON_ID)) return;
      // Try topnav first, fall back to floating if no slot matches.
      if (topnavSpecs && topnavSpecs.length > 0) {
        if (injectTopnavButton(topnavSpecs, fallbackGetPgn)) return;
      }
      injectFloatingButton(fallbackGetPgn);
    }
    if (document.body) {
      ensure();
    } else {
      window.addEventListener("DOMContentLoaded", ensure, { once: true });
    }
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
    // Sanity cap so long-lived tabs don't hold the observer forever.
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
