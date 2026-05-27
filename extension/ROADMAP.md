# Chess Masti Extension — Roadmap

Backlog of post-v1.0.0 ideas, grouped into ship waves by Chrome permission cost + how much server work each one needs. Pick & re-order freely; this is a working doc, not a contract.

The shipping principle: each Web Store review takes 1-14 days, so we cluster features that share permissions/host_permissions into a single version bump to amortize review time.

---

## Wave v1.1 — pure frontend polish (no new permissions)

Smallest possible "v1.0.0 ships, now what" follow-up. Drops into the existing content scripts.

### 1. Vibe-glow button — color reflects how you played
After the game ends, pulse the button in a result-aware color: green = clean win, orange = mistakes, red = blunder, purple = weird/long game. We already know the result from the DOM. Pure CSS keyframes + ~50 LOC of color-pick logic.

### 2. Adaptive button copy
Button text adapts to the result. After a loss → "♟ Find my blunder". After a win → "♟ Why I won". After a draw → "♟ The missed win". Same button, feels personal every game.

### 3. Move-time heatmap
Thin ribbon under the move list showing per-move time spent. Red = fast, gray = thought. Reveals the player's time-pressure failure pattern. Pure DOM scrape of the existing clock display.

### 4. Opening-name flash
When chess.js identifies the opening, slide in a 3-second ribbon: "📖 Caro-Kann, Advance Variation — Don't let White lock c5". Subliminal opening study. Uses an offline openings book file shipped with the extension (~30KB).

**Total cost**: ~1 day, ~300 LOC, zero new permissions, no Web Store risk.

---

## Wave v1.2 — persistence (adds `storage` permission)

### 5. Streak strip
Tiny pill above the button: "Today: 3W · 1D · 2L · avg 81% acc · 🔥4". Resets daily. Updates as games complete. Persisted via `chrome.storage.local`.

### 6. Pin for later
Right-click the button → "Pin this game". Builds a list synced to your chessmasti.com saved games (when signed in) or kept local-only otherwise.

### 7. Tilt warning
If you lose 2+ in a row, the rematch button gets a 15-second soft gate with a "quick puzzle while you cool down?" prompt. Streak count persisted in `chrome.storage.local`.

**Total cost**: ~half day. Adds `storage` permission — small ask for the review.

---

## Wave v1.3 — Lichess cloud-eval + scout-on-pairing (adds chess.com host_perm)

### 8. Hover-peek tooltip
Hover the button → tooltip with the one juiciest move from the game. Pre-fetched via Lichess's public `/api/cloud-eval` endpoint (free, no auth, generous rate limit).

### 9. Mini eval ribbon
Thin eval sparkline below the button. Hover any spike to see which move caused it. Same Lichess cloud-eval call as #8.

### 10. Opponent flash card
Most-useful 5 seconds in chess: between "paired" and move 1. Scrape opponent username from DOM, hit our existing scout endpoint server-side, slide in a card: "1820 blitz · 76% e4 White · loses 18% on time · vs you: never played". Requires the extension to call chessmasti.com from chess.com, so we add `https://chessmasti.com/*` to host_permissions. The scout API call itself is server-to-server, but the extension has to initiate it from the host page.

**Total cost**: ~1 day. Adds chess.com host_permissions (already lichess.org). Surfaces a feature we already have but only show post-hoc.

---

## Wave v1.4 — coach-integration (server work + chessmasti.com host_perm)

### 11. Cmd+M flag-the-move
Mid-game hotkey. Press Cmd+M to flag the current move. The extension records the FEN + your intent ("proud of this" vs "worried about this"). Post-game, those flags become the first thing the coach addresses. Turns post-mortem into a tour of your gut feelings — massive learning multiplier.

Needs: new chessmasti.com endpoint to receive flagged FENs and inject them into the coach prompt; `storage` to hold flags between game-end and the click.

### 12. Daily blunder puzzles
Toolbar popup shows 3 puzzles built from yesterday's actual blunders. Tight feedback loop: real mistakes → spaced-repetition memory → next-day reinforcement.

Needs: server endpoint that returns puzzles derived from the user's recent games; `notifications` permission for the daily reminder (optional).

**Total cost**: ~2 days. First wave with substantive server work.

---

## Wave v2.0 — moat stuff (architecturally big)

### 13. Sidebar coach panel inside Lichess/Chess.com
Inject a slim coach chat box into the host site's right rail. Same Chess Masti coach, but lives inside Lichess. No tab-switching. Boldest one — nobody else does this, and it changes what "chess platform" means.

Build cost: real engineering. CSP work, shadow DOM, auth bridging from extension to chessmasti.com session.

### 14. GM-watch badge
Pin a grandmaster. When they go live, the extension toolbar icon adds a small dot. Click jumps to the game with the coach pre-attached. Needs: server endpoint for GM live-status, notifications permission, opt-in flow.

### 15. Onboarding wand (first-run-only)
First time the extension sees a game you lost: a soft orange arrow draws from your losing move to "the move you should have played", then dissolves. Once. Builds the click reflex on day 1.

**Total cost**: ~5 days; #13 alone is the big one.

---

## Decisions parked for later

- **Firefox port**: manifest v3 differs. Worth doing when the Chrome version has traction.
- **Edge / Brave**: Chromium browsers should accept the same package; the Edge store has a parallel submission flow.
- **Mobile (Android Chrome)**: extensions on mobile Chrome are not supported. Mobile users get a "save game → chessmasti.com" flow instead.
- **Account-bound features (#10, #11, #12, #13, #14)** vs anonymous-friendly features: the line we want to draw is "any feature that talks to chessmasti.com requires sign-in there but does not require sign-in on Lichess/Chess.com." Confirms when we get to those waves.

## What we should NOT build

- **Auto-play moves**: no. Cheating territory, gets us banned on both platforms, ruins the brand.
- **Anything that hits chess.com's authenticated endpoints**: no. They will block us and rightly so.
- **Anything that stores PGNs without the user clicking analyze**: violates the privacy posture we committed to in /privacy.

---

## How to read this

When picking what to ship next: start at the top of the next un-shipped wave. Don't skip waves — each one's permission set / server endpoint cost compounds; landing them in order keeps each Web Store review boring and fast.

When in doubt, ship smaller. The current extension is ~455 LOC; v1.1 takes it to ~750 with zero permission asks. That's a healthy pace.
