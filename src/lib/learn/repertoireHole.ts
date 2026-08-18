// ─────────────────────────────────────────────────────────────────────────────
// Your own worst opening line — the same screen as /scout, pointed at you.
//
// The hole finder asks: which positions does the subject reach often, score
// below their own baseline in, and what does the engine prefer instead? Scout
// points that at an opponent. Pointed at the user it becomes the one thing a
// learning programme most needs to say — here is where you actually lose, and
// it is not where you think.
//
// The statistics are unchanged. Three things do NOT carry over, and each one
// produces a completely plausible report when it is wrong, which is why they
// are spelled out rather than inherited:
//
//   1. REACH IS INVERTED. `findHoles` multiplies the SUBJECT's move
//      probabilities and treats the other side's moves as free, because in
//      scout the other side is you and you simply choose them. Point it at
//      yourself and that reads "how likely am I to play into my own weakness,
//      treating my opponent's replies as free" — but the opponent's replies are
//      exactly the moves I cannot choose. So reach is not modelled here at all.
//      The index already measures the real quantity: the recency-weighted share
//      of your games that arrived at the position, which counts both sides'
//      choices because it counts games that actually happened.
//
//   2. CONCESSION IS MEANINGLESS AND ITS GATE IS HARMFUL. `concessionCp` prices
//      what you give up to steer someone. Nobody is steering here, so the same
//      arithmetic would be measuring how far your OPPONENTS' moves fall below
//      the engine — of no interest — and `maxConcessionCp` would then drop any
//      line where they cumulatively "conceded" half a pawn. That silently
//      discards the most valuable lines there are: someone plays something
//      mediocre at you and you lose anyway. No concession accounting on this
//      path.
//
//   3. THE SIDE LABELS FLIP. In `HoleMove`, `side: 'them'` means the subject and
//      `'you'` means the other player. Under self-scout the subject IS you, so
//      every 'them' is yours and every 'you' is your opponent's. Translated once
//      here, at the boundary, and tested with an asymmetric fixture — a
//      symmetric one passes either way round.
//
// 100% deterministic. Stockfish supplies evaluations; nothing else judges.
//
// Spec: MASTERMIND_CONTEXT/LEARN_REPERTOIRE_PLAN.md
// ─────────────────────────────────────────────────────────────────────────────

import { buildOpeningTree } from '@/lib/scoutService';
import { buildPositionIndex, effectiveN, positionKey, positionScore } from '@/lib/scout/positionStats';
import {
  collectCandidates,
  createEngineSession,
  screenPositions,
  shrinkScore,
  type Candidate,
  type HoleFinderConfig,
  type HoleFinderProviders,
  type HoleTier,
} from '@/lib/scout/holeFinder';
import type { ScoutGame } from '@/types/scout';

export interface RepertoireConfig {
  /** How many of your games must reach a line before it is worth teaching. */
  minRepeats: number;
  /**
   * Effective sample a position needs before its score is tested at all.
   * Below this the interval is wide enough that the test only ever fires on a
   * fluke, and every extra position makes the correction harsher for the lines
   * that do have evidence.
   */
  minNeff: number;
  /** Depth cap in plies. Opening theory, not a full game. */
  maxPly: number;
  /** How many lines to return. */
  topN: number;
  /** False discovery rate for the Benjamini-Hochberg screen. */
  fdrQ: number;
  /** Shrinkage strength — the sample at which your score carries equal weight
   * with your own baseline. */
  shrinkK: number;
  /** Positions the engine may evaluate. */
  engineBudget: number;
  /** Smallest deficit worth teaching, as an expected-score fraction. */
  minDeficit: number;
  /**
   * Centipawns your move must throw away before we name a replacement.
   *
   * Below this the honest reading is that the move was fine and the POSITION is
   * the problem — which is the whole finding the scout research rests on. Strong
   * club players do not hang pieces in their own repertoire; they walk into
   * structures they cannot play, and an engine cannot see that. Naming a 12cp
   * "improvement" as the fix would point the user at noise and hide the real
   * cause.
   */
  moveLossCp: number;
}

