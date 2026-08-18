// ─────────────────────────────────────────────────────────────────────────────
// Hole finder — the place they come off worst, and the line that gets you there.
//
// This is NOT coverage prep. Knowing all of a predictable opponent's openings
// buys nothing. The value is one specific line where they do badly and which
// you can steer into almost every game.
//
// TWO SIGNALS, ONE CURRENCY
//
// The first version looked only for engine-refuted moves and found nothing on a
// real opponent: strong club players do not hang pieces in their own
// repertoire. Swept across 77 of one player's repeated decisions, their worst
// was 44cp. What they do instead is walk into structures they cannot play, and
// Stockfish cannot see that — it evaluates the position, not the person. Their
// own scoreline can.
//
//   results edge   b − ŝ(v)        how far below their own baseline they score
//   engine edge    cp→score(loss)  what a repeated move objectively throws away
//
// Both become expected-score fractions so they are comparable, and combine with
// max() rather than a sum: they are two measurements of one quantity — how bad
// this is for them — not two edges to add up.
//
//   Benefit(ℓ) = Reach(ℓ) × [ max(resultsEdge, engineEdge) − cost(Concession) ]
//
// Reach is the product of THEIR move probabilities along ℓ; your own moves are
// free because you simply play them. Concession is what your steering hands
// back, in the same units, so paying 30cp to reach a 20-point collapse is worth
// it and paying it for a 3-point wobble is not.
//
// THREE TIERS, BECAUSE MOST OPPONENTS HAVE NO HOLE
//
// Screening a real archive throws up ~160 independent questions, and a deficit
// only clears that burden with an effective sample around seventy games. The
// opponent this was built against had his best line at n_eff 51 — genuinely
// close, and genuinely not proven. Reporting it as a discovery would have been
// a lie; reporting nothing would have been useless. So a line is returned as
// `confirmed` only if it survives Benjamini-Hochberg, as `signal` if the
// evidence is real but short of that bar, and as `prep` when the honest answer
// is that this is simply the best available preparation.
//
// 100% deterministic. Stockfish supplies evaluations; nothing else judges.
//
// Spec: MASTERMIND_CONTEXT/SCOUT_VS_ME_PLAN.md
// ─────────────────────────────────────────────────────────────────────────────

import { Chess } from 'chess.js';
import type { OpeningTreeNode } from '@/types/scout';
import { wilsonBounds } from '@/lib/scoutAnalytics';
import {
  effectiveN,
  positionKey,
  positionScore,
  type PositionIndex,
  type PositionStat,
} from '@/lib/scout/positionStats';
import {
  buildPreparedLines,
  PREPARED_DEFAULTS,
  type PreparedLine,
} from '@/lib/scout/preparedLine';

/** Evaluation of a position, in centipawns from the side-to-move's view. */
export interface PositionEval {
  bestMove: string;
  cp: number;
}

export interface HoleFinderProviders {
  /**
   * Evaluate a position, in centipawns from the SIDE TO MOVE's perspective.
   *
   * Note the perspective: `LineEval.cp` elsewhere in this codebase is
   * White-relative, so an adapter must negate it when Black is to move. Getting
   * that backwards silently inverts every concession rather than failing.
   *
   * Return null when there is genuinely no answer — a cloud miss, a dead
   * service. The caller then drops the candidate instead of ranking it, because
   * a neutral stand-in would read as "this move costs nothing" and let bad
   * steering through.
   */
  evaluate(fen: string): Promise<PositionEval | null>;
}

export interface HoleFinderConfig {
  /**
   * How many of their games must reach a line before it can be recommended.
   * One bad game is variance; five is a habit you can prepare for.
   */
  minRepeats: number;
  /**
   * Effective sample size a position needs before its score is even tested.
   *
   * Below this the interval is so wide that the test can only ever fire on a
   * fluke, and every such position added to the screen makes the correction
   * harsher for the lines that do have evidence.
   */
  minNeff: number;
  /** Hard ceiling on how far below best YOUR moves may fall, cumulatively. */
  maxConcessionCp: number;
  /** Depth cap in plies. */
  maxPly: number;
  /** How many lines to return. */
  topN: number;
  /**
   * False discovery rate. Of the lines returned as `confirmed`, this is the
   * expected proportion that are noise.
   *
   * Benjamini-Hochberg rather than Bonferroni on purpose. This is a screen, not
   * a single confirmatory test, and controlling the family-wise error rate over
   * ~160 nested, heavily correlated positions rejects everything: on real data
   * Bonferroni demanded p ≤ 6e-4 where the strongest line offered 2.8e-3.
   */
  fdrQ: number;
  /**
   * Shrinkage strength. A position with this effective sample carries equal
   * weight with their baseline; below it the estimate is pulled back, so a
   * five-game disaster cannot outrank a forty-game slump.
   */
  shrinkK: number;
  /** Positions Stockfish may evaluate. Engine time is the binding cost. */
  engineBudget: number;
  /** Smallest edge worth reporting, as an expected-score fraction. */
  minEdge: number;
}

