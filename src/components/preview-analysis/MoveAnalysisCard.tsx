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
 *   ENGINE PREFERRED  8.Qxc1 Rb8 9.Qf4 Nf6 …  → White ends a queen up  ▶ Play
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
    () => analyzeMoveAt(gameSans, positions, ply, rootFen, playerColor),
    [gameSans, positions, ply, rootFen, playerColor]
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
            <>
              <Box
                component="span"
                data-testid="move-analysis-label"
                sx={{
                  fontFamily: MONO,
                  fontSize: "0.92rem",
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.94)",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </Box>
              {style && (
                <Box
                  component="span"
                  data-testid="move-analysis-verdict"
                  sx={{
                    color: style.color,
                    fontSize: "0.74rem",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {style.glyph ? `${style.glyph} ` : ""}
                  {style.label}
                </Box>
              )}
              {analysis?.evalBefore && analysis?.evalAfter && (
                <Tooltip title="Engine evaluation before and after the move, from White's side">
                  <Box
                    component="span"
                    sx={{
                      display: { xs: "none", sm: "inline" },
                      fontFamily: MONO,
                      fontSize: "0.74rem",
                      color: "rgba(255,255,255,0.5)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {analysis.evalBefore} → {analysis.evalAfter}
                  </Box>
                </Tooltip>
              )}
            </>
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
                borderRadius: "999px",
                border: "1px solid rgba(249,115,22,0.35)",
                background: "rgba(249,115,22,0.08)",
                color: "#FB923C",
                font: "inherit",
                fontSize: "0.72rem",
                fontWeight: 700,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.5 : 1,
                transition: "background 140ms ease",
                "&:hover": busy ? {} : { background: "rgba(249,115,22,0.18)" },
              }}
            >
              <MessageCircle size={13} />
              <Box
                component="span"
                sx={{ display: { xs: "none", sm: "inline" } }}
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
            color: analysis
              ? "rgba(255,255,255,0.88)"
              : "rgba(255,255,255,0.45)",
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
            color: "rgba(255,255,255,0.4)",
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