export const REPERTOIRE_DEFAULTS: RepertoireConfig = {
  minRepeats: 5,
  minNeff: 40,
  maxPly: 12,
  topN: 5,
  fdrQ: 0.1,
  shrinkK: 12,
  engineBudget: 60,
  minDeficit: 0.03,
  moveLossCp: 30,
};

export interface RepertoireMove {
  san: string;
  /** Whose move it is, in the reader's terms — already un-flipped. */
  side: 'you' | 'opponent';
  /** Your games that reached this move. */
  games: number;
}

/**
 * Why this line is costing you.
 *
 * `move` — the engine has a concrete replacement worth at least `moveLossCp`.
 * `position` — your move is sound and you still score badly, so the structure
 * is the problem and the fix is understanding rather than a different move.
 */
export type RepertoireDiagnosis = 'move' | 'position';

export interface RepertoireHole {
  line: RepertoireMove[];
  /** The position after my move — where my results were measured. */
  fen: string;
  /**
   * The position before it: the decision itself.
   *
   * This is what the master corpus is asked about. "Where does my move rank
   * among the moves strong players choose here" is only answerable from the
   * position they were choosing FROM.
   */
  parentFen: string;
  color: 'white' | 'black';
  /** `confirmed` survived the correction; `signal` is real but unproven. */
  tier: HoleTier;
  diagnosis: RepertoireDiagnosis;

  /** Your raw games reaching here, across all move orders. */
  games: number;
  /** Effective sample after recency weighting. */
  neff: number;
  /** Your recency-weighted score here, 0–1. */
  score: number;
  /** That score shrunk toward your own baseline. */
  shrunkScore: number;
  /** Your weighted score across all your games in this colour. */
  baseline: number;
  /** One-sided p-value against your baseline. */
  p: number;

  /**
   * Share of your games in this colour that arrive here, recency-weighted.
   *
   * Measured, not modelled — see the reach note at the top of this file.
   */
  frequency: number;
  /** baseline − shrunkScore: how far below your own average you score here. */
  deficit: number;
  /** frequency × deficit. Expected score lost per game played in this colour. */
  teachingValue: number;

  /** Centipawns your last move threw away, when the engine could answer. */
  cpLoss?: number;
  /** What the engine would rather YOU had played. Only set when `diagnosis` is `move`. */
  betterMove?: string;
  /** Your opponent's best answer to the move you actually played. */
  opponentBest?: string;
}

export interface RepertoireReport {
  color: 'white' | 'black';
  holes: RepertoireHole[];
  /** Your weighted score in this colour. */
  baseline: number;
  baselineGames: number;
  baselineNeff: number;
  /** Independent questions the screen asked. */
  tests: number;
  /** The BH cutoff they had to clear. */
  threshold: number;
  /** True when at least one returned line survived the correction. */
  confirmed: boolean;
  evaluated: number;
  unavailable: number;
  budgetExhausted: boolean;
  /**
   * No position in this colour had enough games to be tested at all.
   *
   * Distinct from an empty `holes` with tests > 0, which means we looked
   * properly and you have no measurable weakness. The UI must not collapse the
   * two: "play more games" and "nothing is wrong" are opposite instructions.
   */
  insufficientData: boolean;
}

/** The subset of `HoleFinderConfig` the shared walk and screen actually read. */
function walkConfig(config: RepertoireConfig): HoleFinderConfig {
  return {
    minRepeats: config.minRepeats,
    minNeff: config.minNeff,
    maxPly: config.maxPly,
    topN: config.topN,
    fdrQ: config.fdrQ,
    shrinkK: config.shrinkK,
    engineBudget: config.engineBudget,
    // Neither is read by `screenPositions` or `collectCandidates`. They are the
    // steering knobs, and nothing is being steered — see note 2 at the top.
    maxConcessionCp: Number.POSITIVE_INFINITY,
    minEdge: 0,
  };
}

