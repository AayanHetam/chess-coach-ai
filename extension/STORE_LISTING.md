# Chrome Web Store listing — Analyze with Chess Masti

Copy + assets + checklist for the submission flow. Paste these straight into the developer dashboard fields.

---

## Listing fields

**Item name** (45 char max — currently 30)
```
Analyze with Chess Masti
```

**Short description** (132 char max — currently 130)
```
One-click AI chess coaching for your Lichess and Chess.com games. Adds an Analyze button — opens chessmasti.com with the PGN.
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

## Detailed description (16k char max)

```
Adds an "Analyze with Chess Masti" button to game pages on Lichess and Chess.com. One click sends the game's PGN to chessmasti.com, where Chess Masti AI walks you through your mistakes, key turning points, and what to study next — for free.

WHAT IT DOES

• Detects when you're on a Lichess or Chess.com game page and injects a single orange button in the top navigation bar.
• When you click the button, the extension reads the PGN of the game (from the public Lichess game-export endpoint, or from the Chess.com moves panel) and opens chessmasti.com/analysis in a new tab with the game pre-loaded.
• The AI coach on chessmasti.com automatically starts analyzing the game once the engine pass finishes — you don't have to click anything else.

WHAT YOU GET ON CHESSMASTI.COM

• Engine-grounded coaching. Stockfish 17 runs first (in your browser as WebAssembly), then Anthropic Claude turns the engine output into plain-English coaching. The LLM never invents chess facts because Stockfish has already produced the truth.
• Hallucination validator. Every coaching response is parsed for piece, square, and move references and checked against the live board. Claims that don't match the actual position get rewritten before they reach you.
• Move-by-move insights with shareable permalinks — send a specific mistake to a friend without making them re-analyze.
• Opponent scouting. Paste a username and get opening trees, repertoire collisions, tilt and timeout profiles.
• Inline puzzles tailored to the mistakes you just made — three puzzles rendered directly inside the chat after a coaching response, picked by FEN similarity to the position you got wrong.

WHAT THE EXTENSION DOES NOT DO

• It does not collect any personal information.
• It does not track your browsing across sites.
• It does not run on any site other than lichess.org and chess.com.
• It has no background page, no storage, and no remote server of its own.
• It does not modify the page beyond adding the single button.

When you click the button, the PGN of the game is sent only to chessmasti.com as a URL parameter — equivalent to copy-pasting the PGN into chessmasti.com yourself. See https://chessmasti.com/privacy for the full disclosure.

WHO BUILDS THIS

Aayan Hetamsaria, a high-school student. Chess Masti AI is free and there's no paid tier.

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
1. Bump `manifest.json` version if you've changed anything since the last upload (current: 1.0.0).
2. Zip the `extension/` directory at its root — the manifest must be at the top level of the zip, not inside a wrapping folder. From the repo root:
   ```sh
   cd extension && zip -r ../chess-masti-extension-v1.0.0.zip . -x "STORE_LISTING.md" "README.md"
   ```
3. Verify the zip on a fresh Chrome profile via "Load unpacked" — make sure the button shows up on a Lichess game and a Chess.com game.
4. Upload to https://chrome.google.com/webstore/devconsole. First-time submissions need a $5 developer-account fee, paid once.
5. Paste the listing copy, screenshots, and privacy practice answers from above.
6. Submit. First review typically takes a few business days to a couple of weeks.
