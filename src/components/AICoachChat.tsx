"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  Paper,
  TextField,
  IconButton,
  Select,
  MenuItem,
  Typography,
  CircularProgress,
  FormControl,
  InputLabel,
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

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface AICoachChatProps {
  position: string; // FEN string of current position
  game?: Chess; // Chess game object with move history
}

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
  maxHeight: isExpanded ? "none" : "200px",
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
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content:
        "You are a helpful chess coach. Use the Stockfish analysis to help the user understand the position and improve their chess skills.",
    },
  ]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState(
    "claude-sonnet-4-20250514"
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);


  const models = [
    { id: "claude-sonnet-4-20250514", name: "Claude 4 Sonnet" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  ];

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
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          position,
          game: game
            ? {
                pgn: game.pgn(),
                history: game.history(),
                moves: game.moves(),
              }
            : null,
          model: selectedModel,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      // Add an empty assistant message that we'll update with the stream
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      setIsStreaming(true);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((line) => line.trim() !== "");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || "";

              if (content) {
                setMessages((prev) => {
                  const newMessages = [...prev];
                  const lastMessage = newMessages[newMessages.length - 1];
                  if (lastMessage.role === "assistant") {
                    lastMessage.content += content;
                  }
                  return newMessages;
                });
              }
            } catch (e) {
              console.error("Error parsing streaming response:", e);
            }
          }
        }
      }
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
        <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
          <FormControl fullWidth size="small">
            <InputLabel>AI Model</InputLabel>
            <Select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              label="AI Model"
            >
              {models.map((model) => (
                <MenuItem key={model.id} value={model.id}>
                  {model.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

      </Box>

      <MessagesContainer isExpanded={isExpanded}>
        {messages
          .filter((m) => m.role !== "system")
          .map((message, index) => (
            <MessageBubble key={index} isUser={message.role === "user"}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
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

      <Box sx={{ display: "flex", gap: 1 }}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask about the position..."
          disabled={isLoading}
        />
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