/**
 * Candidates whose last move is YOURS, deduped to one per position.
 *
 * Two filters, both load-bearing:
 *
 * - The last move must be yours. "You played this and it goes badly" is
 *   actionable; "your opponent played this" is not something you can change.
 * - The position must have been part of the corrected screen. An untested
 *   sample is not protected by anything, and a seven-game 14% still shrinks to a
 *   double-digit "deficit" — the same fluke promotion the screen exists to stop,
 *   one layer down.
 *
 * Deduping keeps the SHORTEST line to a position. The same idea reached by two
 * move orders is one lesson, and the shorter statement of it is the one a player
 * can act on.
 */
export function teachableCandidates(
  candidates: Candidate[],
  config: RepertoireConfig
): Candidate[] {
  const best = new Map<string, Candidate>();
  for (const c of candidates) {
    const last = c.line[c.line.length - 1];
    // 'them' is the subject, and the subject here is the user.
    if (!last || last.side !== 'them') continue;
    if (!c.test || !c.stat) continue;
    if (c.stat.games < config.minRepeats) continue;

    const key = positionKey(c.path[c.path.length - 1].fen);
    const prev = best.get(key);
    if (!prev || c.line.length < prev.line.length) best.set(key, c);
  }
  return Array.from(best.values());
}

/**
 * How much this line costs you per game of this colour.
 *
 * frequency × deficit. Shrunk rather than raw, so a five-game disaster cannot
 * outrank a forty-game slump — the same reason it is shrunk in scout.
 */
export function teachingValue(frequency: number, deficit: number): number {
  return frequency * Math.max(0, deficit);
}

/** Un-flip the subject/other labels. See note 3 at the top of this file. */
export function readerSides(line: Candidate['line']): RepertoireMove[] {
  return line.map(m => ({
    san: m.san,
    side: m.side === 'them' ? ('you' as const) : ('opponent' as const),
    games: m.games,
  }));
}

/**
 * Find the lines in your own repertoire that cost you the most.
 *
 * `color` is the colour YOU play — the subject is you, not an opponent.
 */
