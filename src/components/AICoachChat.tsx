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
import { boardAtom, gameAtom } from "@/sections/analysis/states";
import { useAtomValue } from "jotai";

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
const SeeHowLink: React.FC<{ sequence: string[]; description: string; fromMoveNumber?: number }> = ({ sequence, description, fromMoveNumber }) => {
  const game = useAtomValue(gameAtom);
  const { goToMove } = useChessActions(boardAtom);
  
  const handleSequenceClick = async () => {
    console.log(`SeeHowLink clicked: ${description}, sequence:`, sequence);
    try {
      // First, go to the position where the sequence should start
      let startPosition = fromMoveNumber ? fromMoveNumber + 1 : game.history().length + 1;
      goToMove(startPosition, game);
      
      // Wait a moment for the position to update
      await new Promise(resolve => setTimeout(resolve, 500));
      
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
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          console.error(`Error playing move ${move}:`, error);
          break;
        }
      }
      
      console.log(`✅ Demonstrated tactical sequence: ${description}`);
    } catch (error) {
      console.error('Error demonstrating tactical sequence:', error);
    }
  };

  return (
    <span
      onClick={handleSequenceClick}
      style={{
        color: '#4CAF50',
        cursor: 'pointer',
        textDecoration: 'underline',
        fontWeight: 'bold',
        padding: '2px 6px',
        borderRadius: '4px',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        border: '1px solid rgba(76, 175, 80, 0.3)',
        fontSize: '0.9em',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
        e.currentTarget.style.borderColor = 'rgba(76, 175, 80, 0.5)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
        e.currentTarget.style.borderColor = 'rgba(76, 175, 80, 0.3)';
      }}
      title={`Click to see how: ${description}`}
    >
      🔍 see how
    </span>
  );
};

// Component for clickable chess moves
const ClickableMove: React.FC<{ move: string; moveNumber?: number; isBlackMove?: boolean }> = ({ move, moveNumber, isBlackMove }) => {
  const game = useAtomValue(gameAtom);
  const { goToMove } = useChessActions(boardAtom);
  
  console.log(`ClickableMove created: ${moveNumber}.${isBlackMove ? '..' : ''} ${move}`);

  const handleMoveClick = () => {
    console.log(`ClickableMove clicked: ${moveNumber}.${isBlackMove ? '..' : ''} ${move}`);
    try {
      const gameHistory = game.history();
      console.log('Game history length:', gameHistory.length);
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
        
        console.log(`Calculated target index: ${targetMoveIndex}, Game history at that index: ${gameHistory[targetMoveIndex]}`);
        
        // Verify the move matches what we expect
        if (targetMoveIndex >= 0 && targetMoveIndex < gameHistory.length && gameHistory[targetMoveIndex] === move) {
          console.log('Perfect match found!');
          // Perfect match found
        } else {
          console.log('No perfect match, searching for move...');
          // Fallback to searching for the move
          targetMoveIndex = gameHistory.findIndex(historyMove => historyMove === move);
          console.log(`Search result index: ${targetMoveIndex}`);
        }
      } else {
        // Search for the move in history (find first occurrence)
        targetMoveIndex = gameHistory.findIndex(historyMove => historyMove === move);
      }

      if (targetMoveIndex >= 0) {
        // Navigate to the move (add 1 because goToMove expects position after the move)
        goToMove(targetMoveIndex + 1, game);
        console.log(`✅ Navigated to move ${targetMoveIndex + 1}: ${move}`);
      } else {
        console.warn(`❌ Could not find move "${move}" in game history:`, gameHistory);
      }
    } catch (error) {
      console.error('Error navigating to move:', error);
    }
  };

  return (
    <span
      onClick={handleMoveClick}
      style={{
        color: '#4FC3F7',
        cursor: 'pointer',
        textDecoration: 'underline',
        fontWeight: 'bold',
        padding: '2px 4px',
        borderRadius: '4px',
        backgroundColor: 'rgba(79, 195, 247, 0.1)',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'rgba(79, 195, 247, 0.2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'rgba(79, 195, 247, 0.1)';
      }}
      title={`Click to jump to move ${moveNumber}${isBlackMove ? '...' : '.'} ${move}`}
    >
      {moveNumber}.{isBlackMove ? '..' : ''} {move}
    </span>
  );
};

