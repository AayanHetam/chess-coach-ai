export type Platform = 'chess.com' | 'lichess';

export type TimeClass = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily' | 'correspondence' | 'unknown';

/** How a game ended from the loser's perspective (or "draw"). */
export type Termination =
  | 'checkmate'
  | 'resign'
  | 'timeout'
  | 'abandoned'
  | 'stalemate'
  | 'repetition'
  | '50move'
  | 'agreed'
  | 'insufficient'
  | 'timevsinsufficient'
  | 'unknown';

export interface ScoutGame {
  id: string;
  platform: Platform;
  /** SAN move list, capped to SCOUT_MAX_PLY from the server (~30 plies). */
  moves: string[];
  /** Actual total plies played (pre-truncation). Used for psychology metrics. */
  numMoves?: number;
  whiteUsername: string;
  blackUsername: string;
  whiteRating?: number;
  blackRating?: number;
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  timeControl?: string;
  timeClass?: TimeClass;
  termination?: Termination;
  date: number;
}

export interface OpeningTreeNode {
  move: string;
  fen: string;
  totalGames: number;
  wins: number;
  draws: number;
  losses: number;
  children: OpeningTreeNode[];
}

export interface ScoutResult {
  username: string;
  platform: Platform;
  games: ScoutGame[];
  totalGames: number;
  dateRange: { from: number; to: number };
  /** True when the response was served from the server-side 10-minute cache. */
  cached?: boolean;
}

export interface PrepLine {
  moves: string[];
  fen: string;
  opponentScore: number;
  totalGames: number;
  wins: number;
  draws: number;
  losses: number;
  stockfishEval?: { cp?: number; mate?: number };
  recommendation: string;
}

// ── Analytics ────────────────────────────────────────────────────────────────

export type Predictability = 'Low' | 'Medium' | 'High';

export interface RatingsByTimeClass {
  bullet?: number;
  blitz?: number;
  rapid?: number;
  classical?: number;
  daily?: number;
}

export interface RecentResult {
  outcome: 'win' | 'draw' | 'loss';
  date: number;
}

export interface PhaseElo {
  /** Baseline ELO used for phase estimates (typically the blitz/rapid median). */
  baseline: number;
  /** ELO estimate in the opening (first ~15 plies). */
  opening: number;
  /** ELO estimate in the middlegame (plies ~16-60). */
  middle: number;
  /** ELO estimate in the endgame (plies > 60). */
  endgame: number;
}

export interface ProfileSnapshot {
  ovr: number; // 0-100
  atk: number; // 0-100 — attacking aggression
  def: number; // 0-100 — defensive resilience
  time: number; // 0-100 — time-management quality
  mind: number; // 0-100 — psychological composure
  ratings: RatingsByTimeClass;
  totalGames: number;
  spanDays: number;
  recent: RecentResult[]; // last N in chronological order
  recentAccuracy: number; // % recent non-losses
  winRate: number;
  drawRate: number;
  lossRate: number;
  archetype: string;
  latestRating?: number;
  peakRating?: number;
  lowRating?: number;
  /** Per-phase ELO estimates used by the Twin Bot to mimic the opponent's curve. */
  phaseElo: PhaseElo;
}

export interface Tell {
  id: 'time_trouble' | 'tilts' | 'limited_rep' | 'repetitive';
  label: string;
  score: number; // 0-100 (higher = more exploitable)
}

export interface TellsProfile {
  total: number; // 0-100
  predictability: Predictability;
  factors: Tell[];
}

export interface OpeningSummary {
  eco: string;
  name: string;
  variation: string;
  moves: string[];
  totalGames: number;
  scorePct: number; // opponent's score in this line (0-100)
  wins: number;
  draws: number;
  losses: number;
  lowSample?: boolean;
}

export interface TargetedPrep {
  asWhite: { weaknesses: OpeningSummary[]; strengths: OpeningSummary[] };
  asBlack: { weaknesses: OpeningSummary[]; strengths: OpeningSummary[] };
}

export interface ChecklistItem {
  id: string;
  title: string;
  detail: string;
  severity: 'low' | 'medium' | 'high';
}

export interface FrequentRival {
  name: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  scorePct: number; // target-player's score vs this rival
}

export interface PsychologySnapshot {
  avgGameLength: number; // avg plies
  quickLossRate: number; // % of losses under 50 plies
  longGameLossRate: number; // % of losses over 120 plies
  timeoutRate: number; // % of losses by timeout
  resignRate: number; // % of losses by resignation
  checkmateRate: number; // % of wins by checkmate
  maxWinStreak: number;
  maxLossStreak: number;
  tiltAfterLossLossRate: number; // loss rate on next game after a loss
}

export interface RecentFormBucket {
  label: string;
  wins: number;
  draws: number;
  losses: number;
}

// ── Novelty / deviation finder ──────────────────────────────────────────────

export interface NoveltyFinding {
  /** Moves leading to the position where the opponent deviated from their book. */
  moves: string[];
  /** The move the opponent played in this game (deviation). */
  playedMove: string;
  /** The move they usually play at this position (their "book" move). */
  bookMove: string;
  /** How often the book move was played in their games. */
  bookFrequency: number;
  /** Total games that reached this parent position. */
  totalGames: number;
  /** Ply index of the deviation (counting plies from start, 0-indexed). */
  ply: number;
  /** Whether the deviating game ended in a loss for the target. */
  gameLost: boolean;
  /** Game id for reference. */
  gameId: string;
  /** Chess opening info for the position before the deviation. */
  eco: string;
  name: string;
  variation: string;
}

// ── Collision analysis (you vs them) ────────────────────────────────────────

export interface CollisionLine {
  /** Moves leading into the line (starting from the initial position). */
  moves: string[];
  eco: string;
  name: string;
  variation: string;
  /** The color YOU play in this line. */
  yourColor: 'white' | 'black';
  /** Your score % in this line. */
  yourScorePct: number;
  yourGames: number;
  /** Their score % (as the opposite color) in this line. */
  theirScorePct: number;
  theirGames: number;
  /** Raw collision value (higher = bigger edge for you). */
  edge: number;
}

export interface Collisions {
  /** Lines where you play White & they play Black — you over-perform, they under-perform. */
  whenYouPlayWhite: CollisionLine[];
  /** Lines where you play Black & they play White. */
  whenYouPlayBlack: CollisionLine[];
  /** Your overall win rate (for context). */
  yourWinRate: number;
  yourGames: number;
  yourUsername: string;
}

export interface ScoutAnalytics {
  profile: ProfileSnapshot;
  tells: TellsProfile;
  prep: TargetedPrep;
  checklist: ChecklistItem[];
  rivals: FrequentRival[];
  psychology: PsychologySnapshot;
  recentBuckets: RecentFormBucket[];
  novelty: NoveltyFinding[];
}
