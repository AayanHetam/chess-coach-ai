// Shared types for the insight permalinks feature.
// Insights are point-in-time snapshots of a coach response — a shareable
// "permalink" view of a coach message anchored to a board position. The
// snippet share dialog writes one, /analysis?insightId=<id> reads it back.
//
// Two share modes, picked by the user in the snippet dialog:
// - 'single': just the one coach message they clicked Share on
// - 'transcript': the entire user/coach conversation up to and including that message

export type InsightKind = "single" | "transcript";

// A single user/assistant turn in a shareable transcript. Matches the shape
// of AICoachChat's internal Message but only the public-share fields. We
// exclude 'system' role from shares (system messages are internal-only).
export interface ShareableMessage {
  role: "user" | "assistant";
  content: string;
  fen?: string;
}

export interface InsightCreateRequest {
  fen: string;
  pgn?: string | null;
  coachContent: string;
  coachContextId?: string | null;
  kind?: InsightKind; // defaults to 'single' for backward compat
  transcript?: ShareableMessage[]; // required when kind === 'transcript'
}

export interface InsightRecord {
  id: string;
  fen: string;
  pgn: string | null;
  coachContent: string;
  coachContextId: string | null;
  kind: InsightKind;
  transcript: ShareableMessage[] | null;
  sharerUid: string | null;
  createdAt: number; // unix epoch ms — stable across server/client
  viewCount: number;
}

// Sanity caps. Firestore docs are capped at ~1MB; we enforce smaller bounds
// up front so a malformed client doesn't fill the field with garbage.
export const INSIGHT_MAX_COACH_CONTENT_CHARS = 20_000;
export const INSIGHT_MAX_PGN_CHARS = 50_000;
export const INSIGHT_MAX_FEN_CHARS = 200;
// Transcript caps — a chatty conversation could otherwise blow past
// Firestore's per-doc limit when combined with PGN + metadata.
export const INSIGHT_MAX_TRANSCRIPT_MESSAGES = 100;
export const INSIGHT_MAX_TRANSCRIPT_TOTAL_CHARS = 200_000;
