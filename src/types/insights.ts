// Shared types for the insight permalinks feature.
// Insights are point-in-time snapshots of a coach response — a shareable
// "permalink" view of a coach message anchored to a board position. The
// snippet share dialog writes one, /analysis?insightId=<id> reads it back.

export interface InsightCreateRequest {
  fen: string;
  pgn?: string | null;
  coachContent: string;
  coachContextId?: string | null;
}

export interface InsightRecord {
  id: string;
  fen: string;
  pgn: string | null;
  coachContent: string;
  coachContextId: string | null;
  sharerUid: string | null;
  createdAt: number; // unix epoch ms — stable across server/client
  viewCount: number;
}

// Sanity caps. Firestore docs are capped at ~1MB; we enforce smaller bounds
// up front so a malformed client doesn't fill the field with garbage.
export const INSIGHT_MAX_COACH_CONTENT_CHARS = 20_000;
export const INSIGHT_MAX_PGN_CHARS = 50_000;
export const INSIGHT_MAX_FEN_CHARS = 200;
