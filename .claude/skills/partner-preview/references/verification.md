# Verification patterns

All browser checks run against a local production server (see
`scripts/local-prod.sh`), from a script in the scratchpad, with Playwright
loaded through the repo's own `node_modules`:

```js
import { createRequire } from "module";
const { chromium } = createRequire("/abs/path/to/repo/package.json")("playwright");
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH, // remote env: /opt/pw-browsers/chromium-*/chrome-linux/chrome
  args: ["--no-sandbox"],
});
const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
await c.addCookies([{ name: "cm_consent", value: "accepted", domain: "127.0.0.1", path: "/" }]);
```

A script placed outside the repo cannot `import "playwright"` by name; the
`createRequire` line is what makes it resolvable. Print PASS/FAIL lines with
the measured values in parentheses, so a failure carries its own diagnosis.

Every check below runs on two kinds of URL. A prefixed one
(`/partners/ChessUSA/1/puzzles`) is the preview. A bare one (`/puzzles`) is
what a real visitor gets, which with `LIVE_PLACEMENT` set includes the live
banner. The bare checks are the ones that prove nothing preview-only leaked.

## Settling a page

```js
async function settle(p, mobile) {
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.waitForTimeout(800);
  for (let i = 0; i < 3 && (await p.locator('[role="dialog"]').count()); i++) {
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  }
  if (mobile) { const m = p.locator('button[aria-label="Open menu"]'); if (await m.count()) { await m.click(); await p.waitForTimeout(500); } }
}
```

## The slot

```js
const s = await p.evaluate(() => ({
  path: location.pathname + location.search,
  banner: document.querySelectorAll('aside[aria-label^="Advertisement"]').length,
  attr: document.documentElement.getAttribute("data-cm-partner"),
  preview: document.documentElement.hasAttribute("data-cm-preview"),
}));
```

Under a prefix: `banner === 1`, `attr` is that link's `slug:option` and
`preview === true`. On a bare URL with the live placement: `banner === 1`,
`attr === "chessusa:2"` and `preview === false`. On every bare URL when
nothing is live: `0`, `null`, `false`, and `.cm-partner-slot` has computed
`display: none`. The exclusions differ from each other, so read them one by
one:

- `/auth/age` mounts no slot at all and reads `0`, `null`, `false` (the
  wrapper is simply absent).
- `/reset-password` mounts the slot (in `BARE_ROUTES`, and not `/auth/age`)
  and reads `0`, `null`, `false` with `.cm-partner-slot` at `display: none`.
- `/admin` has no page and 404s into the App Router not-found page, which
  mounts the slot, so it reads `0`, `null`, `false` anonymously with
  `.cm-partner-slot` at `display: none` (the real admin pages are
  `/admin/cost` and `/admin/intern-data`).
- `/partners/chessusa/live` reads `attr === null`, `preview === false` and
  `.cm-partner-slot` at `display: none`, but `banner === 1`: that page
  renders the ChessUSA creative itself (`aria-label="Advertisement from
  ChessUSA"`), so count the aside inside `.cm-partner-slot` instead if a 0
  is wanted.
- `/intern`, `/admin/cost` and `/admin/intern-data` replace an anonymous
  visitor onto `/` (client-side `router.replace`), where the read is the
  home page's live slot (`1`, `"chessusa:2"`). Those three are proven by
  the `placementForPath` cases in `partnerSlot.test.tsx` or with an intern
  or admin session.

## Navigation keeps the prefix

Set a marker before navigating, `await p.evaluate(() => { window.__cmMarker = 1; })`.
After each step, `marker === 1` proves the navigation was client-side (a full
load resets it), and `path` proves the prefix survived. Cover:

- a nav link: `p.locator('a[href="/puzzles"]').first().click()`
- a dynamic route: `p.evaluate(() => window.next.router.push("/learn/w-london"))`
  (`window.next.router` is the underlying instance, so this also proves the
  patch reached it)
