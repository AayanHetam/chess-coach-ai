// ─────────────────────────────────────────────────────────────────────────────
// Personalized theory lines.
//
// Generates a small set of opening lines where YOU play the engine move and
// THEY play what they actually play, branching only where their behaviour is
// genuinely uncertain.
//
// 100% deterministic algorithm. No LLM anywhere in this file — the only
// external judgement comes from Stockfish (your move) and Maia (their move
// distribution), both injected as providers so the whole search is testable
// without a network.
//
// Spec + rationale: MASTERMIND_CONTEXT/SCOUT_VS_ME_PLAN.md
// ─────────────────────────────────────────────────────────────────────────────

import { Chess } from 'chess.js';

export interface MoveCandidate {
  /** SAN. */
  move: string;
  probability: number;
}

/** Their observed behaviour at a position, from their own game history. */
export interface HistoryAtPosition {
  /** n(v) — how many of their games reached this position. */
  games: number;
  /** Empirical move frequencies; should sum to ~1. */
  moves: MoveCandidate[];
}

export interface TheoryProviders {
  /** Their history at a position, or null when the position never occurred. */
  history(fen: string): HistoryAtPosition | null;
  /**
   * Maia's predicted distribution for them at this position.
   *
   * Must already be renormalised over the moves it returns — the service only
   * returns a top-K, so the raw probabilities do not sum to 1 and the tail is
   * unknown. Returning an empty array means "no opinion"; the caller must then
   * fall back to history alone, and if there is no history either, stop.
   */
  maia(fen: string): Promise<MoveCandidate[]>;
  /** Your move: Stockfish best move in SAN. Only ever called on your turn. */
  bestMove(fen: string): Promise<string>;
}

export interface TheoryConfig {
  /** N — how many lines to produce. */
  lineBudget: number;
  /** τ — cumulative probability a node's branches must cover. */
  tau: number;
  /** k — Maia's prior strength, priced in games of observed history. */
  kShrink: number;
  /**
   * D — safety cap on line length in plies.
   *
   * Not the termination condition: lines normally end at their last fork (see
   * generateTheoryLines), so length is emergent and varies. A line may run one
   * ply past this cap when the closing reply is appended.
   */
  maxPly: number;
  /** ε — minimum reach probability for a line to be worth keeping. */
  minReach: number;
  /** Kmax — hard cap on branches at a single node. */
  maxBranch: number;
  /** Stockfish search depth for your moves. */
  engineDepth: number;
}

export type TheoryPreset = 'lite' | 'recommended' | 'hardcore';

/**
 * ε scales with N: a user asking for 20 lines is explicitly asking to go
 * further down the tail. A fixed ε would silently return fewer lines than they
 * picked, because expansion runs out of candidates above the floor.
 */
export const THEORY_PRESETS: Record<TheoryPreset, Pick<TheoryConfig, 'lineBudget' | 'minReach'>> = {
  lite: { lineBudget: 5, minReach: 0.05 },
  recommended: { lineBudget: 10, minReach: 0.02 },
  hardcore: { lineBudget: 20, minReach: 0.01 },
};

export const THEORY_DEFAULTS: Omit<TheoryConfig, 'lineBudget' | 'minReach'> = {
  tau: 0.7,
  kShrink: 5,
  maxPly: 20,
  maxBranch: 3,
  engineDepth: 20,
};

export function configFor(preset: TheoryPreset): TheoryConfig {
  return { ...THEORY_DEFAULTS, ...THEORY_PRESETS[preset] };
}

export interface TheoryMove {
  /** SAN as played from the position before it. */
  san: string;
  /** Who is to move here. */
  side: 'you' | 'them';
  /** For their moves: the blended probability they play it. 1 for yours. */
  probability: number;
  /** FEN after the move. */
  fen: string;
}

export interface TheoryLine {
  moves: TheoryMove[];
  /** R(ℓ) — probability they walk this whole line. */
  reach: number;
  /** Why the line stopped growing. */
  stoppedBy: 'depth' | 'reach' | 'no-model' | 'terminal' | 'budget';
}