/** How many of the returned holes get a prepared continuation built. */
export const PREPARED_FOR_TOP = 3;

export const HOLE_DEFAULTS: HoleFinderConfig = {
  minRepeats: 5,
  minNeff: 40,
  maxConcessionCp: 50,
  maxPly: 16,
  topN: 10,
  fdrQ: 0.1,
  shrinkK: 12,
  engineBudget: 120,
  minEdge: 0.02,
};

// ── Statistics ───────────────────────────────────────────────────────────────

/** Standard normal CDF, via Abramowitz-Stegun 7.1.26. Accurate to ~1.5e-7. */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * One-sided p-value for "they score at their baseline here", against the
 * alternative that they score worse.
 */
export function deficitPValue(score: number, n: number, baseline: number): number {
  if (n <= 0) return 1;
  const se = Math.sqrt((baseline * (1 - baseline)) / n);
  if (se <= 0) return 1;
  return normalCdf((score - baseline) / se);
}

/**
 * Benjamini-Hochberg step-up. Returns the p-value threshold below which a test
 * counts as a discovery, or 0 when there are none.
 *
 * Sort ascending, find the largest k with p₍ₖ₎ ≤ (k/m)·q, and reject everything
 * up to it — including any earlier test with a larger p-value, which is what
 * makes this a step-UP procedure rather than m independent comparisons.
 */
export function bhThreshold(pValues: number[], q: number): number {
  const m = pValues.length;
  if (m === 0) return 0;
  const sorted = [...pValues].sort((a, b) => a - b);
  for (let i = m - 1; i >= 0; i--) {
    if (sorted[i] <= ((i + 1) / m) * q) return sorted[i];
  }
  return 0;
}

/**
 * Their score pulled toward their baseline in proportion to how little evidence
 * there is: ŝ = (n·s + k·b) / (n + k).
 */
export function shrinkScore(score: number, n: number, baseline: number, k: number): number {
  if (n <= 0) return baseline;
  return (n * score + k * baseline) / (n + k);
}

/**
 * Centipawns → expected-score advantage over an even game.
 *
 * Lichess's winning-chances curve, 2/(1+e^(−0.004·cp)) − 1, rescaled to a score
 * fraction. It is what lets an engine loss and a results slump be compared at
 * all: +150cp and a 15-point drop both land near 0.15.
 */
export function cpToScoreEdge(cp: number): number {
  return 1 / (1 + Math.exp(-0.004 * cp)) - 0.5;
}

/**
 * Centipawns lost by playing a move instead of the engine's choice.
 *
 * Both arguments evaluate the position AFTER a move, from the point of view of
 * whoever is then to move — so a larger number is worse for the mover.
 *
 * Comparing siblings rather than parent-to-child matters more than it looks. A
 * parent and its child are searched to the same nominal depth one ply apart, so
 * their scores disagree by 20–40cp in the opening from search instability alone
 * — enough to bill a developing move like Nc3 for half the concession budget.
 * Between siblings that bias is identical on both sides and cancels, and a move
 * that IS the engine's choice scores exactly zero rather than merely near it.
 */
export function moveLoss(afterMoveCp: number, afterBestCp: number): number {
  return Math.max(0, afterMoveCp - afterBestCp);
}

// ── The screen ───────────────────────────────────────────────────────────────

export interface ScreenedPosition {
  stat: PositionStat;
  n: number;
  score: number;
  p: number;
  confirmed: boolean;
}

