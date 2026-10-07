/**
 * Parse a `go … searchmoves a b c` search with MultiPV equal to the number of
 * moves: every asked move owns one PV slot, and the slot is identified by the
 * first move of its PV, never by its number, because MultiPV numbers slots by
 * score and the order changes between depths.
 *
 * Scores come from the engine side-to-move and leave here White-relative,
 * the convention every LineEval uses (see MoveEval in types/eval.ts).
 */
import { Chess } from "chess.js";
import { formatUciPv } from "@/lib/chess";
import type { MoveEval, MovesEval } from "@/types/eval";
import { getResultProperty, sortLines } from "./parseResults";

/** Every legal move at `fen` in the engine's spelling. */
export function legalUciMoves(fen: string): string[] {
  return new Chess(fen)
    .moves({ verbose: true })
    .map((m) => `${m.from}${m.to}${m.promotion ?? ""}`);
}

/**
 * The asked moves as the engine must see them: trimmed, lower case, each
 * legal at `fen`, no duplicates, at most ten (the MultiPV bound). Throws on
 * anything else, before a command is sent.
 */
export function normaliseAskedMoves(
  fen: string,
  moves: readonly string[]
): string[] {
  const legal = new Set(legalUciMoves(fen));
  const out: string[] = [];
  for (const raw of moves) {
    const uci = raw.trim().toLowerCase();
    if (!legal.has(uci))
      throw new Error(`evaluateMoves: ${raw} is not legal at ${fen}`);
    if (!out.includes(uci)) out.push(uci);
  }
  if (out.length < 1) throw new Error("evaluateMoves: no moves to score");
  if (out.length > 10)
    throw new Error(`evaluateMoves: at most 10 moves, got ${out.length}`);
  return out;
}

function sanOf(fen: string, uci: string): string {
  try {
    const game = new Chess(fen);
    const move = game.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    return move ? move.san : uci;
  } catch {
    return uci;
  }
}

export function parseMovesResults(
  results: string[],
  fen: string,
  asked: readonly string[]
): MovesEval {
  const wanted = new Set(asked);
  const bySlotMove = new Map<
    string,
    { cp?: number; mate?: number; depth: number; pv: string[] }
  >();
  let bestMove: string | undefined;

  for (const line of results) {
    if (line.startsWith("bestmove")) {
      const raw = getResultProperty(line, "bestmove");
      if (raw && raw !== "(none)") bestMove = formatUciPv(fen, [raw])[0];
      continue;
    }
    if (!line.startsWith("info")) continue;
    // A bound is a partial result of an aspiration window, not a score.
    if (/\b(?:lowerbound|upperbound)\b/.test(line)) continue;
    const depthRaw = getResultProperty(line, "depth");
    const parts = line.split(" ");
    const pvIndex = parts.indexOf("pv");
    if (!depthRaw || pvIndex < 0 || pvIndex + 1 >= parts.length) continue;
    const pv = formatUciPv(fen, parts.slice(pvIndex + 1));
    const first = pv[0];
    if (!wanted.has(first)) continue;
    const depth = parseInt(depthRaw, 10);
    const existing = bySlotMove.get(first);
    if (existing && depth < existing.depth) continue;
    const cp = getResultProperty(line, "cp");
    const mate = getResultProperty(line, "mate");
    bySlotMove.set(first, {
      pv,
      cp: cp !== undefined ? parseInt(cp, 10) : undefined,
      mate: mate !== undefined ? parseInt(mate, 10) : undefined,
      depth,
    });
  }

  // Order by the mover's preference while the scores are still side-to-move.
  const ordered = Array.from(bySlotMove.entries())
    .map(([uci, line]) => ({ uci, ...line, multiPv: 0 }))
    .sort(sortLines);

  const whiteToPlay = fen.split(" ")[1] === "w";
  const moves: MoveEval[] = ordered.map((line) => ({
    uci: line.uci,
    san: sanOf(fen, line.uci),
    cp: line.cp === undefined ? undefined : whiteToPlay ? line.cp : -line.cp,
    mate:
      line.mate === undefined
        ? undefined
        : whiteToPlay
          ? line.mate
          : -line.mate,
    depth: line.depth,
    pv: line.pv,
  }));

  return {
    fen,
    depth: moves.length > 0 ? Math.min(...moves.map((m) => m.depth)) : 0,
    moves,
    missing: asked.filter((uci) => !bySlotMove.has(uci)),
    bestMove,
    source: "local",
    cold: true,
  };
}
