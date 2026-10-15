"use client";

/**
 * The strip under the board: where the board is, and what the move there
 * does.
 *
 * One block, always the same height, so stepping through a game moves
 * nothing but the pieces:
 *
 *   [⏮ ◀ ▶ ⏭]  8. Nc7+  ?? Blunder  +2.48 → −1.34        [Ask Masti] [⋯]
 *   Gives check; forks the king on e8 and the rook on a8. This is where it
 *   went wrong. The engine preferred 8. Qxc1, which takes the queen on c1.
 *   Engine preferred  8.Qxc1 Rb8 9.Qf4 Nf6 …  → White ends a queen up  ▶ Play
 *   8.Qxc1 takes the queen on c1
 *
 * The first row's label gives way to the board's state when it is off the
 * mainline ("Exploring 8.Qxc1 Rb8 · Back to move 7", "Showing 8. Nc7+, the
 * move you asked about · Back to move 10"), which used to be two banners
 * that dropped in above the board and resized it.
 *
 * The analysis itself is moveAnalysis.ts over the engine data the client
 * already holds: it exists for every ply, the opponent's included, and never
 * says what the board does not back. "Ask Masti" hands the move to the
 * coach for the why behind the facts. The page supplies the navigation
 * buttons and the board menu; this component owns the words.
 */
import React, { useMemo } from "react";
import { Box, Tooltip } from "@mui/material";
import { MessageCircle } from "lucide-react";
import { MoveClassification } from "@/types/enums";
import type { PositionEval } from "@/types/eval";
import type { GameEvalRecheck } from "@/lib/coach/deepRecheck";
import { ACCENT, FONT_MONO, MOTION, RADIUS, TEXT, TYPE } from "@/theme/tokens";
import { ProofLine } from "./ProofLine";
import type { CoachLine } from "./coachLines";
import { analyzeMoveAt, type MoveAnalysis } from "./moveAnalysis";

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
    color: TEXT.secondary,
  },
  [MoveClassification.Forced]: {
    label: "Forced",
    glyph: "",
    color: TEXT.secondary,
  },
  [MoveClassification.Opening]: {
    label: "Book",
    glyph: "",
    color: TEXT.secondary,
  },
};

