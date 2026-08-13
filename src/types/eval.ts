import { Move } from "chess.js";
import { EngineName, MoveClassification } from "./enums";

/**
 * Where an evaluation actually came from.
 *
 * `evaluatePositionWithUpdate` races Lichess's cloud-eval against the local
 * engine and returns the cloud answer whenever it is at least as deep as the
 * caller asked for. Lichess routinely holds depth 60 for common positions, so
 * for most openings the numbers on screen are Lichess's, not the engine the
 * user picked — which makes an engine selector meaningless unless the UI can
 * say which one answered.
 */
export type EvalSource = "local" | "cloud";

export interface PositionEval {
  bestMove?: string;
  moveClassification?: MoveClassification;
  opening?: string;
  lines: LineEval[];
  /** Undefined on evals produced before this was tracked. */
  source?: EvalSource;
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
  /**
   * Default true. Set false to force the local engine even when Lichess's
   * cloud holds a deeper answer — i.e. when the user has explicitly chosen
   * which engine should be doing the work.
   */
  allowCloud?: boolean;
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
