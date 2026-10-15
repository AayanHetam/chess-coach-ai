"use client";

import { Box, CircularProgress, Typography } from "@mui/material";
import { User } from "lucide-react";
import { MastiAvatar, type MastiMood } from "@/components/masti";
import { FadeIn } from "@/components/ui/FadeIn";
import { ACCENT, LINE, RADIUS, SURFACE, TEXT, TYPE } from "@/theme/tokens";
import { PuzzleCoachMiniboard } from "./PuzzleCoachMiniboard";
import { GlossifiedText } from "./ChessTermGlossary";
import { DemoMoveCard } from "./DemoMoveCard";
import type {
  CoachHighlight,
  TermMention,
} from "@/lib/validation/puzzleHintSchemas";

/**
 * Chat-style bubble for the Puzzle Coach. Two roles: "user" (right-aligned,
 * accent-tinted) and "coach" (left-aligned, a secondary surface).
 *
 * The coach role parses two kinds of tags out of the prose:
 *   - `[SHOW_MOVE: san1 san2 ...]` (canonical) — renders a DemoMoveCard
 *     the user can tap to play the line on the main puzzle board.
 *   - `[POSITION_AFTER: san1 san2 ...]` (legacy) — renders an inline
 *     PuzzleCoachMiniboard. Kept for backwards compat with already-cached
 *     coach replies; the prompt only emits SHOW_MOVE going forward.
 *
 * A new message fades in (opacity only, see FadeIn); nothing slides.
 */

// Match SHOW_MOVE first, then POSITION_AFTER — same alternation so a single
// pass over `content` yields ordered tags without double-matching.
const COACH_TAG_RE = /\[(SHOW_MOVE|POSITION_AFTER):\s*([^\]]+)\]/g;

/** Chat-bubble corners: the card radius with a 4px tail corner. */
const USER_RADIUS = `${RADIUS.card}px ${RADIUS.card}px 4px ${RADIUS.card}px`;
const COACH_RADIUS = `${RADIUS.card}px ${RADIUS.card}px ${RADIUS.card}px 4px`;

interface PuzzleCoachBubbleProps {
  role: "user" | "coach";
  content: string;
  /** The puzzle's "student starting position" FEN — the anchor for legacy
   *  [POSITION_AFTER:...] miniboards. */
  startFen: string;
  /** Streaming state: tokens are still arriving. The arriving text shows the
   *  activity and Masti's face reads "thinking"; nothing blinks. */
  streaming?: boolean;
  /** Called when the user taps "Show on board" inside a DemoMoveCard.
   *  Bubble passes the SAN sequence up; parent opens DemoMoveDialog. */
  onCoachDemoRequest?: (moves: string[]) => void;
  /** Structured term highlights this turn (from /api/puzzle-hint). When a
   *  glossary chip is tapped and the term has a matching mention, the
   *  popover surfaces a "Show on board" button. (PR-C.3) */
  mentions?: TermMention[];
  onShowCoachHighlight?: (highlight: CoachHighlight) => void;
  /** Masti's face beside a coach bubble. Streaming always shows "thinking". */
  mood?: MastiMood;
}

/** Render coach content with inline miniboards / demo cards in place of tags. */
function renderCoachContent(
  content: string,
  startFen: string,
  onCoachDemoRequest: ((moves: string[]) => void) | undefined,
  mentions: TermMention[] | undefined,
  onShowCoachHighlight: ((highlight: CoachHighlight) => void) | undefined
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
        out.push(
          <GlossifiedText
            key={`p${key++}`}
            text={prose}
            mentions={mentions}
            onShowOnBoard={onShowCoachHighlight}
          />
        );
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
          />
        );
      } else {
        out.push(<span key={`d${key++}`}>{sans.join(" ")}</span>);
      }
    } else {
      // Legacy miniboard render.
      out.push(
        <PuzzleCoachMiniboard
          key={`m${key++}`}
          startFen={startFen}
          moves={sans}
        />
      );
    }
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < content.length) {
    out.push(
      <GlossifiedText
        key={`p${key++}`}
        text={content.slice(lastIdx)}
        mentions={mentions}
        onShowOnBoard={onShowCoachHighlight}
      />
    );
  }
  if (out.length === 0)
    out.push(
      <GlossifiedText
        key="empty"
        text={content}
        mentions={mentions}
        onShowOnBoard={onShowCoachHighlight}
      />
    );
  return out;
}

export function PuzzleCoachBubble({
  role,
  content,
  startFen,
  streaming = false,
  onCoachDemoRequest,
  mentions,
  onShowCoachHighlight,
  mood,
}: PuzzleCoachBubbleProps) {
  const isUser = role === "user";

  return (
    <FadeIn>
      <Box
        sx={{
          display: "flex",
          flexDirection: isUser ? "row-reverse" : "row",
          alignItems: "flex-start",
          gap: 1.25,
          mb: 2,
        }}
      >
        {isUser ? (
          <Box
            sx={{
              flexShrink: 0,
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mt: 0.25,
              color: TEXT.secondary,
            }}
          >
            <User size={20} strokeWidth={1.75} aria-hidden />
          </Box>
        ) : (
          <MastiAvatar
            mood={streaming ? "thinking" : (mood ?? "idea")}
            size={28}
            ring={false}
            style={{ marginTop: 2 }}
          />
        )}

        <Box
          sx={{
            maxWidth: "85%",
            minWidth: 0,
            px: 1.75,
            py: 1.25,
            borderRadius: isUser ? USER_RADIUS : COACH_RADIUS,
            background: isUser ? ACCENT.tint : SURFACE.raisedSecondary,
            border: `1px solid ${isUser ? ACCENT.border : LINE.hairline}`,
            color: TEXT.primary,
            fontSize: "0.92rem",
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            position: "relative",
          }}
        >
          {isUser
            ? content
            : renderCoachContent(
                content,
                startFen,
                onCoachDemoRequest,
                mentions,
                onShowCoachHighlight
              )}
        </Box>
      </Box>
    </FadeIn>
  );
}

/**
 * Standalone "Masti is thinking" indicator shown between the user's message
 * and the first arriving token. Replaced in-place by the coach bubble once
 * the first text delta lands: a 16px spinner beside the status text, gone
 * the frame the reply starts.
 */
export function PuzzleCoachThinkingBubble() {
  return (
    <FadeIn>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          mb: 2,
        }}
      >
        {/* Loops while visible: the bubble unmounts on the first token, so
            this is the one place an endless loop is the right length. */}
        <MastiAvatar
          mood="thinking"
          size={28}
          ring={false}
          animated
          loops={0}
        />
        <Box
          role="status"
          sx={{
            px: 1.75,
            py: 1.5,
            borderRadius: COACH_RADIUS,
            background: SURFACE.raisedSecondary,
            border: `1px solid ${LINE.hairline}`,
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <CircularProgress
            size={16}
            thickness={4}
            aria-hidden
            sx={{ color: TEXT.secondary }}
          />
          <Typography
            sx={{
              ...TYPE.caption,
              color: TEXT.secondary,
              fontWeight: 500,
            }}
          >
            Masti is thinking
          </Typography>
        </Box>
      </Box>
    </FadeIn>
  );
}