export interface MoveAnalysisCardProps {
  gameSans: readonly string[];
  positions: readonly PositionEval[] | null | undefined;
  /** COACH_CLAIM_VERIFIER pass 2: re-checked moves read their deeper evals. */
  recheck?: GameEvalRecheck | null;
  ply: number;
  rootFen?: string;
  playerColor: "w" | "b" | null;
  /** Put a ply of a proof line on the main board. */
  onShowLinePly?: (line: CoachLine, k: number) => void;
  /** Send a question about this move to the coach. */
  onAsk?: (question: string) => void;
  /** True while the coach is answering; the ask button waits. */
  busy?: boolean;
  /** True while Stockfish is still working through the game. */
  analyzing?: boolean;
  /** The board's navigation buttons, at the left of the first row. */
  nav?: React.ReactNode;
  /** The board menu, at the right of the first row. */
  menu?: React.ReactNode;
  /**
   * Replaces the move label while the board is off the mainline: the
   * exploration path with its way back, or the coach's jump with its way
   * back. Same row, same height, so the board below never moves.
   */
  state?: React.ReactNode;
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

/** "8. Nc7+" / "8... Kd8" for a ply the engine has not reached yet. */
function fallbackLabel(gameSans: readonly string[], ply: number): string {
  if (ply < 1 || ply > gameSans.length) return "Start";
  const index = ply - 1;
  const moveNumber = Math.floor(index / 2) + 1;
  return `${moveNumber}${index % 2 === 0 ? "." : "..."} ${gameSans[index]}`;
}

export function MoveAnalysisCard({
  gameSans,
  positions,
  recheck = null,
  ply,
  rootFen,
  playerColor,
  onShowLinePly,
  onAsk,
  busy,
  analyzing,
  nav,
  menu,
  state,
}: MoveAnalysisCardProps) {
  const analysis = useMemo(
    () =>
      analyzeMoveAt(gameSans, positions, ply, rootFen, playerColor, recheck),
    [gameSans, positions, ply, rootFen, playerColor, recheck]
  );

  const cls = analysis?.classification ?? null;
  const style = (cls && STYLE[cls]) || null;
  const label = analysis?.label ?? fallbackLabel(gameSans, ply);

  const sentence = analysis
    ? analysis.sentence
    : ply === 0
      ? gameSans.length > 0
        ? "Step through the game and this line says what each move does, what it cost, and what the engine preferred."
        : ""
      : analyzing
        ? "Stockfish has not reached this move yet."
        : "";

  return (
    <Box
      data-testid="move-analysis"
      sx={{ mt: { xs: 1.25, lg: 1 }, px: 0.25, minWidth: 0 }}
    >
      {/* Row 1: where the board is. */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: { xs: 0.75, sm: 1 },
          minHeight: 34,
          minWidth: 0,
          // The ask button's words come off in a narrow row (below).
          containerType: "inline-size",
        }}
      >
        {/* On a phone the row cannot hold the step buttons AND an exploring
            state with its way back, so while the board is off the mainline
            the buttons yield the row to the state; they are back the moment
            the reader is. Beside a board there is room for both. */}
        <Box
          sx={{
            display: state ? { xs: "none", md: "contents" } : "contents",
          }}
        >
          {nav}
        </Box>
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 0.9,
            overflow: "hidden",
          }}
        >
          {state ?? (
            // One line tall and wrapping, so what does not fit drops whole
            // onto a second line the box clips: the eval swing gives way
            // before anything else, and never shows half a number.
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                height: 34,
                lineHeight: "34px",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                columnGap: 0.9,
                overflow: "hidden",
              }}
            >
              {/* The move and its verdict stay together. The move never
                  shrinks, it is what the row is about. On a row too short
                  for both, the verdict word drops whole the same way and
                  its glyph stays, so the classification keeps a channel
                  that is not colour; a verdict with no glyph ends in an
                  ellipsis instead. */}
              <Box
                component="span"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.9,
                  minWidth: 0,
                  whiteSpace: "nowrap",
                }}
              >
                <Box
                  component="span"
                  data-testid="move-analysis-label"
                  sx={{
                    fontFamily: FONT_MONO,
                    fontSize: TYPE.bodySmall.fontSize,
                    fontWeight: 600,
                    color: TEXT.primary,
                    flexShrink: 0,
                  }}
                >
                  {label}
                </Box>
                {style && (
                  <Box
                    component="span"
                    data-testid="move-analysis-verdict"
                    sx={{
                      display: "flex",
                      flexWrap: "wrap",
                      columnGap: "0.3em",
                      minWidth: 0,
                      height: 34,
                      overflow: "hidden",
                      color: style.color,
                      fontSize: TYPE.caption.fontSize,
                      fontWeight: 600,
                    }}
                  >
                    {style.glyph && (
                      <Box component="span" sx={{ flexShrink: 0 }}>
                        {`${style.glyph} `}
                      </Box>
                    )}
                    <Box
                      component="span"
                      sx={{
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {style.label}
                    </Box>
                  </Box>
                )}
              </Box>
              {analysis?.evalBefore && analysis?.evalAfter && (
                <Tooltip title="Engine evaluation before and after the move, from White's side">
                  <Box
                    component="span"
                    sx={{
                      display: { xs: "none", sm: "inline" },
                      flexShrink: 0,
                      fontSize: TYPE.caption.fontSize,
                      fontVariantNumeric: "tabular-nums",
                      color: TEXT.secondary,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {analysis.evalBefore} → {analysis.evalAfter}
                    {analysis.depthLabel ? ` · ${analysis.depthLabel}` : ""}
                  </Box>
                </Tooltip>
              )}
            </Box>
          )}
        </Box>
        {onAsk && analysis && !state && (
          <Tooltip title="Ask Masti about this move">
            <Box
              component="button"
              type="button"
              data-testid="move-analysis-ask"
              aria-label="Ask Masti about this move"
              disabled={busy}
              onClick={() => onAsk(questionFor(analysis))}
              sx={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                height: 28,
                px: { xs: 0.75, sm: 1 },
                // A quiet tinted action: the coach is one tap away, but the
                // screen's one solid ember belongs elsewhere.
                borderRadius: `${RADIUS.pill}px`,
                border: 0,
                background: ACCENT.tint,
                color: ACCENT.hover,
                font: "inherit",
                fontSize: TYPE.caption.fontSize,
                fontWeight: 600,
                lineHeight: 1,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.5 : 1,
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                transition: `background-color ${MOTION.hover}, transform ${MOTION.press}`,
                "&:hover": busy ? {} : { background: ACCENT.tintHover },
                "&:active": busy ? {} : { transform: MOTION.pressScale },
                "&:focus-visible": {
                  outline: "2px solid #FFFFFF",
                  outlineOffset: 2,
                },
              }}
            >
              <MessageCircle size={16} strokeWidth={1.75} aria-hidden />
              <Box
                component="span"
                sx={{
                  display: { xs: "none", sm: "inline" },
                  // In a row under 540px (beside a 420px board, say) the
                  // words would push the move's verdict out; measured, the
                  // longest moves and verdicts fit beside them from 520px.
                  // The icon, its tooltip and its label carry the action.
                  "@container (max-width: 539px)": { display: "none" },
                }}
              >
                Ask Masti
              </Box>
            </Box>
          </Tooltip>
        )}
        {menu}
      </Box>

      {/* Row 2: what the move does, and why it works or does not. Reserved
          for three lines so a longer sentence never pushes the page. */}
      <Tooltip title={analysis?.captionFull || ""} enterDelay={600}>
        <Box
          data-testid="move-analysis-sentence"
          sx={{
            mt: 0.5,
            fontSize: "0.86rem",
            lineHeight: 1.5,
            color: analysis ? TEXT.primary : TEXT.secondary,
            // A hard height, not a minimum: the strip's whole point is that
            // it never changes size as the cursor moves. Four lines on a
            // phone, three beside a board.
            height: { xs: "6em", lg: "4.5em" },
            display: "-webkit-box",
            WebkitLineClamp: { xs: 4, lg: 3 },
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {sentence}
        </Box>
      </Tooltip>

      {/* Rows 3–4: the engine's line when it preferred something else, with
          its caption row. The same height when there is nothing to draw. */}
      {analysis?.engineLine ? (
        <ProofLine
          line={analysis.engineLine}
          playerColor={playerColor}
          onShowPly={onShowLinePly}
          label="Engine preferred"
          reserveCaption
          data-testid="move-analysis-line"
        />
      ) : (
        <Box
          sx={{
            mt: 0.75,
            minHeight: "calc(24px + 1.3em + 2px)",
            fontSize: "0.76rem",
            lineHeight: "24px",
            color: TEXT.secondary,
          }}
        >
          {analysis
            ? "The engine's own choice, so there is no other line to show."
            : ""}
        </Box>
      )}
    </Box>
  );
}

export default MoveAnalysisCard;
