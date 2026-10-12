/**
 * Chess Masti design tokens (2026-10 redesign).
 *
 * One dark, flat system for the whole site, in Apple's discipline: a neutral
 * surface ladder taken from Apple's dark-mode system colours, one accent used
 * only for the primary action and links, semantic colours for status, a type
 * scale whose tracking and leading change with size, hairline borders, and
 * shadows that are neutral and earned by floating. No gradients, no glow, no
 * glass on content; translucency belongs to floating chrome alone (the nav,
 * the drawer, dialogs, menus) and is defined once here.
 *
 * docs/design/DESIGN_RULES.md explains the rules these tokens serve. Every
 * theme on the site (src/theme/chessMasti.ts for the product pages,
 * src/components/landing/launchTheme.ts for the home page, the App Router's
 * ThemeRegistry) reads from here so a value changes in one place.
 */

/** Surfaces, darkest to lightest. Opaque: content never sits on glass. */
export const SURFACE = {
  /** The page. Pure black, as on apple.com's dark pages and iOS. */
  page: "#000000",
  /** A card, a panel, a list on the page. */
  raised: "#1C1C1E",
  /** A control or a row on a raised surface. */
  raisedSecondary: "#2C2C2E",
  /** A hovered row or control on a raised surface. */
  raisedTertiary: "#3A3A3C",
  /** Floating chrome at rest (menus, tooltips, the drawer). Opaque. */
  overlay: "#1C1C1E",
} as const;

/** Hairlines and separators. */
export const LINE = {
  hairline: "rgba(255,255,255,0.10)",
  separator: "rgba(84,84,88,0.65)",
  strong: "rgba(255,255,255,0.18)",
} as const;

/** Text, the three label levels of Apple's dark mode, plus inverse. */
export const TEXT = {
  primary: "#F5F5F7",
  secondary: "rgba(235,235,245,0.60)",
  tertiary: "rgba(235,235,245,0.30)",
  /** Text on the accent. */
  onAccent: "#0A0A0A",
} as const;

/** The one accent: the brand's ember, for the primary action and links only. */
export const ACCENT = {
  main: "#F97316",
  hover: "#FB923C",
  active: "#EA580C",
  /** A quiet tint for selected states and tags, never a large fill. */
  tint: "rgba(249,115,22,0.14)",
  /** A hairline in the accent, for a selected control. */
  border: "rgba(249,115,22,0.45)",
} as const;

/** Status colours: Apple's dark-mode system colours. */
export const STATUS = {
  success: "#30D158",
  warning: "#FFD60A",
  error: "#FF453A",
  info: "#0A84FF",
  successTint: "rgba(48,209,88,0.14)",
  warningTint: "rgba(255,214,10,0.14)",
  errorTint: "rgba(255,69,58,0.14)",
  infoTint: "rgba(10,132,255,0.14)",
} as const;

/**
 * Floating chrome only: the nav, the drawer sheet, dialogs, menus. Content
 * scrolls under it, so it is translucent, and it goes solid for anyone who
 * asked for reduced transparency or more contrast.
 */
export const MATERIAL = {
  background: "rgba(28,28,30,0.72)",
  backdropFilter: "saturate(180%) blur(20px)",
  border: LINE.hairline,
  /** The dimming scrim under a modal. */
  scrim: "rgba(0,0,0,0.5)",
} as const;

/** CSS for the two media queries every translucent surface must honour. */
export const MATERIAL_FALLBACK_SX = {
  "@media (prefers-reduced-transparency: reduce)": {
    background: SURFACE.overlay,
    backdropFilter: "none",
    WebkitBackdropFilter: "none",
  },
  "@supports not (backdrop-filter: blur(1px))": {
    background: SURFACE.overlay,
  },
  "@media (prefers-contrast: more)": {
    background: SURFACE.overlay,
    backdropFilter: "none",
    WebkitBackdropFilter: "none",
    borderColor: LINE.strong,
  },
} as const;

