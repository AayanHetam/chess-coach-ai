"use client";

import { Box } from "@mui/material";
import { useEffect, useState } from "react";

import {
  PartnerBanner,
  SLOT_HEIGHT,
  SWAP_PX,
  type SlotTone,
} from "./PartnerBanner";
import { CHESSUSA_HREF } from "./chessusaCreative";
import {
  TURN_TWO_META,
  isTurnTwoId,
  turnTwoCreative,
  type TurnTwoId,
} from "./chessusaTurn2";

/**
 * The ChessUSA slot, mounted below the nav on every surface.
 *
 * ─── WHO SEES THIS ────────────────────────────────────────────────────────
 * Only someone on a URL under /partners/chessusa/1, /2 or /3. Those prefixes
 * serve the real site — /partners/ChessUSA/1/puzzles IS /puzzles, rewritten,
 * with one of the three creatives in this slot. It is a sales asset shown to
 * one advertiser, NOT a live placement.
 *
 * The option lives in the URL and nowhere else, and that is the safety
 * property rather than a style choice. With no stored state there is no
 * sequence of clicks that can put a visitor on a normal URL into a state
 * where the banner appears: on /puzzles it cannot render, full stop. This is
 * why it is not a cookie. Real visitors get `display:none` and zero bytes of
 * ChessUSA artwork or webfont.
 *
 * ─── WHY IT IS BUILT THIS WAY ─────────────────────────────────────────────
 * Three constraints pull against each other and this is the shape that
 * satisfies all three. Read before simplifying.
 *
 * 1. NO HYDRATION MISMATCH. The server cannot know the prefix: most routes are
 *    statically optimised, so the HTML is built once at build time and reused
 *    for every URL that rewrites onto it. Reading location during render would
 *    make the client's first render differ from the server's and React would
 *    blow up the tree. So the component renders the SAME empty wrapper on both
 *    sides and fills it in an effect.
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
 *    script only under the preview prefix.
 *
 * 4. THE PREFIX TRAVELS. Every link on the site points at the bare path, so
 *    the first click used to land on /puzzles, where the banner correctly
 *    disappeared — which made each link a one-page demo. The router bindings
 *    (PartnerSlotPages / PartnerSlotApp) keep the prefix on every navigation
 *    instead: router.push and router.replace are wrapped to prefix their
 *    destination, and anchor hrefs are rewritten as they are clicked. See
 *    partnerPrefixOf, prefixPath and anchorRewriteHandler below. Still no
 *    stored state: leave the prefix by typing a URL and the banner is gone.
 */

/** URL prefix that activates the slot. Matched case-insensitively. */
export const PARTNER_PREFIX = "/partners/chessusa";

/**
 * Pulls the option out of a pathname. Anchored at the start, so the prefix has
 * to be the route rather than a substring somewhere in the middle, and the
 * trailing (?:/|$) stops /partners/chessusa/12 or .../1x matching option 1.
 */
export const PARTNER_PATH_RE = /^\/partners\/chessusa\/([123])(?:\/|$)/i;

/** Class on the always-rendered wrapper. Styled by partnerSlotCss below. */
export const PARTNER_SLOT_CLASS = "cm-partner-slot";

/** Attribute the boot script puts on <html> under a preview prefix. */
export const PARTNER_ATTR = "data-cm-partner";

/**
 * Attribute the two viewport-locked layouts (/analysis and /puzzles at lg)
 * carry on their root box. Those pages are exactly one screen tall with
 * overflow hidden — by design, so the session never scrolls — and the slot
 * sits INSIDE that box, so the banner's height pushed the bottom of the board
 * out of the box and out of reach with no way to scroll to it. Under the
 * prefix, the rule in partnerSlotCss lets the box grow and the page scroll.
 * Without the html attribute the rule does not apply, so real visitors keep
 * the locked layout exactly as it was.
 */
