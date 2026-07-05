"use client";

import React, { useState, useRef, useEffect } from "react";
import { triggerPaywall } from "@/contexts/PaywallDialogContext";
import {
  Box,
  Paper,
  TextField,
  IconButton,
  Typography,
  CircularProgress,
  Chip,
  Stack,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import ThumbDownOutlinedIcon from "@mui/icons-material/ThumbDownOutlined";
import ThumbUpIcon from "@mui/icons-material/ThumbUp";
import ThumbDownIcon from "@mui/icons-material/ThumbDown";
import ShareIcon from "@mui/icons-material/IosShare";
import Tooltip from "@mui/material/Tooltip";
import { styled } from "@mui/material/styles";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";

import { Chess } from "chess.js";
import { ChessPuzzle } from "@/lib/chessPuzzlesService";
import { useChessActions } from "@/hooks/useChessActions";
import {
  autoAnalyzeStateAtom,
  boardAtom,
  evaluationProgressAtom,
  gameAtom,
  gameEvalAtom,
  moveAnalysisRequestAtom,
  preloadedInsightAtom,
  userPlayerInfoAtom,
} from "@/sections/analysis/states";
import { useAtomValue, useSetAtom } from "jotai";
import { MaiaStatusIndicator } from "./MaiaStatusIndicator";
import { useRouter } from "next/router";
import {
  practicePuzzlesAtom,
  currentPuzzleIndexAtom,
  practiceThemeAtom,
  puzzleSolvedStatusAtom,
  PracticePuzzle,
} from "@/sections/practice/states";
import { getPuzzlesByTheme, normalizeThemeName, TACTICAL_THEMES } from "@/lib/chessPuzzlesService";
import { isExplorationModeAtom } from "@/components/board/states";
import { selectedCoachIdAtom } from "@/atoms/coachAtoms";
import { getPersonalityById } from "@/config/coachPersonalities";
import { useAuth } from "@/contexts/AuthContext";
import { storeFeedback } from "@/lib/feedbackStore";
import { ContextualPuzzleRecommendations } from "@/components/ContextualPuzzleRecommendations";
import { InlinePuzzleSet } from "@/components/InlinePuzzleSet";
import { InsightsCarousel, parseInsights } from "@/components/AICoachInsights";
import { getAuthHeader } from "@/lib/auth/getAuthHeader";
import { loadWeaknessProfile } from "@/lib/weaknessProfile";
import { toMasterySummary } from "@/lib/teaching/relevanceFilter";
import {
  createChat,
  appendMessage,
  getChat,
  generateChatTitle,
  type ChatGameRef,
} from "@/lib/firestoreChats";
import { FlagButton } from "@/components/intern/FlagButton";
import AnalysisSnippetDialog from "@/components/AnalysisSnippetDialog";
import type { AnalysisSnippetData } from "@/lib/analysisSnippet";
import { FadeIn } from "@/components/ui/FadeIn";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  // FEN of the board position this message refers to. Captured at message-
  // creation time for assistant messages so the "Share Insight" card shows the
  // exact position Claude was discussing — not whatever the user has navigated
  // to since. Optional because legacy messages (hydrated from Firestore) and
  // user-authored messages don't carry one.
  fen?: string;
}

interface AICoachChatProps {
  position?: string;
  game?: Chess;
  boardOrientation?: boolean;
}