export interface Screen {
  /** Tested positions, by position key. */
  tested: Map<string, ScreenedPosition>;
  /** How many independent questions were asked. */
  tests: number;
  /** The BH cutoff those questions had to clear. */
  threshold: number;
}

/**
 * Which positions are worth testing, and which of them survive correction.
 *
 * Forced continuations are collapsed first. A position and the reply that
 * follows it in nearly every game are not two independent questions, and
 * counting them twice inflates the correction against everything else — on real
 * data it padded 160 genuine questions out to 229.
 */
export function screenPositions(index: PositionIndex, config: HoleFinderConfig): Screen {
  const eligible = new Map<string, PositionStat>();
  for (const stat of Array.from(index.positions.values())) {
    if (effectiveN(stat) >= config.minNeff) eligible.set(stat.key, stat);
  }

  const redundant = new Set<string>();
  for (const stat of Array.from(eligible.values())) {
    for (const nextKey of Array.from(stat.next)) {
      const next = eligible.get(nextKey);
      if (next && stat.weight > 0 && next.weight / stat.weight >= 0.95) redundant.add(nextKey);
    }
  }

  const tested = new Map<string, ScreenedPosition>();
  const pValues: number[] = [];
  for (const stat of Array.from(eligible.values())) {
    if (redundant.has(stat.key)) continue;
    const n = effectiveN(stat);
    const score = positionScore(stat);
    const p = deficitPValue(score, n, index.baseline);
    tested.set(stat.key, { stat, n, score, p, confirmed: false });
    pValues.push(p);
  }

  const threshold = bhThreshold(pValues, config.fdrQ);
  for (const t of Array.from(tested.values())) t.confirmed = t.p <= threshold && t.score < index.baseline;

  return { tested, tests: pValues.length, threshold };
}

// ── Candidate lines ──────────────────────────────────────────────────────────

export interface HoleMove {
  san: string;
  side: 'you' | 'them';
  /** Games in their archive that reached this move. */
  games: number;
}

export type HoleTier = 'confirmed' | 'signal' | 'prep';
export type HoleKind = 'results' | 'engine';

export interface Hole {
  /** The moves leading to the position, inclusive. */
  line: HoleMove[];
  fen: string;
  /** Which signal earned this its rank. */
  kind: HoleKind;
  /**
   * How strongly the evidence supports it. `confirmed` survived correction;
   * `signal` is real but unproven; `prep` is the best available line and is not
   * a claim about their weakness at all.
   */
  tier: HoleTier;

  // ── Their record here ──
  /** Raw games of theirs that reached this position, all move orders. */
  games: number;
  /** Effective sample size after recency weighting. */
  neff: number;
  /** Their recency-weighted score here, 0–1. */
  score: number;
  /** That score shrunk toward their baseline. */
  shrunkScore: number;
  /** Their weighted score across all games with this colour. */
  baseline: number;
  /** Plain 95% upper bound on their score here. */
  scoreUpper: number;
  /**
   * One-sided p-value against the baseline, or undefined when the position was
   * never part of the corrected screen.
   *
   * Undefined rather than 1 deliberately: "we did not test this" and "we tested
   * this and found nothing" are different statements, and a 1.0 in a UI field
   * reads as the second when it means the first.
   */
  p?: number;

  // ── The engine's view ──
  /** Centipawns their last move threw away, when the line ends on one. */
  cpLoss?: number;
  /** What the engine prefers for them instead. */
  betterMove?: string;
  /** Your best move in the position the line arrives at. */
  punish?: string;
  /** Centipawns you concede, cumulatively, to steer here. */
  concessionCp: number;

