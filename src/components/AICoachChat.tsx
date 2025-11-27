"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  Paper,
  TextField,
  IconButton,
  Typography,
  CircularProgress,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { styled } from "@mui/material/styles";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";

import { Chess } from "chess.js";
import { useChessActions } from "@/hooks/useChessActions";
import {
  boardAtom,
  gameAtom,
  gameEvalAtom,
  moveAnalysisRequestAtom,
  userPlayerInfoAtom,
} from "@/sections/analysis/states";
import { useAtomValue, useSetAtom } from "jotai";
import { MaiaStatusIndicator } from "./MaiaStatusIndicator";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface AICoachChatProps {
  position?: string;
  game?: Chess;
  boardOrientation?: boolean;
}

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
}> = ({ move, moveNumber, isBlackMove }) => {
  const game = useAtomValue(gameAtom);
  const { goToMove } = useChessActions(boardAtom);

  console.log(
    `ClickableMove created: ${moveNumber}.${isBlackMove ? ".." : ""} ${move}`
  );

  const handleMoveClick = () => {
    console.log(
      `ClickableMove clicked: ${moveNumber}.${isBlackMove ? ".." : ""} ${move}`
    );
    try {
      const gameHistory = game.history();
      console.log("Game history length:", gameHistory.length);
      let targetMoveIndex = -1;

      if (moveNumber !== undefined) {
        // Calculate the exact index based on move number and color
        if (isBlackMove) {
          // Black move: moveNumber * 2 - 1 (e.g., move 11 black = index 21)
          targetMoveIndex = moveNumber * 2 - 1;
        } else {
          // White move: moveNumber * 2 - 2 (e.g., move 11 white = index 20)
          targetMoveIndex = moveNumber * 2 - 2;
        }

        console.log(
          `Calculated target index: ${targetMoveIndex}, Game history at that index: ${gameHistory[targetMoveIndex]}`
        );

        // Verify the move matches what we expect
        if (
          targetMoveIndex >= 0 &&
          targetMoveIndex < gameHistory.length &&
          gameHistory[targetMoveIndex] === move
        ) {
          console.log("Perfect match found!");
          // Perfect match found
        } else {
          console.log("No perfect match, searching for move...");
          // Fallback to searching for the move
          targetMoveIndex = gameHistory.findIndex(
            (historyMove) => historyMove === move
          );
          console.log(`Search result index: ${targetMoveIndex}`);
        }
      } else {
        // Search for the move in history (find first occurrence)
        targetMoveIndex = gameHistory.findIndex(
          (historyMove) => historyMove === move
        );
      }

      if (targetMoveIndex >= 0) {
        // Navigate to the move (add 1 because goToMove expects position after the move)
        goToMove(targetMoveIndex + 1, game);
        console.log(`✅ Navigated to move ${targetMoveIndex + 1}: ${move}`);
      } else {
        console.warn(
          `❌ Could not find move "${move}" in game history:`,
          gameHistory
        );
      }
    } catch (error) {
      console.error("Error navigating to move:", error);
    }
  };

  return (
    <span
      onClick={handleMoveClick}
      style={{
        color: "#4FC3F7",
        cursor: "pointer",
        textDecoration: "underline",
        fontWeight: "bold",
        padding: "2px 4px",
        borderRadius: "4px",
        backgroundColor: "rgba(79, 195, 247, 0.1)",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(79, 195, 247, 0.2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(79, 195, 247, 0.1)";
      }}
      title={`Click to jump to move ${moveNumber}${isBlackMove ? "..." : "."} ${move}`}
    >
      {moveNumber}.{isBlackMove ? ".." : ""} {move}
    </span>
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

// Helper function to process position links
const processPositionLinks = (text: string) => {
  if (!text.includes("position") && !text.includes("Position")) {
    return [text];
  }

  const parts = [];
  // Pattern to match position references: "position X", "Position X", "[position X]", "at position X", "after position X"
  const positionPattern = /(?:\[)?(?:position|Position)\s+(\d+)(?:\])?/gi;
  let lastIndex = 0;
  let match;

  while ((match = positionPattern.exec(text)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const positionNumber = parseInt(match[1]);
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

// Custom text renderer that converts move notation to clickable links
const renderTextWithClickableMoves = (text: string) => {
  if (!text) return null;

  // First, process position links
  const textWithPositions = processPositionLinks(text);

  // If we have position links, we need to process each part separately
  if (
    textWithPositions.length > 1 ||
    (textWithPositions.length === 1 && typeof textWithPositions[0] !== "string")
  ) {
    // We have position links, process each string part for moves
    return textWithPositions.map((part, idx) => {
      if (typeof part === "string") {
        return (
          <React.Fragment key={idx}>{renderMovesInText(part)}</React.Fragment>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  }

  // No position links, just process moves
  return renderMovesInText(text);
};

// Helper function to render moves in text
const renderMovesInText = (text: string) => {
  if (!text) return null;

  // Unified pattern to catch all move formats in priority order
  const movePatterns = [
    // Priority 1: AI response format "Move X: [move] - [principle] - [explanation] - [suggestion]"
    {
      pattern:
        /Move\s+(\d+):\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/gi,
      type: "ai",
      priority: 1,
    },
    // Priority 2: Standard notation "15. Nf3" or "15... cxd4"
    {
      pattern:
        /(\d+)\.\.\.?\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/g,
      type: "standard",
      priority: 2,
    },
    // Priority 3: "move X" format
    {
      pattern:
        /move\s+(\d+)([wb])?:\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/gi,
      type: "move",
      priority: 3,
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

    if (pattern.type === "ai") {
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

    // Add the clickable move
    parts.push(
      <ClickableMove
        key={`${pattern.type}-${moveNumber}-${isBlackMove ? "black" : "white"}-${startIndex}`}
        move={move}
        moveNumber={moveNumber}
        isBlackMove={isBlackMove}
      />
    );

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

const AICoachChat: React.FC<AICoachChatProps> = ({
  position,
  game,
  boardOrientation = true,
}) => {
  // Get real Stockfish evaluation data
  const gameEval = useAtomValue(gameEvalAtom);
  // Get user player info (username and color)
  const userPlayerInfo = useAtomValue(userPlayerInfoAtom);

  // Track previous game to detect when a new game is loaded
  const prevGameRef = useRef<string | null>(null);
  const gameLoadedRef = useRef(false);
  const hasUserMessagedRef = useRef(false);

  // Detect when a new game is loaded
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
          gameLoadedRef.current = true;
          hasUserMessagedRef.current = false; // Reset for new game
        }
        prevGameRef.current = currentFen;
      }
    }
  }, [game]);

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content: `You are an expert grandmaster-level chess coach with deep knowledge of chess principles, strategy, and tactics. Your role is to guide users through their games by providing clear, actionable feedback that helps them improve.

YOUR PRIMARY JOB:
- Understand what the user is asking for using your natural language understanding
- Use the Stockfish evaluations, game history, and position data provided to fulfill their request
- Think through the request: What do they want? What information do you have? How can you use it to answer?
- Provide intelligent, helpful analysis based on their actual question - don't just follow templates

CONVERSATION FLOW:
- If the user makes a specific request (e.g., "best moves", "analyze move 5", "what's wrong here"), use your reasoning to understand what they want, then use the provided Stockfish data to answer their question directly
- If the user only greets you (Hi, Hello) without a request, introduce yourself and ask what they'd like to do
- If a game is newly loaded, give a brief reaction, then ask what they'd like to analyze
- Use your judgment: if they've asked something specific, answer it. If they haven't, ask what they want.

CRITICAL: OPENING MOVES POLICY
- DO NOT critique opening moves (moves 1-10). These are established openings played by strong players.
- If an opening is detected (e.g., Vienna Game, Ruy Lopez, Sicilian Defense), acknowledge it: "Let's analyze your Vienna game" or "I see you played the Ruy Lopez"
- Only analyze moves from move 11 onwards, unless the user specifically asks about opening moves
- Example: If user plays 1.e4 e5 2.Nc3 (Vienna), say "Let's analyze your Vienna game" NOT "2.Nc3 is a mistake, you should play 2.Nf3"
- Opening moves are stylistic choices, not mistakes. Respect the user's opening choice.

DEEP STOCKFISH ANALYSIS - THINK LIKE A CHESS COACH:
You must deeply analyze Stockfish's principal variation (PV) to understand WHY moves are good. Don't just say "this is the best move" - explain the reasoning:

TACTICAL PATTERN RECOGNITION (Based on FULL Lichess Chess Puzzles Dataset):
You have access to the COMPLETE Lichess chess puzzles dataset with millions of real puzzle positions. Use this extensively:

1. SIMILAR PUZZLES FROM DATASET:
   - When similar puzzles are provided, reference them directly: "This position is similar to puzzle #12345 from the Lichess dataset, which demonstrates the same fork pattern"
   - Explain how the solution sequences from similar puzzles relate to Stockfish's principal variation
   - Use puzzle themes to identify what type of tactic is present: "This is a classic fork pattern, as seen in thousands of Lichess puzzles with the 'fork' theme"

2. TACTICAL THEME IDENTIFICATION:
   - Use the tactical theme analysis provided (fork, pin, discovered attack, skewer, sacrifice, etc.)
   - Connect the identified tactical patterns to specific moves in the principal variation
   - Explain HOW the tactical pattern works in this specific position
   - Reference that these patterns come from the Lichess dataset: "This fork pattern appears in over 50,000 puzzles in the Lichess dataset"

3. DATASET-BASED EXPLANATIONS:
   - When explaining tactics, mention that this pattern is common in the dataset: "Forks like this appear frequently in the Lichess puzzle database"
   - Reference puzzle ratings when relevant: "This type of pin is typically rated around 1500-1800 in puzzle difficulty"
   - Use puzzle solutions to explain sequences: "The solution to similar puzzles shows that after this fork, the typical continuation is..."

For example:
- If a "fork" theme is identified with similar puzzles: "Stockfish suggests this move because it creates a fork, attacking both the king and queen simultaneously. This pattern appears in puzzle #12345 from the Lichess dataset (rated 1650), where the same fork leads to winning material. The solution sequence shows..."
- If a "pin" theme is identified: "This move creates a pin, where the opponent's piece cannot move without exposing a more valuable piece behind it. The Lichess dataset contains thousands of puzzles demonstrating this pattern, typically rated 1400-2000."
- If a "discovered attack" theme is identified: "By moving this piece, we reveal an attack from a piece behind it. This discovered attack pattern is one of the most common themes in the Lichess puzzle database, appearing in over 100,000 puzzles."

1. TACTICAL REASONS (immediate threats and opportunities):
   - Identify the specific tactical theme (fork, pin, discovered attack, skewer, sacrifice, etc.)
   - Explain HOW the tactical pattern works in this position
   - Connect the pattern to the moves in Stockfish's principal variation
   - Does it win material (piece, pawn)?
   - Does it threaten checkmate or force a winning sequence?
   - Does it defend against an immediate threat?

2. STRATEGIC REASONS (long-term plans and piece coordination):
   - Does it develop a piece to a better square?
   - Does it improve pawn structure or create weaknesses?
   - Does it coordinate pieces for an attack or defense?
   - Does it control important squares or files?

3. POSITIONAL REASONS (piece placement and future plans):
   - WHERE should pieces be placed? (e.g., "The knight belongs on f3 to control e5 and prepare kingside castling")
   - HOW do we get pieces there? (e.g., "We need to play d3 first to allow the bishop to develop")
   - WHY is this the best move? (e.g., "This move prepares the bishop development while maintaining central control")

4. GAME PLAN CREATION:
   - From any position, identify where pieces should ideally be placed
   - Explain the path to reach those ideal positions
   - Connect the best move to that plan: "This move is best because it starts the plan of placing the knight on f3, which will control the center and allow kingside castling"

MAIA INTEGRATION - HUMAN-LIKE MOVE PREDICTIONS:
- Maia predicts what humans at the user's rating level would play
- Use Maia predictions to:
  * Identify if the user played a common human move (even if not optimal): "You played the move that most players at your level choose, which is understandable because..."
  * Explain why humans choose certain moves: "Many players at your level play this move because it feels natural, but Stockfish shows a better alternative..."
  * Provide personalized feedback: "This is a common mistake at your level. Here's how to avoid it..."
- Compare: Stockfish (optimal) vs Maia (human-like) vs User's actual move
- If user's move matches Maia's prediction, acknowledge it's a common choice and explain why it's not optimal
- If user's move matches Stockfish, celebrate it: "Excellent! You found the engine's best move!"

CORE RESPONSIBILITIES:
- Use your reasoning capabilities to understand what the user is asking for
- Analyze chess positions and games using Stockfish engine evaluations as your primary source of truth
- When analyzing moves, deeply examine Stockfish's principal variation to understand WHY moves are good:
  * Tactical reasons: pins, forks, discovered attacks, material wins, threats
  * Strategic reasons: piece development, pawn structure, piece coordination, control of squares
  * Positional reasons: ideal piece placement, how to reach those positions, why the move helps
- Use Maia predictions to provide personalized, human-level feedback when available
- Be encouraging and educational, helping users understand the deeper reasoning behind moves
- Reference specific moves in a clickable format: "move X" or "X." where X is the move number

STOCKFISH EVALUATION USAGE:
- Always ground your analysis in the Stockfish evaluations provided
- Deeply analyze the principal variation (PV) - don't just list moves, explain WHY each move in the PV is good
- When Stockfish shows a significant evaluation change, analyze the PV to understand what caused it
- Use Stockfish's best move suggestions and explain them using the WHERE/HOW/WHY framework
- Explain the evaluation in terms of pawns (e.g., "+0.5 pawns advantage" or "-1.2 pawns")
- If Stockfish shows mate, explain the mating sequence clearly by analyzing the PV
- Trust Stockfish evaluations over general principles when they conflict, but explain WHY

HOW TO FULFILL REQUESTS:
- Read the user's request carefully and understand what they're asking for
- Look at the Stockfish evaluations, game history, and position data provided
- Use your reasoning to determine: What information do they need? What does the data show?
- Provide a direct, helpful answer using the Stockfish data to support your analysis
- For move analysis: Reference moves as "move X" or "X.", analyze Stockfish PV to explain WHY
- For game reviews: Use Stockfish evaluations to identify key moments (only critique moves after move 10)
- Always make moves clickable by using "move X" or "X." format
- Be specific and educational - explain the reasoning, not just the result

CHESS PRINCIPLES TO REFERENCE:
When analyzing moves (after move 10), reference relevant chess principles such as:
- Opening (moves 1-10): Acknowledge the opening, don't critique it
- Middlegame: Improve worst-placed piece, control open files, create and exploit weaknesses
- Endgame: Activate your king, create passed pawns, control key squares
- Tactical: Look for tactical opportunities, don't leave pieces hanging, create pins and forks
- Strategic: Control important squares, don't create permanent weaknesses, coordinate pieces

INTERACTIVE ELEMENTS:
- When referencing a move in the game, format it as clickable: "move X" or "X."
- When suggesting a hypothetical move, clearly indicate it's an alternative and explain WHY using PV analysis
- When discussing a specific position, reference it clearly and explain the plan

TONE AND STYLE:
- Be encouraging and supportive - celebrate good moves and explain mistakes constructively
- Use clear, accessible language (avoid overly technical jargon unless the user asks for it)
- Focus on learning and improvement - help users understand patterns they can apply in future games
- Be specific with examples rather than giving vague general advice
- When explaining mistakes, always suggest what should have been played and WHY (using PV analysis)
- Think like a chess coach: explain the reasoning, not just the result

IMPORTANT GUIDELINES:
- NEVER show FEN strings unless specifically requested
- NEVER critique opening moves (1-10) - acknowledge the opening instead
- Always analyze moves in the context of the full game, not just the current position
- Deeply analyze Stockfish's principal variation to understand WHY moves are good
- Use Maia predictions to provide personalized, human-level feedback
- Focus on educational value - help users understand the reasoning, not just the result
- Use Stockfish evaluations to identify the most critical mistakes (biggest evaluation drops) AFTER move 10
- Provide actionable advice that users can apply in similar positions
- Explain WHERE pieces should be, HOW to get them there, and WHY the best move is best`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Listen for move analysis requests from moves panel
  const moveAnalysisRequest = useAtomValue(moveAnalysisRequestAtom);
  const setMoveAnalysisRequest = useSetAtom(moveAnalysisRequestAtom);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

      // Cancel any ongoing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const userMessage: Message = { role: "user", content: textToSend };

      // Extract system prompt from messages state BEFORE updating it
      const systemMessage = messages.find((m) => m.role === "system");
      let systemPrompt =
        systemMessage?.content && systemMessage.content.trim() !== ""
          ? systemMessage.content
          : undefined;

      // Add user player information to system prompt if available
      if (userPlayerInfo.username && userPlayerInfo.playerColor && systemPrompt) {
        const playerInfoSection = `\n\nUSER CONTEXT:
- The user's username is: ${userPlayerInfo.username}
- The user is playing as: ${userPlayerInfo.playerColor === "white" ? "White" : "Black"}
- Always analyze the game from the perspective of ${userPlayerInfo.username} playing as ${userPlayerInfo.playerColor === "white" ? "White" : "Black"}
- When referring to the user's moves, say "your move" or "${userPlayerInfo.username}'s move"
- When referring to the opponent, say "your opponent" or "the opponent"
- Focus your analysis on helping ${userPlayerInfo.username} understand their moves and improve their game`;
        
        systemPrompt = systemPrompt + playerInfoSection;
      }

      // Check if this is the first user message (only system message exists)
      const isFirstUserMessage = messages.filter(m => m.role === "user").length === 0;
      
      // Check if a new game was just loaded and user hasn't messaged yet
      const isNewGameLoaded = gameLoadedRef.current && game && !hasUserMessagedRef.current;
      
      // Mark that user has now messaged
      if (isFirstUserMessage) {
        hasUserMessagedRef.current = true;
      }
      
      // Handle greetings and new game reactions
      if (isGreeting(textToSend) || isNewGameLoaded) {
        let greetingResponse = "";
        
        if (isNewGameLoaded && game) {
          // Game was just loaded - give reaction and ask what to analyze
          greetingResponse = `${getGameReaction(game)} What would you like to analyze?`;
          gameLoadedRef.current = false; // Reset flag
        } else if (isGreeting(textToSend)) {
          // User greeted - introduce and ask what they want
          greetingResponse = "Hi! I'm your AI chess coach. Feel free to input a game from the chess database which we can analyze together, or play the moves out on the board in front of you. What would you like to do?";
        }
        
        if (greetingResponse) {
          setMessages((prev) => [...prev, userMessage, { role: "assistant", content: greetingResponse }]);
          if (!messageText) {
            setInput("");
          }
          return; // Don't make API call for greetings
        }
      }

      // If it's a direct request, proceed with analysis
      // Otherwise, if it's the first message and not a greeting, ask what they want
      // "best moves" is always a direct request - proceed with analysis
      const isBestMovesRequest = textToSend.toLowerCase().includes("best move");
      
      if (!isDirectRequest(textToSend) && !isBestMovesRequest && isFirstUserMessage && !isGreeting(textToSend)) {
        const promptResponse = "Hi! I'm your AI chess coach. What would you like to analyze or discuss about your game?";
        setMessages((prev) => [...prev, userMessage, { role: "assistant", content: promptResponse }]);
        if (!messageText) {
          setInput("");
        }
        return;
      }

      setMessages((prev) => [...prev, userMessage]);
      if (!messageText) {
        setInput("");
      }
      setIsLoading(true);

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

        // Send full game data for comprehensive analysis
        const requestData: any = {
          analysisType: "game_review",
          model: "gpt-4o-high",
          includeAIAnalysis: true,
          playerColor: userColor,
          systemPrompt: systemPrompt,
          userMessage: textToSend,
          responseLength: "comprehensive",
          boardOrientation: boardOrientation,
          gameEval: gameEval,
          // Include username and player color for context
          username: userPlayerInfo.username || undefined,
          playerColorName: userPlayerInfo.playerColor || undefined,
          userRating: userRating || 1500, // Default to 1500 if rating unknown
        };

        // Add game data based on what's available
        if (game) {
          requestData.moveHistory = game.history();
          requestData.fen = game.fen();
        } else if (position) {
          requestData.fen = position;
        }

        const response = await fetch("/api/enhanced-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestData),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          const errorMessage =
            errorData.error ||
            errorData.details ||
            `HTTP error! status: ${response.status}`;
          console.error("API Error:", errorData);
          throw new Error(errorMessage);
        }

        const data = await response.json();

        // Add assistant message with the analysis
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
          { role: "assistant", content: assistantContent },
        ]);
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          console.log("Request aborted");
        } else {
          console.error("Error sending message:", error);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "Sorry, I encountered an error. Please try again.",
            },
          ]);
        }
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [messages, game, position, boardOrientation, gameEval, input]
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
      return renderTextWithClickableMoves(children);
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
    let enhancedContent = content;

    // Look for move patterns that might need better citation
    const movePatterns = [
      // Match moves without move numbers: "Nf3", "e4", etc.
      /\b([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)\b/g,
      // Match moves with partial notation: "move Nf3", "played e4"
      /(?:move|played|moved)\s+([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/gi,
    ];

    movePatterns.forEach((pattern) => {
      enhancedContent = enhancedContent.replace(pattern, (match, move) => {
        // Find the move in game history
        const moveIndex = gameHistory.findIndex(
          (historyMove) => historyMove === move
        );
        if (moveIndex >= 0) {
          const moveNumber = Math.floor(moveIndex / 2) + 1;
          const isBlackMove = moveIndex % 2 === 1;
          const moveNotation = `${moveNumber}.${isBlackMove ? ".." : ""} ${move}`;

          // Replace with properly cited move
          return match.replace(move, moveNotation);
        }
        return match;
      });
    });

    return enhancedContent;
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
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
        {messages
          .filter((m) => m.role !== "system")
          .map((message, index) => (
            <MessageBubble key={index} isUser={message.role === "user"}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Custom text renderer for clickable moves
                  text({ children }) {
                    const text = String(children);
                    return renderTextWithClickableMoves(text);
                  },
                  // Preserve existing code component
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
                  // Preserve existing table component
                  table({ children }: any) {
                    return (
                      <div style={{ overflowX: "auto", marginBottom: "1rem" }}>
                        <table style={{ minWidth: "100%" }}>{children}</table>
                      </div>
                    );
                  },
                  // Preserve existing blockquote component
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
                  // Handle paragraphs and other text-containing elements
                  p({ children }) {
                    // Process children recursively to handle React elements
                    return <p>{processChildren(children)}</p>;
                  },
                  li({ children }) {
                    // Process children recursively to handle React elements
                    return <li>{processChildren(children)}</li>;
                  },
                  strong({ children }) {
                    return <strong>{processChildren(children)}</strong>;
                  },
                  em({ children }) {
                    return <em>{processChildren(children)}</em>;
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
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
            </MessageBubble>
          ))}
        <div ref={messagesEndRef} />
      </MessagesContainer>

      <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask specific questions about moves or positions..."
          disabled={isLoading}
        />

        {/* Quick Analysis Button */}
        <IconButton
          onClick={() => {
            if (!isLoading && !input.trim()) {
              setInput("analyze my game");
              // Use the existing handleSend function to ensure proper state management
              setTimeout(() => {
                handleSend();
              }, 50);
            }
          }}
          disabled={isLoading}
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
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? <CircularProgress size={24} /> : <SendIcon />}
        </IconButton>
      </Box>
    </ChatContainer>
  );
};

export default AICoachChat;
