// ─────────────────────────────────────────────────────────────────────────────
// Twin Bot engine
//
// Hybrid move generator that mirrors a specific opponent's play:
//   1. "Book" phase  — walk the opponent's own opening tree using the current
//      game's move history. If the current position has children, pick one
//      weighted by how often the opponent actually played it. This makes the
//      bot play the opponent's exact theory for as long as the opponent's
//      repertoire goes.
//   2. "Engine" phase — once out of book, delegate to Stockfish with
//      UCI_LimitStrength + UCI_Elo set to the opponent's phase-specific rating
//      (opening / middle / endgame). This is the "Maia-proxy": not real Maia,
//      but a pragmatic, in-browser approximation of level-appropriate play.
//
// The caller is expected to feed in the same tree that was used to build the
// dashboard (so the bot plays with the exact repertoire surfaced to the user)
// and the opponent's PhaseElo bundle from analytics.
// ─────────────────────────────────────────────────────────────────────────────

import { Chess } from 'chess.js';
import { OpeningTreeNode, PhaseElo } from '@/types/scout';
import { UciEngine } from './engine/uciEngine';
import { uciMoveParams } from './chess';

export type TwinBotMoveSource = 'book' | 'engine' | 'fallback';
export type GamePhase = 'opening' | 'middle' | 'endgame';

export interface TwinBotMove {
  /** SAN move the bot played. */
  san: string;
  /** UCI move (for react-chessboard / playMove). */
  uci: string;
  source: TwinBotMoveSource;
  /** In-book: share of this move at the current position (0-100). */
  confidence?: number;
  /** Out-of-book: ELO used by the engine. */
  engineElo?: number;
  /** Out-of-book: engine depth used. */
  engineDepth?: number;
  /** Phase used when calling the engine. */
  phase?: GamePhase;
  /** Total games in parent node (in-book). */
  parentGames?: number;
  /** Games of the picked child (in-book). */
  bookGames?: number;
  /** Think time budget we actually used, in ms (for the thinking indicator). */
  thinkMs?: number;
}

export interface TwinBotSettings {
  /**
   * 0 = always the single most-played book move,
   * 1 = picks proportional to frequency (can lead into rare lines).
   * 0.35 is a good mix: mostly main lines, sometimes side-lines.
   */
  bookRandomness: number;
  /** Minimum games a parent node must have for us to consider it "book". */
  minParentGames: number;
  /** Minimum total games a candidate child must have. Filters noise. */
  minChildGames: number;
  /** Human-like simulated thinking delay in ms (min, max). */
  thinkMs: [number, number];
}

export const DEFAULT_TWINBOT_SETTINGS: TwinBotSettings = {
  bookRandomness: 0.35,
  minParentGames: 3,
  minChildGames: 1,
  thinkMs: [450, 1200],
};

// ─── Tree walking ───────────────────────────────────────────────────────────

/** Walk `tree` along SAN moves; return the reached node or null if not found. */
export function walkTree(
  tree: OpeningTreeNode,
  moves: string[]
): OpeningTreeNode | null {
  let node: OpeningTreeNode | null = tree;
  for (const mv of moves) {
    if (!node) return null;
    const child: OpeningTreeNode | undefined = node.children.find(c => c.move === mv);
    if (!child) return null;
    node = child;
  }
  return node;
}

/** Pick a child weighted by frequency (randomness ∈ [0, 1]). */
export function pickBookMove(
  node: OpeningTreeNode,
  randomness: number,
  minChildGames = 1
): OpeningTreeNode | null {
  const eligible = node.children.filter(c => c.totalGames >= minChildGames);
  if (eligible.length === 0) return null;
  if (randomness <= 0.001) {
    return [...eligible].sort((a, b) => b.totalGames - a.totalGames)[0];
  }
  // Sharpness k: randomness→1 means k=1 (proportional), randomness→0 means k large
  // (heavily biased toward the top move).
  const k = Math.max(0.6, 1 / Math.max(0.1, randomness));
  const weighted = eligible.map(c => ({ node: c, w: Math.pow(c.totalGames, k) }));
  const total = weighted.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return eligible[0];
  let r = Math.random() * total;
  for (const x of weighted) {
    r -= x.w;
    if (r <= 0) return x.node;
  }
  return weighted[weighted.length - 1].node;
}

// ─── Phase ELO mapping ──────────────────────────────────────────────────────

export function phaseForPly(ply: number): GamePhase {
  if (ply <= 20) return 'opening';
  if (ply <= 70) return 'middle';
  return 'endgame';
}

export function eloForPhase(phase: GamePhase, phaseElo: PhaseElo): number {
  if (phase === 'opening') return phaseElo.opening;
  if (phase === 'middle') return phaseElo.middle;
  return phaseElo.endgame;
}

/**
 * Stockfish 16.1 supports UCI_Elo in [1320, 3190]. Clamp & pick a depth that
 * feels right for the target strength (shallower depths for weaker opponents
 * give the engine more "human" blunders).
 */
