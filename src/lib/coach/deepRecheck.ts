/**
 * Deep re-check — pass 2 of the review (COACH_CLAIM_VERIFIER).
 *
 * Pass 1 is the browser's whole-game sweep: Stockfish 17 Lite at depth 16 on
 * every position. Depth 16 is evidence, not truth. On the Opera Game it
 * scores Morphy's 15.Bxd7+ as a three-pawn blunder that depth 20 rates the
 * best move on the board; on Game B it names 12.Bd3 where depth 20 names
 * 12.Rb1 (docs/coach-accuracy-notes.md). Re-running all ~80 positions deeper
 * would cost a minute or more in the browser, so pass 2 re-runs only the
 * moments the coach will talk about — the player's worst moves, missed
 * mates, the game's biggest swings — and BOTH positions of each, so every
 * before/after pair the server compares was searched at one depth (the
 * mixed-depth guard, contract/evalDepth.ts).
 *
 * Time-sliced: positions are searched in priority order, each under its own
 * cap, and the loop stops at the deadline. A position that does not reach
 * the target depth keeps its pass-1 evaluation and is reported as skipped:
 * labelled for what it is, never passed off as the deeper number.
 *
 * Pure: the engine comes in as `RecheckEngine`, the clock as `now`.
 */
import { getLineWinPercentage } from "@/lib/engine/helpers/winPercentage";
import { BAND_LOST, BLUNDER_CP, evalBand } from "@/lib/contract/cardWorthiness";
import type { LineEval, PositionEval } from "@/types/eval";

/** What the browser sends as `gameEval.recheck`. */
export interface GameEvalRecheck {
  /** Engine that ran pass 2, e.g. "stockfish_17_lite". */
  engine: string;
  /** The depth every kept position reached. */
  depth: number;
  /** Position index (half-moves from the start) → its deeper evaluation. */
  positions: Record<string, { lines: LineEval[]; bestMove?: string }>;
  /** Flagged positions that did not reach `depth` in time: still pass-1 depth. */
  skipped: number[];
  /** Moves (half-move indices) that were flagged, most important first. */
  moments: number[];
  budgetMs: number;
  elapsedMs: number;
}

export type MomentReason = "missed_mate" | "player_mistake" | "swing";

export interface FlaggedMoment {
  /** Half-move index of the move: it goes from position `move` to `move + 1`. */
  move: number;
  reasons: MomentReason[];
  score: number;
}

export interface FlagOptions {
  playerColor: "w" | "b" | null;
  /** Side to move at position 0 (a game loaded from a FEN can start with Black). */
  firstMover?: "w" | "b";
  /** Default 8: a few seconds each fits a budget of tens of seconds. */
  max?: number;
}

const opp = (c: "w" | "b"): "w" | "b" => (c === "w" ? "b" : "w");

/** Win chance for `side`, 0–100, or null when the line carries no score. */
function winFor(line: LineEval | undefined, side: "w" | "b"): number | null {
  if (!line || line.depth === 0) return null;
  if (typeof line.cp !== "number" && typeof line.mate !== "number") return null;
  const white = getLineWinPercentage(line);
  return side === "w" ? white : 100 - white;
}

/**
 * The mover had a forced mate before the move and no longer has one after
 * it: "you had mate in N". A slower mate is not a miss.
 */
export function missedMate(
  before: LineEval | undefined,
  after: LineEval | undefined,
  mover: "w" | "b"
): { mateIn: number } | null {
  if (!before || before.depth === 0 || typeof before.mate !== "number")
    return null;
  const mateIn = mover === "w" ? before.mate : -before.mate;
  if (mateIn <= 0) return null;
  // A depth-0 "after" with no mate is a timeout sentinel: it proves nothing.
  // (The engine stamps a delivered mate as depth 0, mate ±1 — handled below.)
  if (!after || (after.depth === 0 && typeof after.mate !== "number"))
    return null;
  if (
    after &&
    typeof after.mate === "number" &&
    (mover === "w" ? after.mate > 0 : after.mate < 0)
  )
    return null;
  return { mateIn };
}

