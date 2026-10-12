import { createTheme, type Theme } from "@mui/material/styles";
import {
  ACCENT,
  FONT_SANS,
  GLOBAL_CSS,
  LINE,
  MATERIAL,
  MOTION,
  RADIUS,
  SHADOW,
  STATUS,
  SURFACE,
  TEXT,
  TYPE,
} from "./tokens";

/**
 * The site theme, built from src/theme/tokens.ts.
 *
 * One builder for every ThemeProvider on the site (the Pages Router layout,
 * the home page, the App Router registry), so MUI components look the same
 * everywhere: flat surfaces, hairline borders, no ripple, press feedback on
 * pointer-down, pill buttons, solid menus and dialogs with a neutral shadow,
 * and a type scale whose tracking and leading change with size. The intern
 * view passes its blue as `primary`; the App Router's content pages pass
 * `mode: "light"`.
 */
export interface ChessMastiThemeOptions {
  /** The accent. Defaults to the brand's ember. */
  primary?: string;
  primaryLight?: string;
  mode?: "dark" | "light";
}

const LIGHT = {
  page: "#FFFFFF",
  raised: "#F5F5F7",
  overlay: "#FFFFFF",
  text: "#1D1D1F",
  textSecondary: "#6E6E73",
  textTertiary: "#86868B",
  hairline: "rgba(0,0,0,0.1)",
  strong: "rgba(0,0,0,0.2)",
  hover: "rgba(0,0,0,0.04)",
  selected: "rgba(0,0,0,0.08)",
} as const;

