# content-engine

Deterministic Chess Masti reel builder. Chromium renders, ffmpeg encodes,
chess.js verifies. **No generative AI touches any output.** Marginal cost per
asset is zero.

This is the Linux/CI port of the pipeline that lives on Aayan's Mac. Same
format rules, same verification order, same ledger.

```
node make_cold.mjs 30 batch1     # build a batch into out/batch1
node verify.mjs batch1           # gate it before anything is handed over
```

Each folder gets `video.mp4`, `cover.png`, `caption.txt`, `pinned-comment.txt`
and `puzzle.json`. `out/<batch>/batch-sheet.tsv` is the posting schedule.

## Format rules that were paid for

- **The board is on screen at frame zero. There is no intro.** A 3-second
  branded intro produced 1-second average watch time and an 87% skip rate
  across nine posts. Never reintroduce a title card.
- Goal, ELO and the difficulty badge are on the first frame. Time-to-content
  is zero.
- Countdown is 5 ticks at 1.6s each. The viewer solves it. **The answer never
  appears in the video.**
- **Silent on purpose.** Trending audio is added in the Instagram app, and the
  web uploader has no audio picker, so reels must be posted from the phone.
- Ember board (`#F2E7DA` / `#C2673B`), navy ground `#0D1420`, ember accent
  `#F97316`. Difficulty colour drives the badge, the ring and the countdown.
- The answer goes in the **caption below the fold**, not a comment.
  Instagram's API cannot post a top-level comment on your own media, only
  replies. `pinned-comment.txt` is a hand-paste fallback, not an automation.

Timeline, 30fps, 12.0s exactly:

| window | what is on screen |
| --- | --- |
| 0.0–1.0s | board at the raw FEN, goal + ELO + badge, "THEY JUST PLAYED" |
| 1.0–2.4s | the opponent's setup move slides in (0.5s), then its SAN holds |
| 2.4–10.4s | 5 countdown ticks at 1.6s, side to move, depleting ring |
| 10.4–12.0s | end card, `/puzzles/<band>` |

## Verification, in order. Do not skip.

1. **Legality.** Every puzzle is replayed with chess.js before it enters the
   pool. A line that will not replay is dropped, never shipped.
2. **Evaluation.** Any claim about who is better needs `evals.mjs`, which runs
   only on the Mac (Homebrew Stockfish at `/opt/homebrew/bin/stockfish`; the
   sandbox cannot see it). **This port therefore never makes one.** Counting
   material and legal moves is engine-free and fine, so goals are limited to
   proven mate (`chess.isCheckmate()`) and counted material gain.
   `verify.mjs` fails the batch on "crushing" and "winning".
3. **Attribution.** Check who an opening is actually named after before putting
   a name on a slide. The Vienna is Hamppe's, not Steinitz's.

## Traps that cost real time

- **Playwright `setContent` has no base URL.** A relative `<img src>` fails
  silently. Every piece is inlined as a base64 data URI.
- **Build scripts wipe the output folder.** Only output lives in `out/`.
- **Temp dirs must be `mkdtemp`.** Deriving one from the output filename means
  every build shares a folder and concurrent runs delete each other's frames.
- **Google Fonts is blocked from the sandbox.** The stack is pinned to
  Liberation Sans / DejaVu Sans, both present locally, so a render never
  depends on egress.
- **`NbPlays` is plays, not solves, and not people.** The footer and every
  caption say "played N times on Lichess".
- Playwright's bundled ffmpeg is VP8-only. Reels need H.264, so this uses the
  system ffmpeg.

## Selection

`selectDiverse` walks 4 difficulty tiers against 5 goal types. They are
coprime, so all 20 combinations cycle before repeating and no two consecutive
posts share a tier or a goal. `verify.mjs` re-checks that on the built batch.

`posted.json` is the ledger — never bypass it. A rerun draws puzzles the
ledger has not seen.

## Licensing

- Puzzles are CC0, from the Lichess open database. Credit Lichess in the bio
  anyway. Every caption credits it too.
- Pieces: `cburnett` (GPLv2+, Colin M.L. Burnett). **Never** a sadsnake1 set —
  maestro, staunty, fresca, cardinal, gioco, tatiana and dubrovny are all
  CC BY-NC-SA, non-commercial only.
- **Never** `public/sounds` — Lichess audio, AGPL v3. These reels are silent,
  so the question does not arise.
- Player photos: pre-1930 or Anefo/Dutch National Archives only. No living
  players. (Not used by this builder.)

## Claims that must never appear

`verify.mjs` fails the batch on all of these:

- Any MAU figure other than the real one.
- "Free forever" — the freemium tier is built. Captions say "free to start".
- "Open source" — the repo is CC BY-NC 4.0, source-visible.
- Any accuracy percentage the eval harness cannot back.
- "Crushing" / "winning" — those need Stockfish, which this port cannot reach.
