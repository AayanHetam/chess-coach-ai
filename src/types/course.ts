// Wire types for a generated opening course.
//
// In src/types and not beside the loader for the same reason as
// src/types/repertoire.ts: the loader reads JSON with `fs`, and a single client
// import of that module would drag Node's filesystem into a page bundle. Types
// cross the boundary; the file does not.

/** Who decided the move we recommend at a node. */
export type MoveSource =
  /** The engine's own choice. Nobody plays it, and it is still better. */
  | 'engine'
  /** The engine's choice, and people play it too. */
  | 'corpus-confirmed'
  /** A system's fixed setup, engine-vetted but engine did not choose it. */
  | 'setup'
  /** No evaluation existed. The most-played move, labelled as exactly that. */
  | 'corpus';

/**
 * Why a line stopped. Every value is measured.
 *
 * There was a fourth, `settled`, for "deep, evaluated and quiet". It fired on
 * any position within 60cp of equal, which is essentially all sound opening
 * theory, and it truncated the whole Najdorf course at ply 13. Equality means
 * both sides played well, not that there is nothing left to teach.
 */
export type Termination =
  /** The band's ply budget ran out. We chose to stop. */
  | 'depth'
  /** The corpus has nothing here. We cannot see further. */
  | 'wall'
  /** The branch is real and below the share threshold. */
  | 'pruned';

export interface CourseNode {
  /** Ply from the start of the game, not from the course root. */
  p: number;
  /**
   * Share of games reaching here, as a product of the OPPONENT's shares only.
   *
   * We choose our own moves, so folding our share in would measure how likely
   * we are to play into our own repertoire while treating their choices as
   * free. That is the inverted-reach bug from repertoireHole.ts.
   */
  w: number;
  /** Corpus games at this position. */
  g: number;
  /** Chapter index, or -1 for the trunk every chapter shares. */
  ch: number;
  end: Termination | null;
  /** Our move here. Present only on our turns. */
  us?: string;
  src?: MoveSource;
  /** Centipawns our move gives up against the engine's own choice. */
  loss?: number;
  /** The position our move leads to, so the graph is traversable. */
  next?: string;
  /** Their replies, present only on their turns. */
  them?: Array<{ san: string; share: number; to: string }>;
  /**
   * Share of this position's real play that `them` accounts for.
   *
   * Not derivable from the shares alone: they are a share of everything that
   * happens here, so a sum below 1 is normal and says nothing about whether the
   * cut is hiding something.
   */
  rc?: number;
  /** Engine evaluation, WHITE-relative centipawns and the depth behind it. */
  ev?: { cp: number; d: number };
}

export interface CourseChapter {
  i: number;
  /** Position key the chapter begins at. */
  at: string;
  /** SAN moves from the start to that position. */
  line: string[];
  title: string | null;
  share: number;
  /** Running total, so a page can say "six chapters get you to 93%". */
  cum: number;
  nodes: number;
}

export interface CourseMeta {
  id: string;
  name: string;
  root: string[];
  side: 'white' | 'black';
  maxPly: number;
  minShare: number;
  minGames: number;
  /** Distinct root-to-end paths. NOT `expanded`, which counts walker entries. */
  lines: number;
  /** Times the walker entered a node. Always >= lines; never shown to a user. */
  expanded: number;
  nodes: number;
  chapters: number;
  ourNodes: number;
  evaluated: number;
  byTermination: Partial<Record<Termination, number>>;
  bySource: Partial<Record<MoveSource, number>>;
  level: string;
  load: string;
  character: string;
  coverage: string;
  eco: string | null;
  corpus: { source: string; games: number; maxPlies: number; sha256: string };
  evals: { source: string; licence: string; covered: number; of: number };
  builtAt: string;
}

export interface Course {
  meta: CourseMeta;
  chapters: CourseChapter[];
  nodes: Record<string, CourseNode>;
}

export interface CourseIndexEntry {
  id: string;
  name: string;
  side: 'white' | 'black';
  level: string;
  load: string;
  character: string;
  root: string[];
  nodes: number;
  lines: number;
  chapters: number;
  evaluated: number;
  bytes: number;
}

export interface CourseIndex {
  builtAt: string;
  corpusSha: string;
  maxPly: number;
  minShare: number;
  minGames: number;
  courses: CourseIndexEntry[];
}
