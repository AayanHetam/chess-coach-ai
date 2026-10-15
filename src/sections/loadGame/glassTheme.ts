import type { Theme } from "@mui/material/styles";
import type { SystemStyleObject } from "@mui/system";
import { LINE, MOTION, RADIUS } from "@/theme/tokens";

/**
 * Styling helpers for the SHARED load-game dialog + its inputs.
 *
 * These components (loadGameDialog + chessComInput/lichessInput/gamePgnInput)
 * are rendered inside whatever ThemeProvider the host page provides. Every
 * provider on the site is built by `buildChessMastiTheme`, which already
 * styles the Dialog paper, the backdrop, inputs and buttons from the design
 * tokens, so these helpers add nothing beyond what the theme cannot know
 * (the dialog's fixed position and the list-row hover). The `dark` argument
 * is kept so the call sites compile unchanged.
 */

/** The theme already styles this surface; nothing to add in either mode. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const fromTheme = (_dark: boolean): SystemStyleObject<Theme> => ({});

export const glassDialogPaperSx = (
  dark: boolean
): SystemStyleObject<Theme> => ({
  position: "fixed",
  top: 0,
  ...fromTheme(dark),
});

export const glassBackdropSx = fromTheme;

/** An MUI TextField / Select OutlinedInput: the theme styles it. */
export const glassInputSx = fromTheme;

/** Row treatment for the game-result ListItemButtons. */
export const glassListRowSx = (dark: boolean): SystemStyleObject<Theme> =>
  dark
    ? {
        borderRadius: `${RADIUS.small}px`,
        border: `1px solid ${LINE.hairline}`,
        transition: `background-color ${MOTION.hover}, border-color ${MOTION.hover}`,
        "&:hover": {
          background: "rgba(255,255,255,0.06)",
          borderColor: LINE.strong,
        },
      }
    : {};

/** Primary CTA: `variant="contained"` from the theme. */
export const glassPrimaryBtnSx = fromTheme;

/** Subordinate outline button: `variant="outlined"` from the theme. */
export const glassOutlineBtnSx = fromTheme;
