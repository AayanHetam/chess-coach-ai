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
  positions?: Array<{
    lines?: Array<{ cp?: number | null; mate?: number | null; depth?: number }>;
  }>;
}

/**
 * C1 (SILENT_SUBSTITUTION_HANDOFF §3 Group C): is this line a real evaluation?
 *
 * The client Stockfish emits `{pv: [], depth: 0, multiPv: 1, cp: 0}` when it
 * blows its per-position budget. That is a "no answer" marker shaped exactly
 * like a real "dead equal" eval, and the old `if (curEval)` guard passed it
 * straight through — so a position that is actually +6.20 was presented to the
 * model as balanced, and "am I winning?" got answered "it's level".
 *
 * Note this keys on `depth === 0` and on absence, NOT on the value being zero:
 * a genuine 0.00 at real depth is a legitimate, useful fact.
 */
function isRealEval(
  line: { cp?: number | null; mate?: number | null; depth?: number } | undefined,
): boolean {
  if (!line) return false;
  if (line.depth === 0) return false; // client timeout sentinel
  // `cp ?? 0` used to render a line carrying neither field as a confident +0.00.
  const hasCp = line.cp !== undefined && line.cp !== null;
  const hasMate = line.mate !== undefined && line.mate !== null;
  return hasCp || hasMate;
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
  // E3 (SILENT_SUBSTITUTION_HANDOFF §3 Group E): this was
  //   moveHistory[played - 1] ?? moveHistory[moveHistory.length - 1]
  // When the FIRST move fails to replay, `played === 0`, `moveHistory[-1]` is
  // undefined, and the `??` fell back to the LAST move of the game — handing
  // the model a STARTING-POSITION piece map captioned "Last move played:
  // Qxh7#", a mate that is nowhere on the board it is looking at. There is no
  // sensible fallback here: if nothing replayed, no move was played.
  const lastMove = played > 0 ? moveHistory[played - 1] : null;

  const lines = [
    `FEN: ${game.fen()}`,
    `White pieces: ${white.join(" ")}`,
    `Black pieces: ${black.join(" ")}`,
    lastMove
      ? `${toMove} to move. Last move played: ${lastMove}.`
      : `${toMove} to move.`,
  ];

  // E3: the deep path already warns on truncation ("analysis covers the first
  // N moves… Do NOT comment on moves after this point"); this path used to
  // just `break` silently, so the model saw a board covering fewer moves than
  // the game with nothing saying so.
  if (played < moveHistory.length) {
    lines.push(
      `NOTE: this position covers the first ${played} half-move${played === 1 ? "" : "s"} only — ` +
        `the remaining ${moveHistory.length - played} could not be replayed. ` +
        `Do NOT comment on moves after this point.`,
    );
  }

  const curEval = gameEval?.positions?.[played]?.lines?.[0];
  // Omit the line entirely rather than fabricate a number. This is the last
  // line of the FIRST block in every follow-up context, so a wrong value here
  // is the most prominent number in the whole prompt (C1).
  if (isRealEval(curEval)) {
    lines.push(
      `Current eval: ${formatCp(curEval!.cp ?? 0, curEval!.mate)} (pawns, White's perspective).`,
    );
  }

  // B2 (SILENT_SUBSTITUTION_HANDOFF §3 Group B): this block is built by
  // replaying the WHOLE game, so it is the FINAL position — and it is baked
  // into the cached compact context and re-sent verbatim on every follow-up.
  // It used to be headed "CURRENT POSITION (the board you are commenting on)",
  // which was already misleading and became actively harmful once B1 started
  // forwarding the viewed board: the per-turn "CURRENTLY VIEWED POSITION"
  // block would sit next to this one, both claiming to be the board in
  // question, describing different positions, with this one asserting equal
  // or greater authority. Fixing B1 alone would have looked like a fix and
  // left the bug live — which is why B1/B2/B3 ship together.
  return (
    "## FINAL POSITION (the position at the END of the game — use these exact " +
    "facts; do NOT reconstruct the board from the move list). If a " +
    "CURRENTLY VIEWED POSITION block is also present, THAT is the board the " +
    "user is looking at and the one to answer about; this block is only the " +
    "game's final state.\n" +
    lines.join("\n")
  );
}
