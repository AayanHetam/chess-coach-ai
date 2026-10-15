"use client";

import { Box } from "@mui/material";
import { useEffect, useState, type ReactNode } from "react";

import {
  PartnerBanner,
  SLOT_HEIGHT,
  SWAP_PX,
  type SlotTone,
} from "./PartnerBanner";
import { chesshouseCreative } from "./chesshouseTurn2";
import { turnTwoCreative } from "./chessusaTurn2";
import {
  LIVE_EXCLUDED_RE_SOURCE,
  LIVE_PLACEMENT,
  PARTNERS,
  PARTNER_FONT_FACES,
  PARTNER_PATH_RE_SOURCE,
  isPartnerOptionId,
  isPartnerSlug,
  partnerAttrValue,
  partnerFontUrl,
  type PartnerOptionId,
  type PartnerPlacement,
  type PartnerPreview,
  type PartnerSlug,
} from "./partners";

/**
 * The partner slot, mounted below the nav on every surface.
 *
 * ─── WHO SEES THIS ────────────────────────────────────────────────────────
 * Two audiences, decided by two different things.
 *
 *   PREVIEW  Someone on a URL under /partners/<advertiser>/1, /2 or /3. Those
 *            prefixes serve the real site — /partners/ChessUSA/1/puzzles IS
 *            /puzzles, rewritten — with that advertiser's creative in this
 *            slot, their sign-in asks hidden, and the prefix carried through
 *            every click. A sales asset shown to one advertiser. The
 *            advertiser and option live in the URL and nowhere else: no
 *            cookie, no storage, so there is no sequence of clicks that puts
 *            a visitor on a normal URL into someone's preview.
 *
 *   LIVE     Everyone, on every page, when the registry names a live
 *            placement (LIVE_PLACEMENT in partners.ts). That is a paid
 *            advertisement and the only way a real visitor ever sees a
 *            banner. A few paths are excluded, the age gate and the partner
 *            surface among them; LIVE_EXCLUDED_RE_SOURCE in partners.ts is
 *            the list. Nothing preview-only applies to it: the sign-in asks
 *            stay, the router is not touched, analytics run.
 *
 * With no live placement, real visitors get `display:none` and zero bytes of
 * any advertiser's artwork or faces. With one, everything the banner needs
 * still comes from this domain: the artwork is under /img/p/ and the faces
 * under /fonts/partners/, so a page load makes no request to anyone else.
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
 * 3. NO COST TO REAL VISITORS BEYOND THE LIVE PLACEMENT. Without one, the
 *    wrapper is display:none for them, and the creatives draw their logo with
 *    CSS background-image rather than <img> — a hidden <img> is still fetched,
 *    a hidden background-image is not — and the @font-face rules below sit
 *    unused: a browser fetches a face only once text is set in it. With one,
 *    they load that advertiser's faces and logo, from this domain, and
 *    nothing else.
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

/**
 * Pulls the advertiser and the option out of a pathname. The source is built
 * from the registry (see partners.ts) rather than written here, so adding an
 * advertiser cannot leave this regex behind. Anchored at the start, so the
 * prefix has to BE the route rather than a substring somewhere in the middle,
 * and the trailing (?:/|$) stops /partners/chessusa/12 or .../1x matching
 * option 1.
 *
 * Case-insensitive, because the rewrites are: the links go out capitalised as
 * /partners/ChessHouse/1 and must resolve to the same preview.
 */
export const PARTNER_PATH_RE = new RegExp(PARTNER_PATH_RE_SOURCE, "i");

/** Class on the always-rendered wrapper. Styled by partnerSlotCss below. */
export const PARTNER_SLOT_CLASS = "cm-partner-slot";

/**
 * Class on the block PartnerSlotApp wraps the slot in. The App Router pages
 * render on a white body, and most of them paint a dark PageShell over it
 * (the SEO cluster); the rest, the legal pages, the internship pages and the
 * 404, stay white. The wrapper takes the ground of whichever page follows
 * it, by the rules in partnerSlotCss, so the banner never sits in a white
 * band above a dark page or a dark band above a white one. It also carries
 * the side gutter those pages have no <main> padding to provide.
 *
 * Two signals, so the ground is right both before and after hydration:
 * `body:has(.cm-page-shell)` paints the dark ground from the first frame,
 * and after mount PartnerSlotApp stamps the tone it chose onto the wrapper
 * (SLOT_TONE_ATTR), which the later rules key on. In a browser without
 * :has() the first frame is white everywhere and the stamp corrects it.
 */
export const PARTNER_SLOT_APP_CLASS = "cm-partner-slot-app";