/** Radii. Pills are for pill buttons only, never for containers. */
export const RADIUS = {
  small: 8,
  control: 10,
  card: 16,
  sheet: 20,
  pill: 980,
} as const;

/**
 * Shadows: neutral, and only for things that float. A card on the page has
 * none; it is a surface, not an object.
 */
export const SHADOW = {
  none: "none",
  /** A menu, a tooltip, a popover. */
  floating: "0 4px 16px rgba(0,0,0,0.35)",
  /** A dialog or a sheet. */
  modal: "0 16px 48px rgba(0,0,0,0.5)",
} as const;

/** The platform's own font first; it already carries optical sizing. */
export const FONT_SANS =
  '-apple-system, BlinkMacSystemFont, system-ui, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif';
export const FONT_MONO =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

/**
 * The type scale. Tracking tightens as size grows and sits near zero at body
 * size; leading loosens as size shrinks. Weight makes hierarchy, not colour.
 */
export const TYPE = {
  display: {
    fontSize: "3.5rem",
    lineHeight: 1.07,
    letterSpacing: "-0.025em",
    fontWeight: 700,
  },
  h1: {
    fontSize: "2.5rem",
    lineHeight: 1.1,
    letterSpacing: "-0.02em",
    fontWeight: 700,
  },
  h2: {
    fontSize: "1.75rem",
    lineHeight: 1.15,
    letterSpacing: "-0.015em",
    fontWeight: 600,
  },
  h3: {
    fontSize: "1.375rem",
    lineHeight: 1.2,
    letterSpacing: "-0.01em",
    fontWeight: 600,
  },
  h4: {
    fontSize: "1.1875rem",
    lineHeight: 1.25,
    letterSpacing: "-0.005em",
    fontWeight: 600,
  },
  h5: {
    fontSize: "1.0625rem",
    lineHeight: 1.3,
    letterSpacing: "0",
    fontWeight: 600,
  },
  body: {
    fontSize: "1.0625rem",
    lineHeight: 1.5,
    letterSpacing: "0",
    fontWeight: 400,
  },
  bodySmall: {
    fontSize: "0.9375rem",
    lineHeight: 1.45,
    letterSpacing: "0",
    fontWeight: 400,
  },
  caption: {
    fontSize: "0.8125rem",
    lineHeight: 1.4,
    letterSpacing: "0.005em",
    fontWeight: 400,
  },
  /** A small label above a group. Sentence case, never uppercase. */
  label: {
    fontSize: "0.8125rem",
    lineHeight: 1.3,
    letterSpacing: "0.005em",
    fontWeight: 600,
  },
} as const;

/**
 * Motion. Hover changes colour, press scales down on pointer-down, surfaces
 * that open move along the path they close on, and anything that sits on
 * the page never moves on its own.
 */
export const MOTION = {
  /** Colour and opacity changes on hover and focus. */
  hover: "160ms ease-out",
  /** The press. Instant, on pointer-down. */
  press: "100ms ease-out",
  pressScale: "scale(0.97)",
  /** A dialog or menu arriving: a short cross-fade with a small scale from its origin. */
  enter: "200ms cubic-bezier(0.2, 0, 0, 1)",
  exit: "160ms cubic-bezier(0.4, 0, 1, 1)",
  /** Framer Motion spring for a sheet or drawer: critically damped. */
  springSheet: { type: "spring", bounce: 0, duration: 0.4 } as const,
  /** Framer Motion spring for something the user flicked: a little bounce. */
  springFlick: { type: "spring", bounce: 0.2, duration: 0.4 } as const,
} as const;

/** Global CSS the baseline injects: reduced motion and the press feedback. */
export const GLOBAL_CSS = `
@keyframes cmFadeIn { from { opacity: 0; } to { opacity: 1; } }
::-webkit-scrollbar { width: 12px; height: 12px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 6px; border: 3px solid transparent; background-clip: padding-box; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); border: 3px solid transparent; background-clip: padding-box; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
`;