  // ── The ranking ──
  /** Their probability of walking this path, from their own frequencies. */
  reach: number;
  /** The deficit defensible at 95% once confirmed; zero otherwise. */
  confirmedEdge: number;
  /**
   * Their deficit plus your surplus, both against their own baselines.
   *
   * Measuring each player against themselves is what makes the two comparable
   * across a rating gap: a 600 and a 1400 both sit near 50% overall, so the
   * question "who is unusually bad here" transfers.
   */
  jointEdge: number;
  /** The larger of the estimated results edge and the engine edge. */
  edge: number;
  /** Reach × (edge − concession cost). Expected score gained per game. */
  benefit: number;
  /**
   * Your own record in the same position, when your archive was supplied.
   *
   * The report is otherwise entirely one-sided, and one-sided is wrong: if they
   * score 31% here and so do you, that is not an edge, it is a bad position that
   * you happen to both be bad at. Undefined means your games were not available
   * or never reached here, which is different from "you do badly".
   */
  you?: {
    games: number;
    neff: number;
    score: number;
    baseline: number;
    /** Your score here above your own baseline, shrunk. Negative is a warning. */
    surplus: number;
  };
  /** The last move you choose on the way in — the actionable instruction. */
  keyMove?: string;
  /**
   * The continuation from here: what they play, what you answer, and where they
   * run out of familiar ground.
   *
   * Separate from `line` because the two rest on different evidence. `line` is
   * where to steer and is backed by their results; this is what to play once
   * there and is backed by their behaviour. Conflating them would let a
   * ply-twelve move inherit a p-value earned at ply three.
   */
  prepared?: PreparedLine[];
}

export interface HoleReport {
  holes: Hole[];
  baseline: number;
  baselineGames: number;
  /** Effective sample size behind the baseline. */
  baselineNeff: number;
  /** Independent questions the screen asked. */
  tests: number;
  /** BH cutoff those questions had to clear. */
  threshold: number;
  /**
   * True when at least one returned line is a statistically confirmed weakness.
   *
   * When false the report is still useful — it is the best prep available — but
   * it is prep, not a discovery, and the UI must not dress it up as one. On a
   * solid opponent this is the normal outcome, not a failure.
   */
  confirmedWeakness: boolean;
  evaluated: number;
  budgetExhausted: boolean;
  /**
   * Positions the engine had no answer for. A high count means the report rests
   * on results alone, which the UI should say rather than imply engine backing.
   */
  unavailable: number;
  noHoleFound: boolean;
}

/**
 * A reachable line plus everything the index and the screen already know about
 * where it lands. Exported because the learning programme runs the same walk
 * over the user's own games.
 */
export interface Candidate {
  line: HoleMove[];
  path: OpeningTreeNode[];
  reach: number;
  test: ScreenedPosition | null;
  stat: PositionStat | null;
  /** Ranking hint available before the engine runs. */
  potential: number;
}

/** Their empirical probability of each continuation at a node. */
function childProbabilities(node: OpeningTreeNode): Map<string, number> {
  const total = node.children.reduce((s, c) => s + c.totalGames, 0);
  const out = new Map<string, number>();
  if (total <= 0) return out;
  for (const c of node.children) out.set(c.move, c.totalGames / total);
  return out;
}

/**
 * Walk the move tree for reachable lines, taking every statistic from the
 * position index.
 *
 * The tree supplies move order and probability — what you play and how likely
 * they are to follow. It does not supply scores: those come from the index,
 * pooled across every order that reaches the same position.
 */
export function collectCandidates(
  tree: OpeningTreeNode,
  theirColor: 'white' | 'black',
  index: PositionIndex,
  screen: Screen,
  config: HoleFinderConfig
): Candidate[] {
  const candidates: Candidate[] = [];

  interface Frame {
    node: OpeningTreeNode;
    line: HoleMove[];
    path: OpeningTreeNode[];
    reach: number;
  }
  const stack: Frame[] = [{ node: tree, line: [], path: [], reach: 1 }];

  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.line.length >= config.maxPly) continue;
    if (frame.node.children.length === 0) continue;

    let turn: 'w' | 'b';
    try {
      turn = new Chess(frame.node.fen).turn();
    } catch {
      continue;
    }
    const theirTurn =
      (turn === 'w' && theirColor === 'white') || (turn === 'b' && theirColor === 'black');
    const probs = theirTurn ? childProbabilities(frame.node) : null;

    for (const child of frame.node.children) {
      if (child.totalGames < config.minRepeats) continue;

      // Your moves are choices and cost no probability. Theirs decay it.
      const reach = theirTurn ? frame.reach * (probs!.get(child.move) ?? 0) : frame.reach;
      if (reach <= 0) continue;

      const line: HoleMove[] = [
        ...frame.line,
        { san: child.move, side: theirTurn ? 'them' : 'you', games: child.totalGames },
      ];
      const path = [...frame.path, child];

      const key = positionKey(child.fen);
      const stat = index.positions.get(key) ?? null;
      const test = screen.tested.get(key) ?? null;
      const score = stat ? positionScore(stat) : index.baseline;
      const n = stat ? effectiveN(stat) : 0;
      const shrunk = shrinkScore(score, n, index.baseline, config.shrinkK);

      candidates.push({
        line,
        path,
        reach,
        test,
        stat,
        potential: reach * Math.max(0, index.baseline - shrunk),
      });

      stack.push({ node: child, line, path, reach });
    }
  }

  return candidates;
}

