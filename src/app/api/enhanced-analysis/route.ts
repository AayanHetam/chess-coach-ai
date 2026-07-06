import { NextRequest, NextResponse } from "next/server";
import { Chess } from "chess.js";
import { validateAIResponse } from "@/lib/aiResponseValidator";
import { annotatePosition, annotationToPromptContext } from "@/lib/positionAnnotator";
import { selectExamples, formatExamplesForPrompt } from "@/data/goldStandardExamples";
import { generateCacheKey, getCachedResponse, setCachedResponse } from "@/lib/responseCache";
import { recordLLMCall } from "@/lib/llmStatsAggregator";
import {
  generateContextId,
  storeAnalysisContext,
} from "@/lib/analysisContextCache";
import { enhancedAnalysisSchema, validateRequest } from "@/lib/validation/schemas";
import {
  logger,
  logErrorToSentry,
  withRequestContext,
  extractRequestId,
} from "@/lib/logging";
import { callLLM, callLLMStream, LLMError } from "@/lib/llmProvider";
import {
  getCoachChatSystemPromptParts,
  PROMPT_VERSION,
} from "@/lib/prompts/coachChatPrompt";
import { getReinforcements } from "@/lib/concept/conceptRetrieval";
import { detectConcepts } from "@/lib/concept/conceptDetector";
import { getConcept } from "@/lib/concept/conceptTaxonomy";
import { requireSession } from "@/lib/auth/session";
import { gateFeature } from "@/lib/billing/gate";
import { getUserById } from "@/lib/server/users";
// ── Stage B (PR 1.C) Mastermind validator pipeline imports ──────────
// All flag-gated by getMastermindEnv().validatorsEnabled. When false, none
// of these symbols execute. See PR_1C_STAGE_B_PLAN.md §3.7 for the audit
// and §3.7.9 for insertion-point rationale.
import { getMastermindEnv } from "@/env";
import {
  runValidationPipeline,
  countScoutOpportunities,
  countUserHistoryOpportunities,
  POSITION_ANCHORED_VALIDATOR_CATEGORIES,
  type VoterSnapshot,
} from "@/lib/mastermind/validators";
import { fetchDataSources, type FetchedDataSources } from "@/lib/mastermind/wireValidators";
import { computeCitationRate } from "@/lib/mastermind/citationRate";
import {
  forwardTelemetry,
  type RouteContext,
} from "@/lib/mastermind/validatorTelemetry";
import {
  withPipelineTimeout,
  readPipelineTimeoutMs,
  readMaxRetries,
  resolveOverclaimRetries,
  type PipelineResultWithTimeout,
} from "@/lib/mastermind/pipelineTimeout";
import {
  prepareMastermindContext,
  forwardPipelineTelemetryForRoute,
  type MastermindPrepResult,
} from "@/lib/mastermind/routeHelpers";
import { buildCurrentPositionFacts } from "@/lib/mastermind/positionFacts";
import { detectMotifs, motifsToPropmt } from "@/lib/tactics";
import type { AnyMotif } from "@/lib/tactics";
import { fetch_lichess_tablebase } from "@/lib/mastermind/lichessTablebase";
import { validateMotifGrounding } from "@/lib/mastermind/validators/motifGrounding";
import { runStreamingStage9Validators } from "@/lib/mastermind/validators/streamingStage9";
import { correctStreamedAnalysis } from "@/lib/mastermind/validators/streamCorrection";
import type { ValidatorIssue } from "@/lib/mastermind/validators/types";
import { queryChessdb } from "@/lib/grounding/chessdb";
import { compileVoterResult } from "@/lib/grounding/voter";
import { buildAsyncSnapshotForMove } from "@/lib/grounding/voterSnapshot";
import { queryLc0, shouldCallLc0 } from "@/lib/grounding/lc0";
import { queryMaiaAtRating, shouldCallMaia } from "@/lib/grounding/maia";
import { buildRelationalFacts } from "@/lib/relational/relationalFactsBuilder";
// Phase-2 GROUNDED TEACHING SPINE (principle 8): pure-synchronous chess.js
// helpers (no async/engine) — safe to call inside buildGameContext's top3 loop.
import { compute_feature_delta } from "@/lib/mastermind/featureDelta";
import { buildThreatTree } from "@/lib/mastermind/threatTree";

const log = logger.child({ module: "enhanced-analysis" });

// ─────────────────────────────────────────────────────────────────────
// Stage B Mastermind helpers live in src/lib/mastermind/routeHelpers.ts
// (extracted in 1.C.B.5 so /api/chat can reuse). This file consumes them
// via the imports above. The route still owns request-shape mapping —
// which inputs become moveHistory / fen / gameEval / opponentUsername.
// ─────────────────────────────────────────────────────────────────────

interface PositionEvalInput {
  bestMove?: string;
  moveClassification?: string;
  opening?: string;
  lines: Array<{
    pv: string[];
    cp?: number;
    mate?: number;
    depth: number;
    multiPv: number;
  }>;
}

interface GameEvalInput {
  positions: PositionEvalInput[];
  accuracy?: { white: number; black: number };
  estimatedElo?: { white: number; black: number };
  settings?: { engine: string; depth: number; multiPv: number; date: string };
}

/**
 * Convert a full PV line (array of UCI moves) to SAN notation by replaying each move.
 */