export function engineParamsForElo(elo: number): { elo: number; depth: number } {
  const clamped = Math.max(1320, Math.min(3190, Math.round(elo)));
  let depth: number;
  if (clamped < 1500) depth = 4;
  else if (clamped < 1800) depth = 6;
  else if (clamped < 2100) depth = 8;
  else if (clamped < 2400) depth = 10;
  else if (clamped < 2700) depth = 12;
  else depth = 14;
  return { elo: clamped, depth };
}

// ─── Core: getTwinBotMove ──────────────────────────────────────────────────

export interface TwinBotMoveRequest {
  /** The opponent's opening tree, for the color THEY play in this game. */
  tree: OpeningTreeNode;
  /**
   * Game move history (SAN), spanning BOTH sides from move 1.
   * This is the full path to walk in the tree.
   */
  historyMoves: string[];
  /** Current FEN — used as the engine's starting position if out of book. */
  fen: string;
  /** Opponent's phase-specific ratings. */
  phaseElo: PhaseElo;
  /** Reusable UCI engine (Stockfish). May be null if not yet initialised. */
  engine: UciEngine | null;
  /** Optional overrides. */
  settings?: Partial<TwinBotSettings>;
}

/**
 * Returns the Twin Bot's next move for the given position, or null if no move
 * is possible (e.g., game over, engine unavailable AND no book).
 *
 * Book phase is tried first; if we're still in the opponent's repertoire and
 * the parent has enough games, we sample a child. Otherwise we call Stockfish
 * with the ELO/depth tuned to the current game phase.
 */
export async function getTwinBotMove({
  tree,
  historyMoves,
  fen,
  phaseElo,
  engine,
  settings: overrides,
}: TwinBotMoveRequest): Promise<TwinBotMove | null> {
  const settings = { ...DEFAULT_TWINBOT_SETTINGS, ...overrides };
  const start = Date.now();

  // Book phase
  const node = walkTree(tree, historyMoves);
  if (node && node.totalGames >= settings.minParentGames && node.children.length > 0) {
    const picked = pickBookMove(node, settings.bookRandomness, settings.minChildGames);
    if (picked) {
      const san = picked.move;
      const uci = sanToUci(fen, san);
      if (uci) {
        const confidence = (picked.totalGames / Math.max(1, node.totalGames)) * 100;
        const elapsed = Date.now() - start;
        const [minMs, maxMs] = settings.thinkMs;
        const targetThink = minMs + Math.random() * (maxMs - minMs);
        const waitMs = Math.max(0, targetThink - elapsed);
        if (waitMs > 0) await sleep(waitMs);
        return {
          san,
          uci,
          source: 'book',
          confidence,
          parentGames: node.totalGames,
          bookGames: picked.totalGames,
          thinkMs: Math.round(Date.now() - start),
        };
      }
      // Fall through to engine if SAN couldn't be converted (corrupt tree data).
    }
  }

  // Engine phase (Maia-proxy: Stockfish at phase-ELO)
  if (!engine) {
    // Last-resort fallback: pick any legal move (shouldn't happen in practice).
    const any = anyLegalMove(fen);
    if (!any) return null;
    return {
      san: any.san,
      uci: any.uci,
      source: 'fallback',
      thinkMs: Date.now() - start,
    };
  }

  const ply = historyMoves.length;
  const phase = phaseForPly(ply);
  const targetElo = eloForPhase(phase, phaseElo);
  const { elo, depth } = engineParamsForElo(targetElo);

  let uci: string | undefined;
  try {
    uci = await engine.getEngineNextMove(fen, elo, depth);
  } catch (err) {
    console.warn('TwinBot engine error', err);
  }
  if (!uci) {
    const any = anyLegalMove(fen);
    if (!any) return null;
    return {
      san: any.san,
      uci: any.uci,
      source: 'fallback',
      engineElo: elo,
      engineDepth: depth,
      phase,
      thinkMs: Date.now() - start,
    };
  }

  const san = uciToSan(fen, uci);
  if (!san) return null;

  return {
    san,
    uci,
    source: 'engine',
    engineElo: elo,
    engineDepth: depth,
    phase,
    thinkMs: Date.now() - start,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function sanToUci(fen: string, san: string): string | null {
  const game = new Chess(fen);
  try {
    const mv = game.move(san);
    if (!mv) return null;
    return mv.from + mv.to + (mv.promotion ?? '');
  } catch {
    return null;
  }
}

export function uciToSan(fen: string, uci: string): string | null {
  const game = new Chess(fen);
  try {
    const params = uciMoveParams(uci);
    const mv = game.move(params);
    if (!mv) return null;
    return mv.san;
  } catch {
    return null;
  }
}

/** Pick the first legal move (degenerate fallback). */
function anyLegalMove(fen: string): { uci: string; san: string } | null {
  const game = new Chess(fen);
  const moves = game.moves({ verbose: true });
  if (moves.length === 0) return null;
  const m = moves[0];
  return { uci: m.from + m.to + (m.promotion ?? ''), san: m.san };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
