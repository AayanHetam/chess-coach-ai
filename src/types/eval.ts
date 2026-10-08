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

/**
 * One asked move, scored by `UciEngine.evaluateMoves`.
 *
 * SCORE CONVENTION: `cp` and `mate` are WHITE-RELATIVE, exactly like every
 * `LineEval` (positive favours White whoever is to move, a positive mate is
 * White delivering it). The engine reports side-to-move scores and the parser
 * flips them for Black, as parseEvaluationResults does. The three regimes on
 * the repo's screens (the review's warm sweep, the live effect's deeper
 * number, this cold pair) share the convention and must still never be
 * subtracted across each other; see NullMoveProbe in lib/intent.
 */
export interface MoveEval {
  /** The move as asked, UCI (chess.js spelling: e1g1 for castling). */
  uci: string;
  san: string;
  cp?: number;
  mate?: number;
  depth: number;
  /** The engine's line, UCI, the asked move first. */
  pv: string[];
}

export interface MovesEval {
  fen: string;
  /** The shallowest depth among the scored moves; 0 when none scored. */
  depth: number;
  /** Scored moves, best for the side to move first. */
  moves: MoveEval[];
  /** Asked moves the engine returned no line for. Reported, never invented. */
  missing: string[];
  /** The engine's preferred move among those asked, UCI, from its `bestmove`. */
  bestMove?: string;
  source: "local";
  /**
   * The search ran on a cleared transposition table, so the asked moves are
   * comparable with each other and with nothing measured on a warm table.
   */
  cold: true;
}

export interface EvaluateMovesParams {
  fen: string;
  /** The moves to score, UCI, each legal at `fen`; 1 to 10 of them (the MultiPV bound). */
  moves: string[];
  depth?: number;
  /**
   * Called at every depth the search completes with every asked move scored,
   * so a first evaluation can be drawn before the final one lands.
   */
  onPartial?: (partial: MovesEval) => void;
  /** Ends the search in any phase; the call rejects with `EngineSearchAbortedError`. */
  signal?: AbortSignal;
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
  /**
   * Ends the search early: before the engine is asked, the call rejects
   * with `EngineSearchAbortedError`; during the search the engine is told
   * to stop and the call rejects the same way. The caller that wants the
   * engine for something else (a what-if, coachWhatIf.ts) aborts the live
   * eval in whatever phase it is, instead of stopping only a search that
   * has already begun.
   */
  signal?: AbortSignal;
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
