# Chrome Web Store listing — Chess Masti extension

Copy + assets + checklist for the submission flow.

**Live listing** (published 2026-05-26): https://chromewebstore.google.com/detail/analyze-with-chess-masti/fligcdcmibplmdbpggcjecpkclghdnpc

⚠️ **The item name and the summary are NOT dashboard fields.** The Web Store pulls them from `manifest.json` (`name` and `description`). Changing either means bumping the version, re-zipping, uploading, and going through re-review (the published version stays live meanwhile). Only the detailed description, screenshots, and category are editable in the dashboard without a re-review.

---

## Listing fields

**Item name** (75 char max in the manifest; some store surfaces truncate around 45, so front-load brand + keywords — currently 51)
```
Chess Masti: AI Game Review for Lichess & Chess.com
```

**Short description** (132 char max — currently 127; lives in `manifest.json` `description`)
```
Free AI chess analysis in one click. Stockfish + an AI coach review your Lichess and Chess.com games and explain your mistakes.
```

**Category**
```
Productivity
```

**Language**
```
English (United States)
```

---

## Detailed description (16k char max — dashboard-editable, no re-review)

```
Free AI chess game analysis for Lichess and Chess.com. One click adds instant game review: Stockfish 17 finds your mistakes, blunders, and missed tactics, and an AI chess coach explains them in plain English — no copy-pasting PGNs, no paid tier.

HOW IT WORKS

• On any Lichess or Chess.com game page, the extension adds a single "♟ Analyze with Chess Masti" button to the top navigation.
• One click reads the game's PGN (from the public Lichess game-export endpoint, or from the Chess.com moves panel) and opens chessmasti.com/analysis in a new tab with the game pre-loaded.
• The engine pass runs automatically, then the AI coach walks you through the turning points — you don't click anything else.

WHAT YOU GET

• Engine-grounded coaching: Stockfish 17 runs first (in your browser as WebAssembly), then the AI turns the engine output into plain-English coaching. The AI never invents chess facts — the engine has already produced the truth, and every response is checked against the live board before it reaches you.
• Move-by-move insights with shareable permalinks — send a specific mistake to a friend without making them re-analyze.
• Puzzles picked from the mistakes you just made, rendered directly inside the coaching chat.
• Opponent scouting: paste a username and get opening trees, repertoire collisions, tilt and timeout profiles.

WHAT THE EXTENSION DOES NOT DO

• It does not collect any personal information.
• It does not track your browsing across sites.
• It does not run on any site other than lichess.org and chess.com.
• It has no background page, no storage, and no remote server of its own.
• It does not modify the page beyond adding the single button.

When you click the button, the PGN of the game is sent only to chessmasti.com as a URL parameter — equivalent to copy-pasting the PGN into chessmasti.com yourself. See https://chessmasti.com/privacy for the full disclosure.

WHO BUILDS THIS

Aayan Hetamsaria, a high-school student. Chess Masti is free and there's no paid tier.

LINKS

• Site: https://chessmasti.com
• Privacy: https://chessmasti.com/privacy
• FAQ: https://chessmasti.com/faq
• How it works: https://chessmasti.com/how-it-works
```

---

## Privacy practices declarations

The Chrome Web Store form asks the developer to declare data handling. Answer exactly:

**Does this item collect or use any user data?**
```
No
```

(The extension itself collects nothing. The PGN handed to chessmasti.com when the user clicks the button is initiated by the user navigating to chessmasti.com, not by the extension uploading data anywhere. Same posture as a "share to Twitter" button.)

If the form forces a granular breakdown, decline each category:
- Personally identifiable information — No
- Health information — No
- Financial and payment information — No
- Authentication information — No
- Personal communications — No
- Location — No
- Web history — No
- User activity — No
- Website content — No (we read the PGN from the open page, but do not store or transmit it on our own; the user's click is what hands it to chessmasti.com)

**Certifications** (all three required, all true for this extension):
- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases.
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Single purpose** (the dashboard asks for one sentence):
```
Add an "Analyze with Chess Masti" button to Lichess and Chess.com game pages that opens chessmasti.com with the current game pre-loaded for AI coaching.
```

---

## Permission justifications

The dashboard asks why each declared permission is needed. Paste these verbatim.

**`host_permissions` for `https://lichess.org/*`**
```
The extension fetches the PGN of the currently-open Lichess game from the public Lichess game-export endpoint (https://lichess.org/game/export/<id>) when the user clicks the "Analyze with Chess Masti" button. This is the official, unauthenticated, public endpoint Lichess provides for PGN export. The fetch happens only in response to the user's click, not on page load.
```

**Content scripts on `https://lichess.org/*` and `https://www.chess.com/*`**
```
The extension injects a single button into the top navigation of game pages on these two sites. The content script detects whether the current URL is a game page (via the site's URL pattern) and, if so, inserts a button. When the user clicks the button, the script extracts the PGN from the page (DOM for chess.com, public API for lichess.org) and opens chessmasti.com/analysis in a new tab with the PGN as a URL parameter.
```

---

## Assets checklist (for the dashboard upload step)

**Icons** — already in the package:
- 16×16 (toolbar)
- 32×32 (extensions page)
- 48×48 (management page)
- 128×128 (store listing)

**Store listing icon** — 128×128 PNG (same file as `icons/128.png`).

**Screenshots** — 1280×800 PNG/JPG (up to 5, at least 1). Take these:
1. A Lichess game page (e.g. lichess.org/<gameId>) with the orange "♟ Analyze with Chess Masti" button visible in the top nav between DONATE and the search icon.
2. A Chess.com game page (e.g. chess.com/game/live/<id>) with the same button visible in the top nav.
3. chessmasti.com/analysis mid-coaching after the click — show the board on the left and the AI coach chat actively responding on the right.
4. chessmasti.com/analysis with insights/move annotations populated — board with annotations + insights panel.

**Optional promotional assets** — these unlock featured-placement eligibility but are not required for submission:
- Small promo tile 440×280
- Marquee promo tile 1400×560

---

## Submission preflight

Before clicking "Submit for review":
1. Bump `manifest.json` version if you've changed anything since the last upload (current: 1.0.1).
2. Zip the `extension/` directory at its root — the manifest must be at the top level of the zip, not inside a wrapping folder. From the repo root:
   ```sh
   cd extension && zip -r ../chess-masti-extension-v1.0.1.zip . -x "STORE_LISTING.md" "README.md" "ROADMAP.md"
   ```
3. Verify the zip on a fresh Chrome profile via "Load unpacked" — make sure the button shows up on a Lichess game and a Chess.com game.
4. Upload the new package to the existing item at https://chrome.google.com/webstore/devconsole (do NOT create a new item — that loses the install base and reviews).
5. If the dashboard-only fields changed (detailed description, screenshots), paste those from above.
6. Submit. Re-review of a published item usually clears in a couple of days; the current version stays live meanwhile.