- object form: `window.next.router.push({ pathname: "/analysis", query: { gameId: "demo" } })`
- shallow: `window.next.router.replace("/analysis", undefined, { shallow: true })`
- `p.goBack()`
- a plain anchor appended to the body, `<a href="/plan">`, clicked (a full
  load is expected here, marker becomes null, path prefixed)
- ctrl-click into a new tab: `c.waitForEvent("page")` around
  `click({ modifiers: ["Control"] })`, then read the new page's state
- an App Router page (`/partners/chessusa/1/privacy`) clicking a `Link` to
  another App Router page and to `/`
- phone width: open the drawer, pick `a[href^="/"]:visible`, click, check

And the inverse on a bare URL with the live banner: the router is not
patched. `window.next.router.push("/learn/w-london")` lands on
`/learn/w-london` with no prefix, `marker === 1`, and the slot still reads
`attr === "chessusa:2"`, `preview === false` after the move (the component's
effect keeps the attributes in step, and the banner never left).

## Locked layouts

```js
const m = await p.evaluate(() => {
  const el = document.querySelector("[data-cm-viewport-lock]");
  const cs = el ? getComputedStyle(el) : null;
  const board = document.querySelector("[data-board-fen]")?.getBoundingClientRect();
  const over = el ? el.scrollHeight - el.clientHeight : -1;
  scrollTo(0, 1e6); const maxScroll = scrollY;
  const boxBottomAtMax = el ? el.getBoundingClientRect().bottom : 0;
  scrollTo(0, 0);
  return {
    overflow: cs?.overflowY, height: el && Math.round(el.getBoundingClientRect().height),
    over, reachable: el ? boxBottomAtMax + over <= innerHeight + 1 : null,
    board: board && { w: Math.round(board.width), bottom: Math.round(board.bottom) },
    docH: document.documentElement.scrollHeight, ih: innerHeight, maxScroll,
  };
});
```

With a banner (prefixed, or bare with the live placement) at 1440×900 the
rule shows the box's overflow and nothing else, so `overflow === "visible"`
and `height === ih` on both pages. `/puzzles`: `over <= 1`, `maxScroll ===
0`, `board.bottom <= ih` and `board.w` about 132px under the no-banner width
(476 measured, 480 at 1512×982, 578 at 1920×1080). `/analysis`: `maxScroll
=== 0`, `over === 0`, `board.w` about 86px under the no-banner width (458 at
1440×900) and `reachable === true`. Anything a banner did squeeze out would
scroll into view rather than be cut off, which is what `reachable` proves.
`/puzzles` at 1366×768 and 1280×720 (below `LOCK_MIN_HEIGHT_PX` = 870)
flows: `maxScroll` about 208, the board the same width as without a banner
and 132px lower. Without a banner (bare URL, `LIVE_PLACEMENT` null):
`overflow === "hidden"`, `height === ih`, `maxScroll === 0`. Take a
screenshot scrolled to the bottom and look at it. "nothing clipped" is a
number, "looks right" is not. `tests/e2e/local/puzzle-one-screen.spec.ts` asserts the same shape
with banner-aware floors, so run it too when the layouts are touched.

## Sign-in asks

Scan visible text and placeholders:

```js
const RE = /sign in|sign up|sign-in|create account|free account|log in|not signed in/i;
const asks = await p.evaluate((src) => {
  const re = new RegExp(src, "i"); const out = [];
  for (const el of document.querySelectorAll("a, button, p, span, div, h1, h2, h3, input, textarea")) {
    const t = ["INPUT", "TEXTAREA"].includes(el.tagName) ? el.getAttribute("placeholder") || "" : (el.childElementCount === 0 ? el.textContent || "" : "");
    if (!re.test(t) || !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    out.push(`${(el.closest("a, button") || el).tagName.toLowerCase()} "${t.trim().slice(0, 50)}"`);
  }
  return [...new Set(out)];
}, RE.source);
```

