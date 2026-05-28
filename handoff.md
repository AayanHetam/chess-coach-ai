# Handoff — `/preview/analysis` Takeover + What's Next

Branch: `feat/design-motion-foundation`
Last commit on session close: `07dddee` (Coach absorbs the 130px spacer)
Repo path: `/Users/aayanhetamsaria/Downloads/Inspirit_project/chess-coach-ai`

---

## What just shipped

### `/preview/analysis` (the redesign of the production `/analysis` page)
- Kasparov–Topalov 1999 (Pirc) demo PGN baked in. Eval sparkline, Key Moments row, MoveNavigator pill at the bottom.
- `ChessgroundBoard` wrapper around chessground v9.2.1. Drag works — **never set `viewOnly: true`** on chessground; gate interactivity via `draggable.enabled + selectable.enabled + movable.color`. (v9.2.1 bug: `viewOnly` toggle via `.set()` doesn't rebind drag listeners after mount.)
- Arrow toggles (Engine best / Most common / Game played / Maia w/ ELO slider 1100–2200).
- AI Coach panel — **real streaming** via `/api/chat?stream=1`. Streams Claude SSE deltas in-place into the coach message bubble.
- Takeover mode — Coach swaps for `MasterGamesTakeover` panel. Player avatars (16 brand colors), filter by player, send-row-to-coach, preview-move on hover/click, Revert button.
- Master Games panel (`OpeningExplorer`) lives beneath the Coach. Same source chain.

### Layout state (final pixel iteration the user signed off on)
Right column (large screens):
```tsx
<Box sx={{ height: { xs: 600, lg: "clamp(650px, 80vh, 850px)" } }}>
  <CoachPanel ... />
</Box>
<Box sx={{ flexShrink: 0 }}>
  <OpeningExplorer ... />
</Box>
```
No spacer between Coach and Master Games — Coach absorbs the previous 130px gap so chat is much taller and visible without scroll. Master Games' g3-row still aligns with the left column's key-moments row.

### Master Games DB (`/api/opening-explorer`)
3-tier resolver in `src/app/api/opening-explorer/route.ts`:
1. **Curated** — `src/data/master-openings.ts` (78 hand-curated) + `src/data/master-tree.json` (17.6 MB, **59,260 positions** processed from Nikonoel Lichess Elite 2025-11 dump via `scripts/process-master-pgn.mjs`).
2. **Lichess masters** — kept in code; **currently always 401** (Lichess hard-blocks the IP at nginx layer everywhere: school WiFi, home WiFi, Vercel outbound). Documented in memory.
3. **chessdb.cn** — engine fallback. Popularity tier is **inverted** (lower = more common). Sort: `b.rank - a.rank, then a.popularity - b.popularity`. No synthesized counts.

### Streaming chat (`/api/chat?stream=1`)
- Server: piped `callLLMStream` to SSE `data: {"type":"text","delta":"..."}` events. JSON callers (no `?stream=1`) unaffected.
- Client: `streamCoachReply(...)` in `analysis.tsx` reads the stream, calls `onDelta` per chunk. `handleSend` and `handleTakeoverSendToCoach` push an empty coach bubble then mutate it in place.
- `chatSchema` rejects `role:"system"` from clients (Phase 1.4 hardening). Position context is embedded inside the user message via `buildContextBlurb`.

### Other `/preview/*` pages
`launch`, `play`, `practice`, `scout`, `profile`, `openings` — all Design OS (ThemeProvider + GradientBackdrop + NavPill + Footer). Launch has Founder section (Mumbai mission framing). Practice has interactive Nc7+ knight-fork puzzle. Drawer toggles Preview↔Production per NAV_ITEMS map.

---

## What's NOT done

### 1. Neo4j puzzles → "Move to big board" + 3-puzzle drill flow  ← **next task**
Original spec (verbatim):
> for the Neo4J puzzles, please install a button that allows the user to move the puzzle onto the big board (Easier to see/use) then after the 3 puzzles are completed, the user should get an option for more puzzles or to revert to the game (the interaction(chat history) between the user and coach should all remain intact.

Production analysis (`src/components/AICoachChat.tsx`, ~3000 lines) already wires Neo4j puzzles via `ContextualPuzzleRecommendations` and `InlinePuzzleSet`. The preview Coach has no puzzle UI yet — the chat just streams text. Needs:
1. Detect `[INSIGHT:...]` puzzle tags (or whatever production uses) in coach replies in `analysis.tsx`.
2. Render an inline puzzle card with "Move to big board" CTA.
3. Hijack main board state with puzzle FEN; track 3-puzzle counter.
4. After puzzle #3: "More puzzles" + "Return to game" buttons. Restore the demo PGN state. Preserve coach chat history (already state-lifted, so should be free).

### 2. Real Stockfish on the sparkline
Currently a procedural mock array in `analysis.tsx`. Replace with the real engine — production `/analysis` already runs Stockfish; harvest that path.

### 3. Real Maia microservice for the ELO slider
`MAIA_MOVES` is hardcoded. There's a Maia microservice in repo root (`maia-service/`, `maia-weights/`) — wire it up to return predicted move per ELO bucket.

### 4. Beyond-spec, not blocking
- Promote `/preview/launch` → `/` (replace prod landing).
- Unlock Vercel Deployment Protection for previews (currently gated; deploy URLs need auth bypass).
- Mobile responsive audit on every `/preview/*` page.
- Expand curated master DB (Caissabase ~6M games — script ready at `scripts/process-master-pgn.mjs`).

---

## Critical constraints / gotchas (don't relearn these)

- **chessground v9.2.1** — `viewOnly` is broken across `.set()`. Always init with `viewOnly: false`. `events.after` must be re-set in every `.set()` call.
- **Lichess Masters endpoint** is blocked from every IP we've tested. The 3-tier chain is the real workaround; don't waste a session trying header tricks.
- **chatSchema** rejects `role:"system"` from the client. Embed context in the user turn.
- **No Tailwind.** MUI v7 + Emotion + framer-motion + lucide-react only. New UI primitives → `src/components/ui/`.
- **4 concurrent Claude Code sessions** modify this repo. Never `git add -A`. Ship PRs fast. New files in isolated dirs are safe.
- **Production analysis uses `react-chessboard`**, preview uses `chessground`. Don't cross-import.
- **lucide-react v1.16** — `Chrome` and `Github` icons don't exist. Use `Globe` etc.

---

## Files most likely to need touching for the puzzle work

- `src/pages/preview/analysis.tsx` — CoachPanel rendering, board state, message stream handler.
- `src/components/AICoachChat.tsx` — production reference; copy the insight-tag parsing pattern.
- `src/components/ContextualPuzzleRecommendations.tsx` and `src/components/InlinePuzzleSet.tsx` — production puzzle UI; understand the data shape.
- `src/app/api/chat/route.ts` — if puzzle insertions need a server-side tag in the prompt.
- Whatever Neo4j puzzle endpoint the production analysis hits (find it from `ContextualPuzzleRecommendations` imports).

---

## Pending TODOs at handoff

1. Write this handoff (done).
2. **Start Neo4j puzzles → "Move to big board" + 3-puzzle drill flow.** Investigate production usage first, then mirror in `/preview/analysis`. Can scaffold against mock puzzle data the same way Takeover was built.
