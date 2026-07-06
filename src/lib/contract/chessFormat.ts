/**
 * Pure chess.js utilities shared by the contract builder, the legacy prompt
 * renderer, and the route (position-only path, buildCompactGameContext,
 * generatePuzzleRecommendations). Function bodies are VERBATIM from
 * buildGameContext's private helpers (moved from route.ts in PR-CI-1
 * commit 1; split out of legacyGameContext.ts in commit 2). No behavior
 * change — the snapshot suite pins their combined output.
 */
import { Chess } from "chess.js";

/**
 * Convert a full PV line (array of UCI moves) to SAN notation by replaying each move.
 */
export function convertPvToSan(fen: string, pvUci: string[]): string[] {
  const result: string[] = [];
  try {
    const g = new Chess(fen);
    for (const uci of pvUci) {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length > 4 ? uci.slice(4) : undefined;
      const moveResult = g.move({ from, to, promotion });
      if (!moveResult) break;
      result.push(moveResult.san);
    }
  } catch {
    // Return what we have so far
  }
  return result;
}

/**
 * Format a SAN PV array as a numbered move list: "14. Qe2 Nxe5 15. Nxe5 d6"
 */
export function formatPvAsMoveList(pvSan: string[], startMoveNum: number, startsAsWhite: boolean): string {
  const parts: string[] = [];
  let moveNum = startMoveNum;
  let isWhite = startsAsWhite;

  for (const san of pvSan) {
    if (isWhite) {
      parts.push(`${moveNum}. ${san}`);
    } else {
      if (parts.length === 0) {
        parts.push(`${moveNum}... ${san}`);
      } else {
        parts.push(san);
      }
      moveNum++;
    }
    isWhite = !isWhite;
  }
  return parts.join(" ");
}

/**
 * Convert a UCI move string (e.g. "e2e4") to SAN notation using chess.js
 */
export function uciToSan(fen: string, uciMove: string): string {
  try {
    const tempGame = new Chess(fen);
    const from = uciMove.slice(0, 2);
    const to = uciMove.slice(2, 4);
    const promotion = uciMove.length > 4 ? uciMove.slice(4) : undefined;
    const result = tempGame.move({ from, to, promotion });
    return result ? result.san : uciMove;
  } catch {
    return uciMove;
  }
}

/**
 * Find the move index where two PV lines first diverge.
 * Returns 0 if they diverge immediately, or pvSan1.length if they're identical.
 */
export function findBranchPoint(pv1: string[], pv2: string[]): number {
  let i = 0;
  while (i < Math.min(pv1.length, pv2.length) && pv1[i] === pv2[i]) i++;
  return i;
}

/**
 * Generate a deterministic one-sentence explanation seed from the full PV.
 * Summarizes which pieces become active, captured, or threatened along the line.
 */
export function buildExplanationSeed(fenBefore: string, pvSan: string[], moveNum: number, isWhiteMove: boolean): string {
  if (pvSan.length === 0) return "";
  try {
    const game = new Chess(fenBefore);
    const captures: string[] = [];
    const checks: string[] = [];
    let lastMoveNum = moveNum;
    let isWhite = isWhiteMove;

    for (const san of pvSan.slice(0, Math.min(pvSan.length, 10))) {
      const moveObj = game.move(san);
      if (!moveObj) break;
      const moveLabel = isWhite ? `${lastMoveNum}.` : `${lastMoveNum}...`;
      if (moveObj.captured) {
        const pieceNames: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen" };
        captures.push(`${moveLabel} ${san} wins the ${pieceNames[moveObj.captured] || moveObj.captured}`);
      }
      if (game.inCheck()) checks.push(`${moveLabel} ${san} gives check`);
      if (!isWhite) lastMoveNum++;
      isWhite = !isWhite;
    }

    const parts: string[] = [];
    if (captures.length > 0) parts.push(captures.slice(0, 2).join(", then "));
    if (checks.length > 0 && !captures.some(c => checks[0].includes(c.split(" ")[1]))) {
      parts.push(checks[0]);
    }
    if (parts.length === 0) return `The line runs ${pvSan.slice(0, 5).join(" ")} — a positional sequence building long-term advantage.`;
    return `The key idea: ${parts.join("; ")}.`;
  } catch {
    return "";
  }
}

/**
 * Describe what changed between two FEN positions in plain language.
 * Reduces LLM hallucination by grounding it in concrete board-state changes.
 */
export function describeMoveChange(fenBefore: string, moveSan: string): string {
  try {
    const g = new Chess(fenBefore);
    const moveObj = g.move(moveSan);
    if (!moveObj) return "";

    const parts: string[] = [];
    const pieceName: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
    const color = moveObj.color === "w" ? "White" : "Black";
    const piece = pieceName[moveObj.piece] || moveObj.piece;

    if (moveObj.flags.includes("k")) {
      parts.push(`${color} castled kingside`);
    } else if (moveObj.flags.includes("q")) {
      parts.push(`${color} castled queenside`);
    } else {
      parts.push(`${color} ${piece} moved from ${moveObj.from} to ${moveObj.to}`);
    }

    if (moveObj.captured) {
      const capturedPiece = pieceName[moveObj.captured] || moveObj.captured;
      parts.push(`capturing ${capturedPiece} on ${moveObj.to}`);
    }

    if (moveObj.promotion) {
      const promoPiece = pieceName[moveObj.promotion] || moveObj.promotion;
      parts.push(`promoted to ${promoPiece}`);
    }

    if (g.isCheck()) {
      parts.push("giving check");
    }

    if (g.isCheckmate()) {
      parts.push("CHECKMATE");
    }

    return parts.join(", ");
  } catch {
    return "";
  }
}

/**
 * Get the FEN at a specific half-move index by replaying moves up to that point.
 */
export function getFenAtHalfMove(moveHistory: string[], halfMoveIdx: number): string {
  const game = new Chess();
  for (let i = 0; i < halfMoveIdx; i++) {
    try { game.move(moveHistory[i]); } catch { break; }
  }
  return game.fen();
}

/**
 * Build a PGN string from move history
 */
export function buildPgnFromMoves(moveHistory: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < moveHistory.length; i++) {
    if (i % 2 === 0) {
      parts.push(`${Math.floor(i / 2) + 1}.`);
    }
    parts.push(moveHistory[i]);
  }
  return parts.join(" ");
}

export function getMaterialBalance(game: Chess): string {
  const pieces = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };
  const board = game.board();
  for (const row of board) {
    for (const square of row) {
      if (square) {
        pieces[square.color][square.type]++;
      }
    }
  }
  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  let whiteScore = 0, blackScore = 0;
  for (const [piece, value] of Object.entries(values)) {
    whiteScore += pieces.w[piece as keyof typeof pieces.w] * value;
    blackScore += pieces.b[piece as keyof typeof pieces.b] * value;
  }
  const diff = whiteScore - blackScore;
  const balance = diff === 0 ? "Equal material" : diff > 0 ? `White +${diff} material` : `Black +${Math.abs(diff)} material`;
  return `Material: ${balance}`;
}

/**
 * Convert a PV of SAN moves to UCI (from, to, promotion concatenated) starting
 * from the given FEN. Returns the array up to the first failure.
 */
export function sanPvToUci(fen: string, sanPv: string[]): string[] {
  const uci: string[] = [];
  const chess = new Chess(fen);
  for (const san of sanPv) {
    const mv = chess.move(san);
    if (!mv) break;
    uci.push(`${mv.from}${mv.to}${mv.promotion ?? ""}`);
  }
  return uci;
}
