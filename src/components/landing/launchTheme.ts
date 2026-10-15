import type { SxProps, Theme } from "@mui/material/styles";
import { SWAP_PX } from "@/components/ads/PartnerBanner";
import { PARTNER_ATTR, SLOT_RESERVE } from "@/components/ads/PartnerSlot";
import { buildChessMastiTheme } from "@/theme/chessMasti";
import { ACCENT, LINE, SURFACE, TEXT } from "@/theme/tokens";

/**
 * The home page's palette and page frame, from the site tokens. The theme
 * is the site theme; these names are what the landing components read.
 */
export const HOME_BG = SURFACE.page;
export const HOME_SURFACE = SURFACE.raised;
export const HOME_BORDER = `1px solid ${LINE.hairline}`;
export const HOME_TEXT = TEXT.primary;
export const HOME_MUTED = TEXT.secondary;
export const HOME_EMBER = ACCENT.main;
export const HOME_EMBER_BRIGHT = ACCENT.hover;

export const launchTheme = buildChessMastiTheme();

/**
 * The page root: exactly one screen tall, a column with the nav on top and
 * the footer at the bottom, so the home page never scrolls on the screens
 * it is sized for. `--home-vh` is the viewport height the hero sizes Masti
 * against: the dynamic viewport where the browser has it (a phone's
 * toolbars come off it), the plain one elsewhere. Below the sizes the hero
 * is tuned for the column grows and the page scrolls, never clips.
 *
 * `--home-banner` is the height the partner slot reserves under the nav
 * whenever a banner is on the page (the live placement or a preview link,
 * both of which set the attribute on <html> before first paint). The hero
 * takes it off Masti's height budget so the page still fits one screen.
 */
export const homeRootSx: SxProps<Theme> = {
  "--home-vh": "100vh",
  "--home-banner": "0px",
  "@supports (height: 100dvh)": { "--home-vh": "100dvh" },
  [`html[${PARTNER_ATTR}] &`]: {
    "--home-banner": `${SLOT_RESERVE.narrow}px`,
    [`@media (min-width:${SWAP_PX}px)`]: {
      "--home-banner": `${SLOT_RESERVE.wide}px`,
    },
  },
  minHeight: "var(--home-vh)",
  display: "flex",
  flexDirection: "column",
  width: "100%",
  color: HOME_TEXT,
  pt: 3,
  px: { xs: 2, md: 4 },
};

/** The content column under the nav: takes the rest of the screen. */
export const homeColumnSx = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  width: "100%",
  maxWidth: 1120,
  mx: "auto",
} satisfies SxProps<Theme>;
