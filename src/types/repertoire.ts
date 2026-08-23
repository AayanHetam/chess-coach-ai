// Wire types for the repertoire bracket.
//
// Deliberately in src/types and not beside the loader: the loader reads a 100KB
// JSON with `fs`, and a single client import of that module would drag Node's
// filesystem into a page bundle. Types cross the boundary; the file does not.

/** How a choice's coverage of the branches below it is established. */
export type CoverageKind =
  /** Proved against a named ECO family: absorption is set membership. */
  | 'family'
  /** The same setup whatever the opponent does, so there are no branches. */
  | 'system'
  /** Commits a move and nothing more. Every reply is still to be decided. */
  | 'move';

/** How much there is to memorise. NOT how hard it is to play well. */
export type TheoryLoad = 'light' | 'medium' | 'heavy';

/** The lowest rating band an opening is a sensible choice for. */
export type LevelId = 'new' | 'beginner' | 'improving' | 'club' | 'strong';
export type Character = 'attack' | 'solid' | 'counterattack' | 'structure';

export interface RepertoireChoice {
  id: string;
  name: string;
  /** The move it commits you to at this slot. */
  play: string;
  coverage: CoverageKind;
  family: string | null;
  load: TheoryLoad;
  /**
   * The lowest band this is a sensible choice for.
   *
   * A SEPARATE axis from `load`, and the separation is the point: the King's
   * Indian is `heavy` and `beginner` at once, because it has enormous theory
   * and exactly one plan. Collapsing the two into a single difficulty score
   * would make that opening unrecommendable to the players it suits best.
   */
  level: LevelId;
  character: Character;
  blurb: string;
  /** Why it suits that level, in one line. A judgement, and labelled as one. */
  why: string;
  /**
   * Share of what follows that this choice answers on its own, 0-1.
   *
   * Meaningless for `coverage: 'move'` — 1.e4 "answers 3%" is arithmetically
   * true and useless, because the move was never a claim to answer anything.
   * Callers must not render it for those.
   */
  absorbs: number;
  gaps: Array<{ slot: string; share: number }>;
  /** Named ECO lines backing the coverage claim, or null when not family-proved. */
  namedLines: number | null;
}

/** A move actually played here, for slots we have not curated choices for. */
export interface SlotMove {
  san: string;
  share: number;
  name: string | null;
  eco: string | null;
}

/**
 * What is measurably true about a position, for the ones no book names.
 *
 * Every field is counted off the master corpus. Nothing is inferred and nothing
 * is written by a model. Castling is deliberately absent: it happens too deep
 * in the tree for a pruned walk to measure honestly, and a number we cannot
 * measure properly is worse than a number we do not show.
 */
export interface PositionBrief {
  games: number;
  /** White's score from here, 0-1, or null when the corpus has too few games. */
  score: number | null;
  /** The most-played continuation. Most played, not best. */
  mainline: string[];
  /** Pawn breaks that actually occur, as a share of games reaching here. */
  breaks: Array<{ san: string; share: number }>;
}

export interface RepertoireSlot {
  id: string;
  side: 'white' | 'black';
  /** SAN moves from the start to this position. */
  line: string[];
  fen: string;
  /** Share of your games as this colour that arrive here, 0-1. */
  share: number;
  /** The opening this position is known as, when it has a consensus name. */
  name: string | null;
  eco: string | null;
  /** The choice whose gap created this slot, or null for a root. */
  origin: string | null;
  moves: SlotMove[];
  /** Derived understanding. Null only when the corpus does not reach here. */
  brief: PositionBrief | null;
  choices: RepertoireChoice[];
}

export interface RepertoireMapMeta {
  source: string;
  games: number;
  openings: number;
  gapMaxPly: number;
  gapMinShare: number;
  steerPly: number;
  otherFirstMoves: number;
}

export interface RepertoireMap {
  meta: RepertoireMapMeta;
  slots: RepertoireSlot[];
  /**
   * "If you already play X, this slot flows back into it at least N of the time."
   *
   * A LOWER bound: the search that produced it has a horizon, so a transposition
   * first available beyond that depth is not counted. Never present it as exact.
   */
  transpositions: Array<{ slot: string; choice: string; atLeast: number }>;
}

/** One filled slot in a player's bracket. */
export interface RepertoirePick {
  slotId: string;
  /** A curated choice, when they took one of ours. */
  choiceId?: string;
  /** A move, when they picked one off the list or out of the library. */
  san?: string;
  /** What to call it on screen. */
  label: string;
  /** Set when the pick came from the searchable library rather than our list. */
  fromLibrary?: boolean;
}

/** A named opening in the searchable library. */
export interface OpeningEntry {
  name: string;
  eco: string | null;
  pgn: string | null;
  /** SAN moves, derived from the pgn. */
  moves: string[];
}