export interface TheoryResult {
  lines: TheoryLine[];
  /** Σ R(ℓ) — the share of their real behaviour this prep covers. */
  coverage: number;
  config: TheoryConfig;
}

// ─── The two equations ──────────────────────────────────────────────────────

/**
 * P(m|v) = w·e(m|v) + (1−w)·μ(m|v),   w = n/(n+k)
 *
 * `k` is Maia's opinion priced in games: at n = k the two weigh equally. With
 * no history it is pure Maia; with no Maia it is pure history.
 */
export function blendDistribution(
  history: HistoryAtPosition | null,
  maia: MoveCandidate[],
  k: number
): MoveCandidate[] {
  const n = history?.games ?? 0;
  const hasHistory = n > 0 && (history?.moves.length ?? 0) > 0;
  const hasMaia = maia.length > 0;

  if (!hasHistory && !hasMaia) return [];
  if (!hasMaia) return normalize(history!.moves);
  if (!hasHistory) return normalize(maia);

  const w = n / (n + k);
  const empirical = normalize(history!.moves);
  const predicted = normalize(maia);

  const merged = new Map<string, number>();
  for (const c of empirical) merged.set(c.move, w * c.probability);
  for (const c of predicted) {
    merged.set(c.move, (merged.get(c.move) ?? 0) + (1 - w) * c.probability);
  }

  return normalize(
    Array.from(merged, ([move, probability]) => ({ move, probability }))
  );
}

/**
 * c(v) = min( Kmax, smallest c with p₁+…+p_c ≥ τ )
 *
 * Expects `sorted` descending. Always returns at least 1 for a non-empty list,
 * so a node can never expand into nothing.
 */
export function branchCount(sorted: MoveCandidate[], tau: number, maxBranch: number): number {
  if (sorted.length === 0) return 0;
  let cumulative = 0;
  for (let i = 0; i < sorted.length && i < maxBranch; i += 1) {
    cumulative += sorted[i].probability;
    if (cumulative >= tau) return i + 1;
  }
  return Math.min(maxBranch, sorted.length);
}

function normalize(moves: MoveCandidate[]): MoveCandidate[] {
  const total = moves.reduce((s, m) => s + Math.max(0, m.probability), 0);
  if (total <= 0) return [];
  return moves
    .map(m => ({ move: m.move, probability: Math.max(0, m.probability) / total }))
    .sort((a, b) => b.probability - a.probability);
}

// ─── Search ─────────────────────────────────────────────────────────────────

interface Frontier {
  moves: TheoryMove[];
  reach: number;
  fen: string;
  /** Set once the node can no longer grow. */
  stoppedBy?: TheoryLine['stoppedBy'];
}

/**
 * Best-first expansion under a line budget.
 *
 * Always expands the highest-reach open line, because a split there buys more
 * covered probability than a split anywhere else. Splitting a node into c
 * children costs c−1 from the budget; following a forced-looking move costs
 * nothing, which is why a predictable opponent yields deep lines and an erratic
 * one yields broad shallow ones.
 */
