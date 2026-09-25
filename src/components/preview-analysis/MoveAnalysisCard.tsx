"use client";

/**
 * The analysis of the move on the board, for every move.
 *
 * Sits at the top of the coach panel and follows the cursor: step through
 * the game and each move gets its verdict, its evaluation before and after,
 * what it does in plain words, and, when the engine preferred something
 * else, that line drawn and playable. Built from the engine data and
 * chess.js (moveAnalysis.ts), so it is there for all eighty moves of a game
 * and never says anything the board does not back. "Ask Masti" hands the
 * move to the coach for the why behind the facts.
 */
import React, { useMemo } from "react";
import { Box, Tooltip } from "@mui/material";
import { MessageCircle } from "lucide-react";
import { MoveClassification } from "@/types/enums";
import type { PositionEval } from "@/types/eval";
import { MastiAvatar } from "@/components/masti";
import { classificationMood } from "@/components/masti/mood";
import { ProofLine } from "./ProofLine";
import type { CoachLine } from "./coachLines";
import { analyzeMoveAt, type MoveAnalysis } from "./moveAnalysis";

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const STYLE: Record<string, { label: string; glyph: string; color: string }> = {
  [MoveClassification.Blunder]: {
    label: "Blunder",
    glyph: "??",
    color: "#F87171",
  },
  [MoveClassification.Mistake]: {
    label: "Mistake",
    glyph: "?",
    color: "#FB923C",
  },
  [MoveClassification.Inaccuracy]: {
    label: "Inaccuracy",
    glyph: "?!",
    color: "#FBBF24",
  },
  [MoveClassification.Miss]: {
    label: "Missed chance",
    glyph: "?!",
    color: "#C4B5FD",
  },
  [MoveClassification.Brilliant]: {
    label: "Brilliant",
    glyph: "!!",
    color: "#5EEAD4",
  },
  [MoveClassification.Great]: { label: "Great", glyph: "!", color: "#60A5FA" },
  [MoveClassification.Best]: { label: "Best", glyph: "", color: "#86efac" },
  [MoveClassification.Excellent]: {
    label: "Excellent",
    glyph: "",
    color: "#86efac",
  },
  [MoveClassification.Good]: { label: "Good", glyph: "", color: "#A7F3D0" },
  [MoveClassification.Okay]: {
    label: "Okay",
    glyph: "",
    color: "rgba(255,255,255,0.6)",
  },
  [MoveClassification.Forced]: {
    label: "Forced",
    glyph: "",
    color: "rgba(255,255,255,0.6)",
  },
  [MoveClassification.Opening]: {
    label: "Book",
    glyph: "",
    color: "rgba(255,255,255,0.6)",
  },
};

export interface MoveAnalysisCardProps {
  gameSans: readonly string[];
  positions: readonly PositionEval[] | null | undefined;
  ply: number;
  rootFen?: string;
  playerColor: "w" | "b" | null;
  /** Put a ply of a proof line on the main board. */
  onShowLinePly?: (line: CoachLine, k: number) => void;
  /** Send a question about this move to the coach. */
  onAsk?: (question: string) => void;
  /** True while the coach is answering; the ask button waits. */
  busy?: boolean;
}

function questionFor(a: MoveAnalysis): string {
  const cls = a.classification;
  const mine = a.byPlayer !== false;
  if (
    cls === MoveClassification.Blunder ||
    cls === MoveClassification.Mistake ||
    cls === MoveClassification.Inaccuracy
  ) {
    return `Why was ${a.label} a ${STYLE[cls].label.toLowerCase()}?`;
  }
  if (cls === MoveClassification.Miss)
    return `What did ${mine ? "I" : "my opponent"} miss with ${a.label}?`;
  if (cls === MoveClassification.Brilliant || cls === MoveClassification.Great)
    return `Why was ${a.label} so strong?`;
  return `What was the idea behind ${a.label}?`;
}