// New component for hypothetical "what-if" moves
const HypotheticalMove: React.FC<{ move: string; moveNumber?: number; isBlackMove?: boolean; originalMove: string }> = ({ 
  move, 
  moveNumber, 
  isBlackMove, 
  originalMove 
}) => {
  const game = useAtomValue(gameAtom);
  const { goToMove } = useChessActions(boardAtom);

  const handleHypotheticalClick = () => {
    console.log(`HypotheticalMove clicked: ${moveNumber}.${isBlackMove ? '..' : ''} ${move} instead of ${originalMove}`);
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
        history.forEach(m => newGame.move(m));
        
        // Make the hypothetical move instead of the original move
        try {
          newGame.move(move);
          goToMove(targetMoveIndex + 1, newGame);
          console.log(`✅ Navigated to hypothetical move ${targetMoveIndex + 1}: ${move}`);
        } catch (error) {
          console.error('Invalid hypothetical move:', move, error);
        }
      }
    } catch (error) {
      console.error('Error navigating to hypothetical move:', error);
    }
  };

  return (
    <span
      onClick={handleHypotheticalClick}
      style={{
        color: '#4CAF50', // Green color for hypothetical moves
        cursor: 'pointer',
        textDecoration: 'underline',
        fontWeight: 'bold',
        padding: '2px 4px',
        borderRadius: '4px',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
      }}
      title={`Click to see what if ${moveNumber}${isBlackMove ? '...' : '.'} ${move} was played instead of ${originalMove}`}
    >
      {moveNumber}.{isBlackMove ? '..' : ''} {move}
    </span>
  );
};