/**
 * Which candidates are worth engine time.
 *
 * Three buckets, because the signals become visible at different stages and one
 * ranking would starve two of them: confirmed deficits first, then suspected
 * ones (a line that looks bad but cannot be proven bad still deserves a look —
 * if the engine also dislikes it, two weak signals make a real find), then the
 * most-reached lines, because a repeated engine mistake is invisible until
 * Stockfish looks and only matters where they actually go.
 */
function shortlist(candidates: Candidate[], limit: number): Candidate[] {
  const share = Math.ceil(limit / 3);
  const picked = new Set<Candidate>();

  const take = (ranked: Candidate[], upTo: number, keep: (c: Candidate) => boolean) => {
    for (const c of ranked) {
      if (picked.size >= upTo) break;
      if (keep(c)) picked.add(c);
    }
  };

  take(
    [...candidates].sort((a, b) => b.potential - a.potential),
    share,
    c => !!c.test?.confirmed
  );
  take(
    [...candidates].sort((a, b) => b.potential - a.potential),
    share * 2,
    c => c.potential > 0
  );
  take(
    [...candidates].sort((a, b) => b.reach - a.reach || b.line.length - a.line.length),
    limit,
    () => true
  );

  return Array.from(picked);
}

/**
 * Positions the engine pass will ask about, in the order it will ask.
 *
 * The search awaits each evaluation, so against a ~200ms cloud it would spend
 * twenty seconds doing nothing but waiting. Everything up to this point is pure
 * and free, so a caller can compute this list, warm its provider's cache
 * concurrently, and then run `findHoles` against a cache that already has the
 * answers.
 *
 * It is deliberately not exhaustive: the sibling the engine would rather have
 * played is only knowable once it has answered, so those stay cold. It covers
 * the line positions, which are the bulk.
 */
export function planEngineWork(
  tree: OpeningTreeNode,
  theirColor: 'white' | 'black',
  index: PositionIndex,
  config: HoleFinderConfig = HOLE_DEFAULTS
): string[] {
  const screen = screenPositions(index, config);
  const candidates = collectCandidates(tree, theirColor, index, screen, config);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const c of shortlist(candidates, config.topN * 6)) {
    for (const fen of [tree.fen, ...c.path.map(n => n.fen)]) {
      const key = positionKey(fen);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(fen);
    }
  }
  return out;
}

// ── The engine pass ──────────────────────────────────────────────────────────

/**
 * One conversation with the engine: a cache, a budget, and the two questions
 * the search actually asks.
 *
 * Extracted because the learning programme runs the same screen against the
 * user's OWN games, and a second hand-written copy of `costOfMove` would be a
 * copy of the sibling-comparison rule — the one measurement in here whose wrong
 * version looks entirely reasonable. Parent-to-child differs from sibling-to-
 * sibling by 20–40cp of pure search noise in the opening, which was enough to
 * bill a developing move for half the concession budget. Two copies of that
 * rule is one copy too many.
 *
 * NOT concurrency-safe, and deliberately so. A provider backed by a single
 * engine process is a single conversation; issuing two `position`/`go` pairs at
 * once returns them crossed, which surfaces as a move that is illegal in the
 * position it came back for. Callers await every call.
 */
export interface EngineSession {
  evaluate(fen: string): Promise<PositionEval | null>;
  /**
   * What the move from `parentFen` to `childFen` cost, and what the engine
   * would rather have played. Null when the budget ran out mid-measurement — a
   * partial answer would understate a cost, so the caller drops the candidate.
   */
  costOfMove(parentFen: string, childFen: string): Promise<{ loss: number; best: string } | null>;
  readonly evaluated: number;
  readonly unavailable: number;
  readonly budgetExhausted: boolean;
}

