// ─────────────────────────────────────────────────────────────────────────────
// Types mirroring Lichess's Board API stream events.
//
// These are thinner/stricter than the "ambient" GameState in lichess-board.ts
// because the Board stream has a well-defined two-event shape we can rely on:
//   1. gameFull  — sent once when the stream opens, contains the full snapshot.
//   2. gameState — sent on every subsequent event (move / clock / status).
// ─────────────────────────────────────────────────────────────────────────────

export interface LichessPlayer {
  aiLevel?: number;
  id?: string;
  name?: string;
  title?: string;
  rating?: number;
  provisional?: boolean;
}

/** Named-value subset of Lichess game statuses we care about in the UI. */
export type LichessStatus =
  | 'created'
  | 'started'
  | 'aborted'
  | 'mate'
  | 'resign'
  | 'stalemate'
  | 'timeout'
  | 'draw'
  | 'outoftime'
  | 'cheat'
  | 'nostart'
  | 'unknownFinish'
  | 'variantEnd';

export interface LichessGameFull {
  type: 'gameFull';
  id: string;
  variant: { key: string; name: string; short?: string };
  clock?: { initial: number; increment: number };
  speed: string;
  perf?: { name: string };
  rated: boolean;
  createdAt: number;
  white: LichessPlayer;
  black: LichessPlayer;
  initialFen: string; // "startpos" or FEN string
  state: LichessGameState;
}

export interface LichessGameState {
  type: 'gameState';
  moves: string; // Space-separated UCI moves from initial position.
  wtime: number; // Milliseconds remaining on white's clock.
  btime: number;
  winc: number;
  binc: number;
  status: LichessStatus;
  winner?: 'white' | 'black';
  wdraw?: boolean;
  bdraw?: boolean;
  wtakeback?: boolean;
  btakeback?: boolean;
}

/** Events we receive on the global event-stream (`/api/stream/event`). */
export type LichessEventStreamMessage =
  | { type: 'gameStart'; game: { id: string; fen?: string; color?: 'white' | 'black' } }
  | { type: 'gameFinish'; game: { id: string } }
  | {
      type: 'challenge';
      challenge: {
        id: string;
        url: string;
        challenger: LichessPlayer;
        destUser?: LichessPlayer;
        rated: boolean;
        speed: string;
        timeControl: { type: string; limit?: number; increment?: number };
        color: 'white' | 'black' | 'random';
      };
    }
  | { type: 'challengeCanceled'; challenge: { id: string } }
  | { type: 'challengeDeclined'; challenge: { id: string } };

export interface LichessStoredUser {
  id: string;
  username: string;
  title?: string;
  rating?: number;
  ratingPerf?: string;
  /** Per-speed ratings so the UI can show the one matching the selected TC. */
  perfs?: Record<string, number>;
}
