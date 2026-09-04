# Puzzle Rush leaderboard — what it is, and what it is not

Shipped 2026-09-01 (PR #466), repaired 2026-09-03. Read this before changing
it, and before trusting it.

## The scores are claims, not results

Puzzle Rush is a speed game, so the board reacts the instant a move is played.
That feedback is local: [`usePuzzleBoardState`](../src/hooks/usePuzzleBoardState.ts)
receives each puzzle's full solution and checks moves in the browser.

**The client therefore holds the answers**, and the score it reports is
whatever it chooses to report. Nothing on the server replays the run, so this
is a board of self-reported numbers. Two things bound the damage:

- **Plausibility bounds** (`MAX_PLAUSIBLE` in
  [`puzzleRushLeaderboard.ts`](../src/lib/server/puzzleRushLeaderboard.ts))
  reject absurd claims. They are set well above any real result, so no honest
  player is ever refused. They are **not anti-cheat** — a scripted 150 is
  indistinguishable from an earned one.
- **`DELETE /api/admin/leaderboards/puzzle-rush`** takes a bad entry down for
  good. This is needed because writes are max-wins, so a published score can
  otherwise never be lowered.

Exclusion zeroes the row *and* flags it. Both matter: the zeroes hide it (every
read filters to `score > 0`), and the flag stops the next sync republishing it
from the player's own progress. Deleting the document would do neither.

## What a verifiable board would need

Stop giving the client the answers, which means the server adjudicates every
move. This is how Lichess Puzzle Storm works.

1. **`POST /api/rush/runs`** — server picks the puzzles and returns the first
   FEN plus a run token. Solutions never leave the server.
2. **`POST /api/rush/moves`** — client sends a move and the token; the server
   validates, increments the score, returns the next FEN and a fresh token. The
   clock is the server's.
3. **`POST /api/rush/runs/:id/finish`** — server reports its own count and
   becomes the **only** writer of the board.

Carry run state in the token rather than the database — sign it, and encrypt
the solutions inside it, with a server key. A move then costs zero reads and
zero writes; otherwise ~90 moves per run means ~90 Firestore operations. Track
spent nonces so a finished run cannot be replayed.

Costs to accept before starting: a network round trip per move (decide what the
UI does when one is slow — a stalled 3-minute run is worse than no
leaderboard), and signed-out play becoming local and unranked, which is a
second path through the same screen.

## Invariants — do not break these

- **Every query stays on ONE field.** `where(mode, ">", 0).orderBy(mode)` and
  `where(mode, ">", score).count()` need only Firestore's automatic indexes.
  Adding an opt-in flag or an `updatedAt` tiebreak to a *query* needs a
  hand-created composite index, and every read fails until somebody makes it.
  This is why exclusion is enforced at write time, not filtered in the read.
- **Writes only ever raise a score.** A client that has not hydrated yet has
  every best at 0; letting it write flattened real scores to zero, which is how
  the board came to hold nothing else.
- **Never publish an all-zero row.** Every signed-in account syncs progress,
  not just Rush players. The board is ordered by score, so a cohort of zeros
  *is* the board.
- **The write returns its own board.** A read-after-write answered by a
  different serverless instance shows the player their old score, because the
  public GET is cached per instance.
- **Ranks are shared between ties; display positions are not.** Three players
  tied on 20 are all 9th, but the third appears 11th on a board of ten. To ask
  whether a player can see themselves, check whether they are *on* the visible
  list — never `rank <= rowsShown`.
- **A standing covers every mode.** Ranking only the mode being viewed makes
  the player's own position vanish when they compare modes.

## Two bugs this surfaced elsewhere

The board is a derived view, and chasing it found two real faults in the thing
it derives from. Both are fixed and stand on their own:

- `useProgressSync` marked hydration complete the moment it *started*, so a
  browser that had not yet loaded the server copy could push its local zeros
  over real progress — see [`ProgressSyncGate`](../src/lib/curriculum/progressSyncGate.ts).
- `PUT /api/progress` replaced the whole blob, so two tabs racing could send a
  personal best backwards — see `updateUserProgressMonotone` in
  [`users.ts`](../src/lib/server/users.ts).

## Leftovers

Eleven rows in the `puzzleRushLeaderboard` collection are accounts that never
played Rush, enrolled by the original unguarded write path. The `score > 0`
read filter hides them and they cost nothing; deleting them is safe but has
been left to a human.
