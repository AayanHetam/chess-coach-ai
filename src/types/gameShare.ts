// Shared types for the public game-share feature.
// A game share is a point-in-time snapshot of a coached game — the PGN,
// the Stockfish evaluation (if available), the coach conversation, and
// the player metadata, captured at the moment the user clicked "Share".
//
// Public-by-URL: anyone with the share ID can view at /share/game/[id].
// The sharer's uid is recorded for analytics only, not for access control.

import type { SavedCoachMessage } from "./game";
import type { GameEval } from "./eval";

export interface GameShareCreateRequest {
  pgn: string;
  white?: string | null;
  black?: string | null;
  result?: string | null; // "1-0" | "0-1" | "1/2-1/2" | "*"
  date?: string | null;
  event?: string | null;
  site?: string | null;
  timeControl?: string | null;
  termination?: string | null;
  /** Stockfish evaluation, if the sharer's session computed one. */
  evalData?: GameEval | null;
  /** Coach conversation transcript at share time. */
  coachTranscript?: SavedCoachMessage[] | null;
  /** Optional user annotation shown above the board. */
  note?: string | null;
}

export interface GameShareRecord {
  id: string;
  pgn: string;
  white: string | null;
  black: string | null;
  result: string | null;
  date: string | null;
  event: string | null;
  site: string | null;
  timeControl: string | null;
  termination: string | null;
  evalData: GameEval | null;
  coachTranscript: SavedCoachMessage[] | null;
  note: string | null;
  sharerUid: string | null;
  createdAt: number; // unix epoch ms
  viewCount: number;
}

// Sanity caps. Firestore docs are capped at ~1MB; we enforce smaller bounds
// up front so a malformed client doesn't fill the field with garbage. Game
// transcripts can be larger than insight transcripts because they include
// the whole coached game, but we still cap them.
export const GAME_SHARE_MAX_PGN_CHARS = 60_000;
export const GAME_SHARE_MAX_NOTE_CHARS = 2_000;
export const GAME_SHARE_MAX_PLAYER_CHARS = 200;
export const GAME_SHARE_MAX_TRANSCRIPT_MESSAGES = 200;
export const GAME_SHARE_MAX_TRANSCRIPT_TOTAL_CHARS = 400_000;