/** Class on the dark PageShell's outer box in app/_seo/aeoUi.tsx. */
export const PAGE_SHELL_CLASS = "cm-page-shell";

/** Attribute PartnerSlotApp stamps on its wrapper after mount: dark | light. */
export const SLOT_TONE_ATTR = "data-cm-tone";

/**
 * AEO_TOKENS.bg in app/_seo/aeoUi.tsx, the ground of the dark App Router
 * pages. Repeated here because this CSS is a string in the document head
 * and must not import a module that pulls MUI and the mascot in; a test
 * keeps the two equal.
 */
export const APP_DARK_GROUND = "#08080f";

/**
 * Attribute the boot script puts on <html> whenever a banner will show,
 * preview or live, with the value slug:option. The CSS keys on its presence
 * for everything the banner itself needs: the slot reserve and the
 * viewport-lock rule.
 */
export const PARTNER_ATTR = "data-cm-partner";

/**
 * Attribute present only under a preview prefix, alongside PARTNER_ATTR. The
 * rules that exist for the advertiser's walkthrough and must never reach a
 * real visitor — hiding the sign-in asks — key on this one, because the live
 * placement sets PARTNER_ATTR for everyone.
 */
export const PREVIEW_ATTR = "data-cm-preview";

/**
 * Attribute the two viewport-locked layouts (/analysis and /puzzles at lg)
 * carry on their root box. Those pages are exactly one screen tall with
 * overflow hidden — by design, so the session never scrolls — and the slot
 * sits INSIDE that box, so the banner's height pushed the bottom of the board
 * out of the box and out of reach with no way to scroll to it. Whenever a
 * banner is on the page, preview or live, the rule in partnerSlotCss lets
 * that overflow show instead of clipping it, and nothing else: the box keeps
 * its definite height, so the columns inside still shrink to it (the
 * measured board gives up the banner's 132px, the coach transcript keeps
 * scrolling inside its column) and the page scrolls only by whatever the
 * banner genuinely squeezed out. An earlier version made the height a
 * minimum as well, which took the definite height away from the flex
 * children and let a long transcript grow the page instead of scrolling.
 * Without a banner the rule does not apply and the locked layout is exactly
 * as it was.
 */
export const VIEWPORT_LOCK_ATTR = "data-cm-viewport-lock";
export const VIEWPORT_LOCK_PROPS = { [VIEWPORT_LOCK_ATTR]: "" } as const;

/**
 * Attribute for a block whose top padding is slack a page keeps between the
 * nav and content it promises on the first screen. The landing hero is sized
 * so its primary call to action clears a 720px fold with a few pixels to
 * spare; the banner spends those pixels. With a banner on the page the rule
 * in partnerSlotCss removes that padding, which is enough to keep the
 * promise (measured: the button's bottom edge moved from 727 to under 720).
 * Inert without a banner.
 */
export const FOLD_SLACK_ATTR = "data-cm-fold-slack";
export const FOLD_SLACK_PROPS = { [FOLD_SLACK_ATTR]: "" } as const;

/**
 * Attribute on every sign-in affordance: the nav's Sign in button, the
 * coach's account gate, the signed-out identity chip on the puzzle rail, the
 * "free account" captions. Under a preview prefix the rule in partnerSlotCss
 * hides them, so the advertiser walks a product with no sign-up asks in it.
 * Keyed on PREVIEW_ATTR, never on PARTNER_ATTR: the live placement must leave
 * a real visitor every way to sign in. An element that is only a sign-in ask
 * while signed OUT spreads the props conditionally, so a signed-in demo keeps
 * its account controls.
 */
export const SIGN_IN_ATTR = "data-cm-sign-in";
export const SIGN_IN_PROPS = { [SIGN_IN_ATTR]: "" } as const;

/**
 * Exact rendered height of PartnerBanner, so the reserve cannot drift from
 * the thing it reserves for:
 *
 *   "Advertisement" label   10px at line-height 12px (px, so a larger
 *                           browser font size cannot outgrow this), + 6px
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
 * Google's latin subset range, so the self-hosted latin files cover exactly
 * the glyphs the Google-served faces did and anything outside it falls back
 * the same way. Every creative's text is English; this is belt and braces.
 */
const LATIN_UNICODE_RANGE =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

/**
 * One @font-face per distinct file across the registry. `font-display:swap`
 * because the banner's box is reserved whether or not the face has arrived:
 * the text can show in a fallback for a moment, the page around it cannot
 * move. The files are preloaded by the boot script on pages that will show a
 * banner, so the swap is rare.
 */
