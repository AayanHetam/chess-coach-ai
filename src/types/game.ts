import { GameEval } from "./eval";

/**
 * Persisted coach message. A slim cut of AnalysisImpl's runtime CoachMessage:
 * just the fields a reader needs to reconstruct the conversation. We
 * intentionally drop puzzlePack (re-fetchable from concept tags), drillState
 * (transient), insight metadata (re-parseable from content), and any other
 * runtime UI signals so the persisted blob stays small and forward-
 * compatible — runtime CoachMessage can grow without invalidating saved
 * transcripts.
 */
export interface SavedCoachMessage {
  role: "user" | "coach";
  content: string;
  /** Half-move index this message references, when applicable. */
  ply?: number;
  /** Unix millis. Useful for ordering and "asked 3 days ago" UI. */
  ts?: number;
}

export interface Game {
  id: number;
  pgn: string;
  event?: string;
  site?: string;
  date?: string;
  round?: string;
  white: Player;
  black: Player;
  result?: string;
  eval?: GameEval;
  termination?: string;
  timeControl?: string;
  /** Coach conversation for this game. Updated by the analysis page after
   *  every reply lands so reloading the saved game brings the conversation
   *  back instead of starting fresh. Absent on legacy games saved before
   *  the persistence wiring shipped. */
  coachTranscript?: SavedCoachMessage[];
}

export interface Player {
  name: string;
  rating?: number;
  avatarUrl?: string;
}
