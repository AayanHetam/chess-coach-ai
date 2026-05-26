# Analyze with Chess Masti — Chrome Extension

Adds an **"Analyze with Chess Masti"** button to game pages on Lichess and Chess.com. One click extracts the PGN and opens a new tab on [chessmasti.com](https://chessmasti.com) with the game pre-loaded for AI coaching.

## Install (development, unpacked)

1. Open `chrome://extensions` in Chrome (or Edge / Brave / any Chromium browser).
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked**.
4. Select this `extension/` directory.
5. Visit a Lichess game (e.g. `https://lichess.org/<gameId>`) or a Chess.com game (`https://www.chess.com/game/live/<id>`).
6. The orange **"♟ Analyze with Chess Masti"** button should appear in the sidebar.

## How it works

- **Lichess** — content script detects the 8-character game ID in the URL, fetches the PGN from `https://lichess.org/game/export/<id>` (public, no auth required), and opens `chessmasti.com/analysis?pgn=<encoded>`.
- **Chess.com** — content script extracts the PGN from the moves panel in the DOM (Chess.com doesn't expose an anonymous per-game PGN API). If extraction fails, the button still opens `chessmasti.com/analysis` and the user can paste manually.

Both sites are SPAs; the script handles pushState navigation so the button persists across game-to-game navigation without a page reload.

## File layout

```
extension/
├── manifest.json          # Manifest v3
├── README.md              # this file
├── icons/
│   ├── 16.png             # toolbar icon
│   └── 32.png             # extension management page
└── content/
    ├── shared.js          # button injection helper, URL builder
    ├── lichess.js         # Lichess-specific detection + PGN fetch
    └── chesscom.js        # Chess.com-specific detection + DOM scraping
```

## Limitations (MVP)

- **No Chrome Web Store listing yet** — load unpacked is the only install path.
- **Chess.com PGN extraction is DOM-based** and may need adjustment if Chess.com restyles their moves panel.
- **No Firefox support** — manifest v3 differs across browsers; Firefox port is a follow-up.
- **No game-over auto-detection** — the button is always visible on game pages, user clicks when ready.

## Receiving side

This extension relies on the [`?pgn=` query parameter](../src/pages/analysis.tsx) on `chessmasti.com/analysis`, shipped in PR #37. Without that, the extension's deep link still opens the analysis page but the PGN doesn't auto-load.
