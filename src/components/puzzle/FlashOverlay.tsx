import { Box } from "@mui/material";
import { keyframes, styled } from "@mui/material/styles";

/**
 * Shared flash animation overlay for puzzle boards. Box-shadow pulse
 * ringing the board on solved (green) and wrong (red).
 *
 * Positioned absolutely with pointer-events: none so it doesn't block
 * drag-and-drop on the underlying Chessboard. Critical: callers MUST
 * pass `key={flashKey}` (a counter that increments on every flash
 * trigger) so the overlay remounts and the CSS animation restarts
 * cleanly. CSS animations applied to the SAME element with the SAME
 * emotion class won't reliably retrigger — the previous BoardWrap
 * pattern faded after a few wrong attempts because of this.
 *
 * Previously inlined in InlinePuzzleSet.tsx and PracticeChessBoard.tsx;
 * factored out so the three remaining puzzle surfaces (DailyPuzzle,
 * PuzzleRush, PatternTraining) can share the same visual treatment.
 */

const flashGreen = keyframes`
  0%   { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
  20%  { box-shadow: 0 0 0 8px rgba(76, 175, 80, 0.55); }
  100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
`;

const flashRed = keyframes`
  0%   { box-shadow: 0 0 0 0 rgba(220, 50, 50, 0); }
  20%  { box-shadow: 0 0 0 8px rgba(220, 50, 50, 0.65); }
  100% { box-shadow: 0 0 0 0 rgba(220, 50, 50, 0); }
`;

export type FlashState = "idle" | "green" | "red";

export const FlashOverlay = styled(Box, {
  shouldForwardProp: (prop) => prop !== "flash",
})<{ flash: FlashState }>(({ flash }) => ({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  borderRadius: "8px",
  zIndex: 2,
  animation:
    flash === "green"
      ? `${flashGreen} 700ms ease-out`
      : flash === "red"
        ? `${flashRed} 700ms ease-out`
        : "none",
}));
