# Mechanics: from URL to painted banner

## 1. The request

`/partners/ChessUSA/2/learn/w-london` hits `next.config.js`, whose rewrites
(plain array, so `afterFiles`) map:

```
/partners/chessusa/:option(1|2|3)/:path*   →  /:path*
/partners/chessusa/:option(1|2|3)          →  /
/partners/chessusa/:rest*                  →  /partners/chessusa/:rest*   (casing no-op)
```

`source` patterns match case-insensitively; page routing does not. That is
why a redirect for the prefix looped and a rewrite is used instead, and why
`PARTNER_PATH_RE` and `isPartnerPreviewPath` carry `/i`.

The page renders exactly as it would on the bare path. `router.asPath` stays
the original URL, prefix included; `router.pathname` is the route pattern.

Headers on the same config: `X-Robots-Tag: noindex, nofollow` for
`/partners/:path*`; the sitewide `X-Frame-Options: DENY` is excluded for
`/partners/chessusa/live`, which gets `SAMEORIGIN` and
`Content-Security-Policy: frame-ancestors 'self'` so the shell can frame it.

## 2. Before first paint

`pages/_document.tsx` and `app/layout.tsx` put two things in `<head>`:

- `<style>{partnerSlotCss}</style>`: the slot wrapper is `display:none`;
  under `html[data-cm-partner]` it becomes `display:block` with the exact
  final height of the banner (`SLOT_RESERVE`: 142px narrow, 132px at and
  above `SWAP_PX`), plus the attribute-scoped page rules (below).
- `<script>{partnerBootScript}</script>`: matches `location.pathname` against
  the prefix regex, sets `data-cm-partner="N"` on `<html>`, appends the
  `FONT_HREF` stylesheet (Archivo + IBM Plex Mono). On every normal URL it
  returns after two statements. Wrapped in try/catch because nothing else is
  loaded yet to catch an error.

## 3. After mount

`PartnerSlot` (`PartnerSlot.tsx`) renders the wrapper with a `mounted` flag
that flips in an effect; only then does `optionForPath(pathname)` decide the
option and render `PartnerBanner` with `turnTwoCreative(option)`. A second
effect keeps `data-cm-partner` in step with client-side navigation, so a
next/link move out of the prefix removes the attribute and the banner.

The `pathname` prop comes from the binding:

- `PartnerSlotPages` reads `useRouter().asPath` (path part only) and, under a
  prefix, patches `Router.router.push/replace` with `patchPagesRouter` and
  installs `installAnchorRewriter(prefix)`. Both are undone when the URL
  leaves the prefix or the slot unmounts.
- `PartnerSlotApp` reads `usePathname()` and, under a prefix, installs the
  rewriter with a `navigate` callback that does `window.location.assign`,
  and patches the App Router's `push/replace` the same way. `tone="light"`
  because the App Router SEO pages have a white body.

Mount points: `NavPill` renders `<PartnerSlotPages />` after its header Box
(covers every route that shows the nav, self-chromed or Layout-chromed);
`sections/layout/index.tsx` renders it for `BARE_ROUTES` except `/auth/age`
(an advertisement on a children's age gate is not served even to an
advertiser); `app/layout.tsx` renders `<PartnerSlotApp />` inside
`ThemeRegistry`.

## 4. The banner

`PartnerBanner` renders `<aside aria-label="Advertisement — ChessUSA">` with
the small uppercase "Advertisement" label (FTC), a min-height box of
`SLOT_HEIGHT`, and `<a target="_blank" rel="sponsored noopener noreferrer">`
whose href gets the UTM query through `withUtm`. `SWAP_PX = 760` is the one
breakpoint for the `<picture>`-style swap, the reserve CSS and the creatives'
own media queries (`WIDE`/`NARROW` derive from it): the 728×90 unit is served
only where 728 plus 16px of padding each side fits; below that the 320×100
unit. `LABEL_COLOUR` has a dark and a light tone; the contrast of each on its
ground is asserted arithmetically in the tests.

The three creatives (`chessusaTurn2.tsx`) are CSS-built units with codes
`2a`, `2b`, `2c` (`TURN_TWO_META`), logos as `background-image` from
`public/img/p/cu-*.png` (neutral names; ad blockers key on "ad" and
"banner"). UTM: `source=chessmasti`, `medium=display`,
`campaign=chessusa_2026q3`, `content=<code>`. The shell's `?v=editorial|bold|three`
map onto the same three units (`chessusaCreative.tsx`,
`SHELL_TO_TURN_TWO`), so shell clicks and link clicks reconcile in ChessUSA's
analytics.