export function createEngineSession(
  providers: HoleFinderProviders,
  budget: number
): EngineSession {
  // `null` is a real answer here — "asked, and there is none" — so it is cached
  // alongside the hits. Without that, every unevaluable position is re-requested
  // once per candidate line that passes through it, and on a cloud miss that is
  // the slowest path in the search repeated dozens of times.
  const cache = new Map<string, PositionEval | null>();
  let evaluated = 0;
  let budgetExhausted = false;
  let unavailable = 0;

  const evaluate = async (fen: string): Promise<PositionEval | null> => {
    const key = positionKey(fen);
    if (cache.has(key)) return cache.get(key)!;
    if (evaluated >= budget) {
      budgetExhausted = true;
      return null;
    }
    const res = await providers.evaluate(fen);
    cache.set(key, res);
    evaluated += 1;
    if (!res) unavailable += 1;
    return res;
  };

  const costOfMove = async (
    parentFen: string,
    childFen: string
  ): Promise<{ loss: number; best: string } | null> => {
    const parent = await evaluate(parentFen);
    if (!parent) return null;
    const played = await evaluate(childFen);
    if (!played) return null;
    if (!parent.bestMove) return { loss: 0, best: '' };

    let bestFen: string;
    try {
      const board = new Chess(parentFen);
      if (!board.move(parent.bestMove)) return null;
      bestFen = board.fen();
    } catch {
      return null;
    }
    const best = await evaluate(bestFen);
    if (!best) return null;

    return { loss: moveLoss(played.cp, best.cp), best: parent.bestMove };
  };

  return {
    evaluate,
    costOfMove,
    get evaluated() {
      return evaluated;
    },
    get unavailable() {
      return unavailable;
    },
    get budgetExhausted() {
      return budgetExhausted;
    },
  };
}


