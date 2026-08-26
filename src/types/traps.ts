/** How players at one rating band actually lose an opening. */
export interface TrapFile {
  meta: TrapMeta;
  traps: Trap[];
}

export interface TrapMeta {
  band: string;
  bandScale: string | null;
  source: string | null;
  games: number | null;
  generatedFrom: string;
  /** Stated in the data, not only in a commit message. */
  signal: string;
  z: number;
  minEffect: number;
  minMoveGames: number;
  minShare: number;
  /** How many (position, move) pairs were tested to find these. */
  tests: number;
  /**
   * The noise floor, carried alongside the finding.
   *
   * A count of traps with no expected-false-positive count beside it invites
   * the reader to assume the floor is zero. It is not, and at a looser
   * threshold it would swamp everything here.
   */
  expectedFalsePositives: number;
  traps: number;
}

export interface TrapAlternative {
  san: string;
  share: number;
  score: number;
  games: number;
}

export interface Trap {
  /** The line that reaches the position, in the band's own most common order. */
  line: string[];
  /** 4-field EPD of the position the move is played from. */
  fen: string;
  /** The losing move. */
  san: string;
  /** Who plays it. */
  side: 'white' | 'black';
  /** How often it is played from that position, at this band. */
  share: number;
  games: number;
  /** Score for the side that plays it, 0-1. */
  score: number;
  /** Score for everything else played from the same position. */
  baseline: number;
  /** Standard errors below the alternatives. */
  z: number;
  /** What the same players do instead, best-scoring first. */
  instead: TrapAlternative[];
}