Prefixed: empty on every page, both widths, drawer open. Bare, live placement
or not: the expected asks present (nav Sign in, the coach gate, the rail
chip, the captions). With the live placement that bare result is the proof
that the sign-in rule stayed keyed on `data-cm-preview`. Dedupe hides two
elements with the same text. Count `[data-cm-sign-in]` elements with
`display: none` versus not when that matters.

## The live mode, on bare URLs

Every value below is ChessUSA unit 2b's. For another placement re-derive the
attribute, the campaign, the content code, the preload list and the families
checked from that partner's registry entry.

Run on `/`, `/puzzles`, `/analysis`, `/learn`, `/learn/w-london`, `/faq`,
`/privacy` and `/chess-basics`, at 1440×900 and 390×844, with the consent
cookie set. Each line is a PASS/FAIL of its own.

- The slot (above): `banner === 1`, `attr === "chessusa:2"`, `preview === false`.
- The link carries the campaign and the rel:

```js
const a = await p.evaluate(() => {
  const a = document.querySelector('aside[aria-label^="Advertisement"] a[href]');
  return { href: a?.href, rel: a?.getAttribute("rel"), target: a?.getAttribute("target") };
});
```

  `href` contains `utm_source=chessmasti`, `utm_medium=display`,
  `utm_campaign=chessusa_2026q3` and `utm_content=2b`,
  `rel === "sponsored noopener noreferrer"`, `target === "_blank"`.