## 5. The shell

`pages/partners/chessusa/index.tsx` is the preview shell: device toggles
that set a real `width` attribute on an `<iframe>` (1280/768/390, never a
CSS transform), creative and page toggles, controls visually walled off from
the framed page. `live.tsx` is what it frames: the real `NavPill`, the
banner under it, then the real home sections, the real `/learn` page, or a
static snapshot of the analysis surface (labelled as such). It is
server-rendered so `?v=` and `?page=` are right on the first paint, links
`FONT_HREF` from its own `<Head>` (the boot script does not run there), and
sets the noindex header in `getServerSideProps`. Both routes are in
`SELF_CHROMED_ROUTES`.

## 6. Analytics exclusions

All three guards use `isPartnerPreviewPath` (`/^\/partners\//i`):

- `ConsentGatedAnalytics.tsx`: Vercel Analytics `beforeSend` drops events
  whose URL path matches; the gtag config interpolates the same rule as a JS
  string (`PARTNER_PREVIEW_PATH_JS`) into `send_page_view`, so GA4's automatic
  page view is suppressed on a document loaded under the prefix. A test
  executes the JS string against every accepted spelling and asserts it
  agrees with the TS predicate.
- `AnalyticsProvider.tsx`: the manual `page.view` event returns early. Its
  `usePathname()` comes from `router.asPath` in the Pages adapter, so
  client-side navigations under the prefix are excluded too.

## 7. Attribute-scoped page rules currently shipped

```
html[data-cm-partner] [data-cm-viewport-lock]{height:auto;min-height:100dvh;overflow:visible}
html[data-cm-partner] [data-cm-sign-in]{display:none}
```

`VIEWPORT_LOCK_PROPS` is spread on the root Box of `AnalysisImpl.tsx`
(`height: {lg: "100dvh"}`, `overflow: {lg: "hidden"}`) and of
`pages/puzzles.tsx` (`heightLocked`, at and above `lg` when the viewport is at
least `LOCK_MIN_HEIGHT_PX` = 870 tall). The slot sits inside those boxes, so
without the rule the banner pushed the board's bottom out of reach.

`SIGN_IN_PROPS` is spread on:

| Site | File | Conditional? |
|---|---|---|
| nav pill Sign in button | `ui/NavPill.tsx` | no (only renders signed out) |
| drawer Sign in row | `ui/AppDrawer.tsx` | no |
| coach account gate | `preview-analysis/AnalysisImpl.tsx` | no (only renders signed out) |
| coach suggestion pills | same | `signedOut` |
| coach composer (TextField + send) | same | `signedOut` |
| puzzle rail identity chip | `puzzle/PuzzleSessionRail.tsx` | `!user && !authLoading` |
| home caption "Free account, no card" and its separator | `pages/index.tsx` | no |
| Scout bullet "Free · quick sign-in" | `scout/ScoutLanding.tsx` | no |
| profile "Sign in to sync" card (wrapped in a plain div) | `pages/profile.tsx` | no (only renders signed out) |
| quiz result CTA and caption | `onboarding/QuizResult.tsx` | `!authed` |
| inline puzzle coach error line | `InlinePuzzleCoach.tsx` | `error === SIGN_IN_ERROR` |

Not hidden: the coach's "Sign-in required" chat reply and the share dialog's
error text, both of which need an action first.

## 8. Tests

- `partnerSlot.test.tsx`: the slot server-renders empty on every path,
  reserve arithmetic, which URLs activate, the swap point, label contrast,
  analytics predicate parity, the boot script executed against a fake
  document, the scoped-rule invariants.
- `partnerBanner.test.ts`: `withUtm`, option guards, the shell serving the
  real creatives (every `url(...)` in rendered CSS is under `/img/p/` with no
  bait substrings), UTM content codes.
- `partnerPrefix.test.ts`: `partnerPrefixOf`, `prefixPath`, `prefixedAs`
  against Next's `resolveHref`, both router patches with fake routers, the
  anchor rewriter driven with plain objects, the sign-in rule.

The environment is node with no jsdom, so DOM-facing code is written to be
driven with plain objects (`closest`, `getAttribute`, `setAttribute`).