export function buildChessMastiTheme(opts: ChessMastiThemeOptions = {}): Theme {
  const dark = (opts.mode ?? "dark") === "dark";
  const primary = opts.primary ?? ACCENT.main;
  const primaryLight = opts.primaryLight ?? ACCENT.hover;

  const page = dark ? SURFACE.page : LIGHT.page;
  const raised = dark ? SURFACE.raised : LIGHT.raised;
  const overlay = dark ? SURFACE.overlay : LIGHT.overlay;
  const hairline = dark ? LINE.hairline : LIGHT.hairline;
  const strong = dark ? LINE.strong : LIGHT.strong;
  const textPrimary = dark ? TEXT.primary : LIGHT.text;
  const textSecondary = dark ? TEXT.secondary : LIGHT.textSecondary;
  const textTertiary = dark ? TEXT.tertiary : LIGHT.textTertiary;
  const hover = dark ? "rgba(255,255,255,0.06)" : LIGHT.hover;
  const selected = dark ? "rgba(255,255,255,0.1)" : LIGHT.selected;
  const tooltipBg = dark ? SURFACE.raisedTertiary : LIGHT.text;
  const tooltipText = dark ? TEXT.primary : LIGHT.page;
  const inputBg = dark ? "rgba(255,255,255,0.06)" : LIGHT.page;

  // MUI picks a shadow by elevation. Nothing on the page casts one (0-4:
  // cards, app bars); menus and popovers float (5-12); dialogs are modal.
  const shadows = Array.from({ length: 25 }, (_, i) =>
    i === 0 || i <= 4 ? "none" : i <= 12 ? SHADOW.floating : SHADOW.modal
  ) as unknown as Theme["shadows"];

  const focusRing = {
    outline: `2px solid ${dark ? TEXT.primary : LIGHT.text}`,
    outlineOffset: 2,
  };

  return createTheme({
    palette: {
      mode: dark ? "dark" : "light",
      primary: {
        main: primary,
        light: primaryLight,
        dark: ACCENT.active,
        contrastText: TEXT.onAccent,
      },
      secondary: { main: textSecondary },
      background: { default: page, paper: raised },
      text: {
        primary: textPrimary,
        secondary: textSecondary,
        disabled: textTertiary,
      },
      divider: hairline,
      success: { main: STATUS.success },
      warning: { main: STATUS.warning },
      error: { main: STATUS.error },
      info: { main: STATUS.info },
      action: {
        hover,
        selected,
        focus: selected,
        disabledOpacity: 0.32,
      },
    },
    shape: { borderRadius: RADIUS.control },
    shadows,
    typography: {
      fontFamily: FONT_SANS,
      h1: TYPE.h1,
      h2: TYPE.h2,
      h3: TYPE.h3,
      h4: TYPE.h4,
      h5: TYPE.h5,
      h6: { ...TYPE.h5, fontSize: "1rem" },
      subtitle1: { ...TYPE.body, fontWeight: 600 },
      subtitle2: { ...TYPE.bodySmall, fontWeight: 600 },
      body1: TYPE.body,
      body2: TYPE.bodySmall,
      caption: TYPE.caption,
      // A label above a group: sentence case, never uppercase.
      overline: { ...TYPE.label, textTransform: "none" },
      button: {
        ...TYPE.bodySmall,
        fontWeight: 600,
        textTransform: "none",
        letterSpacing: 0,
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: `
          ${GLOBAL_CSS}
          html { color-scheme: ${dark ? "dark" : "light"}; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; font-synthesis: none; }
          body { background-color: ${page}; }
          ::selection { background: ${ACCENT.tint}; }
        `,
      },
      MuiButtonBase: {
        defaultProps: { disableRipple: true, disableTouchRipple: true },
        styleOverrides: {
          root: {
            transition: `transform ${MOTION.press}, background-color ${MOTION.hover}, color ${MOTION.hover}, border-color ${MOTION.hover}, opacity ${MOTION.hover}`,
            "&:active": { transform: MOTION.pressScale },
            "&.Mui-focusVisible": focusRing,
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: RADIUS.pill,
            paddingInline: 18,
            minHeight: 40,
            boxShadow: "none",
            "&:hover": { boxShadow: "none" },
          },
          outlined: {
            borderColor: strong,
            "&:hover": { borderColor: textSecondary, backgroundColor: hover },
          },
          text: { "&:hover": { backgroundColor: hover } },
          sizeSmall: { minHeight: 32, paddingInline: 12 },
          sizeLarge: {
            minHeight: 48,
            paddingInline: 24,
            fontSize: TYPE.body.fontSize,
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.control,
            "&:hover": { backgroundColor: hover },
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            borderColor: hairline,
            "&.Mui-selected": { backgroundColor: selected },
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: "none" },
          outlined: { borderColor: hairline },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.card,
            border: `1px solid ${hairline}`,
            boxShadow: "none",
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundColor: overlay,
            backgroundImage: "none",
            borderRadius: RADIUS.sheet,
            border: `1px solid ${hairline}`,
            boxShadow: SHADOW.modal,
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: { root: { ...TYPE.h4, paddingBottom: 8 } },
      },
      MuiBackdrop: {
        styleOverrides: {
          root: {
            backgroundColor: MATERIAL.scrim,
            "&.MuiBackdrop-invisible": { backgroundColor: "transparent" },
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            backgroundColor: overlay,
            backgroundImage: "none",
            border: `1px solid ${hairline}`,
            borderRadius: RADIUS.control,
            boxShadow: SHADOW.floating,
            marginTop: 6,
            minWidth: 180,
          },
          list: { padding: 6 },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.small,
            paddingBlock: 8,
            paddingInline: 12,
            "&:hover": { backgroundColor: hover },
            "&.Mui-selected": { backgroundColor: selected },
            "&.Mui-selected:hover": { backgroundColor: selected },
          },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: {
            backgroundColor: overlay,
            backgroundImage: "none",
            border: `1px solid ${hairline}`,
            borderRadius: RADIUS.control,
            boxShadow: SHADOW.floating,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: tooltipBg,
            color: tooltipText,
            fontSize: TYPE.caption.fontSize,
            lineHeight: TYPE.caption.lineHeight,
            borderRadius: RADIUS.small,
            padding: "6px 10px",
            boxShadow: SHADOW.floating,
          },
          arrow: { color: tooltipBg },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: RADIUS.small, fontWeight: 500 },
          outlined: { borderColor: hairline },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.control,
            backgroundColor: inputBg,
            "& .MuiOutlinedInput-notchedOutline": { borderColor: hairline },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: strong,
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: primary,
              borderWidth: 1,
            },
          },
        },
      },
      MuiFilledInput: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.control,
            backgroundColor: inputBg,
            "&::before, &::after": { display: "none" },
          },
        },
      },
      MuiTabs: {
        styleOverrides: { indicator: { height: 2, borderRadius: 1 } },
      },
      MuiTab: {
        styleOverrides: {
          root: { textTransform: "none", fontWeight: 600, minHeight: 44 },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.control,
            border: `1px solid ${hairline}`,
          },
          standardSuccess: {
            backgroundColor: STATUS.successTint,
            color: textPrimary,
          },
          standardWarning: {
            backgroundColor: STATUS.warningTint,
            color: textPrimary,
          },
          standardError: {
            backgroundColor: STATUS.errorTint,
            color: textPrimary,
          },
          standardInfo: {
            backgroundColor: STATUS.infoTint,
            color: textPrimary,
          },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: {
            backgroundColor: overlay,
            color: textPrimary,
            border: `1px solid ${hairline}`,
            borderRadius: RADIUS.control,
            boxShadow: SHADOW.floating,
          },
        },
      },
      MuiDivider: { styleOverrides: { root: { borderColor: hairline } } },
      MuiLink: {
        defaultProps: { underline: "hover" },
        styleOverrides: { root: { color: primaryLight } },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 2, backgroundColor: selected },
          bar: { borderRadius: 2 },
        },
      },
      MuiSkeleton: {
        styleOverrides: { root: { backgroundColor: hover } },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.small,
            "&.Mui-selected": { backgroundColor: selected },
          },
        },
      },
    },
  });
}

/** The product pages' theme (dark, ember accent). */
export const chessMastiDarkTheme = buildChessMastiTheme();