export const partnerFontFaceCss = PARTNER_FONT_FACES.map(
  (face) =>
    `@font-face{font-family:'${face.family}';font-style:normal;font-weight:${face.weight};font-display:swap;src:url(${partnerFontUrl(face)}) format('woff2');unicode-range:${LATIN_UNICODE_RANGE}}`
).join("\n");

/**
 * Plain CSS, injected by _document into the document head so it is in force
 * before first paint. Deliberately not MUI: see note 2 above.
 */
export const partnerSlotCss = `
${partnerFontFaceCss}
.${PARTNER_SLOT_CLASS}{display:none}
html[${PARTNER_ATTR}] .${PARTNER_SLOT_CLASS}{display:block;min-height:${SLOT_RESERVE.narrow}px}
@media (min-width:${SWAP_PX}px){html[${PARTNER_ATTR}] .${PARTNER_SLOT_CLASS}{min-height:${SLOT_RESERVE.wide}px}}
html[${PARTNER_ATTR}] [${VIEWPORT_LOCK_ATTR}]{overflow:visible}
html[${PARTNER_ATTR}] [${FOLD_SLACK_ATTR}]{padding-top:0}
html[${PREVIEW_ATTR}] [${SIGN_IN_ATTR}]{display:none}
html[${PARTNER_ATTR}] .${PARTNER_SLOT_APP_CLASS}{background:#fff;padding:0 16px}
html[${PARTNER_ATTR}] body:has(.${PAGE_SHELL_CLASS}) .${PARTNER_SLOT_APP_CLASS}{background:${APP_DARK_GROUND}}
html[${PARTNER_ATTR}] body .${PARTNER_SLOT_APP_CLASS}[${SLOT_TONE_ATTR}="light"]{background:#fff}
html[${PARTNER_ATTR}] body .${PARTNER_SLOT_APP_CLASS}[${SLOT_TONE_ATTR}="dark"]{background:${APP_DARK_GROUND}}
`.trim();

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
 * Runs in <head>, before first paint. Decides exactly what placementForPath
 * decides — a preview from the prefix, else the live placement on every
 * ordinary page, else nothing — then sets the attribute that un-hides and
 * sizes the slot (plus PREVIEW_ATTR under a prefix) and preloads the faces
 * THAT ADVERTISER's creative is set in, so they are in flight before the
 * banner mounts after hydration. With no live placement, a normal URL
 * executes a few statements, appends nothing and requests nothing.
 *
 * The font map and the live placement are inlined from the registry rather
 * than fetched or guessed: this script runs before any module has loaded, so
 * it cannot import. One preload per file of the one advertiser on the page,
 * never the whole registry: no advertiser pays for another's faces.
 *
 * `crossorigin` on a font preload is mandatory even same-origin — fonts are
 * fetched in CORS mode, and a preload in the other mode is a second download.
 *
 * Wrapped in try/catch because it runs before the app's own error handling
 * exists, where an uncaught throw is both invisible and fatal to the page.
 *
 * Built by a function of the live placement so the tests can run the script
 * both with and without one; `partnerBootScript` is the copy that ships.
 */
const PARTNER_FONTS_JSON = JSON.stringify(
  Object.fromEntries(
    Object.values(PARTNERS).map((p) => [
      p.slug,
      p.fonts.map((face) => partnerFontUrl(face)),
    ])
  )
);

export function buildPartnerBootScript(live: PartnerPlacement | null): string {
  return `(function(){try{
var p=location.pathname,m=p.match(/${PARTNER_PATH_RE_SOURCE}/i),s,o,v=false;
if(m){s=m[1].toLowerCase();o=m[2];v=true}
else{var L=${JSON.stringify(live)};if(!L||/${LIVE_EXCLUDED_RE_SOURCE}/i.test(p))return;s=L.slug;o=L.option}
var f=(${PARTNER_FONTS_JSON})[s];if(!f)return;
var d=document.documentElement;d.setAttribute('${PARTNER_ATTR}',s+':'+o);
if(v)d.setAttribute('${PREVIEW_ATTR}','');
for(var i=0;i<f.length;i++){var l=document.createElement('link');l.rel='preload';l.as='font';l.type='font/woff2';l.crossOrigin='anonymous';l.href=f[i];document.head.appendChild(l)}
}catch(e){}})();`;
}

export const partnerBootScript = buildPartnerBootScript(LIVE_PLACEMENT);

