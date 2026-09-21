"use client";

import { Box } from "@mui/material";
import { useEffect, useState } from "react";

import { PartnerBanner, SLOT_HEIGHT, SWAP_PX } from "./PartnerBanner";
import { CHESSUSA_HREF } from "./chessusaCreative";
import {
  TURN_TWO_META,
  isTurnTwoId,
  turnTwoCreative,
  type TurnTwoId,
} from "./chessusaTurn2";

/**
 * The sitewide ChessUSA slot.
 *
 * ─── WHO SEES THIS ────────────────────────────────────────────────────────
 * Nobody, unless they opened /partners/chessusa/1, /2 or /3. Those routes set
 * the `cm_partner` cookie and redirect home; from then on the banner rides
 * below the nav on every page for that browser until /partners/chessusa/off
 * clears it. It is a sales asset shown to one advertiser, NOT a live
 * placement. Real visitors get `display:none` and zero bytes of ChessUSA
 * artwork or webfont.
 *
 * ─── WHY IT IS BUILT THIS WAY ─────────────────────────────────────────────
 * Three constraints pull against each other and this is the shape that
 * satisfies all three. Read before simplifying.
 *
 * 1. NO HYDRATION MISMATCH. The server cannot know the cookie: most routes are
 *    statically optimised, so there is no request at render time. Reading
 *    document.cookie during render would make the client's first render from
 *    the server's and React would blow up the tree. So the component renders
 *    the SAME empty wrapper on both sides and fills it in an effect.
 *
 * 2. NO LAYOUT SHIFT. Filling in an effect normally means the page jumps when
 *    the banner appears. It does not here, because the wrapper is already the
 *    banner's exact final height before first paint: the reserve lives in
 *    plain CSS emitted by _document (see partnerSlotCss), not in MUI's sx.
 *    That matters because this app has no Emotion SSR on the Pages Router, so
 *    sx-generated rules do not exist until hydration — too late to reserve
 *    anything.
 *
 * 3. NO COST TO REAL VISITORS. The wrapper is display:none for them, and the
 *    creatives draw their logo with CSS background-image rather than <img>.
 *    A hidden <img> is still fetched; a hidden background-image is not.
 *    The Archivo / IBM Plex Mono webfonts are likewise appended by the boot
 *    script only when the cookie is present.
 */

/** Cookie the three links set. Value is the option id: "1" | "2" | "3". */
export const PARTNER_COOKIE = "cm_partner";

/** Class on the always-rendered wrapper. Styled by partnerSlotCss below. */
export const PARTNER_SLOT_CLASS = "cm-partner-slot";

/** Attribute the boot script puts on <html> when the cookie is present. */
export const PARTNER_ATTR = "data-cm-partner";

/**
 * Exact rendered height of PartnerBanner, so the reserve cannot drift from
 * the thing it reserves for:
 *
 *   "Advertisement" label   0.625rem at line-height 1.2 = 12px, + 6px margin
 *   creative                SLOT_HEIGHT (90 wide / 100 narrow)
 *   aside bottom margin     mb: 3 = 24px
 *
 * partnerSlot.test.ts re-derives these from the same constants.
 */
export const LABEL_BLOCK_PX = 18;
export const SLOT_MARGIN_PX = 24;
export const SLOT_RESERVE = {
  wide: LABEL_BLOCK_PX + SLOT_HEIGHT.wide + SLOT_MARGIN_PX,
  narrow: LABEL_BLOCK_PX + SLOT_HEIGHT.narrow + SLOT_MARGIN_PX,
} as const;

/**
 * Plain CSS, injected by _document into the document head so it is in force
 * before first paint. Deliberately not MUI: see note 2 above.
 */
export const partnerSlotCss = `
.${PARTNER_SLOT_CLASS}{display:none}
html[${PARTNER_ATTR}] .${PARTNER_SLOT_CLASS}{display:block;min-height:${SLOT_RESERVE.narrow}px}
@media (min-width:${SWAP_PX}px){html[${PARTNER_ATTR}] .${PARTNER_SLOT_CLASS}{min-height:${SLOT_RESERVE.wide}px}}
`.trim();

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Mono:wght@700&display=swap";

/**
 * Runs in <head>, before first paint. Sets the attribute that un-hides and
 * sizes the slot, and pulls the two webfonts the creative needs. Both happen
 * only when the cookie is present, so a normal visitor executes four
 * statements and appends nothing.
 *
 * Wrapped in try/catch because a cookie read throws in some embedded and
 * privacy-locked contexts, and an exception here would run before the app's
 * own error handling exists.
 */
export const partnerBootScript = `(function(){try{
var m=document.cookie.match(/(?:^|;\\s*)${PARTNER_COOKIE}=([123])(?:;|$)/);
if(!m)return;
document.documentElement.setAttribute('${PARTNER_ATTR}',m[1]);
var l=document.createElement('link');l.rel='stylesheet';l.href='${FONT_HREF}';
document.head.appendChild(l);
}catch(e){}})();`;

function readCookie(): TurnTwoId | null {
  try {
    const m = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${PARTNER_COOKIE}=([^;]*)`)
    );
    const v = m ? decodeURIComponent(m[1]) : null;
    return isTurnTwoId(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Mounted directly below the nav on every surface. Three mount points cover
 * the whole site, because the site has three kinds of page:
 *
 *   NavPill                  every route that renders the nav, which is both
 *                            the self-chromed product surfaces and the ones
 *                            Layout chromes for them
 *   sections/layout          the BARE_ROUTES, which render no nav at all
 *   app/layout.tsx           the App Router SEO pages, which are a separate
 *                            tree with its own root
 */
export function PartnerSlot() {
  const [option, setOption] = useState<TurnTwoId | null>(null);

  useEffect(() => {
    setOption(readCookie());
  }, []);

  return (
    <Box
      className={PARTNER_SLOT_CLASS}
      sx={{ width: "100%", maxWidth: 1680, mx: "auto" }}
    >
      {option && (
        <PartnerBanner
          creative={{
            kind: "html",
            alt: TURN_TWO_META[option].alt,
            node: turnTwoCreative(option),
          }}
          href={CHESSUSA_HREF}
          utm={{
            source: "chessmasti",
            medium: "display",
            campaign: "chessusa_2026q3",
            content: TURN_TWO_META[option].code,
          }}
          advertiser="ChessUSA"
        />
      )}
    </Box>
  );
}