export async function generateTheoryLines(
  startFen: string,
  yourColor: 'white' | 'black',
  providers: TheoryProviders,
  config: TheoryConfig
): Promise<TheoryResult> {
  const root: Frontier = { moves: [], reach: 1, fen: startFen };
  let open: Frontier[] = [root];
  const closed: Frontier[] = [];

  const youMoveFirst = yourColor === 'white';

  while (open.length > 0) {
    // Highest-reach open line first.
    open.sort((a, b) => b.reach - a.reach);
    const node = open.shift()!;

    if (node.moves.length >= config.maxPly) {
      closed.push({ ...node, stoppedBy: 'depth' });
      continue;
    }

    const chess = new Chess(node.fen);
    if (chess.isGameOver()) {
      closed.push({ ...node, stoppedBy: 'terminal' });
      continue;
    }

    const whiteToMove = chess.turn() === 'w';
    const isYourTurn = whiteToMove === youMoveFirst;

    if (isYourTurn) {
      // No branching: you play the engine's move.
      const san = await providers.bestMove(node.fen);
      const applied = tryMove(node.fen, san);
      if (!applied) {
        closed.push({ ...node, stoppedBy: 'no-model' });
        continue;
      }
      open.push({
        fen: applied.fen,
        reach: node.reach,
        moves: [
          ...node.moves,
          { san: applied.san, side: 'you', probability: 1, fen: applied.fen },
        ],
      });
      continue;
    }

    // Their turn — this is the only place lines branch.
    //
    // A line exists to teach one decision: "they play X, you answer Y". Once
    // the budget can fund no further fork, walking deeper adds no distinctness
    // — it just follows a single forced continuation — so the line ends at its
    // last fork, capped off by your reply below. That is also where most of the
    // latency saving comes from: no Maia call is spent on a node that can no
    // longer branch.
    if (open.length + closed.length >= config.lineBudget) {
      closed.push({ ...node, stoppedBy: 'budget' });
      continue;
    }

    const history = providers.history(node.fen);
    const maia = await providers.maia(node.fen);
    const blended = blendDistribution(history, maia, config.kShrink);

    if (blended.length === 0) {
      // No history and no Maia opinion. Guessing here would be fabrication.
      closed.push({ ...node, stoppedBy: 'no-model' });
      continue;
    }

    const take = branchCount(blended, config.tau, config.maxBranch);
    const children: Frontier[] = [];

    for (const candidate of blended.slice(0, take)) {
      const reach = node.reach * candidate.probability;
      if (reach < config.minReach) continue;
      const applied = tryMove(node.fen, candidate.move);
      if (!applied) continue;
      children.push({
        fen: applied.fen,
        reach,
        moves: [
          ...node.moves,
          {
            san: applied.san,
            side: 'them',
            probability: candidate.probability,
            fen: applied.fen,
          },
        ],
      });
    }

    if (children.length === 0) {
      closed.push({ ...node, stoppedBy: 'reach' });
      continue;
    }

    // Splitting into c children costs c−1 lines.
    //
    // A *partial* split is never correct: keeping only the children the budget
    // can pay for silently discards the rest of the node's probability mass,
    // and with three-way forks that throws away two-thirds of it at every
    // level. Measured, that made coverage fall as the line budget rose —
    // "hardcore" returned worse prep than "lite". So either fork completely or
    // not at all; an unexpanded node keeps its full reach.
    const wouldTotal = open.length + closed.length + children.length;
    if (wouldTotal > config.lineBudget) {
      closed.push({ ...node, stoppedBy: 'budget' });
      continue;
    }

    open.push(...children);
  }

  // Every line ends on YOUR move. A line that stops on their move leaves the
  // reader at the decision without the answer, which is the one thing the line
  // exists to deliver — so cap each off with the engine's reply.
  const finished: TheoryLine[] = [];
  for (const f of closed) {
    if (f.moves.length === 0) continue;

    let moves = f.moves;
    const endsOnTheirMove = moves[moves.length - 1].side === 'them';
    if (endsOnTheirMove && f.stoppedBy !== 'terminal') {
      const chess = new Chess(f.fen);
      if (!chess.isGameOver()) {
        const san = await providers.bestMove(f.fen);
        const applied = tryMove(f.fen, san);
        if (applied) {
          moves = [
            ...moves,
            { san: applied.san, side: 'you', probability: 1, fen: applied.fen },
          ];
        }
      }
    }

    finished.push({
      moves,
      reach: f.reach,
      stoppedBy: f.stoppedBy ?? 'terminal',
    });
  }

  const lines = finished.sort((a, b) => b.reach - a.reach);

  return {
    lines,
    coverage: lines.reduce((s, l) => s + l.reach, 0),
    config,
  };
}

/** Apply a SAN move, tolerating notation drift between sources. */
function tryMove(fen: string, san: string): { fen: string; san: string } | null {
  const chess = new Chess(fen);
  try {
    const m = chess.move(san);
    if (!m) return null;
    return { fen: chess.fen(), san: m.san };
  } catch {
    return null;
  }
}
