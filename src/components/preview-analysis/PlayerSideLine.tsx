import { Box, Typography } from "@mui/material";
import { ACCENT, LINE, MOTION, RADIUS, TEXT } from "@/theme/tokens";
import {
  sideLabel,
  type PlayerSide,
  type PlayerSideColor,
  type SideNames,
} from "./playerSide";

// ─── "Which side were you playing?" inline ask ───────────────────────────
// Shown once per game inside the coach stream when the player's side
// can't be inferred (no username match, no stored answer). Answering
// threads playerColor into every analysis/chat request and persists the
// choice per-game. The two side buttons are equal choices, so neither
// wears the accent; hover is a neutral step up the surface ladder.
/**
 * The side question, asked inside the greeting rather than as a card of its
 * own: "Which side were you playing? [White (hikaru)] [Black (magnus)]".
 */
export function PlayerSideAsk({
  names,
  onChoose,
}: {
  names: SideNames;
  onChoose: (color: PlayerSideColor) => void;
}) {
  const sideButton = (color: PlayerSideColor) => (
    <Box
      component="button"
      type="button"
      onClick={() => onChoose(color)}
      aria-label={`I was playing ${sideLabel(color, names)}`}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        maxWidth: "100%",
        minWidth: 0,
        px: 1.1,
        py: 0.35,
        borderRadius: `${RADIUS.pill}px`,
        border: `1px solid ${LINE.strong}`,
        background: "transparent",
        color: TEXT.primary,
        font: "inherit",
        fontSize: "0.8rem",
        fontWeight: 600,
        cursor: "pointer",
        touchAction: "manipulation",
        transition: `background-color ${MOTION.hover}, border-color ${MOTION.hover}, transform ${MOTION.press}`,
        "&:hover": {
          background: "rgba(255,255,255,0.06)",
          borderColor: TEXT.secondary,
        },
        "&:active": { transform: MOTION.pressScale },
        "&:focus-visible": {
          outline: `2px solid ${TEXT.primary}`,
          outlineOffset: 2,
        },
      }}
    >
      <Box
        component="span"
        sx={{ fontSize: "1rem", lineHeight: 1, flexShrink: 0 }}
        aria-hidden
      >
        {color === "white" ? "♔" : "♚"}
      </Box>
      <Box
        component="span"
        sx={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {sideLabel(color, names)}
      </Box>
    </Box>
  );
  return (
    <Box
      data-testid="player-side-ask"
      sx={{
        mt: 1,
        display: "flex",
        alignItems: "center",
        gap: 1,
        flexWrap: "wrap",
      }}
    >
      <Typography sx={{ fontSize: "0.9rem", color: TEXT.primary }}>
        Which side were you playing?
      </Typography>
      {sideButton("white")}
      {sideButton("black")}
    </Box>
  );
}

// One quiet line under the greeting saying which side is being coached, by
// colour and by name, with the switch a word away, so a wrong guess is one
// tap from right.
export function PlayerSideChip({
  side,
  names,
  onChoose,
}: {
  side: PlayerSide;
  names: SideNames;
  onChoose?: (color: PlayerSideColor) => void;
}) {
  const other: PlayerSideColor = side.color === "white" ? "black" : "white";
  return (
    <Typography
      data-testid="player-side-chip"
      sx={{ mt: 0.75, fontSize: "0.8rem", color: TEXT.secondary }}
    >
      Coaching you as {sideLabel(side.color, names)}.
      {onChoose && (
        <>
          {" "}
          <Box
            component="button"
            type="button"
            onClick={() => onChoose(other)}
            sx={{
              font: "inherit",
              fontWeight: 600,
              color: ACCENT.hover,
              background: "none",
              border: 0,
              p: 0,
              cursor: "pointer",
              "&:hover": { textDecoration: "underline" },
              "&:focus-visible": {
                outline: `2px solid ${TEXT.primary}`,
                outlineOffset: 2,
              },
            }}
          >
            Switch to {sideLabel(other, names)}
          </Box>
        </>
      )}
    </Typography>
  );
}