// Custom text renderer that converts move notation to clickable links
const renderTextWithClickableMoves = (text: string) => {
  if (!text) return null;

  // Unified pattern to catch all move formats in priority order
  const movePatterns = [
    // Priority 1: AI response format "Move X: [move] - [principle] - [explanation] - [suggestion]"
    {
      pattern: /Move\s+(\d+):\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/gi,
      type: 'ai',
      priority: 1
    },
    // Priority 2: Standard notation "15. Nf3" or "15... cxd4"
    {
      pattern: /(\d+)\.\.\.?\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/g,
      type: 'standard',
      priority: 2
    },
    // Priority 3: "move X" format
    {
      pattern: /move\s+(\d+)([wb])?:\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/gi,
      type: 'move',
      priority: 3
    }
  ];

  let parts = [];
  let lastIndex = 0;
  let processedRanges: Array<{start: number, end: number}> = [];

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
        priority: patternInfo.priority
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
    const overlaps = processedRanges.some(range => 
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

    if (pattern.type === 'ai') {
      moveNumber = parseInt(match[1]);
      move = match[2];
      isBlackMove = moveNumber % 2 === 0;
    } else if (pattern.type === 'standard') {
      moveNumber = parseInt(match[1]);
      move = match[2];
      isBlackMove = fullMatch.includes('...');
    } else if (pattern.type === 'move') {
      moveNumber = parseInt(match[1]);
      isBlackMove = match[2] === 'b';
      move = match[3];
    } else {
      return; // Unknown pattern type
    }

    // Add the clickable move
    parts.push(
      <ClickableMove 
        key={`${pattern.type}-${moveNumber}-${isBlackMove ? 'black' : 'white'}-${startIndex}`} 
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
  if (!text.includes('<SEELINK>')) {
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
      parts.push(' ');
      parts.push(
        <SeeHowLink 
          key={`see-how-${match.index}`}
          sequence={linkData.sequence}
          description={linkData.description}
        />
      );
    } catch (e) {
      console.error('Error parsing see link data:', e);
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
    : '#FF8C42', // Lighter orange for AI messages
  color: isUser
    ? '#FFFFFF' // White text on orange
    : '#FFFFFF', // White text on light orange
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
    color: isUser ? '#FFFFFF' : '#FFFFFF',
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
    borderLeft: `4px solid ${isUser ? '#FFFFFF' : '#FFFFFF'}`,
    paddingLeft: theme.spacing(2),
    marginLeft: 0,
    marginRight: 0,
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(1),
    fontStyle: "italic",
    backgroundColor: isUser ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.1)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    fontWeight: 600,
  },
  "& code": {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    color: '#FFFFFF',
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
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content:
        "You are a helpful chess coach. Use the Stockfish analysis to help the user understand the position and improve their chess skills.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);





  const handleSend = async () => {
    if (!input.trim()) return;

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Create a new abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      // Send full game data for comprehensive analysis
      const requestData: any = {
        analysisType: "game_review", // Changed to game_review for comprehensive analysis
        model: "gpt-4o-mini", // Fixed to use GPT-4o-mini
        includeAIAnalysis: true,
        playerColor: game?.turn() === 'w' ? 'w' : 'b',
        focusAreas: ['opening', 'middlegame', 'endgame', 'tactics', 'strategy'],
        userMessage: userMessage.content,
        responseLength: "comprehensive", // Fixed to comprehensive for detailed analysis
        boardOrientation: boardOrientation,
      };

      // Add game data based on what's available
      if (game) {
        // Send move history for complete game analysis
        requestData.moveHistory = game.history();
        requestData.fen = game.fen(); // Fallback
      } else if (position) {
        // Only position available
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
        const errorMessage = errorData.error || errorData.details || `HTTP error! status: ${response.status}`;
        console.error('API Error:', errorData);
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      // Add assistant message with the analysis
      let assistantContent = "";
      
      // Use simplified game analysis (principle violations only)
      if (data.gameAnalysis) {
        assistantContent += data.gameAnalysis.analysis;
      } else if (data.currentPositionAnalysis) {
        assistantContent += data.currentPositionAnalysis.analysis;
      }
      
      if (data.aiAnalysisError) {
        assistantContent += `\n\n**Note:** ${data.aiAnalysisError}`;
      }
      
      setMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
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
  };

  // Helper function to process React children recursively
  const processChildren = (children: React.ReactNode): React.ReactNode => {
    if (typeof children === 'string') {
      return renderTextWithClickableMoves(children);
    }
    if (Array.isArray(children)) {
      return children.map((child, index) => (
        <React.Fragment key={index}>
          {processChildren(child)}
        </React.Fragment>
      ));
    }
    if (React.isValidElement(children)) {
      return React.cloneElement(children, {
        ...children.props,
        children: processChildren(children.props.children)
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
    
    movePatterns.forEach(pattern => {
      enhancedContent = enhancedContent.replace(pattern, (match, move) => {
        // Find the move in game history
        const moveIndex = gameHistory.findIndex(historyMove => historyMove === move);
        if (moveIndex >= 0) {
          const moveNumber = Math.floor(moveIndex / 2) + 1;
          const isBlackMove = moveIndex % 2 === 1;
          const moveNotation = `${moveNumber}.${isBlackMove ? '..' : ''} ${move}`;
          
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
        <Typography variant="h6" gutterBottom>
          AI Chess Coach
        </Typography>
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
            background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B42 100%)',
            color: 'white',
            width: 48,
            height: 48,
            borderRadius: 2,
            '&:hover': {
              background: isLoading ? 'linear-gradient(135deg, #FF8C42 0%, #FF6B42 100%)' : 'linear-gradient(135deg, #FF6B42 0%, #FF5722 100%)',
            },
            '&.Mui-disabled': {
              background: 'linear-gradient(135deg, #FF8C42 0%, #FF6B42 100%)',
              opacity: 0.6,
              color: 'white',
            },
          }}
          title="Analyze My Game"
        >
          {isLoading ? (
            <CircularProgress size={20} sx={{ color: 'white' }} />
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
