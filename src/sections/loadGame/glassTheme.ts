import type { Theme } from "@mui/material/styles";
import type { SystemStyleObject } from "@mui/system";

/**
 * Theme-aware glass styling for the SHARED load-game dialog + its inputs.
 *
 * These components (loadGameDialog + chessComInput/lichessInput/gamePgnInput)
 * are rendered inside whatever ThemeProvider the host page provides — the
 * Obsidian-Glass `chessMastiDarkTheme` on glass routes (/database etc.), or the
 * legacy light theme elsewhere. Each helper returns the glass treatment ONLY
 * when the surrounding theme is dark, and `{}` (i.e. MUI defaults, no change)
 * when light — so the dialog is glass on glass pages and unchanged on light
 * pages, with zero regression to either. Pass `theme.palette.mode === "dark"`.
 */

export const glassDialogPaperSx = (dark: boolean): SystemStyleObject<Theme> =>
  dark
    ? {
        position: "fixed",
        top: 0,
        borderRadius: "1.5rem",
        background:
          "linear-gradient(180deg, rgba(20,22,28,0.92), rgba(12,14,20,0.92))",
        backdropFilter: "blur(20px) saturate(150%)",
        WebkitBackdropFilter: "blur(20px) saturate(150%)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow:
          "0 24px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.94)",
      }
    : { position: "fixed", top: 0 };

export const glassBackdropSx = (dark: boolean): SystemStyleObject<Theme> =>
  dark
    ? {
        backgroundColor: "rgba(8,9,12,0.72)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }
    : {};

/** Glass treatment for an MUI TextField / Select OutlinedInput. */
export const glassInputSx = (dark: boolean): SystemStyleObject<Theme> =>
  dark
    ? {
        "& .MuiOutlinedInput-root": {
          backgroundColor: "rgba(255,255,255,0.03)",
          borderRadius: "12px",
          color: "rgba(255,255,255,0.94)",
          "& fieldset": { borderColor: "rgba(255,255,255,0.1)" },
          "&:hover fieldset": { borderColor: "rgba(255,255,255,0.2)" },
          "&.Mui-focused fieldset": {
            borderColor: "rgba(249,115,22,0.55)",
            borderWidth: "1px",
          },
        },
        "& .MuiInputLabel-root": {
          color: "rgba(255,255,255,0.55)",
          "&.Mui-focused": { color: "#FB923C" },
        },
      }
    : {};

/** Subtle glass row treatment for the game-result ListItemButtons. */
export const glassListRowSx = (dark: boolean): SystemStyleObject<Theme> =>
  dark
    ? {
        borderRadius: "10px",
        border: "1px solid rgba(255,255,255,0.06)",
        transition: "all 180ms ease",
        "&:hover": {
          background: "rgba(249,115,22,0.08)",
          borderColor: "rgba(249,115,22,0.3)",
        },
      }
    : {};

/** Primary CTA (the one solid-ember button). */
export const glassPrimaryBtnSx = (dark: boolean): SystemStyleObject<Theme> =>
  dark
    ? {
        bgcolor: "#F97316",
        color: "#0A0A0A",
        boxShadow: "0 6px 18px rgba(249,115,22,0.32)",
        "&:hover": { bgcolor: "#FB923C" },
      }
    : {};

/** Subordinate outline button. */
export const glassOutlineBtnSx = (dark: boolean): SystemStyleObject<Theme> =>
  dark
    ? {
        color: "rgba(255,255,255,0.8)",
        borderColor: "rgba(255,255,255,0.18)",
        "&:hover": {
          borderColor: "rgba(255,255,255,0.32)",
          background: "rgba(255,255,255,0.04)",
        },
      }
    : {};
