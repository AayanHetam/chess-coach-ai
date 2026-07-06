// Current-position fact block for the fast (Haiku) follow-up path.
//
// WHY: `buildCompactGameContext` feeds the follow-up tier the PGN move list +
// eval summary but NO board. The fast model then has to mentally replay the PGN
// to know where the pieces are — which it botches, producing confident factual
// misreads (wrong piece/square, invented tactics). A 2x2 measurement
// (scripts/eval/factual_error_eval.py) found ungrounded Haiku at 2.8/5 factual
// accuracy vs Sonnet's 4.0; injecting explicit position facts lifted Haiku +1.5
// to 4.3 (full flagship parity). See MASTERMIND_CONTEXT/POSITION_FACT_GROUNDING_
// PLAN.md. This emits exactly those facts: FEN, piece map, side-to-move + last
// move, current eval — so the model reads the board instead of reconstructing it.

import { Chess } from "chess.js";

interface GameEvalLike {
  positions?: Array<{ lines?: Array<{ cp?: number | null; mate?: number | null }> }>;
}

const PIECE_LETTER: Record<string, string> = {
  p: "P", n: "N", b: "B", r: "R", q: "Q", k: "K",
};

function formatCp(cp: number, mate?: number | null): string {
  if (mate !== undefined && mate !== null) return `M${mate > 0 ? "+" : ""}${mate}`;
  if (Math.abs(cp) >= 9000) return cp > 0 ? "M+" : "M-";
  return `${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(2)}`;
}

/**
 * Build the CURRENT POSITION fact block from a SAN move history (+ optional
 * gameEval for the current eval). Returns "" when there are no moves yet.
 * Pure; replays the moves with chess.js and stops at the first illegal move.
 */
/**
 * Board facts for an arbitrary FEN — the /api/chat per-turn variant of
 * buildCurrentPositionFacts. Used when the user has navigated the board and
 * the position under discussion is NOT the analysis-time final position.
 * Returns "" for unparseable FENs (callers fall back to the stored context).
 */
export function buildFenPositionFacts(fen: string): string {
  let game: Chess;
  try {
    game = new Chess(fen);
  } catch {
    return "";
  }

  const white: string[] = [];
  const black: string[] = [];
  for (const row of game.board()) {
    for (const sq of row) {
      if (sq) (sq.color === "w" ? white : black).push(PIECE_LETTER[sq.type] + sq.square);
    }
  }

  const toMove = game.turn() === "w" ? "White" : "Black";

  return (
    "## CURRENTLY VIEWED POSITION (the board the user is looking at RIGHT NOW — " +
    "answer about THIS position; use these exact facts; do NOT reconstruct " +
    "the board from the move list)\n" +
    [
      `FEN: ${game.fen()}`,
      `White pieces: ${white.join(" ")}`,
      `Black pieces: ${black.join(" ")}`,
      `${toMove} to move.`,
    ].join("\n")
  );
}

export function buildCurrentPositionFacts(
  moveHistory: string[] | undefined,
  gameEval?: GameEvalLike,
): string {
  if (!moveHistory || moveHistory.length === 0) return "";

  const game = new Chess();
  let played = 0;
  for (const san of moveHistory) {
    try {
      game.move(san);
      played++;
    } catch {
      break; // partial/invalid history — use what replayed cleanly
    }
  }

  const white: string[] = [];
  const black: string[] = [];
  for (const row of game.board()) {
    for (const sq of row) {
      if (sq) (sq.color === "w" ? white : black).push(PIECE_LETTER[sq.type] + sq.square);
    }
  }

  const toMove = game.turn() === "w" ? "White" : "Black";
  const lastMove = moveHistory[played - 1] ?? moveHistory[moveHistory.length - 1];

  const lines = [
    `FEN: ${game.fen()}`,
    `White pieces: ${white.join(" ")}`,
    `Black pieces: ${black.join(" ")}`,
    `${toMove} to move. Last move played: ${lastMove}.`,
  ];

  const curEval = gameEval?.positions?.[played]?.lines?.[0];
  if (curEval) {
    lines.push(
      `Current eval: ${formatCp(curEval.cp ?? 0, curEval.mate)} (pawns, White's perspective).`,
    );
  }

  return (
    "## CURRENT POSITION (the board you are commenting on — use these exact " +
    "facts; do NOT reconstruct the board from the move list)\n" +
    lines.join("\n")
  );
}
