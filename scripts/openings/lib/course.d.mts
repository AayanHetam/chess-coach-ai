// Types for course.mjs.
//
// The module is plain JavaScript so the build script and the unit tests run the
// exact same code with no compile step between them. Without this file TypeScript
// infers parameter types from their defaults — `setup = null` becomes `null`, and
// passing a real setup is an error — so the declarations live here rather than
// the implementation being bent to suit the inference.

export type Side = 'white' | 'black';
export type MoveSource = 'engine' | 'corpus-confirmed' | 'setup' | 'corpus';
export type Termination = 'depth' | 'wall' | 'pruned';

export interface StoredTree {
  positions: Record<string, unknown>;
  meta?: Record<string, unknown>;
}
export interface EvalIndex {
  positions: Record<string, { d: number; k?: number; p: Array<[string, number]> }>;
  source?: string;
  licence?: string;
}

export interface Reply {
  san: string;
  games: number;
  share: number;
  score: number;
}
export interface EngineMove {
  san: string;
  /** WHITE-relative centipawns, as stored. */
  cp: number;
  /** The same score from OUR side's point of view. */
  ours: number;
}
export interface EngineView {
  depth: number;
  /** Informational. Nothing branches on it. */
  knodes?: number;
  /** Sorted best-for-us first, which is not PV order when we are Black. */
  moves: EngineMove[];
}
export interface Pick {
  san: string;
  src: MoveSource;
  cp: number | null;
  loss: number | null;
  depth: number;
  share: number;
  alternatives?: Array<{ san: string; cp: number }>;
}

export interface CourseNodeJs {
  p: number;
  w: number;
  g: number;
  ch: number;
  end: Termination | null;
  us?: string;
  src?: MoveSource;
  loss?: number;
  next?: string;
  them?: Array<{ san: string; share: number; to: string }>;
  rc?: number;
  ev?: { cp: number; d: number };
}
export interface CourseChapterJs {
  i: number;
  at: string;
  line: string[];
  title: string | null;
  share: number;
  cum: number;
  nodes: number;
}
export interface BuiltCourse {
  meta: Record<string, unknown> & { nodes: number; expanded: number; evaluated: number };
  chapters: CourseChapterJs[];
  nodes: Record<string, CourseNodeJs>;
  problems: string[];
}

export interface BuildOptions {
  id: string;
  name: string;
  root: string[];
  side: Side;
  maxPly?: number;
  minShare?: number;
  minGames?: number;
  /** A system's fixed move list. Engine vets it; engine does not choose it. */
  setup?: string[] | null;
}

export declare const MATE_BASE: number;
export declare const PREFER_POPULAR_CP: number;
export declare const MAX_ENGINE_LOSS_CP: number;
export declare const MIN_OVERRIDE_DEPTH: number;
export declare const BLUNDER_CP: number;
export declare const DEFAULT_MIN_SHARE: number;

export declare function positionKey(fen: string): string;
export declare function isMate(cp: number): boolean;
export declare function forSide(cp: number, side: Side): number;
export declare function playUci(board: unknown, uci: string): { san: string } | null;
export declare function repliesAt(tree: StoredTree, fen: string): Reply[];
export declare function gamesAt(tree: StoredTree, fen: string): number;
export declare function engineAt(evals: EvalIndex, fen: string, side: Side): EngineView | null;
export declare function chooseOurMove(
  tree: StoredTree,
  evals: EvalIndex,
  fen: string,
  side: Side,
  setup?: string[] | null
): Pick | null;
export declare function theirReplies(
  tree: StoredTree,
  fen: string,
  minShare: number,
  minGames: number
): Reply[];
export declare function terminationOf(input: {
  ply: number;
  maxPly: number;
  games: number;
}): Termination | null;
export declare function buildCourse(
  tree: StoredTree,
  evals: EvalIndex,
  opts: BuildOptions
): BuiltCourse;
export declare function countLines(course: BuiltCourse): number;