/** A move whose win chance swings this far is part of the game's story, whoever played it. */
const SWING_LOSS = 15;
/** The server's own bar for a move it may card (contract/selectInsights.ts). */
const CARD_DROP_CP = 50;
/** How many of the player's worst moves to re-check — the coach's candidate cards. */
const CARD_CANDIDATES = 5;
/** How many other swings, after them. */
const SWINGS = 3;

/** Mate-flattened centipawns, White's point of view, as the server's selection reads them. */
function flatCp(line: LineEval | undefined): number | null {
  if (!line || line.depth === 0) return null;
  if (typeof line.mate === "number") return line.mate > 0 ? 9999 : -9999;
  return typeof line.cp === "number" ? line.cp : null;
}

/**
 * The 4–8 moments worth a deeper look, most important first:
 *  1. a forced mate the player let go ("you had mate in N");
 *  2. the player's worst moves by the server's own measure — the moves the
 *     coach will card: a drop over 50 centipawns (mates flattened) that
 *     clears the card floor (cardWorthiness.ts: down an eval band, or a
 *     300-centipawn blunder, from a position not already lost), up to 5;
 *  3. the game's other big swings (an opponent's blunder shapes the story),
 *     up to 3.
 * With the player's side unknown, both sides' moves count as the player's.
 */
export function selectFlaggedMoments(
  positions: readonly PositionEval[],
  opts: FlagOptions
): FlaggedMoment[] {
  const first = opts.firstMover ?? "w";
  const max = opts.max ?? 8;
  const mates: FlaggedMoment[] = [];
  const cards: FlaggedMoment[] = [];
  const swings: FlaggedMoment[] = [];
  for (let i = 0; i + 1 < positions.length; i++) {
    const mover = i % 2 === 0 ? first : opp(first);
    const players = opts.playerColor === null || opts.playerColor === mover;
    const before = positions[i]?.lines?.[0];
    const after = positions[i + 1]?.lines?.[0];
    if (missedMate(before, after, mover)) {
      mates.push({
        move: i,
        reasons: ["missed_mate"],
        score: players ? 1000 : 300,
      });
    }
    const cpBefore = flatCp(before);
    const cpAfter = flatCp(after);
    if (players && cpBefore !== null && cpAfter !== null) {
      const drop = mover === "w" ? cpBefore - cpAfter : cpAfter - cpBefore;
      const bandBefore = evalBand(mover === "w" ? cpBefore : -cpBefore);
      const bandAfter = evalBand(mover === "w" ? cpAfter : -cpAfter);
      const worthy =
        bandBefore !== BAND_LOST &&
        (bandAfter < bandBefore || drop >= BLUNDER_CP);
      if (drop > CARD_DROP_CP && worthy) {
        cards.push({
          move: i,
          reasons: ["player_mistake"],
          score: 500 + Math.min(drop, 999) / 10,
        });
      }
    }
    const wBefore = winFor(before, mover);
    const wAfter = winFor(after, mover);
    if (
      wBefore !== null &&
      wAfter !== null &&
      Math.abs(wBefore - wAfter) >= SWING_LOSS
    ) {
      swings.push({
        move: i,
        reasons: ["swing"],
        score: Math.abs(wBefore - wAfter),
      });
    }
  }
  const byScore = (a: FlaggedMoment, b: FlaggedMoment) =>
    b.score - a.score || a.move - b.move;
  const merged = new Map<number, FlaggedMoment>();
  for (const m of [
    ...mates,
    ...cards.sort(byScore).slice(0, CARD_CANDIDATES),
    ...swings.sort(byScore).slice(0, SWINGS + CARD_CANDIDATES),
  ]) {
    const had = merged.get(m.move);
    if (had) {
      had.reasons = Array.from(new Set([...had.reasons, ...m.reasons]));
      had.score = Math.max(had.score, m.score);
    } else if (
      m.reasons[0] !== "swing" ||
      Array.from(merged.values()).filter(
        (x) => x.reasons.length === 1 && x.reasons[0] === "swing"
      ).length < SWINGS
    ) {
      merged.set(m.move, { ...m });
    }
  }
  return Array.from(merged.values()).sort(byScore).slice(0, max);
}