function convertPvToSan(fen: string, pvUci: string[]): string[] {
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
function formatPvAsMoveList(pvSan: string[], startMoveNum: number, startsAsWhite: boolean): string {
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
function uciToSan(fen: string, uciMove: string): string {
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
 * Algorithmically detect tactical motifs from a move and its engine PV.
 * Returns verified string tags — so GPT explains a known motif rather than guessing.
 */
function detectTacticalMotifs(fenBefore: string, moveSan: string, pvSan: string[]): string[] {
  const motifs: string[] = [];
  const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const pieceNames: Record<string, string> = { p: "Pawn", n: "Knight", b: "Bishop", r: "Rook", q: "Queen", k: "King" };

  try {
    const gameBefore = new Chess(fenBefore);
    const moveObj = gameBefore.move(moveSan);
    if (!moveObj) return motifs;

    const gameAfter = new Chess(gameBefore.fen());
    const ourColor = moveObj.color;
    const opponentColor = ourColor === "w" ? "b" : "w";

    // 1. Sacrifice — moving piece is worth more than captured piece
    if (moveObj.captured) {
      const movingVal = pieceValues[moveObj.piece] ?? 0;
      const capturedVal = pieceValues[moveObj.captured] ?? 0;
      if (movingVal > capturedVal) {
        motifs.push(`SACRIFICE (${pieceNames[moveObj.piece]} for ${pieceNames[moveObj.captured]})`);
      }
    }

    // 2. Check — detect if it's a discovered check by checking if the moved piece itself attacks the king
    if (gameAfter.inCheck()) {
      const kingSquare = gameAfter.board().flat().find(sq => sq && sq.type === "k" && sq.color === opponentColor)?.square;
      let isDiscovered = false;
      if (kingSquare) {
        try {
          // Swap turn in FEN so we can query our piece's moves from its landing square
          const fenParts = gameAfter.fen().split(" ");
          fenParts[1] = ourColor;
          const tempGame = new Chess(fenParts.join(" "));
          const canReachKing = tempGame.moves({ square: moveObj.to as any, verbose: true } as any)
            .some((m: any) => m.to === kingSquare);
          isDiscovered = !canReachKing;
        } catch { /* fallback to plain CHECK */ }
      }
      motifs.push(isDiscovered ? "DISCOVERED CHECK" : "CHECK");
    }

    // 3. Fork / Double Attack — 2+ opponent pieces attacked after the move
    const opponentPieces: string[] = [];
    for (const row of gameAfter.board()) {
      for (const sq of row) {
        if (sq && sq.color === opponentColor && sq.type !== "k") {
          opponentPieces.push(sq.square);
        }
      }
    }
    const attackedOpponentPieces = opponentPieces.filter(sq => gameAfter.isAttacked(sq as any, ourColor));
    if (attackedOpponentPieces.length >= 2) {
      motifs.push(`FORK / DOUBLE ATTACK (${attackedOpponentPieces.length} pieces under threat)`);
    }

    // 4. Promotion threat in PV
    if (pvSan.some(san => san.includes("=Q") || san.includes("=R"))) {
      motifs.push("PROMOTION THREAT");
    }

    // 5. Forced line — opponent has very few responses after first PV move
    if (pvSan.length >= 2) {
      const gameAfterFirst = new Chess(gameAfter.fen());
      const opponentMoves = gameAfterFirst.moves().length;
      if (opponentMoves <= 3) {
        motifs.push(`FORCED LINE (opponent has ${opponentMoves} response${opponentMoves === 1 ? "" : "s"})`);
      }
    }

    // 6. Quiet move — no capture, no check, but high eval gain (often the hardest to explain)
    if (!moveObj.captured && !gameAfter.inCheck() && motifs.length === 0) {
      motifs.push("QUIET MOVE (positional — requires deep calculation to validate)");
    }
  } catch {
    // Non-critical — return what we have
  }

  return motifs;
}

/**
 * Find the move index where two PV lines first diverge.
 * Returns 0 if they diverge immediately, or pvSan1.length if they're identical.
 */
function findBranchPoint(pv1: string[], pv2: string[]): number {
  let i = 0;
  while (i < Math.min(pv1.length, pv2.length) && pv1[i] === pv2[i]) i++;
  return i;
}

/**
 * Compute the candidate ranking gap between the best and second-best line.
 * A large gap signals a critical junction where the best move is uniquely powerful.
 */
function computeCandidateGap(lines: PositionEvalInput["lines"]): string {
  if (lines.length < 2) return "Only one candidate line available.";
  const line1 = lines[0];
  const line2 = lines[1];
  const eval1 = line1.mate !== undefined ? (line1.mate > 0 ? 9999 : -9999) : (line1.cp ?? 0);
  const eval2 = line2.mate !== undefined ? (line2.mate > 0 ? 9999 : -9999) : (line2.cp ?? 0);
  const gap = Math.abs(eval1 - eval2);
  const gapStr = (gap / 100).toFixed(2);
  const severity = gap >= 300 ? "CRITICAL JUNCTION" : gap >= 100 ? "IMPORTANT CHOICE" : "CLOSE ALTERNATIVES";
  return `${severity} — gap between #1 and #2 candidate: ${gapStr} pawns`;
}

/**
 * Generate a deterministic one-sentence explanation seed from the full PV.
 * Summarizes which pieces become active, captured, or threatened along the line.
 */
function buildExplanationSeed(fenBefore: string, pvSan: string[], moveNum: number, isWhiteMove: boolean): string {
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
function describeMoveChange(fenBefore: string, moveSan: string): string {
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
 * Optional PGN-header metadata threaded from the client. Mirrors the chess.js
 * `game.header()` shape but typed loose since users import games from
 * everywhere (lichess, chess.com, raw pastes) and the headers vary.
 */
type GameHeadersInput = {
  white?: string;
  black?: string;
  whiteElo?: string;
  blackElo?: string;
  event?: string;
  date?: string;
  result?: string;
  eco?: string;
  opening?: string;
  timeControl?: string;
};

/**
 * Phase-2 GROUNDED TEACHING SPINE (principle 8). For a single critical
 * position, render the top 1-2 non-empty concept-DELTAS the move changed plus
 * the enumerated opponent checks/captures/threats, so the LLM's "why" is
 * anchored to verified facts rather than synthesized. Pure-synchronous
 * (chess.js only). Returns "" when there is nothing grounded to say — callers
 * append nothing in that case. Callers wrap this in try/catch: both helpers
 * call `new Chess(fen)` and can throw InvalidFenError on edge FENs.
 *
 * Deliberately terse: emit only the dominant deltas + ≤3 threats, never the
 * full PositionFeatureDelta/ThreatNode trees (token-bloat / latency guard).
 */
function buildTeachingSpine(
  fenBefore: string,
  fenAfter: string,
  bestPvUci: string[]
): string {
  const lines: string[] = [];

  // --- Concept DELTA: what the move actually changed ---
  const delta = compute_feature_delta(fenBefore, fenAfter, { pv: bestPvUci });
  if (!delta.isEmptyDelta) {
    const deltaBits: string[] = [];

    // Material swing (the most teachable single fact).
    const matW = delta.materialDelta.white;
    const matB = delta.materialDelta.black;
    if (matW !== 0 || matB !== 0) {
      const net = matB - matW; // >0 means Black gained relative to White
      const side = net > 0 ? "Black" : "White";
      deltaBits.push(
        `material swung ~${Math.abs(net)} point(s) toward ${side}`
      );
    }

    // Pieces left hanging by the move (board-vision failures).
    const hung = delta.hangingPiecesDelta.newlyHanging;
    if (hung.length) {
      deltaBits.push(
        `now hanging: ${hung
          .slice(0, 2)
          .map((h) => `${h.color} ${h.piece} on ${h.square}`)
          .join(", ")}`
      );
    }

    // New threats the move conceded.
    const newThreats = delta.threatsDelta.newThreats;
    if (newThreats.length) {
      deltaBits.push(
        `new threat(s): ${newThreats
          .slice(0, 2)
          .map((t) => t.description)
          .join("; ")}`
      );
    }

    // King-safety degradation.
    const ksW = delta.kingSafetyDelta.white;
    const ksB = delta.kingSafetyDelta.black;
    if (ksW < 0 || ksB < 0) {
      const worse = ksW < ksB ? "White" : "Black";
      deltaBits.push(`${worse}'s king safety dropped`);
    }

    // A piece the move trapped.
    const trapped = delta.pieceActivityDelta.newlyTrapped;
    if (trapped.length) {
      deltaBits.push(
        `newly trapped: ${trapped
          .slice(0, 1)
          .map((p) => `${p.color} ${p.piece} on ${p.square}`)
          .join(", ")}`
      );
    }

    // Top 1-2 dominant sub-deltas only — do not dump everything.
    if (deltaBits.length) {
      lines.push(`CONCEPT DELTA (what the move changed): ${deltaBits.slice(0, 2).join(" | ")}`);
    }
  }

  // --- Opponent threats to COUNT (principle 6, 800-1200 band; principle 8) ---
  const threats = buildThreatTree(fenBefore, 2);
  if (threats.length) {
    const threatBits = threats.slice(0, 3).map((t) => {
      const tag = t.isMate ? "MATE" : t.isCheck ? "check" : `wins ~${Math.round(t.approxMaterialGainCp / 100)}p`;
      return `${t.threatSan} (${tag})`;
    });
    lines.push(`OPPONENT THREATS TO COUNT: ${threatBits.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Build a rich move-by-move game context string from the move history + Stockfish evals.
 * This gives the LLM everything it needs to analyze the game.
 */
async function buildGameContext(
  moveHistory: string[],
  gameEval: GameEvalInput | undefined,
  playerColor: string,
  username?: string,
  userRating?: number,
  gameHeaders?: GameHeadersInput
): Promise<string> {
  const sections: string[] = [];

  // --- Game overview ---
  const totalHalfMoves = moveHistory.length;
  const totalFullMoves = Math.ceil(totalHalfMoves / 2);
  const game = new Chess();
  let replayedPlies = 0;
  for (const m of moveHistory) {
    try { game.move(m); replayedPlies++; } catch { break; }
  }
  // If a SAN failed to replay, `game` (and every FEN/eval derived from it
  // below) reflects only the moves BEFORE the break — silently analyzing the
  // wrong "final" position. Tell the model where the record stops instead of
  // letting it narrate a truncated board as complete (audit §3.6).
  const historyTruncated = replayedPlies < totalHalfMoves;

  let overview = `## GAME OVERVIEW\n`;
  if (historyTruncated) {
    overview += `- ⚠️ NOTE: the move record could not be fully replayed — analysis covers the first ${Math.ceil(replayedPlies / 2)} moves (ply ${replayedPlies} of ${totalHalfMoves}). Do NOT comment on moves after this point or describe this as the final position of a completed game.\n`;
  }
  overview += `- Total moves: ${totalFullMoves} full moves (${totalHalfMoves} half-moves)\n`;
  overview += `- Result: ${game.isCheckmate() ? "Checkmate" : game.isStalemate() ? "Stalemate" : game.isDraw() ? "Draw" : "In progress"}\n`;
  if (username) overview += `- Player: ${username} playing as ${playerColor === "w" ? "White" : "Black"}\n`;
  if (userRating) overview += `- Player rating: ${userRating}\n`;
  if (gameEval?.accuracy) overview += `- Accuracy: White ${gameEval.accuracy.white.toFixed(1)}%, Black ${gameEval.accuracy.black.toFixed(1)}%\n`;
  if (gameEval?.estimatedElo) overview += `- Estimated Elo: White ~${gameEval.estimatedElo.white}, Black ~${gameEval.estimatedElo.black}\n`;
  // PGN headers — only emit lines for fields actually present. Chess.com /
  // lichess imports populate most of these; raw FEN-loaded games populate
  // none. The coach uses them to ground references like "your opponent's
  // rapid rating" or "this Najdorf was played in last year's Tata Steel".
  if (gameHeaders) {
    const h = gameHeaders;
    if (h.white) overview += `- White: ${h.white}${h.whiteElo ? ` (${h.whiteElo})` : ""}\n`;
    if (h.black) overview += `- Black: ${h.black}${h.blackElo ? ` (${h.blackElo})` : ""}\n`;
    if (h.event) overview += `- Event: ${h.event}\n`;
    if (h.date) overview += `- Date: ${h.date}\n`;
    if (h.timeControl) overview += `- Time control: ${h.timeControl}\n`;
    if (h.opening || h.eco) {
      const parts = [h.opening, h.eco ? `ECO ${h.eco}` : null].filter(Boolean);
      overview += `- Opening: ${parts.join(", ")}\n`;
    }
    if (h.result && h.result !== "*") overview += `- PGN result tag: ${h.result}\n`;
  }
  sections.push(overview);

  // --- PGN ---
  const pgn = buildPgnFromMoves(moveHistory);
  sections.push(`## PGN\n${pgn}`);

  // --- Move-by-move with Stockfish evaluations ---
  if (gameEval?.positions && gameEval.positions.length > 0) {
    const moveLines: string[] = [];
    // Position[0] is the starting position (before any moves)
    // Position[i] is the position AFTER half-move i was played
    // So position[0] = start, position[1] = after move 1 white, position[2] = after move 1 black, etc.

    const mistakes: Array<{
      halfMoveIdx: number;
      moveNum: number;
      color: string;
      moveSan: string;
      evalBefore: number;
      evalAfter: number;
      drop: number;
      bestMove: string;
      classification?: string;
      fenBefore: string;
      fenAfter: string;
    }> = [];

    for (let i = 0; i < moveHistory.length; i++) {
      const moveSan = moveHistory[i];
      const moveNum = Math.floor(i / 2) + 1;
      const color = i % 2 === 0 ? "White" : "Black";
      const moveLabel = i % 2 === 0 ? `${moveNum}.` : `${moveNum}...`;

      // Compute FEN before and after this move
      const fenBefore = getFenAtHalfMove(moveHistory, i);
      const fenAfter = getFenAtHalfMove(moveHistory, i + 1);
      const moveDescription = describeMoveChange(fenBefore, moveSan);

      // Eval BEFORE this move = positions[i], eval AFTER = positions[i+1]
      const evalBefore = gameEval.positions[i];
      const evalAfter = gameEval.positions[i + 1];

      let line = `${moveLabel} ${moveSan} (${color})`;

      // Plain-language description of what changed
      if (moveDescription) {
        line += ` | ${moveDescription}`;
      }

      // Before/after FEN for grounding
      line += `\n    FEN before: ${fenBefore}`;
      line += `\n    FEN after:  ${fenAfter}`;

      // Classification
      const classification = evalAfter?.moveClassification;
      if (classification) {
        line += `\n    Classification: ${classification.toUpperCase()}`;
      }

      // Evaluation after
      if (evalAfter?.lines?.[0]) {
        const topLine = evalAfter.lines[0];
        if (topLine.depth === 0) {
          // Client-side timeout sentinel ({cp: 0, depth: 0}) — NOT a real 0.00.
          // Narrating it as an eval fabricates a massive swing in decided games.
          line += `\n    Eval: engine data unavailable for this move (analysis timed out)`;
        } else if (topLine.mate !== undefined) {
          line += `\n    Eval: M${topLine.mate > 0 ? "+" : ""}${topLine.mate}`;
        } else if (topLine.cp !== undefined) {
          const pawns = (topLine.cp / 100).toFixed(2);
          line += `\n    Eval: ${topLine.cp >= 0 ? "+" : ""}${pawns}`;
        }
      }

      // Best move from the position BEFORE this move was played — with full engine line
      if (evalBefore?.bestMove && evalBefore.bestMove !== "N/A") {
        const bestSan = uciToSan(fenBefore, evalBefore.bestMove);
        if (bestSan !== moveSan) {
          const bestLine = evalBefore.lines?.[0];
          if (bestLine?.pv && bestLine.pv.length > 0) {
            const pvSan = convertPvToSan(fenBefore, bestLine.pv);
            const pvEvalStr = bestLine.mate !== undefined
              ? `M${bestLine.mate > 0 ? "+" : ""}${bestLine.mate}`
              : bestLine.cp !== undefined ? `${bestLine.cp >= 0 ? "+" : ""}${(bestLine.cp / 100).toFixed(2)}` : "";
            const fullPvLine = formatPvAsMoveList(pvSan, moveNum, i % 2 === 0);
            line += `\n    Best was: ${bestSan} (${pvEvalStr}, depth ${bestLine.depth}) — Engine line: ${fullPvLine}`;
          } else {
            line += `\n    Best was: ${bestSan}`;
          }
        }
      }

      moveLines.push(line);

      // Detect mistakes (evaluation drops)
      // Skip positions carrying the client timeout sentinel ({cp: 0, depth: 0})
      // — comparing a real eval against a fabricated 0.00 manufactures a fake
      // "blunder" (or hides a real one) in the TOP MISTAKES the coach narrates.
      const beforeIsSentinel = evalBefore?.lines?.[0]?.depth === 0;
      const afterIsSentinel = evalAfter?.lines?.[0]?.depth === 0;
      if (evalBefore?.lines?.[0] && evalAfter?.lines?.[0] && !beforeIsSentinel && !afterIsSentinel) {
        const cpBefore = evalBefore.lines[0].mate !== undefined
          ? (evalBefore.lines[0].mate! > 0 ? 9999 : -9999)
          : (evalBefore.lines[0].cp ?? 0);
        const cpAfter = evalAfter.lines[0].mate !== undefined
          ? (evalAfter.lines[0].mate! > 0 ? 9999 : -9999)
          : (evalAfter.lines[0].cp ?? 0);

        // Calculate eval drop from the player's perspective
        // Positive cp = good for White. For White moves, a drop is cpAfter < cpBefore. For Black, it's cpAfter > cpBefore.
        let drop = 0;
        if (i % 2 === 0) {
          // White's move — a drop for White means cpAfter < cpBefore
          drop = cpBefore - cpAfter;
        } else {
          // Black's move — a drop for Black means cpAfter > cpBefore (position got better for White = worse for Black)
          drop = cpAfter - cpBefore;
        }

        if (drop > 50) { // More than 0.5 pawn drop
          const bestSan = evalBefore.bestMove
            ? uciToSan(fenBefore, evalBefore.bestMove)
            : "N/A";

          mistakes.push({
            halfMoveIdx: i,
            moveNum,
            color,
            moveSan,
            evalBefore: cpBefore,
            evalAfter: cpAfter,
            drop,
            bestMove: bestSan,
            classification: classification || undefined,
            fenBefore,
            fenAfter,
          });
        }
      }
    }

    sections.push(`## MOVE-BY-MOVE ANALYSIS (with Stockfish evaluations)\nAll evals are in pawns from White's perspective (positive = better for White); M+n / M-n = forced mate for White / Black.\n${moveLines.join("\n")}`);

    // --- Top mistakes with full PV lines and candidate moves ---
    // System prompt says ONLY analyse the player's mistakes. The mistakes
    // array contains both colors, so filter to the user's color before
    // ranking. Without this filter, opponent blunders leak into TOP
    // MISTAKES and contradict the player-perspective rule.
    const userColorName = playerColor === "w" ? "White" : "Black";
    const userMistakes = mistakes.filter((m) => m.color === userColorName);
    if (userMistakes.length > 0) {
      userMistakes.sort((a, b) => b.drop - a.drop);
      const topMistakes = userMistakes.slice(0, 10);

      // Stage 6: pre-fetch chessdb results for all top mistakes in parallel
      // Stage 7: pre-fetch Lc0 results in parallel (only when trigger fires)
      // Stage 8: pre-fetch Maia per-rating visibility (only when userRating present)
      const [mistakeChessdbResults, mistakeLc0Results, mistakeMaiaResults] = await Promise.all([
        // Voter at compileVoterResult() below combines chessdb with motifs from
        // m.fenBefore + stockfish eval from evalBefore. Query chessdb on the
        // same pre-mistake FEN so all signals describe the same position.
        Promise.all(topMistakes.map((m) => queryChessdb(m.fenBefore).catch(() => null))),
        Promise.all(topMistakes.map((m) => {
          const evalBefore = gameEval!.positions[m.halfMoveIdx];
          const sfCp = evalBefore?.lines?.[0]?.cp ?? null;
          return shouldCallLc0(sfCp, evalBefore?.lines ?? [])
            ? queryLc0(m.fenBefore).catch(() => null)
            : Promise.resolve(null);
        })),
        Promise.all(topMistakes.map((m) => {
          const evalBefore = gameEval!.positions[m.halfMoveIdx];
          const bestUci = evalBefore?.lines?.[0]?.pv?.[0] ?? null;
          return shouldCallMaia(userRating, bestUci)
            ? queryMaiaAtRating(m.fenBefore, userRating!, bestUci!).catch(() => null)
            : Promise.resolve(null);
        })),
      ]);

      const mistakeLines = topMistakes.map((m, mi) => {
        const severity = m.drop >= 300 ? "BLUNDER" : m.drop >= 150 ? "MISTAKE" : m.drop >= 50 ? "INACCURACY" : "MINOR";
        const evalBeforeStr = Math.abs(m.evalBefore) >= 9000 ? (m.evalBefore > 0 ? "M+" : "M-") : (m.evalBefore / 100).toFixed(2);
        const evalAfterStr = Math.abs(m.evalAfter) >= 9000 ? (m.evalAfter > 0 ? "M+" : "M-") : (m.evalAfter / 100).toFixed(2);
        const changeDesc = describeMoveChange(m.fenBefore, m.moveSan);
        let line = `### Move ${m.moveNum} (${m.color}): ${m.moveSan} [${severity}]`;
        line += `\n  Eval: ${evalBeforeStr} → ${evalAfterStr} (lost ${(m.drop / 100).toFixed(1)} pawns)`;
        if (changeDesc) line += `\n  What happened: ${changeDesc}`;
        line += `\n  FEN before: ${m.fenBefore}`;

        // Include ALL candidate moves with evals and full PV lines from the position BEFORE this move
        const evalBefore = gameEval!.positions[m.halfMoveIdx];
        if (evalBefore?.lines && evalBefore.lines.length > 0) {
          // Stage 6+7+8: multi-source voter with Lc0 neural eval + Maia visibility
          const bestPvLine = evalBefore.lines[0];
          const bestPvSan = bestPvLine?.pv ? convertPvToSan(m.fenBefore, bestPvLine.pv) : [];
          const structuredMotifs = m.moveSan ? detectMotifs(m.fenBefore, m.moveSan) : [];
          const voterResult = compileVoterResult({
            motifs: structuredMotifs,
            chessdbResult: mistakeChessdbResults[mi],
            lc0Result: mistakeLc0Results[mi],
            maiaResult: mistakeMaiaResults[mi],
            bestMoveSan: bestPvSan[0] ?? null,
            stockfishEvalCp: evalBefore.lines[0]?.cp ?? null,
            stockfishBestMoveMate: evalBefore.lines[0]?.mate ?? null,
          });
          line += `\n  ${voterResult.groundingContext}`;

          // Candidate ranking gap
          const gapAnalysis = computeCandidateGap(evalBefore.lines);
          line += `\n  ${gapAnalysis}`;

          // Branch point between best line and played move line
          const playedPvLine = evalBefore.lines.find(l => {
            const first = l.pv?.[0] ? convertPvToSan(m.fenBefore, [l.pv[0]])[0] : undefined;
            return first === m.moveSan;
          });
          if (bestPvSan.length > 0 && playedPvLine?.pv) {
            const playedPvSan = convertPvToSan(m.fenBefore, playedPvLine.pv);
            const branchIdx = findBranchPoint(bestPvSan, playedPvSan);
            if (branchIdx < Math.min(bestPvSan.length, playedPvSan.length)) {
              const sharedLine = branchIdx > 0 ? `after ${bestPvSan.slice(0, branchIdx).join(" ")} — ` : "";
              line += `\n  BRANCH POINT: Lines diverge at move ${branchIdx + 1}. ${sharedLine}Best continues ${bestPvSan[branchIdx] ?? "?"}, played line goes ${playedPvSan[branchIdx] ?? "?"}`;
            }
          }

          line += `\n  CANDIDATE MOVES (from Stockfish, best first):`;
          for (const pvLine of evalBefore.lines) {
            if (!pvLine.pv || pvLine.pv.length === 0) continue;
            // Convert full PV from UCI to SAN
            const pvSan = convertPvToSan(m.fenBefore, pvLine.pv);
            const pvEval = pvLine.mate !== undefined
              ? `M${pvLine.mate > 0 ? "+" : ""}${pvLine.mate}`
              : pvLine.cp !== undefined ? `${pvLine.cp >= 0 ? "+" : ""}${(pvLine.cp / 100).toFixed(2)}` : "?";
            const firstMove = pvSan.length > 0 ? pvSan[0] : pvLine.pv[0];
            const isPlayed = firstMove === m.moveSan;
            const fullLine = formatPvAsMoveList(pvSan, m.moveNum, m.halfMoveIdx % 2 === 0);
            line += `\n    ${isPlayed ? "⮕ PLAYED" : "★ BETTER"}: ${firstMove} (${pvEval}) — Line: ${fullLine} (depth ${pvLine.depth})`;
          }
        }

        // What the best line leads to (explain the plan)
        line += `\n  Best move was: ${m.bestMove}`;

        return line;
      });

      sections.push(`## TOP MISTAKES (sorted by severity — ANALYZE EACH WITH FULL DEPTH)\n${mistakeLines.join("\n\n")}`);
    } else {
      sections.push(`## MISTAKES\nNo significant mistakes detected (all moves within 0.5 pawn of engine best).`);
    }
  } else {
    sections.push(`## NOTE: No Stockfish evaluation data available. The game has not been engine-analyzed yet. Analyze the position and moves based on general chess principles.`);
  }

  // --- Material balance at end ---
  sections.push(`## FINAL POSITION\nFEN: ${game.fen()}\n${getMaterialBalance(game)}`);

  // --- Structured position annotation for the final position ---
  try {
    const finalAnnotation = annotatePosition(game.fen());
    sections.push(annotationToPromptContext(finalAnnotation));
  } catch (e) {
    // Non-critical — skip if annotation fails
  }

  // --- Lever 1: relational facts for final position (anti-hallucination grounding) ---
  try {
    const finalFacts = buildRelationalFacts(game.fen());
    sections.push(
      `## VERIFIED POSITION FACTS — FINAL POSITION (chess.js oracle)\n${finalFacts.summary}`
    );
  } catch {
    // skip if FEN is invalid (e.g. no moves played yet)
  }

  // --- Chess Intelligence Layer: pre-computed structured context for critical positions ---
  // This gives GPT verified tactical tags, explanation seeds, and branch analysis
  // so it explains known truths rather than hallucinating chess ideas.
  if (gameEval?.positions) {
    const sortedMistakes: Array<{ halfMoveIdx: number; moveNum: number; color: string; moveSan: string; drop: number; fenBefore: string }> = [];

    for (let i = 0; i < moveHistory.length; i++) {
      const evalBefore = gameEval.positions[i];
      const evalAfter = gameEval.positions[i + 1];
      if (!evalBefore?.lines?.[0] || !evalAfter?.lines?.[0]) continue;

      const cpBefore = evalBefore.lines[0].mate !== undefined ? (evalBefore.lines[0].mate! > 0 ? 9999 : -9999) : (evalBefore.lines[0].cp ?? 0);
      const cpAfter = evalAfter.lines[0].mate !== undefined ? (evalAfter.lines[0].mate! > 0 ? 9999 : -9999) : (evalAfter.lines[0].cp ?? 0);
      const drop = i % 2 === 0 ? cpBefore - cpAfter : cpAfter - cpBefore;

      if (drop > 50) {
        sortedMistakes.push({
          halfMoveIdx: i,
          moveNum: Math.floor(i / 2) + 1,
          color: i % 2 === 0 ? "White" : "Black",
          moveSan: moveHistory[i],
          drop,
          fenBefore: getFenAtHalfMove(moveHistory, i),
        });
      }
    }

    sortedMistakes.sort((a, b) => b.drop - a.drop);
    const top3 = sortedMistakes.slice(0, 3);

    if (top3.length > 0) {
      const intelligenceLines: string[] = [];
      for (const m of top3) {
        const evalBefore = gameEval.positions[m.halfMoveIdx];
        if (!evalBefore?.lines?.[0]) continue;

        const bestPvSan = convertPvToSan(m.fenBefore, evalBefore.lines[0].pv ?? []);
        const motifs = m.moveSan ? detectMotifs(m.fenBefore, m.moveSan) : [];
        // Stage 6+7+8: all signals describe the same pre-mistake position.
        // Trigger Lc0 when SF is uncertain; trigger Maia when we have a user rating.
        const sfCpIntel = evalBefore.lines[0]?.cp ?? null;
        const bestUciIntel = evalBefore.lines[0]?.pv?.[0] ?? null;
        const [cdbResult, lc0IntelResult, maiaIntelResult] = await Promise.all([
          queryChessdb(m.fenBefore).catch(() => null),
          shouldCallLc0(sfCpIntel, evalBefore.lines) ? queryLc0(m.fenBefore).catch(() => null) : Promise.resolve(null),
          shouldCallMaia(userRating, bestUciIntel)
            ? queryMaiaAtRating(m.fenBefore, userRating!, bestUciIntel!).catch(() => null)
            : Promise.resolve(null),
        ]);
        const voterIntel = compileVoterResult({
          motifs,
          chessdbResult: cdbResult,
          lc0Result: lc0IntelResult,
          maiaResult: maiaIntelResult,
          bestMoveSan: bestPvSan[0] ?? null,
          stockfishEvalCp: sfCpIntel,
          stockfishBestMoveMate: evalBefore.lines[0]?.mate ?? null,
        });
        const gapAnalysis = computeCandidateGap(evalBefore.lines);
        const explanationSeed = buildExplanationSeed(m.fenBefore, bestPvSan, m.moveNum, m.halfMoveIdx % 2 === 0);
        const severity = m.drop >= 300 ? "BLUNDER" : m.drop >= 150 ? "MISTAKE" : "INACCURACY";

        let block = `### CRITICAL POSITION: Move ${m.moveNum} (${m.color} — ${severity})\n`;
        block += `${voterIntel.groundingContext}\n`;
        block += `CANDIDATE RANKING: ${gapAnalysis}\n`;

        // Branch point between best and 2nd candidate
        if (evalBefore.lines.length >= 2 && bestPvSan.length > 0) {
          const pv2San = convertPvToSan(m.fenBefore, evalBefore.lines[1].pv ?? []);
          const branchIdx = findBranchPoint(bestPvSan, pv2San);
          const shared = branchIdx > 0 ? `Shared first ${branchIdx} move(s): ${bestPvSan.slice(0, branchIdx).join(" ")}. ` : "";
          block += `BRANCH POINT: ${shared}Key divergence — best: ${bestPvSan[branchIdx] ?? "?"} vs alternative: ${pv2San[branchIdx] ?? "?"}\n`;
        }

        const conceptBlock = buildConceptLayer(m.fenBefore, bestPvSan);
        if (conceptBlock) {
          block += `PEDAGOGICAL CONCEPTS (teach by name — this is the principle the student missed):\n${conceptBlock}\n`;
        }

        if (explanationSeed) block += `ENGINE IDEA: ${explanationSeed}\n`;

        // Lever 1: relational facts for this critical position (anti-hallucination)
        try {
          const relFacts = buildRelationalFacts(m.fenBefore);
          block += `VERIFIED POSITION FACTS (chess.js oracle — only assert relationships listed here):\n${relFacts.summary}\n`;
        } catch {
          // skip on invalid FEN
        }

        // Phase-2 GROUNDED TEACHING SPINE (principle 8): the concept-DELTA the
        // move changed + the opponent threats to count, grounded next to the
        // Lever-1 facts above. try/catch mirrors the Lever-1 pattern — a bad
        // FEN degrades silently rather than 500-ing the analysis.
        try {
          const fenAfter = getFenAtHalfMove(moveHistory, m.halfMoveIdx + 1);
          const spine = buildTeachingSpine(
            m.fenBefore,
            fenAfter,
            evalBefore.lines[0].pv ?? []
          );
          if (spine) {
            block += `GROUNDED TEACHING SPINE (what the move changed + threats to count):\n${spine}\n`;
          }
        } catch {
          // skip on invalid FEN / unexpected chess.js throw
        }

        intelligenceLines.push(block);
      }

      if (intelligenceLines.length > 0) {
        sections.push(`## CHESS INTELLIGENCE LAYER\n(Pre-computed verified analysis — use this to ground your explanations)\n\n${intelligenceLines.join("\n")}`);
      }
    }
  }

  return sections.join("\n\n");
}

/**
 * Compact game context used on follow-up chat turns.
 *
 * Cheaper than `buildGameContext` (no per-move FEN, no full PV trees, no motifs)
 * but rich enough that the LLM can ground answers like "why was move 6 a
 * mistake?" or "what was my first error?" in real moves and evals.
 *
 * Each half-move gets one prose sentence so the LLM can quote pre-narrated
 * facts rather than synthesize them — the synthesis step is where hallucination
 * crept in (e.g., inventing "13. Bh7+" when there was no move list at all).
 *
 * Sections:
 *   - MOVES PLAYED (PGN)
 *   - MOVE-BY-MOVE NARRATIVE  (one sentence per half-move)
 *   - TOP MISTAKES            (eval drops >= 0.5 pawns, sorted, capped)
 */
function buildCompactGameContext(
  moveHistory: string[],
  gameEval: GameEvalInput | undefined,
  playerColor: string
): string {
  if (!moveHistory || moveHistory.length === 0) return "";

  const sections: string[] = [];

  sections.push(`## MOVES PLAYED (PGN)\n${buildPgnFromMoves(moveHistory)}`);

  const evalSentences: string[] = [];
  type Mistake = {
    moveNum: number;
    color: string;
    moveSan: string;
    cpBefore: number;
    cpAfter: number;
    drop: number;
    bestSan?: string;
  };
  const mistakes: Mistake[] = [];

  const formatCp = (cp: number, mate?: number): string => {
    if (mate !== undefined) return `M${mate > 0 ? "+" : ""}${mate}`;
    if (Math.abs(cp) >= 9000) return cp > 0 ? "M+" : "M-";
    return `${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(2)}`;
  };

  for (let i = 0; i < moveHistory.length; i++) {
    const moveSan = moveHistory[i];
    const moveNum = Math.floor(i / 2) + 1;
    const isWhite = i % 2 === 0;
    const colorWord = isWhite ? "White" : "Black";

    const evalBefore = gameEval?.positions?.[i];
    const evalAfter = gameEval?.positions?.[i + 1];

    // Stockfish's preferred move from the position before this one was played
    let bestSan: string | undefined;
    if (evalBefore?.bestMove && evalBefore.bestMove !== "N/A") {
      const fenBefore = getFenAtHalfMove(moveHistory, i);
      const candidate = uciToSan(fenBefore, evalBefore.bestMove);
      if (candidate && candidate !== moveSan) bestSan = candidate;
    }

    // Eval drop from the player's perspective
    // Client timeout sentinels ({cp: 0, depth: 0}) are not real evals — skip
    // swing computation entirely so a stalled position can't narrate as a
    // fabricated blunder (or mask a real one) on the Haiku follow-up path.
    const compactSentinel =
      evalBefore?.lines?.[0]?.depth === 0 || evalAfter?.lines?.[0]?.depth === 0;
    let drop = 0;
    let cpBefore: number | null = null;
    let cpAfter: number | null = null;
    if (evalBefore?.lines?.[0] && evalAfter?.lines?.[0] && !compactSentinel) {
      cpBefore = evalBefore.lines[0].mate !== undefined
        ? (evalBefore.lines[0].mate! > 0 ? 9999 : -9999)
        : (evalBefore.lines[0].cp ?? 0);
      cpAfter = evalAfter.lines[0].mate !== undefined
        ? (evalAfter.lines[0].mate! > 0 ? 9999 : -9999)
        : (evalAfter.lines[0].cp ?? 0);
      drop = isWhite ? (cpBefore - cpAfter) : (cpAfter - cpBefore);
    }

    // Pick a single label: severity for >50cp drops, otherwise the engine's
    // moveClassification field (book/good/excellent/etc.) when present.
    let label = "";
    if (drop >= 300) label = "BLUNDER";
    else if (drop >= 150) label = "MISTAKE";
    else if (drop >= 50) label = "INACCURACY";
    else if (evalAfter?.moveClassification) label = evalAfter.moveClassification;

    // Build the sentence
    let sentence = `Move ${moveNum} (${colorWord}): ${moveSan}`;
    if (label) sentence += ` — ${label}`;

    if (drop >= 50 && cpBefore !== null && cpAfter !== null) {
      // For mistakes, narrate the eval swing
      const beforeStr = formatCp(cpBefore, evalBefore?.lines?.[0]?.mate);
      const afterStr = formatCp(cpAfter, evalAfter?.lines?.[0]?.mate);
      sentence += `; eval ${beforeStr} → ${afterStr} (lost ${(drop / 100).toFixed(1)} pawns)`;
    } else if (evalAfter?.lines?.[0] && evalAfter.lines[0].depth !== 0) {
      // For routine moves, just the resulting eval (skip timeout sentinels —
      // a fabricated "eval +0.00" is worse than saying nothing)
      const afterStr = formatCp(evalAfter.lines[0].cp ?? 0, evalAfter.lines[0].mate);
      sentence += `${label ? ";" : " —"} eval ${afterStr}`;
    }

    if (bestSan) {
      sentence += `. Stockfish preferred ${bestSan}.`;
    } else {
      sentence += ".";
    }

    evalSentences.push(sentence);

    if (drop >= 50 && cpBefore !== null && cpAfter !== null) {
      mistakes.push({
        moveNum,
        color: colorWord,
        moveSan,
        cpBefore,
        cpAfter,
        drop,
        bestSan,
      });
    }
  }

  sections.push(`## MOVE-BY-MOVE NARRATIVE\n(One sentence per half-move. Eval is in pawns from White's perspective. Quote these sentences directly when asked about specific moves — do not paraphrase or invent.)\n${evalSentences.join("\n")}`);

  // Mirror buildGameContext: filter to the user's color so opponent blunders
  // don't leak into TOP MISTAKES and contradict the player-perspective rule.
  const userColorName = playerColor === "w" ? "White" : "Black";
  const userMistakes = mistakes.filter((m) => m.color === userColorName);
  if (userMistakes.length > 0) {
    userMistakes.sort((a, b) => b.drop - a.drop);
    const top = userMistakes.slice(0, 12);
    const mistakeLines = top.map((m) => {
      const severity = m.drop >= 300 ? "BLUNDER" : m.drop >= 150 ? "MISTAKE" : "INACCURACY";
      const before = formatCp(m.cpBefore);
      const after = formatCp(m.cpAfter);
      const lost = (m.drop / 100).toFixed(1);
      const best = m.bestSan ? `; Stockfish preferred ${m.bestSan}` : "";
      return `- Move ${m.moveNum} (${m.color}): ${m.moveSan} [${severity}] — eval ${before} → ${after} (lost ${lost} pawns)${best}`;
    });
    sections.push(`## TOP MISTAKES (worst eval drops first, max 12)\n${mistakeLines.join("\n")}`);
  }

  sections.push(`Player is ${playerColor === "w" ? "White" : "Black"}.`);

  // Position-fact grounding (2026-06-13): prepend the CURRENT POSITION board so
  // the fast (Haiku) follow-up tier reads the board instead of reconstructing it
  // from the PGN — measured +1.5 factual accuracy. See positionFacts.ts /
  // POSITION_FACT_GROUNDING_PLAN.md.
  const positionFacts = buildCurrentPositionFacts(moveHistory, gameEval);
  if (positionFacts) sections.unshift(positionFacts);

  return sections.join("\n\n");
}

/**
 * Get the FEN at a specific half-move index by replaying moves up to that point.
 */
function getFenAtHalfMove(moveHistory: string[], halfMoveIdx: number): string {
  const game = new Chess();
  for (let i = 0; i < halfMoveIdx; i++) {
    try { game.move(moveHistory[i]); } catch { break; }
  }
  return game.fen();
}

/**
 * Build a PGN string from move history
 */
function buildPgnFromMoves(moveHistory: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < moveHistory.length; i++) {
    if (i % 2 === 0) {
      parts.push(`${Math.floor(i / 2) + 1}.`);
    }
    parts.push(moveHistory[i]);
  }
  return parts.join(" ");
}

function getMaterialBalance(game: Chess): string {
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
 * Generate puzzle recommendations for detected mistakes in the game.
 * Returns an array of mistake contexts with their matching puzzles.
 */
interface ReinforcementForCoach {
  concepts: string[];
  fallbackUsed: "concept" | "theme" | "none";
  puzzles: Array<{
    puzzleId: string;
    fen: string;
    moves: string;
    rating: number;
    concepts: Array<{ id: string; confidence: number }>;
  }>;
}

/**
 * Convert a PV of SAN moves to UCI (from, to, promotion concatenated) starting
 * from the given FEN. Returns the array up to the first failure.
 */
function sanPvToUci(fen: string, sanPv: string[]): string[] {
  const uci: string[] = [];
  const chess = new Chess(fen);
  for (const san of sanPv) {
    const mv = chess.move(san);
    if (!mv) break;
    uci.push(`${mv.from}${mv.to}${mv.promotion ?? ""}`);
  }
  return uci;
}

/**
 * Pedagogical Concept Layer — name the principle, not the mechanics.
 *
 * Runs the same detectConcepts used by retrieval so the chip label and the
 * prose vocabulary agree. Returns an empty string when no concept fires; the
 * caller then omits the block entirely (Claude falls back to motif tags).
 */
function buildConceptLayer(fenBefore: string, bestPvSan: string[]): string {
  const uci = sanPvToUci(fenBefore, bestPvSan);
  if (uci.length === 0) return "";
  const hits = detectConcepts({ fen: fenBefore, solutionUci: uci });
  if (hits.length === 0) return "";
  const lines: string[] = [];
  for (const h of hits.slice(0, 3)) {
    const c = getConcept(h.conceptId);
    if (!c) continue;
    lines.push(
      `- ${c.name} (${c.tier}, confidence ${h.confidence.toFixed(2)})\n    Definition: ${c.definition}\n    Evidence: ${h.evidence}`
    );
  }
  return lines.join("\n");
}

async function buildReinforcements(
  fenBefore: string,
  bestMoveSan: string,
  bestPvSan: string[],
  userRating: number
): Promise<ReinforcementForCoach | undefined> {
  try {
    const pv = bestPvSan.length > 0 ? bestPvSan : [bestMoveSan];
    const uci = sanPvToUci(fenBefore, pv);
    if (uci.length === 0) return undefined;
    const result = await getReinforcements({
      anchorFen: fenBefore,
      anchorSolutionUci: uci,
      themes: [],
      userElo: userRating,
      limit: 3,
    });
    return {
      concepts: result.anchorConcepts,
      fallbackUsed: result.fallbackUsed,
      puzzles: result.puzzles.map((p: any) => ({
        puzzleId: p.puzzleId,
        fen: p.fen,
        moves: p.moves,
        rating: p.rating,
        concepts: p.concepts ?? [],
      })),
    };
  } catch (err) {
    log.warn("Reinforcement retrieval failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

async function generatePuzzleRecommendations(
  moveHistory: string[] | undefined,
  gameEval: any,
  userRating: number = 1500
): Promise<Array<{
  moveNumber: number;
  movePlayed: string;
  correctMove: string;
  fen: string;
  evalBefore: number;
  evalAfter: number;
  mistakeSeverity: "blunder" | "mistake" | "inaccuracy";
  tacticalMotifs: string[];
  puzzles: any[];
  explanation: string;
  reinforcements?: ReinforcementForCoach;
}>> {
  if (!moveHistory || !gameEval?.positions) {
    return [];
  }

  const recommendations = [];

  // Detect significant mistakes (drop > 150 centipawns)
  for (let i = 0; i < moveHistory.length; i++) {
    const evalBefore = gameEval.positions[i];
    const evalAfter = gameEval.positions[i + 1];
    if (!evalBefore?.lines?.[0] || !evalAfter?.lines?.[0]) continue;

    const cpBefore = evalBefore.lines[0].mate !== undefined
      ? (evalBefore.lines[0].mate! > 0 ? 9999 : -9999)
      : (evalBefore.lines[0].cp ?? 0);
    const cpAfter = evalAfter.lines[0].mate !== undefined
      ? (evalAfter.lines[0].mate! > 0 ? 9999 : -9999)
      : (evalAfter.lines[0].cp ?? 0);
    const drop = i % 2 === 0 ? cpBefore - cpAfter : cpAfter - cpBefore;

    // Only generate puzzles for mistakes/blunders (not minor inaccuracies)
    if (drop < 150) continue;

    const fenBefore = getFenAtHalfMove(moveHistory, i);
    const bestPvSan = convertPvToSan(fenBefore, evalBefore.lines[0].pv ?? []);
    const bestMove = bestPvSan[0] || "unknown";
    const motifs = detectTacticalMotifs(fenBefore, bestMove, bestPvSan);

    try {
      // Call the mistake-puzzles API
      const response = await fetch("http://localhost:3000/api/mistake-puzzles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fen: fenBefore,
          movePlayed: moveHistory[i],
          correctMove: bestMove,
          evalBefore: cpBefore,
          evalAfter: cpAfter,
          tacticalMotifs: motifs,
          userRating,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const reinforcements = await buildReinforcements(
          fenBefore,
          bestMove,
          bestPvSan,
          userRating
        );
        recommendations.push({
          moveNumber: Math.floor(i / 2) + 1,
          movePlayed: moveHistory[i],
          correctMove: bestMove,
          fen: fenBefore,
          evalBefore: cpBefore,
          evalAfter: cpAfter,
          mistakeSeverity: data.mistakeSeverity,
          tacticalMotifs: motifs,
          puzzles: data.puzzles.slice(0, 3), // Top 3 puzzles (legacy theme path)
          explanation: data.explanation,
          reinforcements,
        });
      }
    } catch (error) {
      console.error(`Failed to fetch puzzles for mistake at move ${Math.floor(i / 2) + 1}:`, error);
      // Continue with other mistakes even if one fails
    }

    // Limit to top 3 mistakes to avoid overwhelming the user
    if (recommendations.length >= 3) break;
  }

  return recommendations;
}

export async function POST(request: NextRequest) {
  const requestId = extractRequestId(request.headers);

  return withRequestContext(requestId, async () => {
  // Local helper so each fatal catch block can fire one structured Sentry
  // event without re-deriving the abort-vs-real-error guard or rebuilding
  // the {route, requestId, phase} envelope at every site. AbortError fires
  // when the client closes the connection mid-stream — that's the user, not
  // a bug, so we filter it out. Everything else (LLMError, FD/pipeline
  // failures, validation explosions) goes to Sentry so the team gets paged
  // instead of finding the failure in next month's Vercel log search.
  const reportFatal = (
    err: unknown,
    phase: string,
    extra?: Record<string, unknown>
  ) => {
    const e = err instanceof Error ? err : new Error(String(err));
    if (e.name === "AbortError") return;
    logErrorToSentry(err, {
      route: "/api/enhanced-analysis",
      requestId,
      phase,
      ...extra,
    });
  };
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const session = guard.session;
  try {
    const body = await request.json();

    const parsed = validateRequest(enhancedAnalysisSchema, body);
    if (!parsed.success) return parsed.response;
    // Gate AFTER validation so a malformed request doesn't burn the free-tier
    // allowance. No-op when FREEMIUM_ENABLED is off; premium/trial = unlimited.
    const gate = await gateFeature(session.uid, "analysis", { surface: "analysis" });
    if (!gate.ok) return gate.response;
    const {
      userMessage,
      message,
      moveHistory,
      fen,
      position,
      gameEval,
      playerColor,
      username,
      // Rename on destructure so we can override with the Firestore-stored
      // selfReportedRating after the profile read below. AnalysisImpl already
      // sends profile.selfReportedRating in the body (PR #64), but the
      // legacy AICoachChat callers and future surfaces may not — when they
      // don't, the value the LLM sees should still be the user's true rating
      // instead of silently defaulting to 1500.
      userRating: userRatingFromBody,
      boardOrientation,
      conversationHistory,
      personalityId,
      playerColorName,
      chesscomUsername,
      lichessUsername,
      opponentUsername,
      opponentPlatform,
      gameHeaders,
      stream: streamRequested,
    } = parsed.data;
    const messageText = userMessage || message || "";

    // Stage B insertion point A (§3.7.9): single env read. No branching cost
    // when off; flag-off path remains byte-identical to today.
    const { validatorsEnabled } = getMastermindEnv();

    // Build ply→FEN map for the relational-claim validator (Lever 2).
    // Only constructed when validators are on (avoids O(n) work otherwise).
    // Maps 1-indexed ply number → FEN after that half-move so the validator
    // can check historical claims against the board they reference, not just
    // the final position.
    const relationalFenMap: Record<number, string> = {};
    if (validatorsEnabled && moveHistory?.length) {
      try {
        const _g = new Chess();
        for (let _i = 0; _i < moveHistory.length; _i++) {
          _g.move(moveHistory[_i]);
          relationalFenMap[_i + 1] = _g.fen();
        }
      } catch {
        // leave map empty — validator falls back to opts.fen
      }
    }

    // Look up the signed-in user's coaching prefs + stored rating from
    // Firestore so the system prompt, skill calibration, and puzzle
    // recommendations can all be personalized. Server-side only — never
    // trust prefs from the client body. Best-effort: if Firestore is
    // down we proceed without personalization rather than fail the
    // request.
    //
    // userRating resolves request-body-first, Firestore-second. AnalysisImpl
    // wires profile.selfReportedRating into the body via PR #64; the
    // Firestore fallback covers the legacy AICoachChat path, the browser
    // extension, and any future caller that forgets to send the rating.
    let coachingPrefs:
      | import("@/lib/prompts/coachChatPrompt").CoachingPrefs
      | undefined;
    let profileRating: number | undefined;
    try {
      const profile = await getUserById(session.uid);
      if (profile) {
        coachingPrefs = {
          coachTone: profile.coachTone,
          playingStyle: profile.playingStyle,
          studyGoals: profile.studyGoals,
          favoriteOpenings: profile.favoriteOpenings,
        };
        // Single-rating model: prefer the live mirror (tracks improvement),
        // then the placement-measured rating, then the self-reported prior.
        profileRating =
          profile.liveRatingSnapshot ??
          profile.measuredRating ??
          profile.selfReportedRating;
      }
    } catch (err) {
      log.warn("could not load coaching prefs", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
    // Q5 (async-grounding plan): third fallback — the game's own PGN Elo
    // header for the user's color. user_history aggregates carry no rating
    // fields (only latent PGN tags), so the current game's header is the
    // cheapest reliable source. Keeps Maia visibility grounding live for
    // users who never set a rating but analyze rated games. Range guard
    // mirrors shouldCallMaia's [100, 3500] so junk headers ("?", "0") can't
    // skew skill calibration.
    const headerEloRaw = playerColor === "b" ? gameHeaders?.blackElo : gameHeaders?.whiteElo;
    const headerElo = headerEloRaw ? Number.parseInt(headerEloRaw, 10) : NaN;
    const userRating =
      userRatingFromBody ??
      profileRating ??
      (Number.isFinite(headerElo) && headerElo >= 100 && headerElo <= 3500
        ? headerElo
        : undefined);

    log.info("Enhanced analysis started", {
      hasMessage: !!messageText,
      moveCount: moveHistory?.length,
      hasEval: !!gameEval,
      playerColor,
      skillLevel: userRating ? (userRating < 1000 ? "beginner" : userRating < 1600 ? "intermediate" : "advanced") : "intermediate",
    });

    // API-key presence is now validated inside callLLM(); both Anthropic and
    // OpenAI are accepted, with automatic fallback from one to the other.

    // Build game context for the LLM
    let gameContext = "";
    if (moveHistory && moveHistory.length > 0) {
      gameContext = await buildGameContext(
        moveHistory,
        gameEval,
        playerColor || (boardOrientation ? "w" : "b"),
        username,
        userRating,
        gameHeaders
      );
    } else if (fen || position) {
      // Position-only analysis
      const fenStr = fen || position;
      const game = new Chess(fenStr);
      gameContext = `## POSITION ANALYSIS\nFEN: ${fenStr}\nTurn: ${game.turn() === "w" ? "White" : "Black"}\nLegal moves: ${game.moves().length}\n${getMaterialBalance(game)}`;
      // Stage 1: Syzygy endgame grounding via Lichess tablebase API
      try {
        const tbResult = fenStr ? await fetch_lichess_tablebase(fenStr) : null;
        if (tbResult) {
          let tbBlock = `\n\n## ENDGAME GROUND TRUTH (Syzygy tablebases — mathematically perfect for ≤7 pieces)\n`;
          tbBlock += `Outcome for side to move: ${tbResult.category}\n`;
          // Lichess DTM is signed plies — convert to full moves for the prompt
          // (raw plies labeled "moves" taught the model ~2x-too-long mates).
          if (tbResult.dtm !== null) tbBlock += `Distance to mate: ${Math.ceil(Math.abs(tbResult.dtm) / 2)} moves (${Math.abs(tbResult.dtm)} plies)\n`;
          if (tbResult.dtz !== null) tbBlock += `Distance to zeroing: ${tbResult.dtz}\n`;
          if (tbResult.moves.length > 0) {
            const best = tbResult.moves[0];
            tbBlock += `Best move: ${best.san ?? best.uci} (${best.category})\n`;
          }
          tbBlock += `RULE: Endgame outcome claims MUST match the Syzygy result above exactly. Do not assert "winning" if Syzygy says "draw" or "loss".\n`;
          gameContext += tbBlock;
        }
      } catch { /* tablebase is non-critical */ }
    } else {
      gameContext = "No game data or position provided. The user may be asking a general chess question.";
    }

    // (moved up) — coaching prefs + rating are now resolved earlier in the
    // function so downstream telemetry, buildGameContext and prompt
    // composition all see the Firestore fallback automatically.

    // Build the system prompt for Claude. Server-controlled only — composed
    // from structured params in the validated body (see AUDIT-PHASE-1.4
    // hardening note above). personalityId is resolved against a server-side
    // allowlist via getPersonalityById; unknown ids fall back to the default.
    //
    // The prompt comes back split into two parts so the LLM call can put
    // the stable prefix under an ephemeral cache marker and stream the
    // per-user tail uncached. Two users sharing the same personalityId hit
    // the prompt cache even with different username / rating / coaching
    // prefs — that was the ~4x cost overrun the audit flagged.
    //
    // `claudeSystemPrompt` (the concatenated string) is still used by
    // storeAnalysisContext so /api/chat's contextId lookup keeps returning
    // a single self-contained prompt blob.
    const claudeSystemParts = getCoachChatSystemPromptParts({
      personalityId: personalityId ?? "friendly",
      userRating: userRating ?? 1500,
      username,
      playerColorName,
      chesscomUsername,
      lichessUsername,
      coachingPrefs,
    });
    const claudeSystemPrompt = `${claudeSystemParts.stable}\n\n${claudeSystemParts.perUser}`;

    // Per-request LLM telemetry. Captured at whichever branch ends up
    // serving the response (flag-on pipeline, flag-off direct call, or
    // FD-fallback) so the non-streaming JSON response can surface token
    // counts + cache hits to the client. With this in the payload the
    // cost-per-request claims for the prompt-cache restructure
    // (PRs #70 + #77) are demonstrable to a reviewer without grepping
    // Vercel logs.
    let llmTelemetry:
      | {
          provider?: string;
          model?: string;
          inputTokens?: number;
          outputTokens?: number;
          cacheCreationTokens?: number;
          cacheReadTokens?: number;
          elapsedMs?: number;
        }
      | undefined;

    // Build the messages for Claude (user/assistant turns only — system is separate)
    const claudeMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

    // Add conversation history for multi-turn context (prior messages before current)
    if (conversationHistory && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        if (msg.content && (msg.role === "user" || msg.role === "assistant")) {
          claudeMessages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Current user message with full game context appended
    let userContent = "";
    if (messageText) {
      userContent += `## USER REQUEST:\n${messageText}\n\n`;
    }
    if (gameContext) {
      userContent += gameContext;
    }

    // Inject gold-standard few-shot examples for quality benchmarking
    const skillLevel = userRating
      ? (userRating < 1000 ? "beginner" : userRating < 1600 ? "intermediate" : "advanced") as "beginner" | "intermediate" | "advanced"
      : "intermediate" as const;
    const examples = selectExamples(undefined, skillLevel, 3);
    const examplesContext = formatExamplesForPrompt(examples);
    if (examplesContext) {
      userContent += examplesContext;
    }

    claudeMessages.push({ role: "user", content: userContent });

    // Check response cache before calling Claude
    const currentFen = fen || (moveHistory && moveHistory.length > 0
      ? getFenAtHalfMove(moveHistory, moveHistory.length)
      : "startpos");
    // Persona signature scopes the cache to this caller's coaching prefs +
    // personality. Without it two users on the same FEN with the same
    // question would share the same cached response, which leaks the first
    // user's persona/tone (and occasionally their username) to the second.
    // userRating is intentionally NOT in this signature — skillLevel is
    // already derived from it and is part of the cache key separately.
    const personaSignature = [
      personalityId ?? "friendly",
      coachingPrefs?.coachTone ?? "",
      coachingPrefs?.playingStyle ?? "",
      (coachingPrefs?.studyGoals ?? []).slice().sort().join(","),
      (coachingPrefs?.favoriteOpenings ?? []).slice().sort().join(","),
    ].join("|");
    const cacheKey = generateCacheKey(
      currentFen,
      skillLevel,
      messageText || "analyze",
      personaSignature,
      moveHistory
    );
    const cachedResponse = getCachedResponse(cacheKey);

    if (cachedResponse) {
      // Build game state for metadata even on cache hit
      const cachedGame = new Chess();
      if (moveHistory && moveHistory.length > 0) {
        for (const m of moveHistory) {
          try { cachedGame.move(m); } catch { break; }
        }
      } else if (fen) {
        try { cachedGame.load(fen); } catch { /* ignore */ }
      }

      // Re-seed the follow-up context on cache hits. The cached payload used
      // to carry NO contextId, so after a hit every subsequent message in the
      // chat re-fired a FULL flagship deep analysis instead of the Haiku fast
      // path — the cache made follow-ups MORE expensive. All inputs are
      // already in scope (context build happens above the cache check), so
      // re-seeding costs zero LLM calls.
      let cachedContextId: string | undefined;
      try {
        cachedContextId = generateContextId(moveHistory, fen, playerColor || "w", session.uid);
        storeAnalysisContext({
          contextId: cachedContextId,
          gameContext,
          compactGameContext: buildCompactGameContext(
            moveHistory ?? [],
            gameEval,
            playerColor || "w",
          ),
          playedMoves: moveHistory ?? [],
          systemPrompt: claudeSystemPrompt,
          systemPromptStable: claudeSystemParts.stable,
          systemPromptSuffix: claudeSystemParts.perUser,
          fewShotExamples: examplesContext,
          fen: cachedGame.fen(),
          skillLevel,
          playerColor: playerColor || "w",
          moveCount: Math.ceil(cachedGame.history().length / 2),
          createdAt: Date.now(),
          initialAnalysis: cachedResponse,
          gameEval,
        });
      } catch {
        // Context re-seed is best-effort; a miss just means the legacy
        // fall-back-to-deep-path behavior for this conversation.
      }

      const cachedPayload = {
        gameAnalysis: {
          analysis: cachedResponse,
          position: cachedGame.fen(),
          turn: cachedGame.turn(),
          moveCount: Math.ceil(cachedGame.history().length / 2),
          availableMoves: cachedGame.moves().length,
          validationScore: 1.0,
          validationIssues: 0,
          cached: true,
          contextId: cachedContextId,
        },
      };

      if (streamRequested) {
        // Emit the cached response as a single SSE event so the client has
        // one code path. No real "streaming" benefit here, but keeps the
        // contract uniform.
        const encoder = new TextEncoder();
        const sseStream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "text", delta: cachedResponse })}\n\n`
              )
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "done", metadata: cachedPayload.gameAnalysis })}\n\n`
              )
            );
            controller.close();
          },
        });
        return new Response(sseStream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      }

      return NextResponse.json(cachedPayload);
    }

    // ── Stage B insertion point D (§3.7.9): flag-on streaming branch ──
    // Buffer-then-restream per §4. The pipeline can replace the response
    // on retry; live-streaming and then retracting would be bad UX. We
    // open the SSE stream immediately, emit `validating` phase events
    // while the pipeline buffers, then synthetically re-stream the final
    // text in paced chunks. If FD throws (per §3.2), we fall back to the
    // flag-off live-stream loop inside the same already-opened SSE.
    if (streamRequested && validatorsEnabled) {
      const game = new Chess();
      if (moveHistory && moveHistory.length > 0) {
        for (const m of moveHistory) {
          try { game.move(m); } catch { break; }
        }
      } else if (fen) {
        try { game.load(fen); } catch { /* ignore */ }
      }
      const validationFen = game.fen();
      const playerPerspective: "white" | "black" =
        playerColor === "b" ? "black" : "white";

      const encoder = new TextEncoder();
      const sseStream = new ReadableStream({
        async start(controller) {
          const send = (obj: unknown) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          };

          send({ type: "validating", phase: "initial" });

          const prep = await prepareMastermindContext({
            userMessage: messageText,
            moveHistory,
            fen,
            gameEval,
            playerPerspective,
            correlationId: requestId,
            uid: session.uid,
            userName: username ?? session.uid,
            opponentUsername,
            opponentPlatform,
          });

          // §3.2 contract: FD throws → fall back to flag-off path.
          //
          // Plus (2026-05-26 game-review-realtime-stream): game_review queries
          // also take this path. Why: on a 100-move game, the Sonnet flagship
          // call alone is 50-60s. The blocking heavy-pipeline path below
          // synthetic-re-streams its result AFTER the call completes, so the
          // user sees nothing until ~60s in (or hits the timeout fallback).
          //
          // For game_review, eval-claim + feature-citation validators ALREADY
          // skip (POSITION_ANCHORED_VALIDATOR_CATEGORIES = position_analysis
          // only). The remaining Mastermind validators (scout, userHistory)
          // add 3-8s for marginal value on multi-position analysis prose.
          // Routing through the streaming path here trades them for ~1s
          // time-to-first-token. The chess.js validateAIResponse downstream
          // still runs as the lightweight hallucination check.
          if (!prep.dataSources || prep.category === "game_review") {
            send({
              type: "validating",
              phase: !prep.dataSources ? "fallback-to-flagoff" : "realtime-stream",
            });
            // Stage 9 v2: kick off async grounding now so the fetches run in
            // parallel with the LLM stream below — by stream end the promise
            // has almost always resolved (fetch ceiling ~8s vs 10s+ stream),
            // so the post-stream validation pass adds ~no latency before the
            // done event. Fail-open to undefined: a grounding hiccup must
            // never break the stream.
            const stage9SnapPromise: Promise<VoterSnapshot | undefined> =
              prep.moveCtx.moveSan && prep.moveCtx.fenBefore
                ? buildAsyncSnapshotForMove({
                    fenBefore: prep.moveCtx.fenBefore,
                    moveSan: prep.moveCtx.moveSan,
                    stockfishEvalCp: prep.moveCtx.stockfishEvalBefore.cp ?? null,
                    stockfishBestMoveMate: prep.moveCtx.stockfishEvalBefore.mate ?? null,
                    stockfishLines: prep.moveCtx.stockfishLinesBefore,
                    userRating: userRating ?? null,
                    correlationId: requestId,
                    branch: "stream-flagon-fallback",
                  }).catch(() => undefined)
                : Promise.resolve(undefined);
            // Reuse the live-stream loop from the flag-off path inline.
            let fullText = "";
            let llmDone: import("@/lib/llmProvider").LLMResult | null = null;
            try {
              for await (const evt of callLLMStream({
                tier: "flagship",
                system: claudeSystemParts.stable,
                systemSuffix: claudeSystemParts.perUser,
                messages: claudeMessages,
                temperature: 0.7,
                maxTokens: 3000,
                cacheSystem: true,
                capture: {
                  feature: "enhanced-analysis",
                  uid: session.uid,
                  requestId,
                  promptVersion: PROMPT_VERSION,
                  fen,
                  props: { branch: "stream-flagon-fallback" },
                },
              })) {
                if (evt.type === "text") {
                  fullText += evt.delta;
                  send({ type: "text", delta: evt.delta });
                } else {
                  llmDone = evt.result;
                }
              }
            } catch (err) {
              const e = err instanceof LLMError ? err : new Error(String(err));
              log.error("LLM streaming failed (flagoff-fallback inside flag-on stream)", { message: e.message });
              reportFatal(err, "stream:flagoff-fallback-inside-flag-on", {
                category: prep.category,
                provider: e instanceof LLMError ? e.provider : undefined,
                status: e instanceof LLMError ? e.status : undefined,
              });
              send({ type: "error", error: e.message });
              controller.close();
              return;
            }
            if (llmDone) {
              console.log("coach.tokens", {
                input: llmDone.inputTokens,
                output: llmDone.outputTokens,
                cacheCreation: llmDone.cacheCreationTokens,
                cacheRead: llmDone.cacheReadTokens,
                promptVersion: PROMPT_VERSION,
                streamed: true,
                flagOnFallback: true,
              });
              recordLLMCall(llmDone);
            }
            const rawAnalysis = fullText || "No analysis generated.";
            const validation = validateAIResponse(rawAnalysis, validationFen, moveHistory);
            if (validation.issues.length > 0) {
              log.warn("AI response validation issues (flagoff-fallback)", {
                issueCount: validation.issues.length,
                score: validation.score,
                category: prep.category,
              });
            }
            // Motif grounding + Stage 9 on the realtime wing. Historically
            // LOG-ONLY — the dominant production path (streamed game_review)
            // shipped raw model output while validators grumbled into logs
            // (audit §3.1). Now: warn-level fires stay telemetry-only (they
            // are last-move-anchored and false-positive on multi-position
            // prose), but ERROR-severity fires — the high-precision signals —
            // trigger a post-stream Haiku surgical edit delivered via the
            // done event's corrected/analysis contract the client already
            // honors.
            const enforceableIssues: ValidatorIssue[] = [];
            if (prep.moveCtx.moveSan && prep.moveCtx.fenBefore) {
              try {
                const moveMotifs: AnyMotif[] = detectMotifs(prep.moveCtx.fenBefore, prep.moveCtx.moveSan);
                const groundingResult = validateMotifGrounding({
                  llmResponse: rawAnalysis,
                  detectedMotifs: moveMotifs,
                  fen: prep.moveCtx.fenAfter,
                  moveSan: prep.moveCtx.moveSan,
                  correlationId: requestId,
                });
                if (!groundingResult.passed) {
                  log.warn("motif_grounding_failed", {
                    issues: groundingResult.issues.map(i => i.llm_span),
                    motif_count: moveMotifs.length,
                    correlationId: requestId,
                    branch: "stream-flagon-fallback",
                  });
                }
                enforceableIssues.push(
                  ...groundingResult.issues.filter((i) => i.severity === "error"),
                );
                // Stage 9 claim-class validators. The async-grounded snapshot
                // was kicked off before the stream started, so this await is
                // ~instant in the common case.
                const stage9Snap = await stage9SnapPromise;
                if (stage9Snap) {
                  const stage9Results = runStreamingStage9Validators({
                    llmResponse: rawAnalysis,
                    voterSnapshot: stage9Snap,
                    fen: prep.moveCtx.fenAfter,
                    moveSan: prep.moveCtx.moveSan,
                    playerPerspective,
                    correlationId: requestId,
                    branch: "stream-flagon-fallback",
                    log,
                  });
                  if (stage9Results) {
                    for (const r of [
                      stage9Results.userVis,
                      stage9Results.positional,
                      stage9Results.mate,
                      stage9Results.material,
                    ]) {
                      enforceableIssues.push(
                        ...r.issues.filter((i) => i.severity === "error"),
                      );
                    }
                  }
                }
              } catch { /* non-critical */ }
            }
            // Same chess.js disclaimer skip as the successful-pipeline
            // branch: suppress for non-position-anchored categories where
            // historical-citation false positives are systematic.
            const usePositionAnchoredAnnotationFD =
              POSITION_ANCHORED_VALIDATOR_CATEGORIES.has(prep.category);
            let analysisContent =
              usePositionAnchoredAnnotationFD && !validation.isValid
                ? validation.correctedResponse
                : rawAnalysis;
            let streamCorrected = false;
            if (enforceableIssues.length > 0) {
              const correction = await correctStreamedAnalysis({
                rawText: analysisContent,
                issues: enforceableIssues,
                correlationId: requestId,
                maxTokens: 3000,
              });
              analysisContent = correction.correctedText;
              streamCorrected = true;
              log.warn("stream_correction_applied", {
                mode: correction.mode,
                issueCount: enforceableIssues.length,
                checks: enforceableIssues.map((i) => i.check_name),
                costUsd: correction.costUsd,
                correlationId: requestId,
                branch: "stream-flagon-fallback",
              });
            }
            setCachedResponse(cacheKey, analysisContent, validation.score);
            const contextId = generateContextId(moveHistory, fen, playerColor || "w", session.uid);
            const compactGameContext = buildCompactGameContext(
              moveHistory ?? [],
              gameEval,
              playerColor || "w",
            );
            storeAnalysisContext({
              contextId,
              gameContext,
              compactGameContext,
              playedMoves: moveHistory ?? [],
              systemPrompt: claudeSystemPrompt,
              systemPromptStable: claudeSystemParts.stable,
              systemPromptSuffix: claudeSystemParts.perUser,
              fewShotExamples: examplesContext,
              fen: validationFen,
              skillLevel,
              playerColor: playerColor || "w",
              moveCount: Math.ceil(game.history().length / 2),
              createdAt: Date.now(),
              initialAnalysis: analysisContent,
              gameEval,
            });
            let puzzleRecommendations: unknown = undefined;
            try {
              puzzleRecommendations = await generatePuzzleRecommendations(
                moveHistory,
                gameEval,
                userRating,
              );
            } catch (err) {
              log.warn("puzzle recs failed in stream (flagoff-fallback)", {
                err: err instanceof Error ? err.message : String(err),
              });
            }
            send({
              type: "done",
              metadata: {
                analysis: analysisContent,
                position: validationFen,
                turn: game.turn(),
                moveCount: Math.ceil(game.history().length / 2),
                availableMoves: game.moves().length,
                validationScore: validation.score,
                validationIssues: validation.issues.length + enforceableIssues.length,
                contextId,
                puzzleRecommendations,
                corrected:
                  streamCorrected ||
                  (usePositionAnchoredAnnotationFD && !validation.isValid),
                pipeline: {
                  fallbackReason: !prep.dataSources
                    ? "fd_failed"
                    : "game_review_realtime_stream",
                },
              },
            });
            controller.close();
            return;
          }

          // Run the validator pipeline against the four-source context,
          // wrapped in a 30s top-level timer per §10.3.1 case 8 (1.C.B.5
          // follow-up). On timeout the helper resolves with a graceful
          // fallback result; the route emits done with pipeline.timedOut=true
          // rather than an SSE error or 502.
          //
          // Capture narrowed dataSources locally so the factory closure
          // below preserves the non-null type (TS loses control-flow
          // narrowing across function boundaries).
          const streamingDataSources = prep.dataSources;
          // Stage 9 v2: full async-grounding snapshot (chessdb / Lc0 / Maia /
          // Syzygy) for the four claim-class validators. The await runs
          // BEFORE withPipelineTimeout so network fetches never eat the
          // pipeline's regenerate budget (async-grounding plan Q1: ~8s
          // worst-case ceiling, parallel fetches). Sources that fail or are
          // gated out leave their snapshot fields null and the validators
          // degrade to sync-snapshot behavior. Uses the BEFORE-move eval —
          // the position the grounding sources are fetched for (mixing the
          // after-move eval here would make lc0AgreesWithSf compare two
          // different positions).
          const stage9Snapshot = prep.moveCtx.moveSan && prep.moveCtx.fenBefore
            ? await buildAsyncSnapshotForMove({
                fenBefore: prep.moveCtx.fenBefore,
                moveSan: prep.moveCtx.moveSan,
                stockfishEvalCp: prep.moveCtx.stockfishEvalBefore.cp ?? null,
                stockfishBestMoveMate: prep.moveCtx.stockfishEvalBefore.mate ?? null,
                stockfishLines: prep.moveCtx.stockfishLinesBefore,
                userRating: userRating ?? null,
                correlationId: requestId,
                branch: "stream-flagon-pipeline",
                // Fail-open: the helper is designed never to reject, but a
                // grounding bug must degrade to no-snapshot, not error the
                // stream.
              }).catch(() => undefined)
            : undefined;

          let pipelineResult: PipelineResultWithTimeout;
          try {
            pipelineResult = await withPipelineTimeout(
              (signal) =>
                runValidationPipeline({
                  initialRequest: {
                    tier: "flagship",
                    system: claudeSystemParts.stable,
                    systemSuffix: claudeSystemParts.perUser,
                    messages: claudeMessages,
                    temperature: 0.7,
                    maxTokens: 3000,
                    cacheSystem: true,
                  },
                  stockfishEval: prep.moveCtx.stockfishEval,
                  featureDelta: streamingDataSources.featureDelta,
                  pieceRoleDiff: streamingDataSources.pieceRoleDiff,
                  threatTree: streamingDataSources.threatTree,
                  playerPerspective,
                  fen: validationFen,
                  moveSan: prep.moveCtx.moveSan,
                  correlationId: requestId,
                  category: prep.category,
                  // 2026-05-30 fix-per-category-retries: game_review gets
                  // 0 retries; others scale down from the legacy default of 2.
                  // CH-2 (Q3): on the anchored overclaim path, cap to a single
                  // hedge-retry, and 0 on a strategic_read position (a retry
                  // can't add grounding that isn't there).
                  maxRetries: resolveOverclaimRetries(
                    readMaxRetries(prep.category),
                    stage9Snapshot?.positionConfidence,
                    POSITION_ANCHORED_VALIDATOR_CATEGORIES.has(prep.category),
                  ),
                  dataSources: {
                    scout: streamingDataSources.scout,
                    userHistory: streamingDataSources.userHistory,
                  },
                  voterSnapshot: stage9Snapshot,
                  enableRelationalValidator: validatorsEnabled,
                  relationalFenMap,
                  signal,
                }),
              {
                correlationId: requestId,
                timeoutMs: readPipelineTimeoutMs(prep.category),
                fallbackResponse:
                  "Still analyzing — the deep-validation pass took longer than expected. Please ask again or rephrase.",
              },
            );
          } catch (err) {
            const e = err instanceof LLMError ? err : new Error(String(err));
            log.error("Mastermind pipeline failed in stream", { message: e.message });
            reportFatal(err, "stream:mastermind-pipeline", {
              category: prep.category,
            });
            send({ type: "error", error: e.message });
            controller.close();
            return;
          }

          if (pipelineResult.timedOut) {
            send({ type: "validating", phase: "timed-out" });
          } else if (pipelineResult.retryCount > 0) {
            send({ type: "validating", phase: `retry-${pipelineResult.retryCount}` });
          }
          if (pipelineResult.finalOutcome === "fallback_used" && !pipelineResult.timedOut) {
            send({ type: "validating", phase: "fallback" });
          }

          // Synthetic re-stream the final pipeline text in paced chunks.
          const finalText = pipelineResult.finalResponse || "No analysis generated.";
          const CHUNK_SIZE = 60;
          const CHUNK_DELAY_MS = 15;
          for (let i = 0; i < finalText.length; i += CHUNK_SIZE) {
            send({ type: "text", delta: finalText.slice(i, i + CHUNK_SIZE) });
            if (i + CHUNK_SIZE < finalText.length) {
              await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
            }
          }

          // Post-pipeline: chess.js validator still runs for observability,
          // but the "may be inaccurate" disclaimer annotation is suppressed
          // for non-position-anchored categories (2026-05-26
          // fix-game-review-false-positives, complement of the eval +
          // featureDelta validator skip in PipelineOpts.category). The
          // chess.js piece-on-square check resolves against a SINGLE FEN
          // (validationFen = current position) but the LLM's prose for
          // game_review queries naturally cites historical positions
          // ("bishop on c5 was strong earlier"). False-positive disclaimer
          // appears on legitimate historical citations. Suppress for these
          // categories; keep for position_analysis where validator + query
          // align.
          // 2026-05-30 fix-fallback-prose-disclaimer: when the Mastermind
          // pipeline used buildFallbackResponse, the resulting prose is
          // deterministic + ground-truth-derived from featureDelta /
          // roleChangePhrases. Those phrases cite the PRE-MOVE position
          // ("bishop on d6 lost its role") while the chess.js validator
          // resolves against the POST-MOVE FEN — guaranteed false-positive
          // "may be inaccurate" disclaimer on top of correct content.
          // Detect fallback_used and gate the annotation off accordingly.
          // Validator still runs for observability + log signal.
          const isFallbackUsed =
            pipelineResult.finalOutcome === "fallback_used";
          const validation = validateAIResponse(finalText, validationFen, moveHistory);
          if (validation.issues.length > 0) {
            log.warn("AI response validation issues (post-pipeline)", {
              issueCount: validation.issues.length,
              score: validation.score,
              issues: validation.issues.map((i) => ({ severity: i.severity, type: i.type, detail: i.detail })),
              category: prep.category,
              positionAnchored: POSITION_ANCHORED_VALIDATOR_CATEGORIES.has(prep.category),
              fallbackUsed: isFallbackUsed,
            });
          }
          // Motif grounding parity with non-streaming flag-on branch
          // (route.ts:2035-2054). Log-only in v1.
          if (prep.moveCtx.moveSan && prep.moveCtx.fenBefore) {
            try {
              const moveMotifs: AnyMotif[] = detectMotifs(prep.moveCtx.fenBefore, prep.moveCtx.moveSan);
              const groundingResult = validateMotifGrounding({
                llmResponse: finalText,
                detectedMotifs: moveMotifs,
                fen: prep.moveCtx.fenAfter,
                moveSan: prep.moveCtx.moveSan,
                correlationId: requestId,
              });
              if (!groundingResult.passed) {
                log.warn("motif_grounding_failed", {
                  issues: groundingResult.issues.map(i => i.llm_span),
                  motif_count: moveMotifs.length,
                  correlationId: requestId,
                  branch: "stream-flagon-pipeline",
                });
              }
              // Stage 9: parity with motifGrounding pattern above. Reuses
              // the async-grounded snapshot built before the pipeline —
              // same move context, zero extra fetches (and the module TTL
              // caches would dedupe anyway). This post-pipeline re-check
              // matters for fallback/timeout cases where finalText was
              // never validated inside runValidationPipeline.
              if (stage9Snapshot) {
                runStreamingStage9Validators({
                  llmResponse: finalText,
                  voterSnapshot: stage9Snapshot,
                  fen: prep.moveCtx.fenAfter,
                  moveSan: prep.moveCtx.moveSan,
                  playerPerspective,
                  correlationId: requestId,
                  branch: "stream-flagon-pipeline",
                  log,
                });
              }
            } catch { /* non-critical */ }
          }
          const usePositionAnchoredAnnotation =
            !isFallbackUsed &&
            POSITION_ANCHORED_VALIDATOR_CATEGORIES.has(prep.category);
          const analysisContent =
            usePositionAnchoredAnnotation && !validation.isValid
              ? validation.correctedResponse
              : finalText;

          // Never cache non-answers: the timeout placeholder ("Still
          // analyzing — …") scores 1.0 on the regex validator and used to be
          // cached for 24h, replaying the non-answer for every identical
          // question on that position. Same for the deterministic template
          // fallback — a degraded artifact, not the analysis.
          if (!pipelineResult.timedOut && !isFallbackUsed) {
            setCachedResponse(cacheKey, analysisContent, validation.score);
          }
          const contextId = generateContextId(moveHistory, fen, playerColor || "w", session.uid);
          const compactGameContext = buildCompactGameContext(
            moveHistory ?? [],
            gameEval,
            playerColor || "w",
          );
          storeAnalysisContext({
            contextId,
            gameContext,
            compactGameContext,
            playedMoves: moveHistory ?? [],
            systemPrompt: claudeSystemPrompt,
            systemPromptStable: claudeSystemParts.stable,
            systemPromptSuffix: claudeSystemParts.perUser,
            fewShotExamples: examplesContext,
            fen: validationFen,
            skillLevel,
            playerColor: playerColor || "w",
            moveCount: Math.ceil(game.history().length / 2),
            createdAt: Date.now(),
            initialAnalysis: analysisContent,
            gameEval,
          });

          let puzzleRecommendations: unknown = undefined;
          try {
            puzzleRecommendations = await generatePuzzleRecommendations(
              moveHistory,
              gameEval,
              userRating,
            );
          } catch (err) {
            log.warn("puzzle recs failed in stream (flag-on)", {
              err: err instanceof Error ? err.message : String(err),
            });
          }

          // §3.7.9 insertion point F: forward pipeline telemetry + citationRate.
          forwardPipelineTelemetryForRoute({
            pipelineResult,
            dataSources: prep.dataSources,
            category: prep.category,
            routeKind: "/api/enhanced-analysis",
            userId: session.uid,
            sessionId: contextId,
            responseId: requestId,
          });

          send({
            type: "done",
            metadata: {
              analysis: analysisContent,
              position: validationFen,
              turn: game.turn(),
              moveCount: Math.ceil(game.history().length / 2),
              availableMoves: game.moves().length,
              validationScore: validation.score,
              validationIssues: validation.issues.length,
              contextId,
              puzzleRecommendations,
              // `corrected` signals the client to replace the streamedText
              // with metadata.analysis. We only do so when the disclaimer
              // is actually applied (position-anchored category + invalid).
              corrected: usePositionAnchoredAnnotation && !validation.isValid,
              pipeline: {
                finalOutcome: pipelineResult.finalOutcome,
                retryCount: pipelineResult.retryCount,
                totalCostUsd: pipelineResult.totalCostUsd,
                category: prep.category,
                classifierConfidence: prep.classifierConfidence,
                prepMs: prep.prepMs,
                timedOut: pipelineResult.timedOut,
              },
            },
          });
          controller.close();
        },
      });

      return new Response(sseStream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // ── Streaming branch (flag-off) ─────────────────────────────────────
    // When the client opts into streaming, we forward Claude's incremental
    // text deltas as Server-Sent Events. Validation, cache write, contextId
    // generation, and puzzle recommendations all run AFTER the stream ends
    // and ride on a final `done` event so the client picks them up too.
    if (streamRequested) {
      // Compute current FEN/game state up front; the stream's done event
      // needs them and they're cheap to compute here.
      const game = new Chess();
      if (moveHistory && moveHistory.length > 0) {
        for (const m of moveHistory) {
          try { game.move(m); } catch { break; }
        }
      } else if (fen) {
        try { game.load(fen); } catch { /* ignore */ }
      }
      const validationFen = game.fen();

      const encoder = new TextEncoder();
      const sseStream = new ReadableStream({
        async start(controller) {
          const send = (obj: unknown) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          };

          // Stage 9 v2: kick off async grounding for the last played move in
          // parallel with the LLM stream — same overlap pattern as the
          // flag-on fallback wing. No prep/moveCtx in this flag-off scope, so
          // derive the before-position from moveHistory + gameEval directly
          // (positions[i] = eval after i half-moves, so positions[lastIdx]
          // with lastIdx = length - 1 IS the pre-move position). Fail-open.
          let stage9SnapPromise: Promise<VoterSnapshot | undefined> =
            Promise.resolve(undefined);
          if (moveHistory && moveHistory.length > 0) {
            try {
              const lastIdx = moveHistory.length - 1;
              const evalBeforeLast = gameEval?.positions?.[lastIdx];
              stage9SnapPromise = buildAsyncSnapshotForMove({
                fenBefore: getFenAtHalfMove(moveHistory, lastIdx),
                moveSan: moveHistory[lastIdx],
                stockfishEvalCp: evalBeforeLast?.lines?.[0]?.cp ?? null,
                stockfishBestMoveMate: evalBeforeLast?.lines?.[0]?.mate ?? null,
                stockfishLines: evalBeforeLast?.lines ?? [],
                userRating: userRating ?? null,
                correlationId: requestId,
                branch: "stream-flagoff",
              }).catch(() => undefined);
            } catch { /* non-critical — Stage 9 block below skips */ }
          }

          let fullText = "";
          let llmDone: import("@/lib/llmProvider").LLMResult | null = null;
          try {
            for await (const evt of callLLMStream({
              tier: "flagship",
              system: claudeSystemParts.stable,
              systemSuffix: claudeSystemParts.perUser,
              messages: claudeMessages,
              temperature: 0.7,
              maxTokens: 3000,
              cacheSystem: true,
              capture: {
                feature: "enhanced-analysis",
                uid: session.uid,
                requestId,
                promptVersion: PROMPT_VERSION,
                fen,
                props: { branch: "stream-flag-off" },
              },
            })) {
              if (evt.type === "text") {
                fullText += evt.delta;
                send({ type: "text", delta: evt.delta });
              } else {
                llmDone = evt.result;
              }
            }
          } catch (err) {
            const e = err instanceof LLMError ? err : new Error(String(err));
            log.error("LLM streaming failed for enhanced-analysis", { message: e.message });
            reportFatal(err, "stream:flag-off", {
              provider: e instanceof LLMError ? e.provider : undefined,
              status: e instanceof LLMError ? e.status : undefined,
            });
            send({ type: "error", error: e.message });
            controller.close();
            return;
          }

          if (llmDone) {
            console.log("coach.tokens", {
              input: llmDone.inputTokens,
              output: llmDone.outputTokens,
              cacheCreation: llmDone.cacheCreationTokens,
              cacheRead: llmDone.cacheReadTokens,
              promptVersion: PROMPT_VERSION,
              streamed: true,
            });
            recordLLMCall(llmDone);
          }

          // Post-stream: validate, cache, store context, build puzzle recs.
          const rawAnalysis = fullText || "No analysis generated.";
          const validation = validateAIResponse(rawAnalysis, validationFen, moveHistory);
          if (validation.issues.length > 0) {
            log.warn("AI response validation issues", {
              issueCount: validation.issues.length,
              score: validation.score,
              issues: validation.issues.map(i => ({ severity: i.severity, type: i.type, detail: i.detail })),
            });
          }
          // Motif grounding parity with non-streaming flag-on branch
          // (route.ts:2035-2054). Log-only in v1; ALL live user traffic
          // streams, so without this the validator never fires in prod.
          if (moveHistory && moveHistory.length > 0) {
            try {
              const lastIdx = moveHistory.length - 1;
              const fenBeforeLast = getFenAtHalfMove(moveHistory, lastIdx);
              const moveSanLast = moveHistory[lastIdx];
              const moveMotifs: AnyMotif[] = detectMotifs(fenBeforeLast, moveSanLast);
              const groundingResult = validateMotifGrounding({
                llmResponse: rawAnalysis,
                detectedMotifs: moveMotifs,
                fen: validationFen,
                moveSan: moveSanLast,
                correlationId: requestId,
              });
              if (!groundingResult.passed) {
                log.warn("motif_grounding_failed", {
                  issues: groundingResult.issues.map(i => i.llm_span),
                  motif_count: moveMotifs.length,
                  correlationId: requestId,
                  branch: "stream-flagoff",
                });
              }
              // Stage 9: async-grounded snapshot kicked off before the
              // stream started — the await is ~instant in the common case.
              const stage9Snap = await stage9SnapPromise;
              if (stage9Snap) {
                // playerPerspective is computed inside the Mastermind branch
                // but not in this flag-off scope — derive locally.
                const ppLocal: "white" | "black" =
                  playerColor === "b" ? "black" : "white";
                runStreamingStage9Validators({
                  llmResponse: rawAnalysis,
                  voterSnapshot: stage9Snap,
                  fen: validationFen,
                  moveSan: moveSanLast,
                  playerPerspective: ppLocal,
                  correlationId: requestId,
                  branch: "stream-flagoff",
                  log,
                });
              }
            } catch { /* non-critical */ }
          }
          const analysisContent = validation.isValid ? rawAnalysis : validation.correctedResponse;

          setCachedResponse(cacheKey, analysisContent, validation.score);
          const contextId = generateContextId(moveHistory, fen, playerColor || "w", session.uid);
          const compactGameContext = buildCompactGameContext(
            moveHistory ?? [],
            gameEval,
            playerColor || "w"
          );
          storeAnalysisContext({
            contextId,
            gameContext,
            compactGameContext,
            playedMoves: moveHistory ?? [],
            systemPrompt: claudeSystemPrompt,
            systemPromptStable: claudeSystemParts.stable,
            systemPromptSuffix: claudeSystemParts.perUser,
            fewShotExamples: examplesContext,
            fen: validationFen,
            skillLevel,
            playerColor: playerColor || "w",
            moveCount: Math.ceil(game.history().length / 2),
            createdAt: Date.now(),
            initialAnalysis: analysisContent,
            gameEval,
          });

          let puzzleRecommendations: unknown = undefined;
          try {
            puzzleRecommendations = await generatePuzzleRecommendations(
              moveHistory,
              gameEval,
              userRating
            );
          } catch (err) {
            log.warn("puzzle recs failed in stream", { err: err instanceof Error ? err.message : String(err) });
          }

          send({
            type: "done",
            metadata: {
              analysis: analysisContent,
              position: validationFen,
              turn: game.turn(),
              moveCount: Math.ceil(game.history().length / 2),
              availableMoves: game.moves().length,
              validationScore: validation.score,
              validationIssues: validation.issues.length,
              contextId,
              puzzleRecommendations,
              corrected: !validation.isValid,
            },
          });
          controller.close();
        },
      });

      return new Response(sseStream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // ── Stage B insertion point E (§3.7.9): non-streaming flag-on wing ──
    // Pipeline replaces callLLM. If FD throws (prep.dataSources === null),
    // fall back to the existing callLLM path per §3.2.
    let rawAnalysis: string;
    let pipelineResultForTelemetry: PipelineResultWithTimeout | null = null;
    let mastermindPrepForTelemetry: MastermindPrepResult | null = null;

    if (validatorsEnabled) {
      const playerPerspective: "white" | "black" =
        playerColor === "b" ? "black" : "white";
      const prep = await prepareMastermindContext({
        userMessage: messageText,
        moveHistory,
        fen,
        gameEval,
        playerPerspective,
        correlationId: requestId,
        uid: session.uid,
        userName: username ?? session.uid,
        opponentUsername,
        opponentPlatform,
      });

      if (prep.dataSources) {
        // Capture narrowed dataSources locally so the factory closure
        // below preserves the non-null type (TS loses control-flow
        // narrowing across function boundaries).
        const nonStreamingDataSources = prep.dataSources;
        // Stage 9 v2: async-grounded voter snapshot — same wiring as the
        // streaming pipeline branch above. Awaited BEFORE withPipelineTimeout
        // so the fetches never eat the pipeline's regenerate budget; uses the
        // before-move eval per the SyncSnapshotInput contract.
        const stage9SnapshotNonStream = prep.moveCtx.moveSan && prep.moveCtx.fenBefore
          ? await buildAsyncSnapshotForMove({
              fenBefore: prep.moveCtx.fenBefore,
              moveSan: prep.moveCtx.moveSan,
              stockfishEvalCp: prep.moveCtx.stockfishEvalBefore.cp ?? null,
              stockfishBestMoveMate: prep.moveCtx.stockfishEvalBefore.mate ?? null,
              stockfishLines: prep.moveCtx.stockfishLinesBefore,
              userRating: userRating ?? null,
              correlationId: requestId,
              branch: "non-streaming-flagon",
              // Fail-open: degrade to no-snapshot rather than 502 the turn.
            }).catch(() => undefined)
          : undefined;
        try {
          const pipelineResult = await withPipelineTimeout(
            (signal) =>
              runValidationPipeline({
                initialRequest: {
                  tier: "flagship",
                  system: claudeSystemParts.stable,
                  systemSuffix: claudeSystemParts.perUser,
                  messages: claudeMessages,
                  temperature: 0.7,
                  maxTokens: 3000,
                  cacheSystem: true,
                },
                stockfishEval: prep.moveCtx.stockfishEval,
                featureDelta: nonStreamingDataSources.featureDelta,
                pieceRoleDiff: nonStreamingDataSources.pieceRoleDiff,
                threatTree: nonStreamingDataSources.threatTree,
                playerPerspective,
                fen: prep.moveCtx.fenAfter,
                moveSan: prep.moveCtx.moveSan,
                correlationId: requestId,
                category: prep.category,
                // 2026-05-30 fix-per-category-retries + CH-2 (Q3)
                // confidence-aware single-regen: same as the realtime-stream
                // branch above.
                maxRetries: resolveOverclaimRetries(
                  readMaxRetries(prep.category),
                  stage9SnapshotNonStream?.positionConfidence,
                  POSITION_ANCHORED_VALIDATOR_CATEGORIES.has(prep.category),
                ),
                dataSources: {
                  scout: nonStreamingDataSources.scout,
                  userHistory: nonStreamingDataSources.userHistory,
                },
                voterSnapshot: stage9SnapshotNonStream,
                enableRelationalValidator: validatorsEnabled,
                relationalFenMap,
                signal,
              }),
            {
              correlationId: requestId,
              timeoutMs: readPipelineTimeoutMs(prep.category),
              fallbackResponse:
                "Still analyzing — the deep-validation pass took longer than expected. Please ask again or rephrase.",
            },
          );
          rawAnalysis = pipelineResult.finalResponse || "No analysis generated.";
          pipelineResultForTelemetry = pipelineResult;
          mastermindPrepForTelemetry = prep;

          // Stage 5 post-LLM motif grounding check (log-only in v1; regeneration loop in Stage 6)
          if (prep.moveCtx.moveSan && prep.moveCtx.fenBefore) {
            try {
              const moveMotifs: AnyMotif[] = detectMotifs(prep.moveCtx.fenBefore, prep.moveCtx.moveSan);
              const groundingResult = validateMotifGrounding({
                llmResponse: rawAnalysis,
                detectedMotifs: moveMotifs,
                fen: prep.moveCtx.fenAfter,
                moveSan: prep.moveCtx.moveSan,
                correlationId: requestId,
              });
              if (!groundingResult.passed) {
                log.warn("motif_grounding_failed", {
                  issues: groundingResult.issues.map(i => i.llm_span),
                  motif_count: moveMotifs.length,
                  correlationId: requestId,
                });
              }
              // Stage 9: post-pipeline log-only check on the final response.
              // Important for pipeline-fallback (timeout) cases where the
              // returned text was deterministic template not validated by
              // Stage 9 inside runValidationPipeline. Reuses the async
              // snapshot built before the pipeline — same move context,
              // zero extra fetches.
              if (stage9SnapshotNonStream) {
                runStreamingStage9Validators({
                  llmResponse: rawAnalysis,
                  voterSnapshot: stage9SnapshotNonStream,
                  fen: prep.moveCtx.fenAfter,
                  moveSan: prep.moveCtx.moveSan,
                  playerPerspective,
                  correlationId: requestId,
                  branch: "non-streaming-flagon",
                  log,
                });
              }
            } catch { /* non-critical */ }
          }

          console.log("coach.tokens", {
            input: undefined,  // pipeline-managed; surfaced via pipelineResult.totalCostUsd
            output: undefined,
            promptVersion: PROMPT_VERSION,
            pipelineCostUsd: pipelineResult.totalCostUsd,
            pipelineFinalOutcome: pipelineResult.finalOutcome,
            pipelineRetryCount: pipelineResult.retryCount,
            pipelineTimedOut: pipelineResult.timedOut,
          });
        } catch (err) {
          const e = err instanceof LLMError ? err : new Error(String(err));
          log.error("Mastermind pipeline failed for enhanced-analysis", { message: e.message });
          reportFatal(err, "non-stream:mastermind-pipeline", {
            category: prep.category,
          });
          return NextResponse.json(
            { error: "Pipeline request failed", details: e.message },
            { status: 502 },
          );
        }
      } else {
        // FD failed → flag-off fallback for this turn.
        let llmResult;
        try {
          llmResult = await callLLM({
            tier: "flagship",
            system: claudeSystemParts.stable,
            systemSuffix: claudeSystemParts.perUser,
            messages: claudeMessages,
            temperature: 0.7,
            maxTokens: 3000,
            cacheSystem: true,
            capture: {
              feature: "enhanced-analysis",
              uid: session.uid,
              requestId,
              promptVersion: PROMPT_VERSION,
              fen,
              props: { branch: "nonstream-fd-fallback" },
            },
          });
        } catch (err) {
          const e = err instanceof LLMError ? err : new Error(String(err));
          log.error("LLM provider failed (flag-on fallback after FD failure)", { message: e.message });
          reportFatal(err, "non-stream:fd-fallback", {
            provider: e instanceof LLMError ? e.provider : undefined,
            status: e instanceof LLMError ? e.status : undefined,
          });
          return NextResponse.json(
            { error: "LLM request failed", details: e.message },
            { status: 502 },
          );
        }
        console.log("coach.tokens", {
          input: llmResult.inputTokens,
          output: llmResult.outputTokens,
          promptVersion: PROMPT_VERSION,
          flagOnFallback: true,
        });
        llmTelemetry = {
          provider: llmResult.provider,
          model: llmResult.model,
          inputTokens: llmResult.inputTokens,
          outputTokens: llmResult.outputTokens,
          cacheCreationTokens: llmResult.cacheCreationTokens,
          cacheReadTokens: llmResult.cacheReadTokens,
          elapsedMs: llmResult.elapsedMs,
        };
        recordLLMCall(llmResult);
        rawAnalysis = llmResult.content || "No analysis generated.";
      }
    } else {
      // Call the unified LLM provider (Anthropic primary, OpenAI fallback).
      let llmResult;
      try {
        llmResult = await callLLM({
          tier: "flagship",
          system: claudeSystemParts.stable,
          systemSuffix: claudeSystemParts.perUser,
          messages: claudeMessages,
          temperature: 0.7,
          maxTokens: 3000,
          cacheSystem: true,
          capture: {
            feature: "enhanced-analysis",
            uid: session.uid,
            requestId,
            promptVersion: PROMPT_VERSION,
            fen,
            props: { branch: "nonstream-flag-off" },
          },
        });
      } catch (err) {
        const e = err instanceof LLMError ? err : new Error(String(err));
        log.error("LLM provider failed for enhanced-analysis", {
          message: e.message,
        });
        reportFatal(err, "non-stream:flag-off", {
          provider: e instanceof LLMError ? e.provider : undefined,
          status: e instanceof LLMError ? e.status : undefined,
        });
        return NextResponse.json(
          {
            error: "LLM request failed",
            details: e.message,
          },
          { status: 502 }
        );
      }
      console.log("coach.tokens", {
        input: llmResult.inputTokens,
        output: llmResult.outputTokens,
        promptVersion: PROMPT_VERSION,
      });
      llmTelemetry = {
        provider: llmResult.provider,
        model: llmResult.model,
        inputTokens: llmResult.inputTokens,
        outputTokens: llmResult.outputTokens,
        cacheCreationTokens: llmResult.cacheCreationTokens,
        cacheReadTokens: llmResult.cacheReadTokens,
        elapsedMs: llmResult.elapsedMs,
      };
      recordLLMCall(llmResult);
      rawAnalysis = llmResult.content || "No analysis generated.";
    }

    // Build final game state for response metadata
    const game = new Chess();
    if (moveHistory && moveHistory.length > 0) {
      for (const m of moveHistory) {
        try { game.move(m); } catch { break; }
      }
    } else if (fen) {
      try { game.load(fen); } catch { /* ignore */ }
    }

    // Validate the LLM response against the actual board state
    const validationFen = game.fen();
    const validation = validateAIResponse(rawAnalysis, validationFen, moveHistory);

    if (validation.issues.length > 0) {
      log.warn("AI response validation issues", {
        issueCount: validation.issues.length,
        score: validation.score,
        issues: validation.issues.map(i => ({ severity: i.severity, type: i.type, detail: i.detail })),
        category: mastermindPrepForTelemetry?.category,
      });
    }

    // 2026-05-26 fix-game-review-false-positives: chess.js "may be
    // inaccurate" disclaimer is suppressed for non-position-anchored
    // categories (game_review et al.) because the validator's
    // current-FEN-only check produces false positives on legitimate
    // historical citations. Disclaimer kept for position_analysis and
    // for the legacy flag-off path (no category info, preserve prior
    // behavior).
    const usePositionAnchoredAnnotation = mastermindPrepForTelemetry
      ? POSITION_ANCHORED_VALIDATOR_CATEGORIES.has(mastermindPrepForTelemetry.category)
      : true; // flag-off / pre-Mastermind path: keep historical behavior
    const analysisContent =
      usePositionAnchoredAnnotation && !validation.isValid
        ? validation.correctedResponse
        : rawAnalysis;

    // Cache the validated response for future identical queries — but never
    // cache non-answers (timeout placeholder / deterministic template
    // fallback), which used to be cached for 24h and replayed verbatim.
    const nonStreamDegraded =
      pipelineResultForTelemetry?.timedOut === true ||
      pipelineResultForTelemetry?.finalOutcome === "fallback_used";
    if (!nonStreamDegraded) {
      setCachedResponse(cacheKey, analysisContent, validation.score);
    }

    // Store full analysis context for fast follow-up chat via /api/chat
    const contextId = generateContextId(moveHistory, fen, playerColor || "w", session.uid);
    const compactGameContext = buildCompactGameContext(
      moveHistory ?? [],
      gameEval,
      playerColor || "w"
    );
    storeAnalysisContext({
      contextId,
      gameContext,
      compactGameContext,
      playedMoves: moveHistory ?? [],
      systemPrompt: claudeSystemPrompt,
      systemPromptStable: claudeSystemParts.stable,
      systemPromptSuffix: claudeSystemParts.perUser,
      fewShotExamples: examplesContext,
      fen: validationFen,
      skillLevel,
      playerColor: playerColor || "w",
      moveCount: Math.ceil(game.history().length / 2),
      createdAt: Date.now(),
      initialAnalysis: analysisContent,
      gameEval,
    });

    // Generate targeted puzzle recommendations for detected mistakes
    const puzzleRecommendations = await generatePuzzleRecommendations(
      moveHistory,
      gameEval,
      userRating
    );

    // Stage B insertion point F: forward pipeline telemetry + citationRate.
    // Only when the pipeline actually ran (validatorsEnabled + FD succeeded).
    if (pipelineResultForTelemetry && mastermindPrepForTelemetry?.dataSources) {
      forwardPipelineTelemetryForRoute({
        pipelineResult: pipelineResultForTelemetry,
        dataSources: mastermindPrepForTelemetry.dataSources,
        category: mastermindPrepForTelemetry.category,
        routeKind: "/api/enhanced-analysis",
        userId: session.uid,
        sessionId: contextId,
        responseId: requestId,
      });
    }

    return NextResponse.json({
      gameAnalysis: {
        analysis: analysisContent,
        position: validationFen,
        turn: game.turn(),
        moveCount: Math.ceil(game.history().length / 2),
        availableMoves: game.moves().length,
        validationScore: validation.score,
        validationIssues: validation.issues.length,
        contextId,
        puzzleRecommendations, // NEW: Targeted puzzles for each mistake
        // Per-request token + cache stats from the LLM provider. Lets
        // callers (the synthetic-tester, demo screenshots, an eventual
        // cost dashboard) see exactly how many input tokens were served
        // from the prompt cache vs charged at full rate, without having
        // to grep Vercel Log Drain for "coach.tokens" lines.
        ...(llmTelemetry ? { llm: llmTelemetry } : {}),
        ...(pipelineResultForTelemetry && mastermindPrepForTelemetry
          ? {
              pipeline: {
                finalOutcome: pipelineResultForTelemetry.finalOutcome,
                retryCount: pipelineResultForTelemetry.retryCount,
                totalCostUsd: pipelineResultForTelemetry.totalCostUsd,
                category: mastermindPrepForTelemetry.category,
                classifierConfidence: mastermindPrepForTelemetry.classifierConfidence,
                prepMs: mastermindPrepForTelemetry.prepMs,
                timedOut: pipelineResultForTelemetry.timedOut,
                // Stage C telemetry expose (Follow-up A, 2026-05-23): preview
                // env only. Production responses do not include the telemetry
                // array — see Stage C dispatch design + Pause 4 dry-run
                // surface for context. The events still emit through the
                // structured logger to Vercel Log Drain on every env; this
                // field just additionally inlines them in the response so
                // the synthetic-tester harness can capture per-turn telemetry
                // without a separate Log Drain reader.
                ...(process.env.VERCEL_ENV === "preview"
                  ? { telemetry: pipelineResultForTelemetry.telemetry }
                  : {}),
              },
            }
          : {}),
      },
    });
  } catch (error) {
    log.error("Enhanced analysis failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    reportFatal(error, "non-stream:uncaught");
    return NextResponse.json(
      {
        error: "Analysis failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
  });
}