export function MoveAnalysisCard({
  gameSans,
  positions,
  ply,
  rootFen,
  playerColor,
  onShowLinePly,
  onAsk,
  busy,
}: MoveAnalysisCardProps) {
  const analysis = useMemo(
    () => analyzeMoveAt(gameSans, positions, ply, rootFen, playerColor),
    [gameSans, positions, ply, rootFen, playerColor]
  );
  if (!analysis) return null;

  const cls = analysis.classification;
  const style = (cls && STYLE[cls]) || null;
  const mover =
    analysis.byPlayer === null
      ? "unknown"
      : analysis.byPlayer
        ? "player"
        : "opponent";
  const mood = classificationMood(cls ?? "", mover);

  return (
    <Box
      data-testid="move-analysis"
      sx={{
        px: 2.25,
        py: 1.5,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(0,0,0,0.18)",
        position: "relative",
        zIndex: 1,
      }}
    >
      {/* Header: move · verdict · eval · Masti's face */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.9,
          flexWrap: "wrap",
        }}
      >
        <Box
          sx={{
            fontSize: "0.62rem",
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.45)",
          }}
        >
          This move
        </Box>
        <Box
          data-testid="move-analysis-label"
          sx={{
            fontFamily: MONO,
            fontSize: "0.95rem",
            fontWeight: 700,
            color: "rgba(255,255,255,0.94)",
          }}
        >
          {analysis.label}
        </Box>
        {style && (
          <Box
            data-testid="move-analysis-verdict"
            sx={{
              px: 0.8,
              py: 0.2,
              borderRadius: "999px",
              background: `${style.color}22`,
              border: `1px solid ${style.color}55`,
              color: style.color,
              fontSize: "0.7rem",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            {style.glyph ? `${style.glyph} ` : ""}
            {style.label}
          </Box>
        )}
        {analysis.evalBefore && analysis.evalAfter && (
          <Tooltip title="Engine evaluation before and after the move, from White's side">
            <Box
              component="span"
              sx={{
                fontFamily: MONO,
                fontSize: "0.74rem",
                color: "rgba(255,255,255,0.55)",
              }}
            >
              {analysis.evalBefore} → {analysis.evalAfter}
            </Box>
          </Tooltip>
        )}
        <Box sx={{ flex: 1 }} />
        <MastiAvatar mood={mood} size={24} ring={false} decorative />
      </Box>

      {/* What the move does, and why it works or does not. */}
      <Tooltip title={analysis.captionFull || ""} enterDelay={600}>
        <Box
          data-testid="move-analysis-sentence"
          sx={{
            mt: 0.75,
            fontSize: "0.86rem",
            lineHeight: 1.5,
            color: "rgba(255,255,255,0.88)",
          }}
        >
          {analysis.sentence}
        </Box>
      </Tooltip>

      {/* The engine's line, when it preferred something else. */}
      {analysis.engineLine && (
        <ProofLine
          line={analysis.engineLine}
          playerColor={playerColor}
          onShowPly={onShowLinePly}
          label="Engine preferred"
          data-testid="move-analysis-line"
        />
      )}

      {onAsk && (
        <Box sx={{ mt: 0.9, display: "flex", justifyContent: "flex-end" }}>
          <Box
            component="button"
            type="button"
            data-testid="move-analysis-ask"
            disabled={busy}
            onClick={() => onAsk(questionFor(analysis))}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.6,
              px: 1.1,
              py: 0.45,
              borderRadius: "999px",
              border: "1px solid rgba(249,115,22,0.35)",
              background: "rgba(249,115,22,0.1)",
              color: "#FB923C",
              font: "inherit",
              fontSize: "0.74rem",
              fontWeight: 700,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.5 : 1,
              transition: "background 140ms ease",
              "&:hover": busy ? {} : { background: "rgba(249,115,22,0.18)" },
            }}
          >
            <MessageCircle size={13} />
            Ask Masti about this move
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default MoveAnalysisCard;