- Sign-in asks present (above), drawer open at phone width.
- Router not patched (the inverse check under "Navigation keeps the prefix").
- No noindex: `document.querySelector('meta[name="robots"]')?.content` has
  no `noindex`. Skip `/learn/<id>`, which is noindex by design, and the
  response has no `x-robots-tag` header (read it from `p.goto()`'s response).
- Font preloads, that advertiser's files only. Select on the href prefix:
  App Router pages (`/faq`, `/privacy`, `/chess-basics`) also carry one
  `next/font` Inter preload under `/_next/static/media/`, which is Next's
  own and expected, and the bare selector would count it.

```js
const links = await p.evaluate(() => [...document.querySelectorAll('link[rel="preload"][as="font"][href^="/fonts/partners/"]')]
  .map((l) => ({ href: l.getAttribute("href"), cross: l.getAttribute("crossorigin"), type: l.getAttribute("type") })));
```

  For ChessUSA exactly two: `/fonts/partners/v1/archivo-latin.woff2` and
  `/fonts/partners/v1/ibm-plex-mono-700-latin.woff2`, each with
  `cross === "anonymous"` and `type === "font/woff2"`.
- Faces loaded, checked after the banner is on screen (a face downloads only
  once text is set in it):
  `await p.evaluate(() => document.fonts.check("600 12px Archivo") && document.fonts.check("700 12px 'IBM Plex Mono'"))`
  is `true`.
- Nothing the banner needs leaves this origin. Collect before `goto`:

```js
const foreign = [];
p.on("request", (r) => { const u = new URL(r.url()); if (u.origin !== new URL(BASE).origin) foreign.push(u.href); });
```

  Run this one in a context WITHOUT the `cm_consent` cookie: both analytics
  mounts render nothing then, so `foreign` must be exactly empty after
  settling and the result proves the banner alone (the consent dialog is
  open in that context, which does not matter for a request list). With
  the cookie set, `ConsentGatedAnalytics` loads gtag from
  `www.googletagmanager.com` (its `GA_MEASUREMENT_ID` has a literal fallback,
  so it is never unset), gtag then posts hits to `google-analytics.com`,
  Vercel Analytics loads from this origin, and `src/lib/firebase.ts` starts
  Firebase Analytics on the same cookie, which contacts
  `firebaseinstallations.googleapis.com` when the Firebase config is in the
  build. If the consented context must be used, filter those analytics
  hosts by name (`googletagmanager.com`, `google-analytics.com` and the
  Firebase SDK's `*.googleapis.com` hosts, never `fonts.googleapis.com`)
  and read anything else as a failure. In particular nothing from
  `fonts.googleapis.com` or `fonts.gstatic.com`, and nothing the banner
  itself needs.
- CLS small (snippet below). On the layout-stability routes at phone width
  with Maia stubbed it measured under 0.001.
- The App Router ground: on `/chess-basics` the computed `background-color`
  of `.cm-partner-slot-app` is `rgb(8, 8, 15)` and the "Advertisement" label
  is the light-on-dark tone. On `/privacy` it is `rgb(255, 255, 255)` and the
  label the dark-on-light tone.
- The landing hero gives up its slack: on `/` at 1280×720
  `getComputedStyle(document.querySelector("[data-cm-fold-slack]")).paddingTop`
  is `"0px"` and the hero's primary call to action (`StartPlanCTA`) ends
  above the fold (bottom 709 measured, 727 without the rule).
- The exclusions set no attribute (the per-path reads are under "The
  slot"): `/auth/age`, `/reset-password` (the slot mounted at
  `display: none`) and `/admin` (the App Router 404 with the slot mounted)
  read `banner === 0`, `attr === null`, `preview === false`.
  `/partners/chessusa/live`
  reads `attr === null` and `.cm-partner-slot` at `display: none` while its
  own banner (`aria-label="Advertisement from ChessUSA"`) is on the page.
  `/intern`, `/admin/cost` and `/admin/intern-data` replace an anonymous
  visitor onto `/`, so those three are proven by the `placementForPath`
  cases in `partnerSlot.test.tsx`, or in the browser with an intern or
  admin session.
- The previews still work: `/partners/ChessUSA/1/puzzles` reads
  `preview === true`, its asks list is empty, and
  `window.next.router.push("/learn")` lands under the prefix.

## Layout shift

Install before navigation with `context.addInitScript`:

```js
window.__cls = 0;
new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
  .observe({ type: "layout-shift", buffered: true });
```

Read `window.__cls` after settling. With no live placement, compare the
prefixed page with the bare one. The banner adds nothing when the difference
is under 0.01. With a live placement both pages carry the banner, so compare
against the per-route budgets in
`tests/e2e/local/layout-stability.spec.ts` instead, which throttles the
browser first (`throttleLikeAPhone`) and stubs Maia (`stubMaiaHealthy`). An
unthrottled `next start` reports 0 for every shift. Record the shift sources
(`e.sources[].node`) when a number needs explaining.

## Production, with curl

Chromium cannot reach production from the remote environment, so:

1. Poll a marker only the new build carries in server-rendered HTML. Not a
   URL the boot script always carried, and never the `<html>` attribute or
   the banner markup, which are set by JS and are not in server HTML. For
   the live placement and the self-hosted fonts:
   - `curl -s https://www.chessmasti.com/puzzles | grep -c '{"slug":"chessusa","option":"2"}'`
     → 1 (the boot script's inlined placement)
   - `curl -s https://www.chessmasti.com/puzzles | grep -o '@font-face{[^}]*/fonts/partners/v1/[^}]*}' | wc -l`
     → 4 (one rule per file, in the inline `<style>`)
   - `curl -sI https://www.chessmasti.com/fonts/partners/v1/archivo-latin.woff2`
     → `HTTP/2 200`, `cache-control: public, max-age=31536000, immutable`
   - `curl -s https://www.chessmasti.com/privacy | grep -c Sponsors` → at least 1
2. Then: `curl -sI https://www.chessmasti.com/partners/ChessUSA/1/practice`
   → `HTTP/2 200` and `x-robots-tag: noindex, nofollow`; an uppercase
   spelling and an App Router path behave the same; bare `/puzzles` → 200 with
   no `x-robots-tag` and zero `aria-label="Advertisement` in the body (the
   banner is client-rendered, so this is zero live or not). Each scoped rule
   present and no copy keyed elsewhere:
   `grep -o '[^}]*\[data-cm-sign-in\][^}]*}' | grep -vc 'html\[data-cm-preview\]'` → 0 and
   `grep -o '[^}]*\[data-cm-viewport-lock\][^}]*}' | grep -vc 'html\[data-cm-partner\]'` → 0.