/**
 * The advertiser and option a URL activates, or null — which is every normal
 * URL. The single most important function here: it is the line between "an
 * advertiser sees a mock-up" and "we put an unapproved ad on the live site".
 *
 * The slug is lowercased because the regex is case-insensitive and the links
 * go out capitalised; the registry is keyed on the canonical lowercase form.
 */
export function previewForPath(pathname: string): PartnerPreview | null {
  const m = PARTNER_PATH_RE.exec(pathname);
  if (!m) return null;
  const slug = m[1].toLowerCase();
  if (!isPartnerSlug(slug) || !isPartnerOptionId(m[2])) return null;
  return { slug: slug as PartnerSlug, option: m[2] as PartnerOptionId };
}

/**
 * Where the live placement never shows. The list lives with its source in
 * partners.ts (LIVE_EXCLUDED_RE_SOURCE), shared verbatim with the boot
 * script.
 */
export const LIVE_EXCLUDED_RE = new RegExp(LIVE_EXCLUDED_RE_SOURCE, "i");

/**
 * What the slot shows on this URL: the preview a prefix names, else the live
 * placement on every ordinary page, else nothing. `live` is a parameter so
 * the tests can prove both halves; every caller takes the registry's value.
 */
export function placementForPath(
  pathname: string,
  live: PartnerPlacement | null = LIVE_PLACEMENT
): PartnerPlacement | null {
  const preview = previewForPath(pathname);
  if (preview) return preview;
  if (live && !LIVE_EXCLUDED_RE.test(pathname)) return live;
  return null;
}

/**
 * The prefix as spelled in the current URL, so a visitor who opened
 * /partners/ChessUSA/2 keeps "/partners/ChessUSA/2" in front of every page
 * they move to. Null on a normal URL.
 */
export function partnerPrefixOf(pathname: string): string | null {
  const m = PARTNER_PATH_RE.exec(pathname);
  return previewForPath(pathname) ? m![0].replace(/\/$/, "") : null;
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
/**
 * Which module draws which advertiser's units. The registry stays React-free
 * so that anything can import a slug; this is where the slugs meet the
 * components, and the Record type means a new partner fails to compile until
 * its creatives exist.
 *
 * Both modules are imported statically rather than lazily. The slot only
 * renders after mount, so a dynamic import would work — but it would put the
 * creative behind a second chunk fetch for the one audience that is looking
 * straight at it, to save real visitors a few KB of a bundle they already
 * download. If this list grows past a handful of advertisers, revisit that
 * trade; at two it is not worth the machinery.
 */
export const PARTNER_CREATIVES: Record<
  PartnerSlug,
  (option: PartnerOptionId) => ReactNode
> = {
  chessusa: turnTwoCreative,
  chesshouse: chesshouseCreative,
};

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

  const preview = mounted ? previewForPath(pathname ?? "") : null;
  const placement = mounted ? placementForPath(pathname ?? "") : null;

  /**
   * Keep <html data-cm-partner> (and data-cm-preview) in step with the URL.
   *
   * The boot script sets them once per DOCUMENT load, which is not enough: a
   * next/link click is a client-side navigation, so the document — and the
   * attributes — survive while the URL changes underneath it. Without this
   * effect, clicking any in-app link from /partners/chessusa/2/learn lands on
   * /learn/<course> with the preview attribute still set and that advertiser's
   * walkthrough state still on screen. With a live placement the banner
   * itself legitimately stays, but which creative shows, and whether the
   * sign-in asks are hidden, must follow the URL.
   *
   * Found by clicking a link rather than by calling goto(), which is why the
   * navigation case now has its own test.
   */
  useEffect(() => {
    if (!mounted) return;
    const el = document.documentElement;
    if (placement) el.setAttribute(PARTNER_ATTR, partnerAttrValue(placement));
    else el.removeAttribute(PARTNER_ATTR);
    if (preview) el.setAttribute(PREVIEW_ATTR, "");
    else el.removeAttribute(PREVIEW_ATTR);
  }, [mounted, placement, preview]);

  const partner = placement ? PARTNERS[placement.slug] : null;

  return (
    <Box
      className={PARTNER_SLOT_CLASS}
      sx={{ width: "100%", maxWidth: 1680, mx: "auto" }}
    >
      {placement && partner && (
        <PartnerBanner
          creative={{
            kind: "html",
            alt: partner.options[placement.option].alt,
            node: PARTNER_CREATIVES[placement.slug](placement.option),
          }}
          href={partner.href}
          utm={{
            source: "chessmasti",
            medium: "display",
            campaign: partner.campaign,
            content: partner.options[placement.option].code,
          }}
          advertiser={partner.displayName}
          tone={tone}
        />
      )}
    </Box>
  );
}
