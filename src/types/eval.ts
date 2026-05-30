import { Move } from "chess.js";
import { EngineName, MoveClassification } from "./enums";

export interface PositionEval {
  bestMove?: string;
  moveClassification?: MoveClassification;
  opening?: string;
  lines: LineEval[];
}

export interface LineEval {
  pv: string[];
  cp?: number;
  mate?: number;
  depth: number;
  multiPv: number;
}

export interface Accuracy {
  white: number;
  black: number;
}

export interface EstimatedElo {
  white: number;
  black: number;
}

export interface EngineSettings {
  engine: EngineName;
  depth: number;
  multiPv: number;
  date: string;
}

export interface GameEval {
  positions: PositionEval[];
  accuracy: Accuracy;
  estimatedElo?: EstimatedElo;
  settings: EngineSettings;
}

export interface EvaluatePositionWithUpdateParams {
  fen: string;
  depth?: number;
  multiPv?: number;
  setPartialEval?: (positionEval: PositionEval) => void;
}

export interface CurrentPosition {
  lastMove?: Move;
  eval?: PositionEval;
  lastEval?: PositionEval;
  currentMoveIdx?: number;
  opening?: string;
}

export interface EvaluateGameParams {
  fens: string[];
  uciMoves: string[];
  depth?: number;
  multiPv?: number;
  setEvaluationProgress?: (value: number) => void;
  playersRatings?: { white?: number; black?: number };
  workersNb?: number;
  useLichessEval?: boolean;
  /**
   * Per-position deadline. When a single position takes longer than this
   * to evaluate, the engine emits `stop` and the sweep retries the
   * position at a shallower depth. Defaults to 30s — generous since at
   * depth 16 most positions finish in 1-3s, but tight enough that a
   * stalled worker doesn't park the whole sweep indefinitely.
   */
  perPositionTimeoutMs?: number;
}

export interface SavedEval {
  bestMove?: string;
  lines: LineEval[];
  engine: EngineName;
}

export type SavedEvals = Record<string, SavedEval | undefined>;