/** Both positions of each moment, most important moment first, each position once. */
export function positionsToRecheck(
  moments: readonly FlaggedMoment[]
): number[] {
  const order: number[] = [];
  for (const m of moments) {
    for (const idx of [m.move, m.move + 1])
      if (!order.includes(idx)) order.push(idx);
  }
  return order;
}

export interface RecheckEngine {
  /** e.g. "stockfish_17_lite". */
  name: string;
  /**
   * Search `fen` towards `depth`, giving up after `capMs`. Resolves with the
   * deepest evaluation reached (its lines' `depth` says how deep), or null.
   */
  evaluate(
    fen: string,
    depth: number,
    capMs: number
  ): Promise<PositionEval | null>;
}

export interface RecheckArgs {
  /** fens[i] is the position after i half-moves. */
  fens: readonly string[];
  moments: readonly FlaggedMoment[];
  engine: RecheckEngine;
  /** Target depth (default 20). */
  depth?: number;
  /** Whole pass-2 budget. */
  budgetMs: number;
  /** Cap per position (default: the budget split evenly, at most 8 s). */
  perPositionMs?: number;
  now?: () => number;
}

/** Below this, a position is not started: it could not reach depth 20 anyway. */
const MIN_SLICE_MS = 400;

export async function runDeepRecheck(
  args: RecheckArgs
): Promise<GameEvalRecheck> {
  const now = args.now ?? Date.now;
  const depth = args.depth ?? 20;
  const order = positionsToRecheck(args.moments);
  const perPosition =
    args.perPositionMs ??
    Math.min(
      8_000,
      Math.max(
        MIN_SLICE_MS,
        Math.floor(args.budgetMs / Math.max(1, order.length)) * 2
      )
    );
  const start = now();
  const deadline = start + args.budgetMs;
  const positions: GameEvalRecheck["positions"] = {};
  const skipped: number[] = [];
  for (const idx of order) {
    const left = deadline - now();
    const fen = args.fens[idx];
    if (!fen || left < MIN_SLICE_MS) {
      skipped.push(idx);
      continue;
    }
    let result: PositionEval | null = null;
    try {
      result = await args.engine.evaluate(
        fen,
        depth,
        Math.min(perPosition, left)
      );
    } catch {
      result = null;
    }
    const top = result?.lines?.[0];
    if (
      result &&
      top &&
      top.depth >= depth &&
      (typeof top.cp === "number" || typeof top.mate === "number")
    ) {
      positions[String(idx)] = {
        lines: result.lines,
        ...(result.bestMove ? { bestMove: result.bestMove } : {}),
      };
    } else {
      skipped.push(idx);
    }
  }
  return {
    engine: args.engine.name,
    depth,
    positions,
    skipped,
    moments: args.moments.map((m) => m.move),
    budgetMs: args.budgetMs,
    elapsedMs: now() - start,
  };
}

/**
 * The deeper pair for move `move`, when BOTH of its positions reached the
 * re-check depth; otherwise null and the move keeps its pass-1 pair. Never
 * returns a pair that mixes depths.
 */
export function recheckedPair(
  recheck: GameEvalRecheck | null | undefined,
  move: number
): {
  before: { lines: LineEval[]; bestMove?: string };
  after: { lines: LineEval[]; bestMove?: string };
} | null {
  if (!recheck || typeof recheck !== "object" || !recheck.positions)
    return null;
  const before = recheck.positions[String(move)];
  const after = recheck.positions[String(move + 1)];
  const depthOf = (p: { lines: LineEval[] } | undefined) =>
    p && Array.isArray(p.lines) && typeof p.lines[0]?.depth === "number"
      ? p.lines[0].depth
      : null;
  const a = depthOf(before);
  const b = depthOf(after);
  // Both at the re-check depth, and the SAME depth: the server's mixed-depth
  // guard would otherwise drop the move instead of falling back to pass 1.
  if (a === null || b === null || a < recheck.depth || a !== b) return null;
  return { before: before!, after: after! };
}
