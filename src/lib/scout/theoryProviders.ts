// ─────────────────────────────────────────────────────────────────────────────
// Wiring the theory search to the real world.
//
// The search itself (theoryLines.ts) is pure and provider-driven. This module
// supplies the three real providers:
//
//   history  ← the opponent's own opening tree, already built client-side
//   maia     ← /api/maia-predict, memoized by FEN
//   bestMove ← Stockfish WASM in the browser
//
// Generation runs CLIENT-side. Stockfish is a browser worker, and a 20-ply
// walk would blow a serverless function's wall clock; doing it here also lets
// the UI report progress instead of hanging on a spinner.
// ─────────────────────────────────────────────────────────────────────────────

import { Chess } from 'chess.js';
import type { OpeningTreeNode } from '@/types/scout';
import type { UciEngine } from '@/lib/engine/uciEngine';
import type {
  HistoryAtPosition,
  MoveCandidate,
  TheoryProviders,
} from './theoryLines';

// ─── History ────────────────────────────────────────────────────────────────

/**
 * Index the opponent's opening tree by FEN.
 *
 * Node counts are used directly: a child's share of its parent is the
 * empirical frequency e(m|v). Children can sum to fewer games than the parent
 * (games that ended at this node), so the search normalises over what is here.
 */
export function createHistoryLookup(
  tree: OpeningTreeNode | null
): (fen: string) => HistoryAtPosition | null {
  const index = new Map<string, HistoryAtPosition>();

  const walk = (node: OpeningTreeNode) => {
    if (node.children.length > 0) {
      index.set(normalizeFen(node.fen), {
        games: node.totalGames,
        moves: node.children.map(c => ({
          move: c.move,
          probability: c.totalGames,
        })),
      });
    }
    for (const c of node.children) walk(c);
  };

  if (tree) walk(tree);

  return (fen: string) => index.get(normalizeFen(fen)) ?? null;
}

/**
 * Compare positions ignoring the halfmove and fullmove counters.
 *
 * The same position reached by a different move order is the same position for
 * prep purposes, and the counters would otherwise make every transposition a
 * cache miss — both losing history matches and multiplying Maia calls.
 */
function normalizeFen(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

// ─── Maia ───────────────────────────────────────────────────────────────────

export interface MaiaProviderResult {
  maia: TheoryProviders['maia'];
  /** False once any call has failed — the caller must surface this. */
  isAvailable: () => boolean;
  callCount: () => number;
}

/**
 * Maia move distribution for the opponent, memoized by position.
 *
 * Fail-closed on two levels:
 *
 *  1. A failed or malformed response yields an EMPTY distribution, never a
 *     guess. The search treats "no opinion" as a reason to stop the line, so a
 *     Maia outage produces shorter prep — never invented prep.
 *  2. `isAvailable()` flips false on the first failure so the UI can say so.
 *     Silently returning history-only lines that look like full prep would be
 *     the same class of bug as a heuristic fallback masquerading as the model.
 *
 * Note there IS a heuristic fallback inside maiaServerService — hand-written
 * move scoring, not Maia. This provider deliberately does not touch it. It
 * talks to /api/maia-predict, which errors rather than fabricating.
 */
export function createMaiaProvider(opts: {
  rating: number;
  opponentRating?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): MaiaProviderResult {
  const cache = new Map<string, MoveCandidate[]>();
  const doFetch = opts.fetchImpl ?? fetch;
  let available = true;
  let calls = 0;

  const maia: TheoryProviders['maia'] = async (fen: string) => {
    const key = normalizeFen(fen);
    const hit = cache.get(key);
    if (hit) return hit;

    calls += 1;
    try {
      const res = await doFetch('/api/maia-predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fen,
          rating: opts.rating,
          opponent_rating: opts.opponentRating ?? opts.rating,
        }),
        signal: opts.signal,
      });

      if (!res.ok) {
        available = false;
        cache.set(key, []);
        return [];
      }

      const data = (await res.json()) as {
        humanLikeMove?: string;
        confidence?: number;
        alternativeMoves?: Array<{ move: string; probability: number }>;
      };

      const raw: MoveCandidate[] = [];
      if (data.humanLikeMove && typeof data.confidence === 'number') {
        raw.push({ move: data.humanLikeMove, probability: data.confidence });
      }
      for (const alt of data.alternativeMoves ?? []) {
        if (typeof alt?.move === 'string' && typeof alt.probability === 'number') {
          raw.push({ move: alt.move, probability: alt.probability });
        }
      }

      // The service returns a top-K only, so these do not sum to 1 and the
      // tail is unknown. Convert to legal SAN and let the search renormalise
      // over what came back; the unreturned tail is simply never branched into.
      const legal = toLegalSan(fen, raw);
      cache.set(key, legal);
      return legal;
    } catch {
      available = false;
      cache.set(key, []);
      return [];
    }
  };

  return { maia, isAvailable: () => available, callCount: () => calls };
}

/**
 * Map whatever notation the service returned onto legal SAN for this position.
 *
 * Maia speaks UCI in some deployments and SAN in others; anything that does not
 * resolve to a legal move is dropped rather than guessed at.
 */
function toLegalSan(fen: string, candidates: MoveCandidate[]): MoveCandidate[] {
  const out: MoveCandidate[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const san = resolveToSan(fen, c.move);
    if (!san || seen.has(san)) continue;
    seen.add(san);
    out.push({ move: san, probability: c.probability });
  }
  return out;
}

function resolveToSan(fen: string, move: string): string | null {
  const chess = new Chess(fen);
  try {
    const m = chess.move(move);
    if (m) return m.san;
  } catch {
    /* not SAN — try UCI below */
  }
  return uciToSan(fen, move);
}

/** "e2e4" / "e7e8q" → SAN, or null when it isn't a legal move here. */
export function uciToSan(fen: string, uci: string): string | null {
  if (!uci || uci.length < 4) return null;
  const chess = new Chess(fen);
  try {
    const m = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    return m ? m.san : null;
  } catch {
    return null;
  }
}

// ─── Stockfish ──────────────────────────────────────────────────────────────

/**
 * Your move, from Stockfish in the browser.
 *
 * Only ever called on your turn — their replies come from Maia and history, so
 * no position needs engine evaluation on their move. That halves the engine
 * work per line.
 */
export function createEngineProvider(
  engine: UciEngine,
  opts: { depth: number; elo?: number }
): TheoryProviders['bestMove'] {
  const cache = new Map<string, string>();

  return async (fen: string) => {
    const key = normalizeFen(fen);
    const hit = cache.get(key);
    if (hit) return hit;

    // Full strength: this is the move we are recommending, not a sparring
    // partner. `getEngineNextMove` returns UCI.
    const uci = await engine.getEngineNextMove(fen, opts.elo ?? 3000, opts.depth);
    const san = uci ? uciToSan(fen, uci) : null;
    const resolved = san ?? '';
    cache.set(key, resolved);
    return resolved;
  };
}
