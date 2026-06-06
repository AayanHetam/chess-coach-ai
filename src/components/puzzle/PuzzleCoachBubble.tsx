"use client";

import { Box, Typography } from "@mui/material";
import { motion } from "framer-motion";
import { Sparkles, User } from "lucide-react";
import { PuzzleCoachMiniboard } from "./PuzzleCoachMiniboard";
import { GlossifiedText } from "./ChessTermGlossary";
import { DemoMoveCard } from "./DemoMoveCard";

/**
 * Chat-style bubble for the Puzzle Coach. Two roles: "user" (right-aligned,
 * ember-tinted) and "coach" (left-aligned, glass).
 *
 * The coach role parses two kinds of tags out of the prose:
 *   - `[SHOW_MOVE: san1 san2 ...]` (canonical) — renders a DemoMoveCard
 *     the user can tap to play the line on the main puzzle board.
 *   - `[POSITION_AFTER: san1 san2 ...]` (legacy) — renders an inline
 *     PuzzleCoachMiniboard. Kept for backwards compat with already-cached
 *     coach replies; the prompt only emits SHOW_MOVE going forward.
 *
 * Design tokens mirror /preview/move-reveal (glass blur 12px, rgba(22,18,14,0.55)
 * fill, #FF7A1A accent, cubic-bezier(0.23, 1, 0.32, 1) easing).
 */

const EASE_OUT_STRONG: [number, number, number, number] = [0.23, 1, 0.32, 1];

// Match SHOW_MOVE first, then POSITION_AFTER — same alternation so a single
// pass over `content` yields ordered tags without double-matching.
const COACH_TAG_RE =
  /\[(SHOW_MOVE|POSITION_AFTER):\s*([^\]]+)\]/g;

interface PuzzleCoachBubbleProps {
  role: "user" | "coach";
  content: string;
  /** The puzzle's "student starting position" FEN — the anchor for legacy
   *  [POSITION_AFTER:...] miniboards. */
  startFen: string;
  /** Streaming state — when true, render with a soft pulse so the user
   *  knows tokens are still arriving. */
  streaming?: boolean;
  /** Called when the user taps "Show on board" inside a DemoMoveCard.
   *  Bubble passes the SAN sequence up; parent opens DemoMoveDialog. */
  onCoachDemoRequest?: (moves: string[]) => void;
}

/** Render coach content with inline miniboards / demo cards in place of tags. */
function renderCoachContent(
  content: string,
  startFen: string,
  onCoachDemoRequest?: (moves: string[]) => void,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;
  const re = new RegExp(COACH_TAG_RE.source, COACH_TAG_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIdx) {
      const prose = content.slice(lastIdx, match.index);
      if (prose)
        out.push(<GlossifiedText key={`p${key++}`} text={prose} />);
    }
    const tagKind = match[1] as "SHOW_MOVE" | "POSITION_AFTER";
    const sansRaw = match[2] || "";
    const sans = sansRaw
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (tagKind === "SHOW_MOVE") {
      // No callback wired (e.g. user-role bubble) → render as plain text so
      // the line stays visible rather than vanishing.
      if (onCoachDemoRequest) {
        out.push(
          <DemoMoveCard
            key={`d${key++}`}
            moves={sans}
            onShow={onCoachDemoRequest}
          />,
        );
      } else {
        out.push(
          <span key={`d${key++}`}>{sans.join(" ")}</span>,
        );
      }
    } else {
      // Legacy miniboard render.
      out.push(
        <PuzzleCoachMiniboard
          key={`m${key++}`}
          startFen={startFen}
          moves={sans}
        />,
      );
    }
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < content.length) {
    out.push(
      <GlossifiedText key={`p${key++}`} text={content.slice(lastIdx)} />,
    );
  }
  if (out.length === 0) out.push(<GlossifiedText key="empty" text={content} />);
  return out;
}

export function PuzzleCoachBubble({
  role,
  content,
  startFen,
  streaming = false,
  onCoachDemoRequest,
}: PuzzleCoachBubbleProps) {
  const isUser = role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, transform: "translateY(6px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={{ duration: 0.24, ease: EASE_OUT_STRONG }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: isUser ? "row-reverse" : "row",
          alignItems: "flex-start",
          gap: 1.25,
          mb: 2,
        }}
      >
        <Box
          sx={{
            flexShrink: 0,
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: isUser
              ? "rgba(255,122,26,0.18)"
              : "rgba(22,18,14,0.7)",
            border: isUser
              ? "1px solid rgba(255,122,26,0.35)"
              : "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            mt: 0.25,
          }}
        >
          {isUser ? (
            <User size={14} color="#FFD1A8" />
          ) : (
            <Sparkles size={14} color="#FF7A1A" />
          )}
        </Box>

        <Box
          sx={{
            maxWidth: "85%",
            minWidth: 0,
            px: 1.75,
            py: 1.25,
            borderRadius: isUser ? "1rem 1rem 0.3rem 1rem" : "1rem 1rem 1rem 0.3rem",
            background: isUser
              ? "linear-gradient(135deg, rgba(255,122,26,0.18), rgba(255,140,66,0.08))"
              : "rgba(22,18,14,0.55)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: isUser
              ? "1px solid rgba(255,122,26,0.28)"
              : "1px solid rgba(255,255,255,0.06)",
            color: "rgba(255,240,224,0.94)",
            fontSize: "0.92rem",
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            position: "relative",
            transition: "border-color 200ms ease",
            ...(streaming && {
              "&::after": {
                content: '""',
                display: "inline-block",
                width: "0.5em",
                height: "1em",
                marginLeft: "2px",
                verticalAlign: "text-bottom",
                background: "#FF7A1A",
                opacity: 0.7,
                animation: "puzzleCoachCursor 800ms steps(1) infinite",
              },
              "@keyframes puzzleCoachCursor": {
                "0%, 49%": { opacity: 0.7 },
                "50%, 100%": { opacity: 0 },
              },
            }),
          }}
        >
          {isUser
            ? content
            : renderCoachContent(content, startFen, onCoachDemoRequest)}
        </Box>
      </Box>
    </motion.div>
  );
}

/**
 * Standalone "coach is thinking…" indicator shown between the user's
 * message and the first arriving token. Replaced in-place by the coach
 * bubble once the first text delta lands.
 */
export function PuzzleCoachThinkingBubble() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, ease: EASE_OUT_STRONG }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          mb: 2,
        }}
      >
        <Box
          sx={{
            flexShrink: 0,
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "rgba(22,18,14,0.7)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Sparkles size={14} color="#FF7A1A" />
        </Box>
        <Box
          sx={{
            px: 1.75,
            py: 1.5,
            borderRadius: "1rem 1rem 1rem 0.3rem",
            background: "rgba(22,18,14,0.55)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            gap: 0.6,
          }}
        >
          {[0, 1, 2].map((i) => (
            <Box
              key={i}
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#FF7A1A",
                opacity: 0.4,
                animation: "puzzleCoachDot 1.2s ease-in-out infinite",
                animationDelay: `${i * 0.15}s`,
                "@keyframes puzzleCoachDot": {
                  "0%, 100%": { opacity: 0.3, transform: "translateY(0)" },
                  "50%": { opacity: 1, transform: "translateY(-3px)" },
                },
              }}
            />
          ))}
          <Typography
            sx={{
              ml: 0.75,
              color: "rgba(255,240,224,0.5)",
              fontSize: "0.78rem",
              fontWeight: 500,
            }}
          >
            thinking…
          </Typography>
        </Box>
      </Box>
    </motion.div>
  );
}