export async function findHoles(
  tree: OpeningTreeNode,
  theirColor: 'white' | 'black',
  index: PositionIndex,
  providers: HoleFinderProviders,
  config: HoleFinderConfig = HOLE_DEFAULTS,
  /**
   * Your own games, indexed the same way. Optional: the report degrades to the
   * one-sided ranking without it rather than refusing to run, because a scout
   * of a stranger is still useful when you have not linked an account.
   */
  yourIndex?: PositionIndex
): Promise<HoleReport> {
  const screen = screenPositions(index, config);
  const candidates = collectCandidates(tree, theirColor, index, screen, config);

  const engine = createEngineSession(providers, config.engineBudget);
  const { evaluate, costOfMove } = engine;

  const holes: Hole[] = [];

  for (const c of shortlist(candidates, config.topN * 6)) {
    const before = [tree.fen, ...c.path.slice(0, -1).map(n => n.fen)];

    let concessionCp = 0;
    let abandoned = false;
    for (let i = 0; i < c.line.length; i++) {
      if (c.line[i].side !== 'you') continue;
      const cost = await costOfMove(before[i], c.path[i].fen);
      if (!cost) {
        abandoned = true;
        break;
      }
      concessionCp += cost.loss;
      if (concessionCp > config.maxConcessionCp) {
        abandoned = true;
        break;
      }
    }
    if (abandoned) continue;

    const lastIndex = c.line.length - 1;
    const last = c.line[lastIndex];
    let cpLoss: number | undefined;
    let betterMove: string | undefined;
    let punish: string | undefined;

    const here = await evaluate(c.path[lastIndex].fen);
    if (here && last.side === 'them') {
      // After their move it is your turn, so the engine's choice here is the
      // punishment. After your own move it is theirs, and there is nothing to
      // punish yet.
      punish = here.bestMove;
      const cost = await costOfMove(before[lastIndex], c.path[lastIndex].fen);
      if (cost) {
        cpLoss = cost.loss;
        betterMove = cost.best;
      }
    }

    const n = c.stat ? effectiveN(c.stat) : 0;
    const score = c.stat ? positionScore(c.stat) : index.baseline;
    const shrunk = shrinkScore(score, n, index.baseline, config.shrinkK);
    const upper = wilsonBounds(score, n, 1.96).upper;

    // Your side of the same board. Same FEN key space, so this is the position
    // itself rather than a line that resembles it.
    const yourStat = yourIndex?.positions.get(positionKey(c.path[lastIndex].fen));
    let you: Hole['you'];
    if (yourIndex && yourStat) {
      const yourN = effectiveN(yourStat);
      const yourScore = positionScore(yourStat);
      // Shrunk toward YOUR baseline, so three good games do not read as mastery.
      const yourShrunk = shrinkScore(yourScore, yourN, yourIndex.baseline, config.shrinkK);
      you = {
        games: yourStat.games,
        neff: yourN,
        score: yourScore,
        baseline: yourIndex.baseline,
        surplus: yourShrunk - yourIndex.baseline,
      };
    }

    const confirmed = !!c.test?.confirmed;
    const confirmedEdge = confirmed ? Math.max(0, index.baseline - upper) : 0;
    // A results edge is only ever claimed for a position the screen actually
    // tested. Below that sample the multiple-comparison correction never saw
    // the line, so nothing is protecting it — and an unscreened seven-game
    // sample at 4.5% still shrinks to a fourteen-point "edge", which is the
    // same fluke-promotion the screen exists to prevent, one layer down.
    const estimatedEdge = c.test ? Math.max(0, index.baseline - shrunk) : 0;
    const engineEdge = cpLoss !== undefined ? cpToScoreEdge(cpLoss) : 0;
    const edge = Math.max(estimatedEdge, engineEdge);
    // Your surplus counts once, alongside their deficit. With no games of yours
    // it is zero and the ranking is exactly what it was before.
    const jointEdge = edge + (you?.surplus ?? 0);
    const benefit = c.reach * (jointEdge - cpToScoreEdge(concessionCp));

    if (edge < config.minEdge || benefit <= 0) continue;

    holes.push({
      line: c.line,
      fen: c.path[lastIndex].fen,
      kind: engineEdge > estimatedEdge ? 'engine' : 'results',
      tier: confirmed ? 'confirmed' : c.test ? 'signal' : 'prep',
      games: c.stat?.games ?? 0,
      neff: n,
      score,
      shrunkScore: shrunk,
      baseline: index.baseline,
      scoreUpper: upper,
      p: c.test?.p,
      cpLoss,
      betterMove,
      punish,
      concessionCp,
      reach: c.reach,
      confirmedEdge,
      edge,
      jointEdge,
      you,
      benefit,
      keyMove: [...c.line].reverse().find(m => m.side === 'you')?.san,
    });
  }

  const ranked = dedupeNested(holes).slice(0, config.topN);

  // Only the leading holes get a continuation. Each line costs engine calls and
  // forks into several, so building them for all ten would spend the budget on
  // entries nobody scrolls to and starve the one they came for.
  for (const hole of ranked.slice(0, PREPARED_FOR_TOP)) {
    hole.prepared = await buildPreparedLines(
      hole.fen,
      theirColor === 'white' ? 'black' : 'white',
      index,
      { evaluate },
      PREPARED_DEFAULTS
    );
  }

  return {
    holes: ranked,
    baseline: index.baseline,
    baselineGames: index.games,
    baselineNeff: index.baselineNeff,
    tests: screen.tests,
    threshold: screen.threshold,
    confirmedWeakness: ranked.some(h => h.tier === 'confirmed'),
    evaluated: engine.evaluated,
    budgetExhausted: engine.budgetExhausted,
    unavailable: engine.unavailable,
    noHoleFound: ranked.length === 0,
  };
}

/**
 * One line per idea.
 *
 * Two ways the same idea shows up twice. `4.c4` and `4.c4 Nf6` are one
 * discovery told at two depths; `2.c4 d5 3.cxd5` and `2.d4 d5 3.exd5 cxd5 4.c4`
 * are one discovery reached by two move orders. Nesting catches the first,
 * terminal position the second — and the second only became visible once the
 * statistics moved off the move tree.
 */
export function dedupeNested(holes: Hole[]): Hole[] {
  const sorted = [...holes].sort((a, b) => b.benefit - a.benefit);
  const kept: Hole[] = [];
  const seenPositions = new Set<string>();

  const isPrefix = (a: Hole, b: Hole) =>
    a.line.length <= b.line.length && a.line.every((m, i) => m.san === b.line[i].san);

  for (const h of sorted) {
    const key = positionKey(h.fen);
    if (seenPositions.has(key)) continue;
    if (kept.some(k => isPrefix(k, h) || isPrefix(h, k))) continue;
    seenPositions.add(key);
    kept.push(h);
  }
  return kept;
}