export async function findRepertoireHoles(
  games: ScoutGame[],
  username: string,
  color: 'white' | 'black',
  providers: HoleFinderProviders,
  config: RepertoireConfig = REPERTOIRE_DEFAULTS
): Promise<RepertoireReport> {
  const cfg = walkConfig(config);
  const index = buildPositionIndex(games, username, color);
  const tree = buildOpeningTree(games, username, color, config.maxPly, config.minRepeats);
  const screen = screenPositions(index, cfg);

  const empty = (insufficientData: boolean): RepertoireReport => ({
    color,
    holes: [],
    baseline: index.baseline,
    baselineGames: index.games,
    baselineNeff: index.baselineNeff,
    tests: screen.tests,
    threshold: screen.threshold,
    confirmed: false,
    evaluated: 0,
    unavailable: 0,
    budgetExhausted: false,
    insufficientData,
  });

  if (index.games === 0 || screen.tests === 0) return empty(true);

  const candidates = teachableCandidates(
    collectCandidates(tree, color, index, screen, cfg),
    config
  );

  // Ranked BEFORE the engine runs. The deficit is a results measurement and
  // costs nothing, so engine time is spent only on the handful of lines that
  // will actually be shown rather than on a shortlist that is mostly discarded.
  interface Ranked {
    c: Candidate;
    neff: number;
    score: number;
    shrunk: number;
    frequency: number;
    deficit: number;
    value: number;
  }
  const ranked: Ranked[] = [];
  for (const c of candidates) {
    const neff = effectiveN(c.stat!);
    const score = positionScore(c.stat!);
    const shrunk = shrinkScore(score, neff, index.baseline, config.shrinkK);
    const deficit = index.baseline - shrunk;
    if (deficit < config.minDeficit) continue;
    const frequency = index.baselineNeff > 0 ? neff / index.baselineNeff : 0;
    ranked.push({
      c,
      neff,
      score,
      shrunk,
      frequency,
      deficit,
      value: teachingValue(frequency, deficit),
    });
  }
  ranked.sort((a, b) => b.value - a.value);

  const engine = createEngineSession(providers, config.engineBudget);
  const holes: RepertoireHole[] = [];

  for (const r of ranked.slice(0, config.topN)) {
    const path = r.c.path;
    const lastIndex = r.c.line.length - 1;
    const parentFen = lastIndex === 0 ? tree.fen : path[lastIndex - 1].fen;
    const fen = path[lastIndex].fen;

    // Sequential on purpose. A provider backed by one engine process is a
    // single conversation, and two evaluations in flight come back crossed.
    const cost = await engine.costOfMove(parentFen, fen);
    const here = await engine.evaluate(fen);

    const cpLoss = cost?.loss;
    const diagnosis: RepertoireDiagnosis =
      cpLoss !== undefined && cpLoss >= config.moveLossCp ? 'move' : 'position';

    holes.push({
      line: readerSides(r.c.line),
      fen,
      parentFen,
      color,
      tier: r.c.test!.confirmed ? 'confirmed' : 'signal',
      diagnosis,
      games: r.c.stat!.games,
      neff: r.neff,
      score: r.score,
      shrunkScore: r.shrunk,
      baseline: index.baseline,
      p: r.c.test!.p,
      frequency: r.frequency,
      deficit: r.deficit,
      teachingValue: r.value,
      cpLoss,
      // Only named when the engine actually disagrees enough to matter.
      betterMove: diagnosis === 'move' ? cost?.best || undefined : undefined,
      opponentBest: here?.bestMove || undefined,
    });
  }

  return {
    color,
    holes,
    baseline: index.baseline,
    baselineGames: index.games,
    baselineNeff: index.baselineNeff,
    tests: screen.tests,
    threshold: screen.threshold,
    confirmed: holes.some(h => h.tier === 'confirmed'),
    evaluated: engine.evaluated,
    unavailable: engine.unavailable,
    budgetExhausted: engine.budgetExhausted,
    insufficientData: false,
  };
}

/**
 * The single line to put in front of the user today, across both colours.
 *
 * Comparable across colours without rescaling: `teachingValue` is already
 * expected score lost per game of that colour, and a player meets both roughly
 * equally often.
 */
export function pickTodaysLine(reports: RepertoireReport[]): RepertoireHole | null {
  const all = reports.flatMap(r => r.holes);
  if (all.length === 0) return null;
  // A confirmed line outranks any unconfirmed one regardless of size: the
  // difference between "measured" and "suspected" is not a quantity you can
  // trade against a slightly larger estimate.
  const confirmed = all.filter(h => h.tier === 'confirmed');
  const pool = confirmed.length > 0 ? confirmed : all;
  return pool.reduce((best, h) => (h.teachingValue > best.teachingValue ? h : best));
}

/** Moves rendered as a numbered line: `1.e4 c5 2.c3`. */
export function formatLine(line: RepertoireMove[], color: 'white' | 'black'): string {
  const whiteMoves = color === 'white' ? 'you' : 'opponent';
  const out: string[] = [];
  let moveNumber = 1;
  for (let i = 0; i < line.length; i++) {
    const isWhite = line[i].side === whiteMoves;
    if (isWhite) {
      out.push(`${moveNumber}.${line[i].san}`);
      moveNumber += 1;
    } else if (i === 0) {
      // A line that opens on Black's move only happens if the walk started
      // mid-game; number it explicitly rather than silently dropping the count.
      out.push(`${moveNumber}...${line[i].san}`);
      moveNumber += 1;
    } else {
      out.push(line[i].san);
    }
  }
  return out.join(' ');
}
