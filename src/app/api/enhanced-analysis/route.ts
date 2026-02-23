import { NextRequest, NextResponse } from "next/server";
import { Chess } from "chess.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

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
 * Build a rich move-by-move game context string from the move history + Stockfish evals.
 * This gives the LLM everything it needs to analyze the game.
 */
function buildGameContext(
  moveHistory: string[],
  gameEval: GameEvalInput | undefined,
  playerColor: string,
  username?: string,
  userRating?: number
): string {
  const sections: string[] = [];

  // --- Game overview ---
  const totalHalfMoves = moveHistory.length;
  const totalFullMoves = Math.ceil(totalHalfMoves / 2);
  const game = new Chess();
  for (const m of moveHistory) {
    try { game.move(m); } catch { break; }
  }

  let overview = `## GAME OVERVIEW\n`;
  overview += `- Total moves: ${totalFullMoves} full moves (${totalHalfMoves} half-moves)\n`;
  overview += `- Result: ${game.isCheckmate() ? "Checkmate" : game.isStalemate() ? "Stalemate" : game.isDraw() ? "Draw" : "In progress"}\n`;
  if (username) overview += `- Player: ${username} playing as ${playerColor === "w" ? "White" : "Black"}\n`;
  if (userRating) overview += `- Player rating: ${userRating}\n`;
  if (gameEval?.accuracy) overview += `- Accuracy: White ${gameEval.accuracy.white.toFixed(1)}%, Black ${gameEval.accuracy.black.toFixed(1)}%\n`;
  if (gameEval?.estimatedElo) overview += `- Estimated Elo: White ~${gameEval.estimatedElo.white}, Black ~${gameEval.estimatedElo.black}\n`;
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
    }> = [];

    for (let i = 0; i < moveHistory.length; i++) {
      const moveSan = moveHistory[i];
      const moveNum = Math.floor(i / 2) + 1;
      const color = i % 2 === 0 ? "White" : "Black";
      const moveLabel = i % 2 === 0 ? `${moveNum}.` : `${moveNum}...`;

      // Eval BEFORE this move = positions[i], eval AFTER = positions[i+1]
      const evalBefore = gameEval.positions[i];
      const evalAfter = gameEval.positions[i + 1];

      let line = `${moveLabel} ${moveSan} (${color})`;

      // Classification
      const classification = evalAfter?.moveClassification;
      if (classification) {
        line += ` [${classification.toUpperCase()}]`;
      }

      // Evaluation after
      if (evalAfter?.lines?.[0]) {
        const topLine = evalAfter.lines[0];
        if (topLine.mate !== undefined) {
          line += ` — Eval: M${topLine.mate > 0 ? "+" : ""}${topLine.mate}`;
        } else if (topLine.cp !== undefined) {
          const pawns = (topLine.cp / 100).toFixed(2);
          line += ` — Eval: ${topLine.cp >= 0 ? "+" : ""}${pawns}`;
        }
      }

      // Best move from the position BEFORE this move was played
      if (evalBefore?.bestMove && evalBefore.bestMove !== "N/A") {
        // We need the FEN before this move to convert UCI to SAN
        const fenBefore = getFenAtHalfMove(moveHistory, i);
        const bestSan = uciToSan(fenBefore, evalBefore.bestMove);
        if (bestSan !== moveSan) {
          line += ` — Best was: ${bestSan}`;
        }
      }

      moveLines.push(line);

      // Detect mistakes (evaluation drops)
      if (evalBefore?.lines?.[0] && evalAfter?.lines?.[0]) {
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
          const fenBefore = getFenAtHalfMove(moveHistory, i);
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
          });
        }
      }
    }

    sections.push(`## MOVE-BY-MOVE ANALYSIS (with Stockfish evaluations)\n${moveLines.join("\n")}`);

    // --- Top mistakes ---
    if (mistakes.length > 0) {
      mistakes.sort((a, b) => b.drop - a.drop);
      const topMistakes = mistakes.slice(0, 10);
      const mistakeLines = topMistakes.map((m) => {
        const severity = m.drop >= 300 ? "BLUNDER" : m.drop >= 150 ? "MISTAKE" : m.drop >= 50 ? "INACCURACY" : "MINOR";
        const evalBeforeStr = Math.abs(m.evalBefore) >= 9000 ? (m.evalBefore > 0 ? "M+" : "M-") : (m.evalBefore / 100).toFixed(2);
        const evalAfterStr = Math.abs(m.evalAfter) >= 9000 ? (m.evalAfter > 0 ? "M+" : "M-") : (m.evalAfter / 100).toFixed(2);
        return `- Move ${m.moveNum} (${m.color}): ${m.moveSan} [${severity}] — Eval went from ${evalBeforeStr} to ${evalAfterStr} (lost ${(m.drop / 100).toFixed(1)} pawns) — Best was: ${m.bestMove}`;
      });

      sections.push(`## TOP MISTAKES (sorted by severity)\n${mistakeLines.join("\n")}`);
    } else {
      sections.push(`## MISTAKES\nNo significant mistakes detected (all moves within 0.5 pawn of engine best).`);
    }
  } else {
    sections.push(`## NOTE: No Stockfish evaluation data available. The game has not been engine-analyzed yet. Analyze the position and moves based on general chess principles.`);
  }

  // --- Material balance at end ---
  sections.push(`## FINAL POSITION\nFEN: ${game.fen()}\n${getMaterialBalance(game)}`);

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userMessage,
      message,
      moveHistory,
      fen,
      position,
      systemPrompt,
      gameEval,
      playerColor,
      username,
      userRating,
      boardOrientation,
      conversationHistory,
    } = body;
    const messageText = userMessage || message || "";

    console.log("Enhanced analysis API called:", {
      hasMessage: !!messageText,
      moveCount: moveHistory?.length,
      hasEval: !!gameEval,
      hasSystemPrompt: !!systemPrompt,
      playerColor,
    });

    // Check for OpenAI API key
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY not configured");
      return NextResponse.json(
        { error: "OpenAI API key not configured. Please set OPENAI_API_KEY in .env.local." },
        { status: 500 }
      );
    }

    // Build game context for the LLM
    let gameContext = "";
    if (moveHistory && moveHistory.length > 0) {
      gameContext = buildGameContext(
        moveHistory,
        gameEval,
        playerColor || (boardOrientation ? "w" : "b"),
        username,
        userRating
      );
    } else if (fen || position) {
      // Position-only analysis
      const fenStr = fen || position;
      const game = new Chess(fenStr);
      gameContext = `## POSITION ANALYSIS\nFEN: ${fenStr}\nTurn: ${game.turn() === "w" ? "White" : "Black"}\nLegal moves: ${game.moves().length}\n${getMaterialBalance(game)}`;
    } else {
      gameContext = "No game data or position provided. The user may be asking a general chess question.";
    }

    // Build the messages for OpenAI
    const openaiMessages: Array<{ role: string; content: string }> = [];

    // System prompt (from client's AI Coach system prompt)
    if (systemPrompt) {
      openaiMessages.push({ role: "system", content: systemPrompt });
    } else {
      openaiMessages.push({
        role: "system",
        content: "You are an expert chess coach AI. Analyze games thoroughly using Stockfish evaluation data when available. Identify mistakes, explain principles violated, suggest improvements, and reference tactical themes. Be specific — cite exact move numbers and variations.",
      });
    }

    // Add conversation history for multi-turn context (prior messages before current)
    if (conversationHistory && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        if (msg.role && msg.content) {
          openaiMessages.push({ role: msg.role, content: msg.content });
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

    openaiMessages.push({ role: "user", content: userContent });

    // Call OpenAI
    const openaiResponse = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: openaiMessages,
        temperature: 0.7,
        max_tokens: 3000,
      }),
    });

    if (!openaiResponse.ok) {
      const errorBody = await openaiResponse.text();
      console.error("OpenAI API error:", openaiResponse.status, errorBody);
      return NextResponse.json(
        {
          error: "OpenAI API request failed",
          details: `Status ${openaiResponse.status}: ${errorBody.slice(0, 200)}`,
        },
        { status: 502 }
      );
    }

    const openaiData = await openaiResponse.json();
    const analysisContent = openaiData.choices?.[0]?.message?.content || "No analysis generated.";

    // Return the analysis
    const game = new Chess();
    if (moveHistory && moveHistory.length > 0) {
      for (const m of moveHistory) {
        try { game.move(m); } catch { break; }
      }
    } else if (fen) {
      try { game.load(fen); } catch { /* ignore */ }
    }

    return NextResponse.json({
      gameAnalysis: {
        analysis: analysisContent,
        position: game.fen(),
        turn: game.turn(),
        moveCount: Math.ceil(game.history().length / 2),
        availableMoves: game.moves().length,
      },
    });
  } catch (error) {
    console.error("Error in enhanced analysis:", error);
    return NextResponse.json(
      {
        error: "Analysis failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