export const VIEWPORT_LOCK_ATTR = "data-cm-viewport-lock";
export const VIEWPORT_LOCK_PROPS = { [VIEWPORT_LOCK_ATTR]: "" } as const;

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
html[${PARTNER_ATTR}] [${VIEWPORT_LOCK_ATTR}]{height:auto;min-height:100dvh;overflow:visible}
`.trim();

/**
 * Archivo + IBM Plex Mono, the two faces the Turn-2 creative is set in. The
 * boot script appends this under the /partners/chessusa/N prefix; the older
 * iframe route at /partners/chessusa/live links it from its own <Head>, since
 * it renders the same units but is not a numeric-option path.
 */
export const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Mono:wght@700&display=swap";

/**
 * Is this path any part of the partner preview surface? Case-INsensitive,
 * because the rewrites match case-insensitively and PARTNER_PATH_RE carries
 * /i, so /PARTNERS/CHESSUSA/1/puzzles renders the preview just as well — and
 * an analytics guard that only knew the lowercase spelling let exactly that
 * traffic through. Every analytics exclusion goes through this one predicate.
 */
export function isPartnerPreviewPath(pathname: string): boolean {
  return /^\/partners\//i.test(pathname);
}

/**
 * The same predicate as a JavaScript expression, for inline scripts that
 * cannot import (the gtag config in ConsentGatedAnalytics). Tested by
 * execution against the TS version so the two cannot disagree.
 */
export const PARTNER_PREVIEW_PATH_JS =
  "/^\\/partners\\//i.test(location.pathname)";

/**
 * Runs in <head>, before first paint. Sets the attribute that un-hides and
 * sizes the slot, and pulls the two webfonts the creative needs. Both happen
 * only under the preview prefix, so on every normal URL this executes two
 * statements, appends nothing and requests nothing.
 *
 * Wrapped in try/catch because it runs before the app's own error handling
 * exists, where an uncaught throw is both invisible and fatal to the page.
 */
export const partnerBootScript = `(function(){try{
var m=location.pathname.match(/^\\/partners\\/chessusa\\/([123])(?:\\/|$)/i);
if(!m)return;
document.documentElement.setAttribute('${PARTNER_ATTR}',m[1]);
var l=document.createElement('link');l.rel='stylesheet';l.href='${FONT_HREF}';
document.head.appendChild(l);
}catch(e){}})();`;

/** The option a URL activates, or null — which is every normal URL. */
export function optionForPath(pathname: string): TurnTwoId | null {
  const m = PARTNER_PATH_RE.exec(pathname);
  return m && isTurnTwoId(m[1]) ? m[1] : null;
}

/**
 * The prefix as spelled in the current URL, so a visitor who opened
 * /partners/ChessUSA/2 keeps "/partners/ChessUSA/2" in front of every page
 * they move to. Null on a normal URL.
 */
export function partnerPrefixOf(pathname: string): string | null {
  const m = PARTNER_PATH_RE.exec(pathname);
  return m && isTurnTwoId(m[1]) ? m[0].replace(/\/$/, "") : null;
}

/**
 * Never prefixed: API routes, Next internals, and the partner surface itself,
 * which also covers a path that already carries the prefix.
 */
const NEVER_PREFIXED = /^\/(api|_next|partners)(\/|$)/i;

/**
 * Where a link to `target` goes while under `prefix`. Same-origin absolute
 * paths get the prefix. Everything else — other origins, relative paths,
 * protocol-relative URLs, mailto: — comes back untouched.
 */
export function prefixPath(
  prefix: string,
  target: string,
  origin: string
): string {
  let path = target;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    let url: URL;
    try {
      url = new URL(path);
    } catch {
      return target;
    }
    if (url.origin !== origin) return target;
    path = url.pathname + url.search + url.hash;
  }
  if (!path.startsWith("/") || path.startsWith("//")) return target;
  if (NEVER_PREFIXED.test(path)) return target;
  if (path === "/") return prefix;
  if (path.startsWith("/?") || path.startsWith("/#")) {
    return prefix + path.slice(1);
  }
  return prefix + path;
}

/** Fired before the browser or React acts on a link, in this order. */
const REWRITE_EVENTS = ["mousedown", "click", "contextmenu"] as const;

/**
 * Keeps the prefix on every link. The site has two kinds:
 *
 *   next/link      navigates through router.push, which the bindings wrap to
 *                  prefix the destination. The href attribute is ALSO
 *                  rewritten here, so a cmd-click, a middle-click or
 *                  "copy link address" gets the prefixed URL as well.
 *   plain <a href> (MUI Button href=, prose links) do a full load of whatever
 *                  the attribute says, so rewriting the attribute before the
 *                  browser reads it is the whole fix.
 *
 * `navigate`, when given, takes over plain left-clicks entirely. The App
 * Router binding needs that because its Link dispatches the navigation
 * directly and never calls router.push.
 *
 * Runs in the capture phase on window, ahead of React's own listeners, so it
 * sees every click first. Pure apart from the attribute write, and typed
 * loosely on purpose: the unit tests drive it with plain objects, there being
 * no DOM in the test environment.
 */
export function anchorRewriteHandler(
  prefix: string,
  origin: string,
  navigate?: (href: string) => void
): (event: Event) => void {
  return (event) => {
    const anchor =
      (event.target as Element | null)?.closest?.("a[href]") ?? null;
    if (!anchor) return;
    const explicitTarget = anchor.getAttribute("target");
    if (explicitTarget && explicitTarget !== "_self") return;
    if (anchor.hasAttribute("download")) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    const next = prefixPath(prefix, href, origin);
    if (next !== href) anchor.setAttribute("href", next);
    if (!navigate || event.type !== "click") return;
    // Only a plain left-click on a link that now carries the prefix. Modified
    // clicks open a new tab (the rewritten attribute takes care of that) and
    // links elsewhere keep their own behaviour.
    const mouse = event as MouseEvent;
    if (mouse.defaultPrevented || mouse.button !== 0) return;
    if (mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey) {
      return;
    }
    if (!PARTNER_PATH_RE.test(next)) return;
    event.preventDefault();
    event.stopPropagation();
    navigate(next);
  };
}

/** Wires anchorRewriteHandler to the window. Returns the undo. */
export function installAnchorRewriter(
  prefix: string,
  navigate?: (href: string) => void
): () => void {
  const handler = anchorRewriteHandler(
    prefix,
    window.location.origin,
    navigate
  );
  for (const type of REWRITE_EVENTS) {
    window.addEventListener(type, handler, true);
  }
  return () => {
    for (const type of REWRITE_EVENTS) {
      window.removeEventListener(type, handler, true);
    }
  };
}

/**
 * The two router bindings live in their own files — PartnerSlotPages.tsx and
 * PartnerSlotApp.tsx — so that neither router's hooks are ever imported into
 * the other's bundle. This module stays router-free and therefore safe for
 * both trees to import.
 */

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
export function PartnerSlot({
  pathname,
  tone = "dark",
}: {
  pathname: string | null;
  /** Ground this mount sits on; drives the disclosure contrast. */
  tone?: SlotTone;
}) {
  /**
   * Two-phase on purpose. `pathname` comes from a router hook, and for a
   * statically optimised page its server-side value is the route PATTERN
   * while the client sees the real URL — rendering from it directly would be
   * a hydration mismatch. So the first render is null on both sides and the
   * content appears once mounted.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const option = mounted ? optionForPath(pathname ?? "") : null;

  /**
   * Keep <html data-cm-partner> in step with the URL.
   *
   * The boot script sets it once per DOCUMENT load, which is not enough: a
   * next/link click is a client-side navigation, so the document — and the
   * attribute — survives while the URL changes underneath it. Without this
   * effect, clicking any in-app link from /partners/chessusa/2/learn lands on
   * /learn/<course> with the attribute still set and the banner still on
   * screen. That is an unapproved advertisement on a real URL, which is the
   * exact thing this design exists to make impossible.
   *
   * Found by clicking a link rather than by calling goto(), which is why the
   * navigation case now has its own test.
   */
  useEffect(() => {
    if (!mounted) return;
    const el = document.documentElement;
    if (option) el.setAttribute(PARTNER_ATTR, option);
    else el.removeAttribute(PARTNER_ATTR);
  }, [mounted, option]);

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
          tone={tone}
        />
      )}
    </Box>
  );
}