// Concept reinforcement strip — renders the anchor concept(s) detected for a
// mistake + 3 same-concept reinforcement puzzles from concept-first retrieval.
// Shown inline under Targeted Practice so the student sees "drill this idea" at
// a glance. If the classifier couldn't identify a concept, badges "unclassified"
// per the plan's honesty requirement.
interface ReinforcementData {
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

const ConceptReinforcementStrip: React.FC<{
  reinforcements?: ReinforcementData;
  anchorFen?: string;
}> = ({ reinforcements, anchorFen }) => {
  if (!reinforcements) return null;
  const { concepts, fallbackUsed, puzzles } = reinforcements;
  const unclassified = concepts.length === 0;
  const usedTheme = fallbackUsed === "theme";

  const onClick = (puzzleId: string, index: number) => {
    fetch("/api/retrieval-telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "click",
        anchorFen: anchorFen ?? "",
        detectedConcepts: concepts,
        puzzleId,
        clickedIndex: index,
      }),
    }).catch(() => {
      /* fire and forget; do not block navigation */
    });
  };

  return (
    <Box
      sx={{
        mt: 1.5,
        p: 1.5,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        bgcolor: "action.hover",
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: "wrap" }}>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          Drill this idea:
        </Typography>
        {unclassified ? (
          <Chip
            size="small"
            label="concept: unclassified"
            color="warning"
            variant="outlined"
          />
        ) : (
          concepts.map((c) => (
            <Chip key={c} size="small" label={c} color="primary" variant="outlined" />
          ))
        )}
        {usedTheme && (
          <Chip size="small" label="theme fallback" variant="outlined" />
        )}
      </Stack>
      {puzzles.length > 0 ? (
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
          {puzzles.map((p, idx) => (
            <Chip
              key={p.puzzleId}
              size="small"
              label={`#${p.puzzleId} (${p.rating})`}
              component="a"
              clickable
              href={`https://lichess.org/training/${p.puzzleId}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onClick(p.puzzleId, idx)}
            />
          ))}
        </Stack>
      ) : (
        <Typography variant="caption" color="text.secondary">
          No same-concept puzzles found in corpus.
        </Typography>
      )}
    </Box>
  );
};

// Component for inline "Practice Similar Puzzles" button in AI responses.
// Renders 3 puzzles inline inside the chat bubble; never navigates to /practice.
const PracticePuzzleButton: React.FC<{
  theme: string;
  displayTheme: string;
}> = ({ theme, displayTheme }) => {
  const game = useAtomValue(gameAtom);
  const userPlayerInfo = useAtomValue(userPlayerInfoAtom);
  const [loading, setLoading] = React.useState(false);
  const [inlinePuzzles, setInlinePuzzles] = React.useState<ChessPuzzle[] | null>(null);

  const handleClick = async () => {
    setLoading(true);
    try {
      const normalizedTheme = normalizeThemeName(theme);

      // Kebab-case theme IDs (matches Neo4j Theme.id convention)
      const kebabTheme = theme
        .trim()
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replace(/\s+/g, "-")
        .toLowerCase();
      const themesForQuery = Array.from(new Set([kebabTheme, normalizedTheme]));

      // Use the CURRENT board position as the reference FEN for similarity ranking.
      const currentFen = (() => {
        try { return game?.fen?.() ?? null; } catch { return null; }
      })();

      // Infer user rating from headers if available
      const userRating = (() => {
        try {
          const headers = game?.getHeaders?.() ?? {};
          const color = userPlayerInfo?.playerColor;
          const str = color === "black" ? headers.BlackElo : headers.WhiteElo;
          const n = str ? parseInt(String(str), 10) : NaN;
          return Number.isFinite(n) ? n : 1500;
        } catch { return 1500; }
      })();

      // PRIMARY PATH: /api/similar-puzzles (theme match + FEN similarity re-rank)
      if (currentFen) {
        try {
          const resp = await fetch("/api/similar-puzzles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fen: currentFen,
              themes: themesForQuery,
              userRating,
              limit: 3,
              candidatePoolSize: 60,
              excludeIds: [],
              sideToMoveMustMatch: false,
            }),
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data.puzzles && data.puzzles.length > 0) {
              const mapped: ChessPuzzle[] = data.puzzles.slice(0, 3).map((p: any) => ({
                id: p.puzzleId,
                fen: p.fen,
                moves: typeof p.moves === "string" ? p.moves.split(" ") : p.moves,
                rating: p.rating,
                themes: p.themes || [],
                solution: typeof p.moves === "string" ? p.moves.split(" ") : p.moves,
              }));
              setInlinePuzzles(mapped);
              return;
            }
          }
        } catch (e) {
          console.log("similar-puzzles failed, falling back to adaptive-puzzles:", (e as Error).message);
        }
      }

      // SECONDARY FALLBACK: /api/adaptive-puzzles (theme-only, no FEN re-rank)
      try {
        const resp = await fetch("/api/adaptive-puzzles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: "practice-user",
            themes: themesForQuery,
            limit: 3,
            excludeIds: [],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.puzzles && data.puzzles.length > 0) {
            const mapped: ChessPuzzle[] = data.puzzles.slice(0, 3).map((p: any) => ({
              id: p.puzzleId,
              fen: p.fen,
              moves: typeof p.moves === "string" ? p.moves.split(" ") : p.moves,
              rating: p.rating,
              themes: p.themes || [],
              solution: typeof p.moves === "string" ? p.moves.split(" ") : p.moves,
            }));
            setInlinePuzzles(mapped);
            return;
          }
        }
      } catch (e) {
        console.log("adaptive-puzzles also failed, falling back to static dataset");
      }

      // TERTIARY FALLBACK: static dataset
      const puzzles = await getPuzzlesByTheme([normalizedTheme], 3);
      if (puzzles.length > 0) {
        setInlinePuzzles(puzzles.slice(0, 3));
      }
    } catch (error) {
      console.error("Error fetching practice puzzles:", error);
    } finally {
      setLoading(false);
    }
  };

  if (inlinePuzzles) {
    return <InlinePuzzleSet puzzles={inlinePuzzles} displayTheme={displayTheme} />;
  }

  return (
    <span
      onClick={handleClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        color: "#fff",
        cursor: loading ? "wait" : "pointer",
        fontWeight: 600,
        padding: "6px 14px",
        borderRadius: "8px",
        background: "linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)",
        fontSize: "0.85em",
        transition: "all 0.2s ease",
        boxShadow: "0 2px 6px rgba(76, 175, 80, 0.3)",
        marginTop: "4px",
      }}
      onMouseEnter={(e) => {
        if (!loading) {
          e.currentTarget.style.background = "linear-gradient(135deg, #43A047 0%, #1B5E20 100%)";
          e.currentTarget.style.boxShadow = "0 3px 10px rgba(76, 175, 80, 0.4)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)";
        e.currentTarget.style.boxShadow = "0 2px 6px rgba(76, 175, 80, 0.3)";
      }}
      title={`Practice ${displayTheme} puzzles`}
    >
      {loading ? "Loading..." : `🧩 Practice ${displayTheme} Puzzles`}
    </span>
  );
};

// Component for "see how" tactical sequence links
const SeeHowLink: React.FC<{
  sequence: string[];
  description: string;
  fromMoveNumber?: number;
}> = ({ sequence, description, fromMoveNumber }) => {
  const game = useAtomValue(gameAtom);
  const { goToMove } = useChessActions(boardAtom);

  const handleSequenceClick = async () => {
    console.log(`SeeHowLink clicked: ${description}, sequence:`, sequence);
    try {
      // First, go to the position where the sequence should start
      let startPosition = fromMoveNumber
        ? fromMoveNumber + 1
        : game.history().length + 1;
      goToMove(startPosition, game);

      // Wait a moment for the position to update
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Create a temporary game to play through the sequence
      const tempGame = new Chess(game.fen());
      const startingHistory = game.history();

      // Play through the sequence step by step
      for (let i = 0; i < sequence.length; i++) {
        const move = sequence[i];
        console.log(`Playing move ${i + 1}/${sequence.length}: ${move}`);

        try {
          // Make the move in the temporary game
          tempGame.move(move);

          // Navigate to this position in the main game by creating a new game state
          const newGame = new Chess();

          // Play all original moves up to the starting point
          for (let j = 0; j < startingHistory.length; j++) {
            newGame.move(startingHistory[j]);
          }

          // Then play the sequence moves up to the current point
          for (let k = 0; k <= i; k++) {
            newGame.move(sequence[k]);
          }

          // Navigate to this position
          goToMove(startingHistory.length + i + 1, newGame);

          // Wait before the next move
          if (i < sequence.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } catch (error) {
          console.error(`Error playing move ${move}:`, error);
          break;
        }
      }

      console.log(`✅ Demonstrated tactical sequence: ${description}`);
    } catch (error) {
      console.error("Error demonstrating tactical sequence:", error);
    }
  };

  return (
    <span
      onClick={handleSequenceClick}
      style={{
        color: "#4CAF50",
        cursor: "pointer",
        textDecoration: "underline",
        fontWeight: "bold",
        padding: "2px 6px",
        borderRadius: "4px",
        backgroundColor: "rgba(76, 175, 80, 0.1)",
        border: "1px solid rgba(76, 175, 80, 0.3)",
        fontSize: "0.9em",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(76, 175, 80, 0.2)";
        e.currentTarget.style.borderColor = "rgba(76, 175, 80, 0.5)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(76, 175, 80, 0.1)";
        e.currentTarget.style.borderColor = "rgba(76, 175, 80, 0.3)";
      }}
      title={`Click to see how: ${description}`}
    >
      🔍 see how
    </span>
  );
};

// Component for clickable position links (navigates to specific position in game)
const PositionLink: React.FC<{
  positionNumber: number;
  description?: string;
}> = ({ positionNumber, description }) => {
  const game = useAtomValue(gameAtom);
  const { goToMove } = useChessActions(boardAtom);

  const handlePositionClick = () => {
    console.log(`PositionLink clicked: position ${positionNumber}`);
    try {
      // Navigate to the position (positionNumber corresponds to halfMoveNumber)
      // Position 0 = initial position, Position 1 = after first move, etc.
      goToMove(positionNumber, game);
      console.log(`✅ Navigated to position ${positionNumber}`);
    } catch (error) {
      console.error("Error navigating to position:", error);
    }
  };

  return (
    <span
      onClick={handlePositionClick}
      style={{
        color: "#FF9800",
        cursor: "pointer",
        textDecoration: "underline",
        fontWeight: "bold",
        padding: "2px 6px",
        borderRadius: "4px",
        backgroundColor: "rgba(255, 152, 0, 0.1)",
        border: "1px solid rgba(255, 152, 0, 0.3)",
        fontSize: "0.9em",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(255, 152, 0, 0.2)";
        e.currentTarget.style.borderColor = "rgba(255, 152, 0, 0.5)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(255, 152, 0, 0.1)";
        e.currentTarget.style.borderColor = "rgba(255, 152, 0, 0.3)";
      }}
      title={`Click to jump to position ${positionNumber}${description ? `: ${description}` : ""}`}
    >
      [position {positionNumber}]
    </span>
  );
};

// Component for clickable chess moves
const ClickableMove: React.FC<{
  move: string;
  moveNumber?: number;
  isBlackMove?: boolean;
  isRecommended?: boolean; // New prop to distinguish recommended moves
}> = ({ move, moveNumber, isBlackMove, isRecommended = false }) => {
  const game = useAtomValue(gameAtom);
  const board = useAtomValue(boardAtom);
  const isExplorationMode = useAtomValue(isExplorationModeAtom);
  const { goToMove, addMoves } = useChessActions(boardAtom);

  console.log(
    `ClickableMove created: ${moveNumber}.${isBlackMove ? ".." : ""} ${move} ${isRecommended ? "(recommended)" : ""}`
  );

  // Helper: enter exploration mode by replaying game to a half-move index, then playing an alternative move
  const enterExplorationAt = (halfMoveIdx: number, altMove: string): boolean => {
    try {
      const gameHistory = game.history();
      const newGame = new Chess();
      // Replay the original game up to BEFORE the target half-move
      for (let i = 0; i < halfMoveIdx && i < gameHistory.length; i++) {
        newGame.move(gameHistory[i]);
      }
      // Play the alternative/recommended move
      newGame.move(altMove);
      goToMove(newGame.history().length, newGame);
      console.log(`✅ Entered exploration mode: ${altMove} at half-move ${halfMoveIdx}`);
      return true;
    } catch (error) {
      console.warn(`Could not enter exploration for ${altMove}:`, error);
      return false;
    }
  };

  const handleMoveClick = () => {
    console.log(
      `ClickableMove clicked: ${moveNumber}.${isBlackMove ? ".." : ""} ${move}`
    );
    
    // Calculate the half-move index for this move number
    let halfMoveIdx = moveNumber !== undefined
      ? (isBlackMove ? moveNumber * 2 - 1 : (moveNumber - 1) * 2)
      : -1;

    // Verify the turn color at the calculated position and correct if needed
    // This fixes cases where AI writes "20. Rf7" when it means "20... Rf7" (Black's move)
    if (halfMoveIdx >= 0 && moveNumber !== undefined) {
      const gameHistory = game.history();
      const tempGame = new Chess();
      for (let i = 0; i < halfMoveIdx && i < gameHistory.length; i++) {
        tempGame.move(gameHistory[i]);
      }
      // Check if move is legal at the calculated position
      const legalMoves = tempGame.moves();
      const isLegalHere = legalMoves.some(m => m.replace(/[+#]/, '') === move.replace(/[+#]/, ''));
      if (!isLegalHere) {
        // Try the other color's position (±1 half-move)
        const altIdx = isBlackMove ? (moveNumber - 1) * 2 : moveNumber * 2 - 1;
        if (altIdx >= 0 && altIdx <= gameHistory.length) {
          const tempGame2 = new Chess();
          for (let i = 0; i < altIdx && i < gameHistory.length; i++) {
            tempGame2.move(gameHistory[i]);
          }
          const altLegal = tempGame2.moves();
          if (altLegal.some(m => m.replace(/[+#]/, '') === move.replace(/[+#]/, ''))) {
            console.log(`Color correction: ${move} not legal at halfMove ${halfMoveIdx}, using ${altIdx} instead`);
            halfMoveIdx = altIdx;
          }
        }
      }
    }

    if (isRecommended && moveNumber !== undefined) {
      // GREEN LINK: Enter exploration mode at the correct position
      enterExplorationAt(halfMoveIdx, move);
      return;
    }
    
    try {
      const gameHistory = game.history();

      if (moveNumber !== undefined) {
        // We have a move number — use it to navigate precisely
        const targetMoveIndex = halfMoveIdx;

        // Check if the move matches at the expected position in the original game
        if (
          targetMoveIndex >= 0 &&
          targetMoveIndex < gameHistory.length &&
          gameHistory[targetMoveIndex] === move
        ) {
          // Exact match — navigate to this move in the original game
          goToMove(targetMoveIndex + 1, game);
          console.log(`✅ Navigated to move ${targetMoveIndex + 1}: ${move}`);
          return;
        }

        // Move doesn't match at expected index — this is an alternative/engine move
        // Enter exploration mode at this specific move number's position
        console.log(`Move "${move}" not at expected index ${targetMoveIndex}, entering exploration mode at move ${moveNumber}`);
        if (enterExplorationAt(halfMoveIdx >= 0 ? halfMoveIdx : 0, move)) return;

      } else {
        // No move number — search for the move in history (find first occurrence)
        const targetMoveIndex = gameHistory.findIndex(
          (historyMove) => historyMove === move
        );
        if (targetMoveIndex >= 0) {
          goToMove(targetMoveIndex + 1, game);
          console.log(`✅ Navigated to move ${targetMoveIndex + 1}: ${move}`);
          return;
        }
      }

      // FALLBACK: If board is already in exploration mode, try playing the move
      // on the CURRENT board position (supports sequential continuation clicks)
      if (isExplorationMode) {
        try {
          const boardCopy = new Chess();
          boardCopy.loadPgn(board.pgn());
          boardCopy.move(move);
          goToMove(boardCopy.history().length, boardCopy);
          console.log(`✅ Played continuation move on current board: ${move}`);
          return;
        } catch {
          console.log(`Could not play ${move} on current board`);
        }
      }

      console.warn(
        `❌ Could not find or explore move "${move}" in game history`
      );
    } catch (error) {
      console.error("Error navigating to move:", error);
    }
  };

  return (
    <span
      onClick={handleMoveClick}
      style={{
        color: isRecommended ? "#2E7D32" : "#2196F3", // Green for recommended, blue for regular
        cursor: "pointer",
        textDecoration: "underline",
        fontWeight: "bold",
        padding: "1px 3px",
        borderRadius: "3px",
        backgroundColor: isRecommended ? "rgba(46, 125, 50, 0.1)" : "rgba(33, 150, 243, 0.08)",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        if (isRecommended) {
          e.currentTarget.style.backgroundColor = "rgba(46, 125, 50, 0.2)";
          e.currentTarget.style.color = "#1B5E20";
        } else {
          e.currentTarget.style.backgroundColor = "rgba(33, 150, 243, 0.15)";
          e.currentTarget.style.color = "#1976D2";
        }
      }}
      onMouseLeave={(e) => {
        if (isRecommended) {
          e.currentTarget.style.backgroundColor = "rgba(46, 125, 50, 0.1)";
          e.currentTarget.style.color = "#2E7D32";
        } else {
          e.currentTarget.style.backgroundColor = "rgba(33, 150, 243, 0.08)";
          e.currentTarget.style.color = "#2196F3";
        }
      }}
      title={isRecommended ? `Click to explore position after ${move}` : `Click to jump to move ${moveNumber}${isBlackMove ? "..." : "."} ${move}`}
    >
      {isRecommended && "🔍 "}{moveNumber}.{isBlackMove ? ".." : ""} {move}
    </span>
  );
};









// Helper: convert UCI PV array to SAN from a given FEN
function uciPvToSan(fen: string, pvUci: string[]): string[] {
  const result: string[] = [];
  try {
    const g = new Chess(fen);
    for (const uci of pvUci) {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length > 4 ? uci.slice(4) : undefined;
      try {
        const moveResult = g.move({ from, to, promotion });
        if (!moveResult) break;
        result.push(moveResult.san);
      } catch { break; }
    }
  } catch { /* ignore */ }
  return result;
}

// Helper: format SAN array as numbered move list
function formatSanAsMoveList(sanMoves: string[], startMoveNum: number, startsAsWhite: boolean): string {
  const parts: string[] = [];
  let moveNum = startMoveNum;
  let isWhite = startsAsWhite;
  for (const san of sanMoves) {
    if (isWhite) {
      parts.push(`${moveNum}. ${san}`);
    } else {
      if (parts.length === 0) parts.push(`${moveNum}... ${san}`);
      else parts.push(san);
      moveNum++;
    }
    isWhite = !isWhite;
  }
  return parts.join(" ");
}

// Engine-backed continuation: reads real Stockfish PV from gameEvalAtom (no LLM hallucinations)
const EngineContinuation: React.FC<{
  moveNum: number;    // Full move number (e.g. 14)
  color: "w" | "b";  // Color whose move this is
}> = ({ moveNum, color }) => {
  const gameEval = useAtomValue(gameEvalAtom);
  const game = useAtomValue(gameAtom);
  const { goToMove } = useChessActions(boardAtom);

  // Calculate half-move index: white move 14 = index 26, black move 14 = index 27
  const halfMoveIdx = color === "b" ? moveNum * 2 - 1 : (moveNum - 1) * 2;
  const gameHistory = game.history();

  // Get PV from Stockfish evaluation data
  const posEval = gameEval?.positions?.[halfMoveIdx];
  const pvLine = posEval?.lines?.[0]; // Best line (multiPv=1)

  if (!pvLine?.pv || pvLine.pv.length === 0) {
    return <span style={{ color: "#999", fontStyle: "italic", fontSize: "0.85em" }}>(Engine line not available for move {moveNum})</span>;
  }

  // Get FEN at position before this move by replaying game
  let fenBeforeMove = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  try {
    const tempGame = new Chess();
    for (let i = 0; i < halfMoveIdx && i < gameHistory.length; i++) {
      tempGame.move(gameHistory[i]);
    }
    fenBeforeMove = tempGame.fen();
  } catch { /* use default */ }

  // Convert UCI PV to SAN
  const pvSan = uciPvToSan(fenBeforeMove, pvLine.pv);
  if (pvSan.length === 0) {
    return <span style={{ color: "#999", fontStyle: "italic", fontSize: "0.85em" }}>(Could not parse engine line)</span>;
  }

  const isWhiteStart = color === "w";
  const displayText = formatSanAsMoveList(pvSan, moveNum, isWhiteStart);

  // Format eval
  const evalStr = pvLine.mate !== undefined
    ? `M${pvLine.mate > 0 ? "+" : ""}${pvLine.mate}`
    : pvLine.cp !== undefined ? `${pvLine.cp >= 0 ? "+" : ""}${(pvLine.cp / 100).toFixed(1)}` : "";

  const handlePlayLine = () => {
    try {
      const newGame = new Chess();
      for (let i = 0; i < halfMoveIdx && i < gameHistory.length; i++) {
        newGame.move(gameHistory[i]);
      }
      for (const san of pvSan) {
        try { newGame.move(san); } catch { break; }
      }
      // Go to divergence point (before first PV move), not the end.
      // The full PV is in the game history so the user can step forward/backward.
      goToMove(halfMoveIdx, newGame);
      console.log(`✅ Engine continuation loaded (${pvSan.length} moves) at divergence point move ${moveNum}. Use forward arrow to step through.`);
    } catch (error) {
      console.error("Error playing engine continuation:", error);
    }
  };

  return (
    <div style={{
      margin: "6px 0",
      padding: "8px 12px",
      borderRadius: "8px",
      backgroundColor: "rgba(76, 175, 80, 0.08)",
      border: "1px solid rgba(76, 175, 80, 0.25)",
      fontSize: "0.9em",
    }}>
      <div style={{ marginBottom: "4px" }}>
        <strong style={{ color: "#2E7D32" }}>Engine Best Line {evalStr && `(${evalStr})`}:</strong>{" "}
        <span>{displayText}</span>
      </div>
      <span
        onClick={handlePlayLine}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          color: "#4CAF50",
          cursor: "pointer",
          fontWeight: "bold",
          padding: "3px 8px",
          borderRadius: "6px",
          backgroundColor: "rgba(76, 175, 80, 0.15)",
          border: "1px solid rgba(76, 175, 80, 0.4)",
          fontSize: "0.85em",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "rgba(76, 175, 80, 0.3)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "rgba(76, 175, 80, 0.15)";
        }}
        title={`Click to play this line on the board`}
      >
        ▶ Play on Board
      </span>
    </div>
  );
};

// Maia continuation: user's color plays engine best, opponent plays Maia-predicted moves
const MaiaContinuation: React.FC<{
  moveNum: number;
  color: "w" | "b"; // Color of the user (whose mistake this was)
}> = ({ moveNum, color }) => {
  const gameEval = useAtomValue(gameEvalAtom);
  const game = useAtomValue(gameAtom);
  const { goToMove } = useChessActions(boardAtom);
  const [maiaLine, setMaiaLine] = React.useState<string[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const halfMoveIdx = color === "b" ? moveNum * 2 - 1 : (moveNum - 1) * 2;
  const gameHistory = game.history();

  const buildMaiaLine = async () => {
    setLoading(true);
    setError(null);
    try {
      // Get FEN at position before this move
      const tempGame = new Chess();
      for (let i = 0; i < halfMoveIdx && i < gameHistory.length; i++) {
        tempGame.move(gameHistory[i]);
      }

      // Get the engine best moves from PV
      const posEval = gameEval?.positions?.[halfMoveIdx];
      const pvLine = posEval?.lines?.[0];
      if (!pvLine?.pv || pvLine.pv.length === 0) {
        setError("No engine data available");
        setLoading(false);
        return;
      }

      // Build hybrid line: user color = engine best, opponent = Maia predicted
      const resultSan: string[] = [];
      const userIsWhite = color === "w";
      let currentIsWhite = userIsWhite; // First move is user's best move
      
      // Play engine best move first (this is the recommended move)
      const firstUci = pvLine.pv[0];
      const firstResult = tempGame.move({ from: firstUci.slice(0, 2), to: firstUci.slice(2, 4), promotion: firstUci.length > 4 ? firstUci.slice(4) : undefined });
      if (!firstResult) { setError("Could not play engine move"); setLoading(false); return; }
      resultSan.push(firstResult.san);
      currentIsWhite = !currentIsWhite;

      // Now alternate: opponent = Maia, user = engine best
      for (let step = 0; step < 8; step++) { // Max 8 more half-moves
        const fen = tempGame.fen();
        const isUserTurn = (currentIsWhite && userIsWhite) || (!currentIsWhite && !userIsWhite);

        if (isUserTurn) {
          // User's turn: play engine best from current eval (or PV if available)
          // Try to use PV continuation
          const pvIdx = resultSan.length;
          if (pvIdx < pvLine.pv.length) {
            const uci = pvLine.pv[pvIdx];
            try {
              const r = tempGame.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci.slice(4) : undefined });
              if (r) { resultSan.push(r.san); currentIsWhite = !currentIsWhite; continue; }
            } catch { /* fall through */ }
          }
          break; // No more engine moves available
        } else {
          // Opponent's turn: ask Maia for prediction
          try {
            const resp = await fetch("/api/maia-predict", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
              body: JSON.stringify({ fen, rating: 1500 }),
            });
            const data = await resp.json();
            if (data.humanLikeMove) {
              try {
                const r = tempGame.move(data.humanLikeMove);
                if (r) { resultSan.push(r.san); currentIsWhite = !currentIsWhite; continue; }
              } catch { /* Maia move illegal, try from PV */ }
            }
          } catch { /* Maia API failed */ }

          // Fallback: use PV move for opponent too
          const pvIdx = resultSan.length;
          if (pvIdx < pvLine.pv.length) {
            const uci = pvLine.pv[pvIdx];
            try {
              const r = tempGame.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci.slice(4) : undefined });
              if (r) { resultSan.push(r.san); currentIsWhite = !currentIsWhite; continue; }
            } catch { /* ignore */ }
          }
          break; // No more moves available
        }
      }

      setMaiaLine(resultSan);
    } catch (err) {
      setError("Failed to build Maia line");
      console.error(err);
    }
    setLoading(false);
  };

  const handlePlayLine = () => {
    if (!maiaLine || maiaLine.length === 0) return;
    try {
      const newGame = new Chess();
      for (let i = 0; i < halfMoveIdx && i < gameHistory.length; i++) {
        newGame.move(gameHistory[i]);
      }
      for (const san of maiaLine) {
        try { newGame.move(san); } catch { break; }
      }
      // Go to divergence point (before first Maia move), not the end.
      // The full line is in the game history so the user can step forward/backward.
      goToMove(halfMoveIdx, newGame);
      console.log(`✅ Maia line loaded (${maiaLine.length} moves) at divergence point. Use forward arrow to step through.`);
    } catch (error) {
      console.error("Error playing Maia continuation:", error);
    }
  };

  const isWhiteStart = color === "w";
  const displayText = maiaLine ? formatSanAsMoveList(maiaLine, moveNum, isWhiteStart) : "";

  return (
    <div style={{
      margin: "6px 0",
      padding: "8px 12px",
      borderRadius: "8px",
      backgroundColor: "rgba(156, 39, 176, 0.08)",
      border: "1px solid rgba(156, 39, 176, 0.25)",
      fontSize: "0.9em",
    }}>
      <div style={{ marginBottom: "4px" }}>
        <strong style={{ color: "#7B1FA2" }}>Maia Realistic Line</strong>
        <span style={{ color: "#9C27B0", fontSize: "0.8em", marginLeft: "6px" }}>
          (You play best moves, opponent plays most likely human responses)
        </span>
      </div>
      {!maiaLine && !loading && !error && (
        <span
          onClick={buildMaiaLine}
          style={{
            display: "inline-flex", alignItems: "center", gap: "4px",
            color: "#9C27B0", cursor: "pointer", fontWeight: "bold",
            padding: "3px 8px", borderRadius: "6px",
            backgroundColor: "rgba(156, 39, 176, 0.15)",
            border: "1px solid rgba(156, 39, 176, 0.4)",
            fontSize: "0.85em", transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(156, 39, 176, 0.3)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(156, 39, 176, 0.15)"; }}
        >
          🤖 Compute Maia Line
        </span>
      )}
      {loading && <span style={{ color: "#9C27B0" }}>Computing Maia predictions...</span>}
      {error && <span style={{ color: "#999", fontStyle: "italic" }}>{error}</span>}
      {maiaLine && maiaLine.length > 0 && (
        <>
          <div style={{ margin: "4px 0" }}>{displayText}</div>
          <span
            onClick={handlePlayLine}
            style={{
              display: "inline-flex", alignItems: "center", gap: "4px",
              color: "#9C27B0", cursor: "pointer", fontWeight: "bold",
              padding: "3px 8px", borderRadius: "6px",
              backgroundColor: "rgba(156, 39, 176, 0.15)",
              border: "1px solid rgba(156, 39, 176, 0.4)",
              fontSize: "0.85em", transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(156, 39, 176, 0.3)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(156, 39, 176, 0.15)"; }}
          >
            ▶ Play on Board
          </span>
        </>
      )}
    </div>
  );
};

// New component for hypothetical "what-if" moves
const HypotheticalMove: React.FC<{
  move: string;
  moveNumber?: number;
  isBlackMove?: boolean;
  originalMove: string;
}> = ({ move, moveNumber, isBlackMove, originalMove }) => {
  const game = useAtomValue(gameAtom);
  const { goToMove } = useChessActions(boardAtom);

  const handleHypotheticalClick = () => {
    console.log(
      `HypotheticalMove clicked: ${moveNumber}.${isBlackMove ? ".." : ""} ${move} instead of ${originalMove}`
    );
    try {
      const gameHistory = game.history();
      let targetMoveIndex = -1;

      if (moveNumber !== undefined) {
        // Calculate the exact index based on move number and color
        if (isBlackMove) {
          targetMoveIndex = moveNumber * 2 - 1;
        } else {
          targetMoveIndex = moveNumber * 2 - 2;
        }
      }

      if (targetMoveIndex >= 0 && targetMoveIndex < gameHistory.length) {
        // Go to the position before the violation
        const newGame = new Chess();
        const history = gameHistory.slice(0, targetMoveIndex);
        history.forEach((m) => newGame.move(m));

        // Make the hypothetical move instead of the original move
        try {
          newGame.move(move);
          goToMove(targetMoveIndex + 1, newGame);
          console.log(
            `✅ Navigated to hypothetical move ${targetMoveIndex + 1}: ${move}`
          );
        } catch (error) {
          console.error("Invalid hypothetical move:", move, error);
        }
      }
    } catch (error) {
      console.error("Error navigating to hypothetical move:", error);
    }
  };

  return (
    <span
      onClick={handleHypotheticalClick}
      style={{
        color: "#4CAF50", // Green color for hypothetical moves
        cursor: "pointer",
        textDecoration: "underline",
        fontWeight: "bold",
        padding: "2px 4px",
        borderRadius: "4px",
        backgroundColor: "rgba(76, 175, 80, 0.1)",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(76, 175, 80, 0.2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(76, 175, 80, 0.1)";
      }}
      title={`Click to see what if ${moveNumber}${isBlackMove ? "..." : "."} ${move} was played instead of ${originalMove}`}
    >
      {moveNumber}.{isBlackMove ? ".." : ""} {move}
    </span>
  );
};

// Helper function to process [CONTINUATION:moveNum:color] and [MAIA_CONTINUATION:moveNum:color] tokens
// These render engine-backed continuation lines from real Stockfish PV data (no LLM hallucinations)
const processContinuationTokens = (text: string): Array<string | React.ReactElement> => {
  const tokenPattern = /\[(CONTINUATION|MAIA_CONTINUATION):(\d+):(w|b)\]/g;
  
  const parts: Array<string | React.ReactElement> = [];
  let lastIndex = 0;
  let match;

  while ((match = tokenPattern.exec(text)) !== null) {
    // Add text before the token
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const type = match[1]; // "CONTINUATION" or "MAIA_CONTINUATION"
    const moveNum = parseInt(match[2]);
    const color = match[3] as "w" | "b";

    if (type === "CONTINUATION") {
      parts.push(
        <EngineContinuation
          key={`engine-cont-${match.index}`}
          moveNum={moveNum}
          color={color}
        />
      );
    } else {
      parts.push(
        <MaiaContinuation
          key={`maia-cont-${match.index}`}
          moveNum={moveNum}
          color={color}
        />
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
};

// Helper function to process position links
const processPositionLinks = (text: string) => {
  if (!text.includes("position") && !text.includes("Position") && !text.includes("[position")) {
    return [text];
  }

  const parts = [];
  // Pattern to match position references: "[position X]" (new format) or "position X", "Position X", etc. (old formats)
  const positionPattern = /\[position\s+(\d+)\]|(?:\[)?(?:position|Position)\s+(\d+)(?:\])?/gi;
  let lastIndex = 0;
  let match;

  while ((match = positionPattern.exec(text)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Use first capture group if available (new format), otherwise second (old format)
    const positionNumber = parseInt(match[1] || match[2]);
    parts.push(
      <PositionLink
        key={`position-${match.index}`}
        positionNumber={positionNumber}
      />
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
};

// Helper function to process practice puzzle button markers [PRACTICE:theme:displayName]
const processPracticeButtons = (text: string): Array<string | React.ReactElement> => {
  if (!text.includes("[PRACTICE:")) {
    return [text];
  }

  const parts: Array<string | React.ReactElement> = [];
  const pattern = /\[PRACTICE:([^:\]]+):([^\]]+)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <PracticePuzzleButton
        key={`practice-${match.index}`}
        theme={match[1]}
        displayTheme={match[2]}
      />
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
};

// Helper function to process correct move links [Correct: Move]
const processCorrectMoveLinks = (text: string, game: Chess, moveNumber?: number, isBlackMove?: boolean) => {
  if (!text.includes("[Correct:") && !text.includes("[correct:")) {
    return [text];
  }

  const parts = [];
  // Pattern to match [Correct: Move] format
  const correctMovePattern = /\[Correct:\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)\]/gi;
  let lastIndex = 0;
  let match;

  while ((match = correctMovePattern.exec(text)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const correctMove = match[1];
    // Try to find the original move from context (we'll need to extract this from the text)
    // For now, use a placeholder - we'll improve this later
    const originalMove = "original"; // Placeholder
    
    parts.push(
      <HypotheticalMove
        key={`correct-${match.index}`}
        move={correctMove}
        moveNumber={moveNumber}
        isBlackMove={isBlackMove}
        originalMove={originalMove}
      />
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
};

// Custom text renderer that converts move notation to clickable links
const renderTextWithClickableMoves = (text: string, game?: Chess) => {
  if (!text) return null;

  // Step 0: Process [CONTINUATION:X:c] and [MAIA_CONTINUATION:X:c] tokens → engine-backed lines
  const textWithContinuations = processContinuationTokens(text);
  if (textWithContinuations.length > 1 || (textWithContinuations.length === 1 && typeof textWithContinuations[0] !== "string")) {
    return <>{textWithContinuations.map((part, idx) => {
      if (typeof part === "string") {
        return <React.Fragment key={idx}>{renderTextWithClickableMoves(part, game)}</React.Fragment>;
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    })}</>;
  }

  // First, process practice puzzle buttons [PRACTICE:theme:displayName]
  const textWithPractice = processPracticeButtons(text);
  if (textWithPractice.length > 1 || (textWithPractice.length === 1 && typeof textWithPractice[0] !== "string")) {
    // Has practice buttons — process remaining string parts for other links
    return <>{textWithPractice.map((part, idx) => {
      if (typeof part === "string") {
        return <React.Fragment key={idx}>{renderTextWithClickableMoves(part, game)}</React.Fragment>;
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    })}</>;
  }

  // Then, process position links
  const textWithPositions = processPositionLinks(text);

  // Then process correct move links for each string part
  const processParts = (parts: any[]): any[] => {
    return parts.map((part, idx) => {
      if (typeof part === "string") {
        // Process correct move links in this string part
        const textWithCorrectMoves = processCorrectMoveLinks(part, game || new Chess());
        
        // If we have correct move links, process each part for regular moves
        if (textWithCorrectMoves.length > 1 || 
            (textWithCorrectMoves.length === 1 && typeof textWithCorrectMoves[0] !== "string")) {
          return textWithCorrectMoves.map((subPart, subIdx) => {
            if (typeof subPart === "string") {
              return (
                <React.Fragment key={`${idx}-${subIdx}`}>
                  {renderMovesInText(subPart)}
                </React.Fragment>
              );
            }
            return <React.Fragment key={`${idx}-${subIdx}`}>{subPart}</React.Fragment>;
          });
        }
        
        // No correct move links, just process regular moves
        return (
          <React.Fragment key={idx}>{renderMovesInText(part)}</React.Fragment>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  // If we have position links, process each part
  if (
    textWithPositions.length > 1 ||
    (textWithPositions.length === 1 && typeof textWithPositions[0] !== "string")
  ) {
    return processParts(textWithPositions);
  }

  // No position links, process correct move links and regular moves
  const textWithCorrectMoves = processCorrectMoveLinks(text, game || new Chess());
  if (textWithCorrectMoves.length > 1 || 
      (textWithCorrectMoves.length === 1 && typeof textWithCorrectMoves[0] !== "string")) {
    return processParts(textWithCorrectMoves);
  }

  // No special links, just process regular moves
  return renderMovesInText(text);
};

// Helper function to render moves in text
const renderMovesInText = (text: string) => {
  if (!text) return null;

  // Unified pattern to catch all move formats in priority order
  const movePatterns = [
    // Priority 1: AI response format "Move X (move)" - your specific format
    {
      pattern:
        /Move\s+(\d+)\s*\([^)]*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)\)/gi,
      type: "ai_parentheses",
      priority: 1,
    },
    // Priority 2: AI response format "Move X: [move]" 
    {
      pattern:
        /Move\s+(\d+):\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/gi,
      type: "ai",
      priority: 2,
    },
    // Priority 3: Standard notation "15. Nf3" or "15... cxd4" (1-3 dots)
    {
      pattern:
        /(\d+)\.{1,3}\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/g,
      type: "standard",
      priority: 3,
    },
    // Priority 4: "move X" format
    {
      pattern:
        /move\s+(\d+)([wb])?:\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/gi,
      type: "move",
      priority: 4,
    },
  ];

  let parts = [];
  let lastIndex = 0;
  let processedRanges: Array<{ start: number; end: number }> = [];

  // Find all matches from all patterns and sort by priority and position
  const allMatches: Array<{
    match: RegExpExecArray;
    pattern: any;
    index: number;
    priority: number;
  }> = [];

  movePatterns.forEach((patternInfo) => {
    patternInfo.pattern.lastIndex = 0;
    let match;
    while ((match = patternInfo.pattern.exec(text)) !== null) {
      allMatches.push({
        match,
        pattern: patternInfo,
        index: match.index,
        priority: patternInfo.priority,
      });
    }
  });

  // Sort matches by priority (lower number = higher priority) and then by position
  allMatches.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.index - b.index;
  });

  // Process matches in order, avoiding overlaps
  allMatches.forEach((matchInfo) => {
    const { match, pattern } = matchInfo;
    const fullMatch = match[0];
    const startIndex = match.index;
    const endIndex = startIndex + fullMatch.length;

    // Check if this range overlaps with any already processed range
    const overlaps = processedRanges.some(
      (range) =>
        (startIndex >= range.start && startIndex < range.end) ||
        (endIndex > range.start && endIndex <= range.end) ||
        (startIndex <= range.start && endIndex >= range.end)
    );

    if (overlaps) {
      return; // Skip this match as it overlaps with a higher priority match
    }

    // Add text before the match
    if (startIndex > lastIndex) {
      parts.push(text.slice(lastIndex, startIndex));
    }

    // Process the match based on pattern type
    let moveNumber: number;
    let move: string;
    let isBlackMove: boolean;

    if (pattern.type === "ai_parentheses") {
      // Handle "Move X (move)" format - your specific case
      moveNumber = parseInt(match[1]);
      move = match[2];
      isBlackMove = moveNumber % 2 === 0;
    } else if (pattern.type === "ai") {
      moveNumber = parseInt(match[1]);
      move = match[2];
      isBlackMove = moveNumber % 2 === 0;
    } else if (pattern.type === "standard") {
      moveNumber = parseInt(match[1]);
      move = match[2];
      isBlackMove = fullMatch.includes("...");
    } else if (pattern.type === "move") {
      moveNumber = parseInt(match[1]);
      isBlackMove = match[2] === "b";
      move = match[3];
    } else {
      return; // Unknown pattern type
    }

    // Check LOCAL context around the move to determine if it's a recommended/best alternative
    const contextBefore = text.slice(Math.max(0, startIndex - 60), startIndex).toLowerCase();
    const isRecommendedMove = /best\s*(was|move|is)|should\s*have\s*(played|been)|instead\s*(of|,|:)|better\s*(was|move|is|alternative)|recommended|correct\s*move|improvement/.test(contextBefore);
    
    if (isRecommendedMove) {
      // Use green clickable move with exploration mode
      parts.push(
        <ClickableMove
          key={`recommended-${moveNumber}-${isBlackMove ? "black" : "white"}-${startIndex}`}
          move={move}
          moveNumber={moveNumber}
          isBlackMove={isBlackMove}
          isRecommended={true}
        />
      );
    } else {
      // Use regular blue clickable move
      parts.push(
        <ClickableMove
          key={`${pattern.type}-${moveNumber}-${isBlackMove ? "black" : "white"}-${startIndex}`}
          move={move}
          moveNumber={moveNumber}
          isBlackMove={isBlackMove}
          isRecommended={false}
        />
      );
    }

    // Update tracking
    lastIndex = endIndex;
    processedRanges.push({ start: startIndex, end: endIndex });
  });

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  // If no moves were found, just return the text
  if (parts.length === 0) {
    return <>{text}</>;
  }

  return <>{parts}</>;
};

// Helper function to process "see how" links
const processSeeLinks = (text: string) => {
  if (!text.includes("<SEELINK>")) {
    return [text];
  }

  const parts = [];
  const linkPattern = /<SEELINK>(.*?)<\/SEELINK>/g;
  let lastIndex = 0;
  let match;

  while ((match = linkPattern.exec(text)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    try {
      const linkData = JSON.parse(match[1]);
      parts.push(" ");
      parts.push(
        <SeeHowLink
          key={`see-how-${match.index}`}
          sequence={linkData.sequence}
          description={linkData.description}
        />
      );
    } catch (e) {
      console.error("Error parsing see link data:", e);
      parts.push(match[0]); // Fallback to original text
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
};

const ChatContainer = styled(Paper)(({ theme }) => ({
  height: "100%",
  display: "flex",
  flexDirection: "column",
  padding: theme.spacing(2),
}));

const MessagesContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== "isExpanded",
})<{ isExpanded: boolean }>(({ theme, isExpanded }) => ({
  flex: isExpanded ? 1 : "none",
  overflowY: "auto",
  marginBottom: theme.spacing(2),
  padding: theme.spacing(1),
  transition: "all 0.3s ease",
  maxHeight: isExpanded ? "none" : "400px", // Increased from 200px to 400px for better readability
}));

const ExpandButton = styled(IconButton)(({ theme }) => ({
  position: "absolute",
  right: theme.spacing(2),
  top: theme.spacing(2),
  zIndex: 1,
}));

const MessageBubble = styled(Box, {
  shouldForwardProp: (prop) => prop !== "isUser",
})<{ isUser: boolean }>(({ theme, isUser }) => ({
  maxWidth: "85%",
  padding: theme.spacing(1.5),
  borderRadius: theme.spacing(2),
  marginBottom: theme.spacing(1.5),
  backgroundColor: isUser
    ? theme.palette.primary.main // Orange for user messages
    : "#FF8C42", // Lighter orange for AI messages
  color: isUser
    ? "#FFFFFF" // White text on orange
    : "#FFFFFF", // White text on light orange
  alignSelf: isUser ? "flex-end" : "flex-start",
  marginLeft: isUser ? "auto" : 0,
  boxShadow: theme.shadows[2],
  transition: "all 0.2s ease-in-out",
  "&:hover": {
    boxShadow: theme.shadows[3],
  },
  // Enhanced markdown styling
  "& h1, & h2, & h3, & h4, & h5, & h6": {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
    fontWeight: 600,
    color: isUser ? "#FFFFFF" : "#FFFFFF",
  },
  "& h1": { fontSize: "1.5rem" },
  "& h2": { fontSize: "1.3rem" },
  "& h3": { fontSize: "1.2rem" },
  "& p": {
    marginBottom: theme.spacing(1),
    lineHeight: 1.6,
  },
  "& ul, & ol": {
    paddingLeft: theme.spacing(3),
    marginBottom: theme.spacing(1),
  },
  "& li": {
    marginBottom: theme.spacing(0.5),
  },
  "& blockquote": {
    borderLeft: `4px solid ${isUser ? "#FFFFFF" : "#FFFFFF"}`,
    paddingLeft: theme.spacing(2),
    marginLeft: 0,
    marginRight: 0,
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(1),
    fontStyle: "italic",
    backgroundColor: isUser
      ? "rgba(255, 255, 255, 0.1)"
      : "rgba(255, 255, 255, 0.1)",
    borderRadius: theme.spacing(0.5),
  },
  "& table": {
    width: "100%",
    borderCollapse: "collapse",
    marginBottom: theme.spacing(1),
    fontSize: "0.9rem",
  },
  "& th, & td": {
    border: `1px solid rgba(255, 255, 255, 0.3)`,
    padding: theme.spacing(1),
    textAlign: "left",
  },
  "& th": {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    fontWeight: 600,
  },
  "& code": {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    color: "#FFFFFF",
    padding: theme.spacing(0.25, 0.5),
    borderRadius: theme.spacing(0.5),
    fontSize: "0.9em",
    fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
  },
  "& pre": {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: theme.spacing(1),
    padding: theme.spacing(1.5),
    overflow: "auto",
    marginBottom: theme.spacing(1),
    "& code": {
      backgroundColor: "transparent",
      color: "inherit",
      padding: 0,
      fontSize: "0.85em",
    },
  },
  "& hr": {
    border: "none",
    borderTop: `1px solid rgba(255, 255, 255, 0.3)`,
    margin: theme.spacing(2, 0),
  },
  "& strong": {
    fontWeight: 600,
  },
  "& em": {
    fontStyle: "italic",
  },
}));

// Smart greeting when a game is loaded — AI speaks first
function getSmartGameGreeting(
  game: Chess,
  playerInfo: { username?: string | null; playerColor?: string | null }
): string {
  const moveCount = Math.ceil(game.history().length / 2);
  const playerColor = playerInfo.playerColor === "white" ? "w" : playerInfo.playerColor === "black" ? "b" : null;
  const playerName = playerInfo.username || "you";

  if (game.isCheckmate()) {
    const winnerSide = game.turn() === "w" ? "b" : "w"; // side that delivered mate wins
    if (playerColor && playerColor === winnerSide) {
      return `Nice win, ${playerName}! 🎉 You checkmated your opponent in ${moveCount} moves. I'm your AI chess coach — would you like me to review the game, point out your best moves, or focus on any particular part?`;
    } else if (playerColor) {
      return `Tough loss, ${playerName}. Your opponent found checkmate on move ${moveCount}. But every loss is a learning opportunity! I'm your AI chess coach — want me to analyze what went wrong and show you how to improve?`;
    }
    return `The game ended in checkmate after ${moveCount} moves. I'm your AI chess coach — what would you like to analyze?`;
  }

  if (game.isDraw()) {
    if (game.isStalemate()) {
      return `The game ended in stalemate after ${moveCount} moves — so close! I'm your AI chess coach. Want me to review the endgame and show where the win was?`;
    }
    return `A hard-fought draw after ${moveCount} moves. I'm your AI chess coach — would you like me to analyze the key moments or find where you could have pushed for a win?`;
  }

  if (game.isGameOver()) {
    return `The game has ended after ${moveCount} moves. I'm your AI chess coach — what aspect would you like me to analyze?`;
  }

  // Game still in progress (imported mid-game or ongoing)
  if (moveCount > 0) {
    return `I see a ${moveCount}-move game loaded. I'm your AI chess coach — you can ask me anything: analyze the full game, review specific moves, explain positions, suggest improvements, or ask about strategy. What would you like to do?`;
  }

  return `Hi! I'm your AI chess coach. Import a game from the database, paste a PGN, or play moves on the board — then I'll help you analyze it. You can ask me about anything: mistakes, strategy, openings, endgames, or specific moves.`;
}

const AICoachChat: React.FC<AICoachChatProps> = ({
  position,
  game,
  boardOrientation = true,
}) => {
  const router = useRouter();
  // Get real Stockfish evaluation data
  const gameEval = useAtomValue(gameEvalAtom);
  // Engine analysis progress (1..99 = running, 0 = idle/done). Used to block
  // chat sends while the Stockfish/coach analysis is mid-flight so the user
  // can't fire LLM calls against an incomplete eval.
  const evaluationProgress = useAtomValue(evaluationProgressAtom);
  const isAnalyzingGame = evaluationProgress > 0 && evaluationProgress < 100;

  // autoAnalyze state machine — set by /analysis when ?autoAnalyze=1 is
  // detected (browser extension flow). When 'pending' or
  // 'sent-awaiting-insights', the chat input is locked (user can't type
  // until the coach replies with [INSIGHT:...] cards).
  const autoAnalyzeState = useAtomValue(autoAnalyzeStateAtom);
  const setAutoAnalyzeState = useSetAtom(autoAnalyzeStateAtom);
  const lockedByAutoAnalyze =
    autoAnalyzeState === "pending" || autoAnalyzeState === "sent-awaiting-insights";

  // Get user player info (username and color)
  const userPlayerInfo = useAtomValue(userPlayerInfoAtom);

  // User profile (chess.com/lichess usernames)
  const { user, profile: userProfile } = useAuth();

  // Coach personality
  const selectedCoachId = useAtomValue(selectedCoachIdAtom);
  const personality = getPersonalityById(selectedCoachId);
  
  // Board navigation (for insight card move-click)
  const { goToMove } = useChessActions(boardAtom);

  // Live board subscription — used to stamp each new assistant message with
  // the FEN at the moment it was created (for "Share Insight" cards).
  const board = useAtomValue(boardAtom);
  const boardFenRef = useRef<string>(board.fen());
  useEffect(() => {
    boardFenRef.current = board.fen();
  }, [board]);

  // Share-insight dialog state. Holds the snippet payload (fen + explanation)
  // while open; null means dialog is closed.
  const [snippetDialog, setSnippetDialog] = useState<AnalysisSnippetData | null>(null);

  // Practice state setters
  const setPracticePuzzles = useSetAtom(practicePuzzlesAtom);
  const setCurrentPuzzleIndex = useSetAtom(currentPuzzleIndexAtom);
  const setPracticeTheme = useSetAtom(practiceThemeAtom);
  const puzzleSolvedStatus = useAtomValue(puzzleSolvedStatusAtom);
  const setPuzzleSolvedStatus = useSetAtom(puzzleSolvedStatusAtom);

  // Track previous game to detect when a new game is loaded
  const prevGameRef = useRef<string | null>(null);
  const gameLoadedRef = useRef(false);
  const hasUserMessagedRef = useRef(false);

  // Detect when a new game is loaded and auto-greet
  useEffect(() => {
    if (game) {
      const currentFen = game.fen();
      if (prevGameRef.current === null) {
        // Initial load
        prevGameRef.current = currentFen;
      } else if (prevGameRef.current !== currentFen) {
        // New game detected - check if it's a different game (not just a move)
        const currentMoves = game.history().length;
        const prevGame = new Chess(prevGameRef.current);
        const prevMoves = prevGame.history().length;

        // If move count decreased or significantly different, it's a new game
        if (currentMoves < prevMoves || Math.abs(currentMoves - prevMoves) > 5) {
          // While hydrating a saved chat, the game state may briefly diverge
          // from the FEN that was active when the chat was created. Don't
          // reset the persistence handle in that window — the hydration
          // effect owns it.
          if (hydratingChatRef.current) {
            prevGameRef.current = currentFen;
            return;
          }
          gameLoadedRef.current = true;
          hasUserMessagedRef.current = false; // Reset for new game
          analysisContextIdRef.current = null; // Reset context for new game
          resetChatPersistence(); // Start a fresh saved chat for the new game

          // AI speaks first — auto-greet when game is loaded
          const greeting = getSmartGameGreeting(game, userPlayerInfo);
          setMessages((prev) => {
            // Keep system message, remove old conversation
            const systemMsg = prev.find((m) => m.role === "system");
            return [
              ...(systemMsg ? [systemMsg] : []),
              { role: "assistant" as const, content: greeting },
            ];
          });
        }
        prevGameRef.current = currentFen;
      }
    }
  }, [game]);

  // Phase 2: the system prompt is now built server-side by
  // getCoachChatSystemPrompt() — see /api/enhanced-analysis. The client only
  // tracks the visible conversation (user + assistant turns).
  // If the page loaded from an insight permalink, seed the chat with the
  // saved coach response as the first assistant turn so the recipient sees
  // the original explanation without a fresh LLM call.
  const preloadedInsight = useAtomValue(preloadedInsightAtom);
  const [messages, setMessages] = useState<Message[]>(() => {
    if (preloadedInsight) {
      const greeting: Message = { role: "assistant", content: personality.greeting };
      // 'transcript' mode: hydrate the full chat history after the greeting.
      // 'single' mode: just append the one saved coach message.
      if (preloadedInsight.kind === "transcript" && preloadedInsight.transcript) {
        return [
          greeting,
          ...preloadedInsight.transcript.map(m => ({
            role: m.role,
            content: m.content,
            ...(m.fen ? { fen: m.fen } : {}),
          })),
        ];
      }
      return [
        greeting,
        {
          role: "assistant",
          content: preloadedInsight.coachContent,
          fen: preloadedInsight.fen,
        },
      ];
    }
    return [{ role: "assistant", content: personality.greeting }];
  });
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [messageFeedback, setMessageFeedback] = useState<Record<number, "positive" | "negative">>({});
  const [puzzleRecommendations, setPuzzleRecommendations] = useState<any[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Synchronous guard against double-sends. setIsLoading is async, so two
  // clicks/Enters in the same tick both see isLoading=false and fire duplicate
  // /api/classify-intent + /api/enhanced-analysis calls — doubling API cost.
  const inFlightRef = useRef(false);
  const analysisContextIdRef = useRef<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Chat persistence (signed-in users only). Anonymous users have no
  // currentChatIdRef and persistTurn() is a no-op.
  const currentChatIdRef = useRef<string | null>(null);
  const pendingChatPromiseRef = useRef<Promise<string> | null>(null);
  const titleRequestedRef = useRef(false);
  const hasPersistedAssistantRef = useRef(false);
  const hydratingChatRef = useRef(false);

  const buildGameRef = React.useCallback((): ChatGameRef | null => {
    if (!game) return null;
    try {
      const headers = game.getHeaders?.() ?? {};
      const userColor = userPlayerInfo?.playerColor;
      const opponent =
        userColor === "white"
          ? headers.Black
          : userColor === "black"
            ? headers.White
            : headers.White || headers.Black;
      return {
        pgn: game.pgn?.() ?? undefined,
        fen: game.fen?.() ?? undefined,
        opponent: opponent || undefined,
        result: headers.Result || undefined,
      };
    } catch {
      return null;
    }
  }, [game, userPlayerInfo]);

  const ensureChatId = React.useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    if (currentChatIdRef.current) return currentChatIdRef.current;
    if (!pendingChatPromiseRef.current) {
      pendingChatPromiseRef.current = createChat({
        coachId: selectedCoachId,
        gameRef: buildGameRef(),
      })
        .then((id) => {
          currentChatIdRef.current = id;
          return id;
        })
        .catch((err) => {
          console.error("Failed to create chat:", err);
          pendingChatPromiseRef.current = null;
          throw err;
        });
    }
    try {
      return await pendingChatPromiseRef.current;
    } catch {
      return null;
    }
  }, [user, selectedCoachId, buildGameRef]);

  const persistTurn = React.useCallback(
    async (role: "user" | "assistant", content: string) => {
      if (!user || hydratingChatRef.current) return;
      if (!content || !content.trim()) return;
      try {
        const chatId = await ensureChatId();
        if (!chatId) return;
        await appendMessage(chatId, { role, content });
        if (role === "assistant" && !hasPersistedAssistantRef.current) {
          hasPersistedAssistantRef.current = true;
          if (!titleRequestedRef.current) {
            titleRequestedRef.current = true;
            generateChatTitle(chatId).catch((err) =>
              console.warn("Title generation failed:", err)
            );
          }
        }
      } catch (err) {
        console.error("persistTurn failed:", err);
      }
    },
    [user, ensureChatId]
  );

  const resetChatPersistence = React.useCallback(() => {
    currentChatIdRef.current = null;
    pendingChatPromiseRef.current = null;
    titleRequestedRef.current = false;
    hasPersistedAssistantRef.current = false;
  }, []);

  // Hydrate from a saved chat when the URL carries ?chatId=…  (set by the
  // sidebar history list). Skips if user is not signed in or the id
  // matches what's already loaded.
  const lastLoadedChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    const queryChatId =
      typeof router.query.chatId === "string" ? router.query.chatId : null;
    if (!queryChatId || !user) return;
    if (lastLoadedChatIdRef.current === queryChatId) return;
    lastLoadedChatIdRef.current = queryChatId;

    let cancelled = false;
    hydratingChatRef.current = true;
    (async () => {
      try {
        const { messages: rows } = await getChat(queryChatId);
        if (cancelled) return;
        const hydrated: Message[] = rows
          .filter((r) => r.role === "user" || r.role === "assistant")
          .map((r) => ({ role: r.role, content: r.content }));
        setMessages(hydrated);
        currentChatIdRef.current = queryChatId;
        pendingChatPromiseRef.current = Promise.resolve(queryChatId);
        titleRequestedRef.current = true;
        hasPersistedAssistantRef.current = hydrated.some(
          (m) => m.role === "assistant"
        );
        analysisContextIdRef.current = null;
        hasUserMessagedRef.current = hydrated.some((m) => m.role === "user");
      } catch (err) {
        console.error("Failed to load chat:", err);
      } finally {
        if (!cancelled) hydratingChatRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      hydratingChatRef.current = false;
    };
  }, [router.query.chatId, user]);

  // Track previous personality to detect changes
  const prevPersonalityRef = useRef<string>(selectedCoachId);

  // Reset conversation when coach personality changes. Phase 2: the system
  // prompt is built server-side from the personalityId we send with the next
  // request, so we no longer rebuild any client-side prompt — we just reset
  // the visible turns to the new persona's greeting.
  useEffect(() => {
    if (prevPersonalityRef.current !== selectedCoachId) {
      prevPersonalityRef.current = selectedCoachId;
      const newPersonality = getPersonalityById(selectedCoachId);

      setMessages([
        { role: "assistant", content: newPersonality.greeting },
      ]);

      hasUserMessagedRef.current = false;
      gameLoadedRef.current = false;
      analysisContextIdRef.current = null; // Reset context for new personality
      resetChatPersistence();
    }
  }, [selectedCoachId, resetChatPersistence]);

  // Listen for move analysis requests from moves panel
  const moveAnalysisRequest = useAtomValue(moveAnalysisRequestAtom);
  const setMoveAnalysisRequest = useSetAtom(moveAnalysisRequestAtom);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ── autoAnalyze auto-send ──────────────────────────────────────────────
  // When the browser extension's URL flag fired and Stockfish finishes
  // analyzing the loaded PGN, auto-send "analyze my game" to the coach so
  // the user doesn't have to type anything. Fires exactly once per
  // page load (refs + atom-state-machine both guard).
  const autoSendFiredRef = useRef(false);
  useEffect(() => {
    if (autoAnalyzeState !== "pending") return;
    if (!gameEval) return; // wait for Stockfish to finish
    if (autoSendFiredRef.current) return;
    // Skip if the conversation already has a user message — handles the
    // refresh-with-persisted-chat case where the prior auto-send already
    // landed. Better to under-fire than to spam duplicate prompts.
    const hasUserMsg = messages.some((m) => m.role === "user");
    if (hasUserMsg) {
      autoSendFiredRef.current = true;
      setAutoAnalyzeState("done");
      return;
    }
    autoSendFiredRef.current = true;
    setAutoAnalyzeState("sent-awaiting-insights");
    // Small delay so the state transition commits before we kick off the
    // send. Belt-and-suspenders against React state-batching edge cases.
    setTimeout(() => {
      handleSendMessage("analyze my game");
    }, 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAnalyzeState, gameEval]);

  // ── autoAnalyze insight-detection lock release ─────────────────────────
  // Watch for the coach's reply to contain [INSIGHT:...] tags (the format
  // that drives the InsightsCarousel rendering). When detected, release
  // the input lock so the user can resume typing.
  useEffect(() => {
    if (autoAnalyzeState !== "sent-awaiting-insights") return;
    // Find the most recent assistant message and check for insight tags.
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant") continue;
      if (m.content.includes("[INSIGHT:")) {
        setAutoAnalyzeState("done");
        return;
      }
      break; // only check the LATEST assistant message — older ones don't matter
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAnalyzeState, messages]);

  // Helper function to detect if message is a greeting
  const isGreeting = (text: string): boolean => {
    const normalizedText = text.toLowerCase().trim();
    const greetings = ["hi", "hello", "hey", "greetings", "hi there", "hello there", "hey there"];
    return greetings.some(greeting => normalizedText === greeting || normalizedText.startsWith(greeting + " "));
  };

  // Helper function to detect if message is a direct request
  const isDirectRequest = (text: string): boolean => {
    const normalizedText = text.toLowerCase().trim();
    const requestKeywords = [
      "analyze", "review", "explain", "what", "why", "how", "show", "tell", 
      "help", "check", "best", "worst", "mistake", "good", "bad", "move",
      "moves", "game", "position", "opening", "middlegame", "endgame",
      "tactic", "strategy", "improve", "feedback", "coach", "teach"
    ];
    return requestKeywords.some(keyword => normalizedText.includes(keyword));
  };

  // Helper function to detect if user is accepting practice offer.
  //
  // IMPORTANT: Uses word-boundary matching and a short-message cap so that
  // casual requests like "help me analyze my game please" don't get hijacked
  // into the practice branch (which was previously happening because "please"
  // was a substring match).
  const isPracticeAcceptance = (text: string): boolean => {
    const normalizedText = text.toLowerCase().trim();
    // Acceptance utterances are short affirmations, not long requests.
    if (normalizedText.length > 60) return false;

    const acceptanceKeywords = [
      "yes", "sure", "ok", "okay", "yeah", "yep", "yup", "alright", "all right",
      "let's practice", "let's do it", "sounds good", "that sounds good",
      "i'd like to practice", "i want to practice", "i'd like that",
    ];
    return acceptanceKeywords.some((keyword) => {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i").test(normalizedText);
    });
  };

  // Whether the most recent assistant message actually offered a practice drill.
  // Required gate before treating a message as practice acceptance — otherwise
  // we'd fire the practice flow on any short "yes" / "ok" regardless of context.
  const lastAssistantOfferedPractice = (): boolean => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return false;
    const c = lastAssistant.content;
    // Must contain a practice-offer phrase AND end with a question.
    const offerPhrase = /(practice\s+(?:some\s+)?\w+?\s*puzzles|would you like to (?:practice|drill|work on|try)|shall we (?:practice|drill)|want to practice)/i;
    return offerPhrase.test(c) && /\?/.test(c);
  };

  // Helper function to extract theme from recent conversation.
  // Patterns are ordered from MOST-SPECIFIC to LEAST-SPECIFIC so that prose
  // containing both "discovered attack" and "attack" maps to the specific
  // theme, not a generic fallback. "fork" is placed last because assistant
  // responses frequently mention forks in passing prose even when the
  // position's key motif is something else — we prefer any more specific
  // match first.
  const extractThemeFromConversation = (): string | null => {
    // Look at the last few assistant messages for practice offer context
    const recentMessages = messages.slice(-5).reverse();

    for (const msg of recentMessages) {
      if (msg.role === "assistant") {
        const content = msg.content.toLowerCase();

        const themePatterns = [
          { keywords: ["back rank", "back-rank"], theme: "backRankMate" },
          { keywords: ["discovered attack", "discovered attacks"], theme: "discoveredAttack" },
          { keywords: ["hanging piece", "hanging pieces"], theme: "hangingPiece" },
          { keywords: ["skewer", "skewers"], theme: "skewer" },
          { keywords: ["pin", "pins"], theme: "pin" },
          { keywords: ["sacrifice", "sacrifices"], theme: "sacrifice" },
          { keywords: ["checkmate", " mate"], theme: "mate" },
          { keywords: ["fork", "forks"], theme: "fork" },
        ];

        for (const pattern of themePatterns) {
          if (pattern.keywords.some(keyword => content.includes(keyword))) {
            return pattern.theme;
          }
        }
      }
    }
    
    return null;
  };

  // Helper function to get game result reaction
  const getGameReaction = (game: Chess): string => {
    if (game.isCheckmate()) {
      // If it's checkmate, the side that just moved won
      // game.turn() gives the side to move next, so if it's checkmate, the opposite side won
      const winner = game.turn() === "w" ? "Black" : "White";
      return `Wow! Nice win for ${winner}!`;
    } else if (game.isDraw()) {
      if (game.isStalemate()) {
        return "Interesting! The game ended in stalemate.";
      } else if (game.isThreefoldRepetition()) {
        return "Close game! It ended in a threefold repetition draw.";
      } else if (game.isInsufficientMaterial()) {
        return "The game ended in a draw due to insufficient material.";
      } else {
        return "Close game! It ended in a draw.";
      }
    } else if (game.isGameOver()) {
      return "The game has ended.";
    } else {
      // Game is still ongoing
      return "Nice game so far!";
    }
  };

  // Extracted send logic to be reusable - using useCallback to avoid dependency issues
  const handleSendMessage = React.useCallback(
    async (messageText?: string) => {
      const textToSend = messageText || input.trim();
      if (!textToSend) return;

      // Gate sends behind game analysis completion. While Stockfish is still
      // evaluating, the coach can't ground its response in the eval data and
      // the user would be paying for an LLM call against incomplete context.
      if (isAnalyzingGame) return;

      // Block duplicate sends while a request is in flight. Must be a sync ref
      // — isLoading is set later (after the classify-intent fetch) and React
      // state updates are async, so without this a fast second click would
      // slip through and fire a second round trip.
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      // Disable UI immediately, before any await, so the Send button reflects
      // the in-flight state on the very next render.
      setIsLoading(true);
      if (!messageText) setInput("");

      // Cancel any ongoing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const userMessage: Message = { role: "user", content: textToSend };

      // Phase 2: the system prompt is built server-side by
      // getCoachChatSystemPrompt() from the structured fields we send below
      // (personalityId, userRating, username, playerColorName,
      // chesscomUsername, lichessUsername). The client no longer composes any
      // system prompt or USER CONTEXT block — that block was the source of
      // the production drift after AUDIT-PHASE-1.4 hardening silently
      // stripped the client systemPrompt field.
      // TODO(phase-2.5): re-introduce weakness profile via bounded structured field

      // Check if this is the first user message (only system message exists)
      const isFirstUserMessage = messages.filter(m => m.role === "user").length === 0;
      
      // Check if a new game was just loaded and user hasn't messaged yet
      const isNewGameLoaded = gameLoadedRef.current && game && !hasUserMessagedRef.current;
      
      // Mark that user has now messaged
      if (isFirstUserMessage) {
        hasUserMessagedRef.current = true;
      }
      
      // ───────────────────────────────────────────────────────────────
      // INTENT CLASSIFICATION (LLM-powered router)
      //
      // Instead of fragile keyword heuristics, ask a small fast LLM
      // (Claude Haiku, via /api/classify-intent) what the user actually
      // wants. Possible intents:
      //   - accept_practice  → run the puzzle-fetch flow with the extracted theme
      //   - decline_practice → short canned acknowledgment, stay in analysis
      //   - off_topic        → polite on-topic redirect (no big LLM call)
      //   - chess_question   → fall through to /api/enhanced-analysis or /api/chat
      //
      // If the classifier fails (network/API error or unparseable), we fall
      // back to the legacy regex heuristics below so the chat still works.
      // ───────────────────────────────────────────────────────────────
      type Intent =
        | "accept_practice"
        | "decline_practice"
        | "off_topic"
        | "chess_question";
      let classifiedIntent: Intent | null = null;
      let classifiedTheme: string | null = null;
      try {
        const classifyRes = await fetch("/api/classify-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
          body: JSON.stringify({
            userMessage: textToSend,
            recentMessages: messages
              .filter((m) => m.role === "user" || m.role === "assistant")
              .slice(-4)
              .map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        if (classifyRes.ok) {
          const c = await classifyRes.json();
          if (
            c.intent === "accept_practice" ||
            c.intent === "decline_practice" ||
            c.intent === "off_topic" ||
            c.intent === "chess_question"
          ) {
            classifiedIntent = c.intent as Intent;
            classifiedTheme = typeof c.theme === "string" ? c.theme : null;
          }
        }
      } catch (e) {
        // Swallow — we'll fall back to regex heuristics below.
        console.warn("Intent classifier call failed, falling back to heuristics:", e);
      }

      // Route: OFF-TOPIC — short polite redirect, no big LLM call.
      if (classifiedIntent === "off_topic") {
        const offTopicReply =
          "I'm your chess coach, so I'll stay focused on chess! Ask me to analyze your game, explain a move, or suggest tactics to practice — happy to dive into any of those.";
        setMessages((prev) => [
          ...prev,
          userMessage,
          { role: "assistant", content: offTopicReply },
        ]);
        void persistTurn("user", textToSend);
        void persistTurn("assistant", offTopicReply);
        setIsLoading(false);
        inFlightRef.current = false;
        return;
      }

      // Route: DECLINE PRACTICE — short acknowledgment, then wait for next message.
      if (classifiedIntent === "decline_practice") {
        const declineReply =
          "No problem! We can keep analyzing the game. Let me know if you want to tackle a specific move or idea.";
        setMessages((prev) => [
          ...prev,
          userMessage,
          { role: "assistant", content: declineReply },
        ]);
        void persistTurn("user", textToSend);
        void persistTurn("assistant", declineReply);
        setIsLoading(false);
        inFlightRef.current = false;
        return;
      }

      // Route: ACCEPT PRACTICE — decide whether to trigger the puzzle flow.
      // Prefer the classifier's decision, but guard with the legacy heuristic
      // (last assistant actually offered practice) to avoid runaway loops.
      const shouldTriggerPractice =
        classifiedIntent === "accept_practice"
          ? !!classifiedTheme || lastAssistantOfferedPractice()
          : classifiedIntent === null &&
            isPracticeAcceptance(textToSend) &&
            lastAssistantOfferedPractice(); // regex fallback only if classifier unavailable

      if (shouldTriggerPractice) {
        // Prefer the classifier-extracted theme; fall back to keyword scan of
        // recent turns if the classifier didn't give us one.
        const theme = classifiedTheme || extractThemeFromConversation();
        
        if (theme) {
          // Determine difficulty from user rating
          let difficulty: string | undefined;
          if (game) {
            const headers = game.getHeaders();
            const playerColor = userPlayerInfo.playerColor;
            const ratingStr = playerColor === "black" ? headers.BlackElo : headers.WhiteElo;
            const rating = ratingStr ? parseInt(ratingStr) : undefined;
            if (rating) {
              if (rating <= 1200) difficulty = "beginner";
              else if (rating <= 1600) difficulty = "intermediate";
              else if (rating <= 2000) difficulty = "advanced";
              else difficulty = "expert";
            }
          }

          // User accepted practice offer - fetch puzzles and redirect
          const ackReply = `Great! Let me gather some ${theme} puzzles${difficulty ? ` at ${difficulty} level` : ""} for you...`;
          setMessages((prev) => [
            ...prev,
            userMessage,
            { role: "assistant", content: ackReply },
          ]);
          void persistTurn("user", textToSend);
          void persistTurn("assistant", ackReply);

          try {
            const normalizedTheme = normalizeThemeName(theme);
            // The static puzzle DB (Lichess-derived) uses camelCase theme IDs
            // like `mate`, `backRankMate`, `trappedPiece`, etc., while
            // normalizeThemeName emits kebab-case like `mating-attack`. Pass
            // both so we hit whichever the local index actually stores.
            const themeVariants = Array.from(
              new Set([normalizedTheme, theme].filter(Boolean))
            );
            const puzzles = await getPuzzlesByTheme(themeVariants, 20, difficulty);
            
            if (puzzles.length > 0) {
              setPracticePuzzles(puzzles);
              setCurrentPuzzleIndex(0);
              setPracticeTheme(normalizedTheme);
              
              // Redirect with theme and difficulty preset
              const query: Record<string, string> = { theme: normalizedTheme };
              if (difficulty) query.difficulty = difficulty;
              router.push({ pathname: "/practice", query });
            } else {
              const noPuzzlesReply =
                "I couldn't find puzzles for that theme right now. Let's continue analyzing your game!";
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: noPuzzlesReply },
              ]);
              void persistTurn("assistant", noPuzzlesReply);
            }
          } catch (error) {
            console.error("Error fetching practice puzzles:", error);
            const errReply =
              "Sorry, I encountered an error fetching puzzles. Let's continue analyzing your game!";
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: errReply },
            ]);
            void persistTurn("assistant", errReply);
          }
          
          setIsLoading(false);
          inFlightRef.current = false;
          return; // Don't make API call for practice acceptance
        }
      }

      // All user messages go to the LLM — no more forced canned responses
      // The AI already speaks first via auto-greet when a game is loaded
      gameLoadedRef.current = false; // Reset flag if set

      setMessages((prev) => [...prev, userMessage]);
      void persistTurn("user", textToSend);

      // Create a new abort controller for this request
      abortControllerRef.current = new AbortController();

      try {
        // Determine user color - prioritize detected player color from username, fallback to board orientation
        let userColor: "w" | "b";
        if (userPlayerInfo.playerColor) {
          userColor = userPlayerInfo.playerColor === "white" ? "w" : "b";
        } else {
          userColor = boardOrientation ? "w" : "b";
        }

        // Extract user rating from game headers if available
        let userRating: number | undefined = undefined;
        if (game) {
          const headers = game.getHeaders();
          if (userPlayerInfo.playerColor === "white" && headers.WhiteElo) {
            userRating = parseInt(headers.WhiteElo);
          } else if (userPlayerInfo.playerColor === "black" && headers.BlackElo) {
            userRating = parseInt(headers.BlackElo);
          }
        }

        // Build conversation history for multi-turn context (exclude system messages)
        const conversationHistory = messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role, content: m.content }));

        let data: any;

        // TWO-TIER ROUTING:
        // - First message (or no contextId): Full deep analysis via /api/enhanced-analysis (gpt-4o, 5-15s)
        // - Follow-up messages: Fast chat via /api/chat (gpt-4o-mini, 2-5s) using cached context
        const hasContext = analysisContextIdRef.current && conversationHistory.some(m => m.role === "assistant");

        if (hasContext) {
          // === FAST PATH: Follow-up via /api/chat ===
          const chatResponse = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
            body: JSON.stringify({
              contextId: analysisContextIdRef.current,
              userMessage: textToSend,
              conversationHistory: conversationHistory,
            }),
            signal: abortControllerRef.current.signal,
          });

          if (chatResponse.status === 404) {
            // Context expired — fall through to full analysis below
            console.log("Analysis context expired, falling back to full analysis");
            analysisContextIdRef.current = null;
          } else if (!chatResponse.ok) {
            const errorData = await chatResponse.json();
            throw new Error(errorData.error || `HTTP error! status: ${chatResponse.status}`);
          } else {
            data = await chatResponse.json();
          }
        }

        // === DEEP PATH: Full analysis via /api/enhanced-analysis (first message or context expired) ===
        if (!data) {
          // The fields the server actually consumes per
          // src/lib/validation/schemas.ts:enhancedAnalysisSchema. The Zod
          // body silently strips unknown keys (AUDIT-PHASE-1.4 hardening
          // contract), so legacy hints like analysisType, model,
          // includeAIAnalysis, and responseLength were always dead weight
          // on the wire — removing them keeps the request body honest and
          // smaller. Server-side prompt composition lives entirely in
          // getCoachChatSystemPromptParts using the structured fields below.
          const requestData: any = {
            playerColor: userColor,
            userMessage: textToSend,
            conversationHistory: conversationHistory,
            boardOrientation: boardOrientation,
            gameEval: gameEval,
            personalityId: selectedCoachId,
            username: userPlayerInfo.username || undefined,
            playerColorName: userPlayerInfo.playerColor || undefined,
            chesscomUsername: userProfile?.chesscomUsername || undefined,
            lichessUsername: userProfile?.lichessUsername || undefined,
            userRating: userRating || 1500, // Default to 1500 if rating unknown
          };

          // Add game data based on what's available
          if (game) {
            requestData.moveHistory = game.history();
            requestData.fen = game.fen();
          } else if (position) {
            requestData.fen = position;
          }

          // Phase-3 cross-game weakness memory: the store lives in the browser's
          // localStorage, so the client projects it into the bounded, server-
          // validated MasterySummary and ships it in the body. The route feeds
          // it to the teaching relevance filter so the coach's ONE-PRIMARY-IDEA
          // choice can favor a recurring weakness. Only sent once there is real
          // cross-game signal (toMasterySummary returns null below 2 games).
          const masterySummary = toMasterySummary(loadWeaknessProfile());
          if (masterySummary) {
            requestData.masterySummary = masterySummary;
          }

          // Opt into Server-Sent Events streaming. The route emits text
          // deltas as the LLM generates them, then a final "done" event
          // carrying validation + contextId + puzzle recommendations.
          requestData.stream = true;

          const response = await fetch("/api/enhanced-analysis", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "text/event-stream",
              ...(await getAuthHeader()),
            },
            body: JSON.stringify(requestData),
            signal: abortControllerRef.current.signal,
          });

          if (response.status === 402) {
            // Free-tier allowance exhausted — surface the upgrade dialog.
            triggerPaywall({ feature: "AI coach", reason: "quota_exhausted" });
          }
          if (!response.ok) {
            // Server returned an error status BEFORE streaming. Body is JSON.
            const errorData = await response.json().catch(() => ({}));
            const errorMessage =
              errorData.error ||
              errorData.details ||
              `HTTP error! status: ${response.status}`;
            console.error("API Error:", errorData);
            throw new Error(errorMessage);
          }

          const isStream = response.headers
            .get("content-type")
            ?.includes("text/event-stream");

          if (isStream && response.body) {
            // Push an empty assistant message we'll fill in as text arrives.
            // Stamp it with the board FEN *now* — the position Claude is
            // actually reasoning about — so a later "Share Insight" doesn't
            // grab whatever the user navigates to.
            const insightFen = boardFenRef.current;
            setMessages((prev) => [...prev, { role: "assistant", content: "", fen: insightFen }]);
            setIsStreaming(true);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let streamedText = "";
            let finalMetadata: any = null;
            let streamErr: string | null = null;

            try {
              for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                let evtEnd: number;
                while ((evtEnd = buffer.indexOf("\n\n")) !== -1) {
                  const evt = buffer.slice(0, evtEnd);
                  buffer = buffer.slice(evtEnd + 2);
                  for (const line of evt.split("\n")) {
                    if (!line.startsWith("data:")) continue;
                    const dataStr = line.slice(5).trim();
                    if (!dataStr) continue;
                    let parsedEvt: any;
                    try {
                      parsedEvt = JSON.parse(dataStr);
                    } catch {
                      continue;
                    }
                    if (parsedEvt.type === "text" && typeof parsedEvt.delta === "string") {
                      streamedText += parsedEvt.delta;
                      setMessages((prev) => {
                        const next = [...prev];
                        const last = next[next.length - 1];
                        if (last && last.role === "assistant") {
                          // Spread `last` so we preserve the `fen` stamped at creation.
                          next[next.length - 1] = { ...last, content: streamedText };
                        }
                        return next;
                      });
                    } else if (parsedEvt.type === "done") {
                      finalMetadata = parsedEvt.metadata;
                    } else if (parsedEvt.type === "error") {
                      streamErr = parsedEvt.error || "stream error";
                    }
                  }
                }
              }
            } finally {
              try { reader.releaseLock(); } catch { /* ignore */ }
              setIsStreaming(false);
            }

            if (streamErr) throw new Error(streamErr);

            // If validation rewrote the text (e.g. flagged an illegal move
            // citation), swap in the corrected version. Usually identical.
            if (
              finalMetadata?.corrected &&
              typeof finalMetadata.analysis === "string" &&
              finalMetadata.analysis !== streamedText
            ) {
              streamedText = finalMetadata.analysis;
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === "assistant") {
                  // Spread `last` so we preserve the `fen` stamped at creation.
                  next[next.length - 1] = { ...last, content: streamedText };
                }
                return next;
              });
            }

            if (finalMetadata?.contextId) {
              analysisContextIdRef.current = finalMetadata.contextId;
            }
            if (finalMetadata?.puzzleRecommendations) {
              setPuzzleRecommendations(finalMetadata.puzzleRecommendations);
            }

            // Persist the finalized assistant turn (after any validation
            // rewrite). Streaming intermediate deltas are not persisted —
            // we only save the canonical final text.
            void persistTurn("assistant", streamedText);

            // Streaming path already wrote the assistant message — skip the
            // append-from-`data` block below.
            data = { __streamed: true };
          } else {
            // Non-streaming JSON fallback (older clients / cache hit paths).
            data = await response.json();

            if (data.gameAnalysis?.contextId) {
              analysisContextIdRef.current = data.gameAnalysis.contextId;
            }
            if (data.gameAnalysis?.puzzleRecommendations) {
              setPuzzleRecommendations(data.gameAnalysis.puzzleRecommendations);
            }
          }
        }

        // Add assistant message with the analysis. Skipped when the
        // streaming path already pushed the message incrementally.
        if (!data.__streamed) {
          let assistantContent = "";

          if (data.gameAnalysis) {
            assistantContent += data.gameAnalysis.analysis;
          } else if (data.currentPositionAnalysis) {
            assistantContent += data.currentPositionAnalysis.analysis;
          }

          if (data.aiAnalysisError) {
            assistantContent += `\n\n**Note:** ${data.aiAnalysisError}`;
          }

          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: assistantContent, fen: boardFenRef.current },
          ]);
          void persistTurn("assistant", assistantContent);
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          console.log("Request aborted");
        } else {
          console.error("Error sending message:", error);
          const errMsg =
            error instanceof Error && error.message
              ? error.message
              : "Unknown error";
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Sorry, I encountered an error: ${errMsg}. Please try again.`,
            },
          ]);
        }
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
        abortControllerRef.current = null;
        inFlightRef.current = false;
      }
    },
    [messages, game, position, boardOrientation, gameEval, input, router, puzzleSolvedStatus, setPracticePuzzles, setCurrentPuzzleIndex, setPracticeTheme, userProfile, isAnalyzingGame]
  );

  // Handle move analysis requests from moves panel
  useEffect(() => {
    if (moveAnalysisRequest && !isLoading) {
      const { moveNumber, move } = moveAnalysisRequest;
      const analysisMessage = `Analyze move ${moveNumber} (${move}) in detail. Explain the short-term and long-term consequences, alternatives, and which principles were followed or violated.`;

      // Clear the request immediately to prevent duplicate triggers
      setMoveAnalysisRequest(null);

      // Trigger send directly with the message
      handleSendMessage(analysisMessage);
    }
  }, [
    moveAnalysisRequest,
    isLoading,
    setMoveAnalysisRequest,
    handleSendMessage,
  ]);

  const handleSend = async () => {
    await handleSendMessage();
  };

  // Helper function to process React children recursively
  const processChildren = (children: React.ReactNode): React.ReactNode => {
    if (typeof children === "string") {
      return renderTextWithClickableMoves(children, game);
    }
    if (Array.isArray(children)) {
      return children.map((child, index) => (
        <React.Fragment key={index}>{processChildren(child)}</React.Fragment>
      ));
    }
    if (React.isValidElement(children)) {
      return React.cloneElement(children, {
        ...children.props,
        children: processChildren(children.props.children),
      });
    }
    return children;
  };

  // Helper function to enhance move citation in AI responses
  const enhanceMoveCitation = (content: string, game: Chess | null): string => {
    if (!game) return content;

    const gameHistory = game.history();
    if (gameHistory.length === 0) return content;

    // SAN move pattern (captures piece moves, pawn moves, castling)
    const sanPattern = /([NBRQK][a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|[a-h]x[a-h][1-8](?:=[NBRQ])?[+#]?|[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/g;

    // Find all bare SAN moves that DON'T already have a move number prefix
    const result = content.replace(sanPattern, (match, move, offset) => {
      // Check if this move is already preceded by a move number like "14." or "14..."
      const before = content.slice(Math.max(0, offset - 10), offset);
      if (/\d+\.{1,3}\s*$/.test(before)) {
        return match; // Already has a move number — don't double-number
      }

      // Check if this is inside a heading/label like "Best Move:" — we want to number these
      // But skip things that look like square references, not moves (e.g., "e4" in "pawn on e4")
      const contextBefore = content.slice(Math.max(0, offset - 30), offset).toLowerCase();
      if (/(?:on|at|square|from|to)\s*$/.test(contextBefore)) {
        return match; // This is a square reference, not a move
      }

      // Try to find the move in game history (for played moves)
      const moveIndex = gameHistory.findIndex((h) => h === move);
      if (moveIndex >= 0) {
        const moveNum = Math.floor(moveIndex / 2) + 1;
        const isBlack = moveIndex % 2 === 1;
        return `${moveNum}.${isBlack ? ".." : ""} ${move}`;
      }

      // For engine-suggested moves NOT in game history, try to infer move number from nearby context
      const nearbyContext = content.slice(Math.max(0, offset - 80), offset);
      const nearbyMoveNum = nearbyContext.match(/(?:Move\s+(\d+)|(\d+)\.)/i);
      if (nearbyMoveNum) {
        const inferredNum = parseInt(nearbyMoveNum[1] || nearbyMoveNum[2]);
        if (inferredNum > 0 && inferredNum <= Math.ceil(gameHistory.length / 2) + 5) {
          return `${inferredNum}. ${move}`;
        }
      }

      return match; // Can't determine move number — leave as-is
    });

    return result;
  };

  const handleFeedback = (messageIndex: number, rating: "positive" | "negative") => {
    // Toggle off if same rating clicked again
    if (messageFeedback[messageIndex] === rating) {
      setMessageFeedback((prev) => {
        const next = { ...prev };
        delete next[messageIndex];
        return next;
      });
      return;
    }

    setMessageFeedback((prev) => ({ ...prev, [messageIndex]: rating }));

    // Find the actual message from the filtered list
    const filteredMessages = messages.filter((m) => m.role !== "system");
    const message = filteredMessages[messageIndex];
    if (!message) return;

    // Store feedback
    try {
      storeFeedback({
        rating,
        responseText: message.content.slice(0, 500),
        fen: game?.fen(),
        coachId: selectedCoachId,
      });
    } catch (e) {
      console.warn("Failed to store feedback:", e);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Drop the keypress if a send is already in flight, the input is empty,
      // the engine is still analyzing the game, or the autoAnalyze flow has
      // the input locked. The button's disabled state is async, but a
      // held-down Enter fires synchronously.
      if (
        isLoading ||
        inFlightRef.current ||
        isAnalyzingGame ||
        lockedByAutoAnalyze ||
        !input.trim()
      ) {
        return;
      }
      handleSend();
    }
  };

  return (
    <ChatContainer elevation={3}>
      <Box sx={{ mb: 2, position: "relative" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="h6" gutterBottom sx={{ mb: 0 }}>
          AI Chess Coach
        </Typography>
          <MaiaStatusIndicator size="small" />
        </Box>
        <ExpandButton onClick={() => setIsExpanded(!isExpanded)} size="small">
          {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </ExpandButton>
      </Box>

      <MessagesContainer isExpanded={isExpanded}>
        {(() => {
          // Filter once so we can pass the same array to FlagButton (intern
          // feature) as `chatHistory` while the .map keeps using `index` as
          // the position in that filtered list.
          const visibleMessages = messages.filter((m) => m.role !== "system");
          return visibleMessages.map((message, index) => {
            const markdownComponents = {
              code({ className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || "");
                const language = match ? match[1] : "";
                const isCodeBlock = Boolean(match);
                return isCodeBlock ? (
                  <SyntaxHighlighter
                    style={vscDarkPlus}
                    language={language}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      borderRadius: "8px",
                      fontSize: "0.85em",
                    }}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
              table({ children }: any) {
                return (
                  <div style={{ overflowX: "auto", marginBottom: "1rem" }}>
                    <table style={{ minWidth: "100%" }}>{children}</table>
                  </div>
                );
              },
              blockquote({ children }: any) {
                return (
                  <blockquote
                    style={{
                      borderLeft: "4px solid #1976d2",
                      paddingLeft: "16px",
                      margin: "16px 0",
                      fontStyle: "italic",
                      backgroundColor: "#f5f5f5",
                      borderRadius: "4px",
                      padding: "8px 16px",
                    }}
                  >
                    {children}
                  </blockquote>
                );
              },
              p({ children }: any) {
                return <p>{processChildren(children)}</p>;
              },
              li({ children }: any) {
                return <li>{processChildren(children)}</li>;
              },
              strong({ children }: any) {
                return <strong>{processChildren(children)}</strong>;
              },
              em({ children }: any) {
                return <em>{processChildren(children)}</em>;
              },
              h1({ children }: any) {
                return <h1>{processChildren(children)}</h1>;
              },
              h2({ children }: any) {
                return <h2>{processChildren(children)}</h2>;
              },
              h3({ children }: any) {
                return <h3>{processChildren(children)}</h3>;
              },
              h4({ children }: any) {
                return <h4>{processChildren(children)}</h4>;
              },
              td({ children }: any) {
                return <td>{processChildren(children)}</td>;
              },
              th({ children }: any) {
                return <th>{processChildren(children)}</th>;
              },
            };

            const renderMarkdown = (body: string) => (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {body}
              </ReactMarkdown>
            );

            // Parse [INSIGHT:...]...[/INSIGHT] blocks for assistant messages.
            // When insights are present, render prefix prose + paginated
            // InsightsCarousel + suffix prose. Everything else keeps its
            // existing markdown+token rendering.
            const rawContent =
              message.role === "assistant"
                ? enhanceMoveCitation(message.content, game ?? null)
                : message.content;
            const parsed =
              message.role === "assistant"
                ? parseInsights(rawContent)
                : { prefix: rawContent, insights: [], suffix: "" };
            const renderRich = (t: string) => renderTextWithClickableMoves(t, game ?? undefined);

            return (
            <FadeIn key={index}>
            <MessageBubble isUser={message.role === "user"}>
              {parsed.insights.length > 0 ? (
                <>
                  {parsed.prefix && renderMarkdown(parsed.prefix)}
                  <InsightsCarousel
                    insights={parsed.insights}
                    renderRich={renderRich}
                    onMoveClick={(moveNum, isBlack) => {
                      const halfMoveIdx = isBlack
                        ? moveNum * 2 - 1
                        : (moveNum - 1) * 2;
                      if (game && halfMoveIdx >= 0) {
                        goToMove(halfMoveIdx + 1, game);
                      }
                    }}
                  />
                  {parsed.suffix && renderMarkdown(parsed.suffix)}
                </>
              ) : (
                renderMarkdown(rawContent)
              )}
              {isStreaming &&
                index ===
                  messages.filter((m) => m.role !== "system").length - 1 &&
                message.role === "assistant" && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      mt: 1,
                      opacity: 0.7,
                    }}
                  >
                    <CircularProgress size={12} sx={{ mr: 1 }} />
                    <Typography variant="caption" sx={{ fontStyle: "italic" }}>
                      Thinking...
                    </Typography>
                  </Box>
                )}
              {message.role === "assistant" && !isStreaming && (
                <Box
                  sx={{
                    display: "flex",
                    gap: 0.5,
                    mt: 0.5,
                    opacity: messageFeedback[index] ? 1 : 0.4,
                    "&:hover": { opacity: 1 },
                    transition: "opacity 0.2s",
                  }}
                >
                  <IconButton
                    size="small"
                    onClick={() => handleFeedback(index, "positive")}
                    sx={{
                      padding: "2px",
                      color: messageFeedback[index] === "positive" ? "#4caf50" : "inherit",
                    }}
                  >
                    {messageFeedback[index] === "positive" ? (
                      <ThumbUpIcon sx={{ fontSize: 14 }} />
                    ) : (
                      <ThumbUpOutlinedIcon sx={{ fontSize: 14 }} />
                    )}
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => handleFeedback(index, "negative")}
                    sx={{
                      padding: "2px",
                      color: messageFeedback[index] === "negative" ? "#f44336" : "inherit",
                    }}
                  >
                    {messageFeedback[index] === "negative" ? (
                      <ThumbDownIcon sx={{ fontSize: 14 }} />
                    ) : (
                      <ThumbDownOutlinedIcon sx={{ fontSize: 14 }} />
                    )}
                  </IconButton>
                  {/* CMIP intern flag — renders only when isIntern. */}
                  <FlagButton
                    message={message}
                    messageIndex={index}
                    chatHistory={visibleMessages}
                    contextId={analysisContextIdRef.current ?? null}
                  />
                  {/* Share Insight — only for messages with a captured FEN and
                      enough content to be worth sharing. Short canned replies
                      (off-topic, decline, errors) don't qualify. */}
                  {message.fen && message.content.trim().length > 100 && (
                    <Tooltip title="Share Insight" arrow placement="top">
                      <IconButton
                        size="small"
                        aria-label="Share insight"
                        onClick={() => {
                          // Capture the conversation up to and including this
                          // message for the "Whole conversation" share mode.
                          // System messages are already excluded from
                          // visibleMessages; we further restrict to user/
                          // assistant roles to match the ShareableMessage type.
                          const transcript = visibleMessages
                            .slice(0, index + 1)
                            .filter(
                              (m): m is typeof m & { role: "user" | "assistant" } =>
                                m.role === "user" || m.role === "assistant"
                            )
                            .map(m => ({
                              role: m.role,
                              content: m.content,
                              ...(m.fen ? { fen: m.fen } : {}),
                            }));
                          setSnippetDialog({
                            fen: message.fen as string,
                            explanation: message.content,
                            transcript,
                          });
                        }}
                        sx={{ padding: "2px", color: "inherit" }}
                      >
                        <ShareIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              )}
            </MessageBubble>
            </FadeIn>
            );
          });
        })()}
        <div ref={messagesEndRef} />
      </MessagesContainer>

      {/* Legacy "Targeted Practice Puzzles" block removed.
          Practice puzzles are now driven by the [CONCEPT:...] tag inside each
          insight card in the carousel, which queries the same puzzle graph. */}

      <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={
            autoAnalyzeState === "pending"
              ? `Analyzing your game... ${evaluationProgress}%`
              : autoAnalyzeState === "sent-awaiting-insights"
              ? "Coach is reviewing your game…"
              : isAnalyzingGame
              ? `Analyzing your game... ${evaluationProgress}%`
              : "Ask specific questions about moves or positions..."
          }
          disabled={isLoading || isAnalyzingGame || lockedByAutoAnalyze}
        />

        {/* Quick Analysis Button */}
        <IconButton
          onClick={() => {
            if (!isLoading && !isAnalyzingGame && !lockedByAutoAnalyze && !input.trim()) {
              setInput("analyze my game");
              // Use the existing handleSend function to ensure proper state management
              setTimeout(() => {
                handleSend();
              }, 50);
            }
          }}
          disabled={isLoading || isAnalyzingGame || lockedByAutoAnalyze}
          sx={{
            background: "linear-gradient(135deg, #FF8C42 0%, #FF6B42 100%)",
            color: "white",
            width: 48,
            height: 48,
            borderRadius: 2,
            "&:hover": {
              background: isLoading
                ? "linear-gradient(135deg, #FF8C42 0%, #FF6B42 100%)"
                : "linear-gradient(135deg, #FF6B42 0%, #FF5722 100%)",
            },
            "&.Mui-disabled": {
              background: "linear-gradient(135deg, #FF8C42 0%, #FF6B42 100%)",
              opacity: 0.6,
              color: "white",
            },
          }}
          title="Analyze My Game"
        >
          {isLoading ? (
            <CircularProgress size={20} sx={{ color: "white" }} />
          ) : (
            <>🎯</>
          )}
        </IconButton>

        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={isLoading || isAnalyzingGame || lockedByAutoAnalyze || !input.trim()}
        >
          {isLoading ? <CircularProgress size={24} /> : <SendIcon />}
        </IconButton>
      </Box>

      {/* Share Insight dialog — board snapshot + Claude's explanation as PNG */}
      {snippetDialog && (
        <AnalysisSnippetDialog
          open
          onClose={() => setSnippetDialog(null)}
          data={snippetDialog}
        />
      )}
    </ChatContainer>
  );
};

export default AICoachChat;
