# Coach-accuracy regression games

Real games where the coach stated something the board contradicts. Each bug
is pinned by a test that replays the game; see
[docs/coach-accuracy-notes.md](../../../../../../docs/coach-accuracy-notes.md).

| File | What it is |
|---|---|
| `opera-game.pgn` | Morphy vs the Duke of Brunswick and Count Isouard, Paris 1858 (public domain). |
| `game-b.pgn` | Lazer_Wizard vs nguoiquangnam, chess.com live game 185345453122, from the public archive API. |
| `game-b.source.json` | That game's own move list (chess.com TCN), so a test can check the PGN against it. |
| `engine-truth.json` | Every position of both games at depth 16 and 20, MultiPV 3, native Stockfish, White's point of view. |

## Adding the next bug

1. Add the game's PGN here and its id to `GAME_FILES` in `../../coachAccuracyFixtures.ts`.
2. Regenerate the engine truth (several minutes; needs `stockfish` on PATH):
   `COACH_TRUTH_REGEN=1 npx vitest run src/lib/coach/__tests__/engineTruth.regen.test.ts`
3. Write the failing test in `../../coachAccuracy.regression.test.ts` against
   the surface the reader saw (footer, strip sentence, card text), then fix.

Never type moves in by hand: replay the PGN, and take engine lines from the
stored truth.
