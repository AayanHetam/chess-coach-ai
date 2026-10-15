# Mechanics: from URL to painted banner

Two audiences share the path below. A preview is named by the URL, the live
placement by `LIVE_PLACEMENT` in `partners.ts`. Where the two differ it is
said at the step where they differ.

## 1. The request

`/partners/ChessUSA/2/learn/w-london` hits `next.config.js`, whose rewrites
(plain array, so `afterFiles`) map:

```
/partners/:partner(chessusa|chesshouse)/:option(1|2|3)/:path*  →  /:path*
/partners/:partner(chessusa|chesshouse)/:option(1|2|3)         →  /
/partners/chessusa/:rest*  →  /partners/chessusa/:rest*   (casing no-op, ChessUSA only)
```

The advertiser alternation is an allowlist, duplicated from
`src/components/ads/partners.ts` because this config is CommonJS and cannot
import it; `partnerPrefix.test.ts` reads the file as text and fails if a
registered slug has no rule. The casing no-op exists only for the two real
ChessUSA shell PAGES, so `/partners/chesshouse` with no option is a 404.

`source` patterns match case-insensitively; page routing does not. That is
why a redirect for the prefix looped and a rewrite is used instead, and why
`PARTNER_PATH_RE` and `isPartnerPreviewPath` carry `/i`.

The page renders exactly as it would on the bare path. `router.asPath` stays
the original URL, prefix included; `router.pathname` is the route pattern.

A bare URL such as `/learn/w-london` touches none of this. The server does
not know whether a banner will show. The live placement is decided in the
browser, in the head script and the component below.

Headers on the same config: `X-Robots-Tag: noindex, nofollow` for
`/partners/:path*`; the sitewide `X-Frame-Options: DENY` is excluded for
`/partners/chessusa/live`, which gets `SAMEORIGIN` and
`Content-Security-Policy: frame-ancestors 'self'` so the shell can frame it.
`/fonts/partners/:path*` gets `Cache-Control: public, max-age=31536000,
immutable`, which is why `PARTNER_FONT_DIR` is versioned (`/fonts/partners/v1`)
and a changed file is a new directory.

## 2. Before first paint

`src/pages/_document.tsx` and `src/app/layout.tsx` put two things in
`<head>`, both through `dangerouslySetInnerHTML` (React escapes a string
child, and the quotes in `format('woff2')` and in the script would not
survive that):

- `<style dangerouslySetInnerHTML={{ __html: partnerSlotCss }} />`. It starts
  with `partnerFontFaceCss`: one `@font-face` per distinct file in
  `PARTNER_FONT_FACES` (`font-display:swap`, the Google latin
  `unicode-range`, `src:url(/fonts/partners/v1/<file>)`). The rules are in
  every page head, but a browser downloads a face only once
  text on the page is set in it, so a page with no banner downloads none and
  a page with one downloads that advertiser's. Then the slot: the wrapper is
  `display:none`. Under `html[data-cm-partner]` it becomes `display:block`
  with the exact final height of the banner (`SLOT_RESERVE`: 142px narrow,
  132px at and above `SWAP_PX`), plus the attribute-scoped page rules and
  the App Router wrapper's ground (section 7). The reserve keys on `data-cm-partner`'s PRESENCE only, so it
  is advertiser-agnostic and every unit reserves the same box, preview or
  live.
- `<script dangerouslySetInnerHTML={{ __html: partnerBootScript }} />`, built
  by `buildPartnerBootScript(LIVE_PLACEMENT)`. It matches `location.pathname`
  against the prefix regex (built from `PARTNER_PATH_RE_SOURCE`, so it cannot
  drift from the TS resolver). On a match the slug and option come from the
  URL and the script remembers it is a preview. Otherwise it reads the live
  placement, inlined as JSON from the registry, and returns if there is none
  or if the path matches `LIVE_EXCLUDED_RE_SOURCE` (also inlined). It then
  sets `data-cm-partner="<slug>:<option>"` on `<html>`, sets
  `data-cm-preview=""` as well only for a preview, and appends one
  `<link rel="preload" as="font" type="font/woff2" crossorigin="anonymous">`
  per file of **that advertiser's** `fonts`, from a map inlined from the
  registry. ChessUSA gets Archivo and Plex Mono 700, Chess House additionally
  Source Serif 4 and Plex Mono 600, and neither pays for the other's faces.
  `crossorigin` is mandatory even same-origin, or the preload is a second
  download. With no live placement a normal URL returns after a few
  statements and appends nothing. Wrapped in try/catch because nothing else
  is loaded yet to catch an error.

## 3. After mount

`PartnerSlot` (`PartnerSlot.tsx`) renders the wrapper with a `mounted` flag
that flips in an effect. Only then does it compute two things from the
`pathname` prop: `previewForPath(pathname)`, the preview a prefix names or
null, and `placementForPath(pathname)`, which is that preview, else
`LIVE_PLACEMENT` unless `LIVE_EXCLUDED_RE` matches, else null. With a
placement it renders `PartnerBanner` with `PARTNER_CREATIVES[slug](option)`
and that partner's `href`, `campaign`, `displayName` and the option's `code`
and `alt` from the registry. A second effect keeps both attributes in step
with client-side navigation: `data-cm-partner` follows the placement and
`data-cm-preview` follows the preview, so a next/link move out of a prefix
removes the preview attribute and shows the live creative (or nothing), and
a move onto `/intern` (Layout-chromed, so the NavPill's slot stays mounted)
removes the banner attribute and the banner. `/auth/age` mounts no slot at
all, so a move there drops the banner because the component is gone, not
because the effect ran: the effect has no cleanup, so attributes set
earlier stay on `<html>` until the next document load, which is harmless
since nothing on that page keys on them. In practice the gate is reached
only by a full load from the OAuth callback, where the boot script excludes
it.

The `pathname` prop comes from the binding. Both compute
`prefix = partnerPrefixOf(pathname)`, null on every bare URL, so the live
placement patches nothing:

- `PartnerSlotPages` reads `useRouter().asPath` (path part only) and, under a
  prefix, patches `Router.router.push/replace` with `patchPagesRouter` and
  installs `installAnchorRewriter(prefix)`. Both are undone when the URL
  leaves the prefix or the slot unmounts.
- `PartnerSlotApp` reads `usePathname()` and, under a prefix, installs the
  rewriter and patches the App Router's `push/replace` with one `navigate`
  callback: `window.location.assign` for `push` and the anchor rewriter,
  `window.location.replace` for `replace`. It wraps the
  slot in `<div class="cm-partner-slot-app">` (`PARTNER_SLOT_APP_CLASS`).
  The tone starts null and is read after mount from the DOM: `dark` when
  the page holds a `.cm-page-shell` box (`PAGE_SHELL_CLASS`, the dark
  `PageShell` of the 21 SEO pages), `light` otherwise (the four
  `.cm-content` legal pages, the internship pages and the 404). It passes
  that tone to the disclosure and stamps it on the wrapper as
  `data-cm-tone` (`SLOT_TONE_ATTR`), the attribute the last two wrapper
  rules key on and the same signal the wrapper's `:has()` rule keys on, so
  the ground and the label can never disagree. Nothing is stamped before
  the tone is known, so a server-rendered guess cannot outrank the `:has()`
  rule on the first frame.

Mount points: `NavPill` renders `<PartnerSlotPages />` after its header Box
(covers every route that shows the nav, self-chromed or Layout-chromed);
`src/sections/layout/index.tsx` renders it for `BARE_ROUTES` except
`/auth/age` (an advertisement on a children's age gate is not served to
anyone, and the boot script excludes the path as well), so `/reset-password`,
a bare route the live placement also excludes, mounts the wrapper and keeps
it at `display:none`. `src/app/layout.tsx` renders `<PartnerSlotApp />` inside
`ThemeRegistry`.

## 4. The banner

`PartnerBanner` renders `<aside aria-label="Advertisement from {displayName}">` with
the small uppercase "Advertisement" label (FTC), a min-height box of
`SLOT_HEIGHT`, and `<a target="_blank" rel="sponsored noopener noreferrer">`
whose href gets the UTM query through `withUtm`. `SWAP_PX = 760` is the one
breakpoint for the `<picture>`-style swap, the reserve CSS and the creatives'
own media queries (`WIDE`/`NARROW` derive from it): the 728×90 unit is served
only where 728 plus 16px of padding each side fits; below that the 320×100
unit. `LABEL_COLOUR` has a dark and a light tone; the contrast of each on its
ground is asserted arithmetically in the tests.

Each advertiser's three creatives live in their own module —
`chessusaTurn2.tsx`, `chesshouseTurn2.tsx` — as CSS-built units with codes
`2a`, `2b`, `2c`, logos as `background-image` from `public/img/p/cu-*.png`
and `ch-*.png` (neutral names; ad blockers key on "ad" and "banner"). One
file per advertiser is deliberate: editing one buyer's units can never alter
another's while theirs are live in a pitch. UTM: `source=chessmasti`,
`medium=display`, `campaign=<the partner's own>`, `content=<code>`. The live
placement is ChessUSA option `2`, so every visitor's link carries
`utm_campaign=chessusa_2026q3&utm_content=2b`.

Chess House's three are "Threshold" (`2a`, the swoosh re-cast as light under a
door on a `#0B0D11` ground), "Swoosh" (`2b`, the full `#285888` field with the
ribbon enlarged, wordmark in Source Serif 4) and "Packing Slip" (`2c`, a
shipping label on `#E8E6E0` stock with courier tape, perforations and a
barcode rule — mail order since 1972, so the code is the hero by structure).

The ChessUSA shell's `?v=editorial|bold|three` map onto the same three
ChessUSA units (`chessusaCreative.tsx`, `SHELL_TO_TURN_TWO`), so shell clicks
and link clicks reconcile in their analytics.

## 5. The shell

`src/pages/partners/chessusa/index.tsx` is the preview shell: device toggles
that set a real `width` attribute on an `<iframe>` (1280/768/390, never a
CSS transform), creative and page toggles, controls visually walled off from
the framed page. Its bar reads `LIVE_NOTE` from the registry: "UNIT 2B
(CHESSUSA) IS LIVE ON CHESSMASTI.COM" while `LIVE_PLACEMENT` is set, "NOT
LIVE ON CHESSMASTI.COM" when it is null. `live.tsx` is what it frames: the real `NavPill`, the
banner under it, then the real home sections, the real `/learn` page, or a
static snapshot of the analysis surface (labelled as such). It is
server-rendered so `?v=` and `?page=` are right on the first paint, and
sets the noindex header in `getServerSideProps`. It links no fonts of its
own: the `@font-face` rules reach it in `partnerSlotCss` from `_document`
like every other page, and the faces download once the creative's text
renders. Both routes are in `SELF_CHROMED_ROUTES`, and both are under
`/partners/`, so the live placement never shows on them (the banner there is
the one the page renders itself).

## 6. Analytics exclusions

All three guards apply the same rule, `/^\/partners\//i`: two call
`isPartnerPreviewPath`, the gtag config inlines it as
`PARTNER_PREVIEW_PATH_JS`. None of them knows about the live placement. A
bare page with the live banner is tracked like any other page:

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
html[data-cm-partner] [data-cm-viewport-lock]{overflow:visible}
html[data-cm-partner] [data-cm-fold-slack]{padding-top:0}
html[data-cm-preview] [data-cm-sign-in]{display:none}
html[data-cm-partner] .cm-partner-slot-app{background:#fff;padding:0 16px}
html[data-cm-partner] body:has(.cm-page-shell) .cm-partner-slot-app{background:#000000}
html[data-cm-partner] body .cm-partner-slot-app[data-cm-tone="light"]{background:#fff}
html[data-cm-partner] body .cm-partner-slot-app[data-cm-tone="dark"]{background:#000000}
```

The viewport-lock, fold-slack and wrapper rules key on the banner attribute
and apply to both audiences. The sign-in rule keys on the preview attribute
and never reaches a real visitor.
`partnerPrefix.test.ts` asserts each rule is scoped to its attribute and
that no line mentions `data-cm-sign-in` without `html[data-cm-preview]`.
`partnerSlot.test.tsx` asserts the same from the live side.

The last four paint the App Router wrapper (`PARTNER_SLOT_APP_CLASS`) in the
ground of the page that follows it. The first is the default, white like the
body, and carries the 16px side gutter those pages have no `<main>` padding
to provide. The four `.cm-content` legal pages (accessibility, extension,
privacy, terms), the internship pages and the 404 render no PageShell and
stay on it. The second turns the wrapper `APP_DARK_GROUND` (`#000000`, which
a test keeps equal to `AEO_TOKENS.bg` in `src/app/_seo/aeoUi.tsx`) from the
first frame when the body holds a `.cm-page-shell` (`PAGE_SHELL_CLASS`, the
class the dark `PageShell` carries on the 21 SEO pages). The last two key on
the `data-cm-tone` stamp (`SLOT_TONE_ATTR`) that `PartnerSlotApp` puts on
the wrapper after mount from the same signal, later in the sheet at the same
specificity, so a browser without `:has()` lands on the right ground once
hydrated and the stamp wins wherever the two disagree. Without them the live
banner sat in a white band above every dark SEO page. All four key on the
banner attribute, so a visitor with no banner gets no paint.

`VIEWPORT_LOCK_PROPS` is spread on the root Box of `AnalysisImpl.tsx`
(`height: {lg: "100dvh"}`, `overflow: {lg: "hidden"}`) and of
`src/pages/puzzles.tsx` (`heightLocked`, at and above `lg` when the viewport is at
least `LOCK_MIN_HEIGHT_PX` = 870 tall). The slot sits inside those boxes, so
without the rule the banner pushed the board's bottom out of reach. The rule
shows the overflow and nothing else. The box keeps its definite height, so
the columns inside still shrink to it (the measured board gives up the
banner's 132px, the coach transcript keeps scrolling inside its column) and
the page scrolls only by what the banner squeezed out. An earlier version
set `height:auto;min-height:100dvh` as well, which took the definite height
away from the flex children and let a long transcript grow the page instead
of scrolling. The test now asserts one rule with no `height` in it. With the
rule and a banner, measured on the production build: `/puzzles` at 1440×900,
1512×982 and 1920×1080 does not scroll, the board giving up the banner's
132px (476, 480, 578px boards). At 1366×768 and 1280×720 the page already
flows, and with the banner it scrolls by about 208px in total, the board the
same size but 132px lower. `/analysis` at 1440×900 does not scroll either,
its board giving up 86px (458 against 544 with no banner).

`FOLD_SLACK_PROPS` is spread on the landing `Hero` section in
`src/components/landing/Hero.tsx` (`section[aria-labelledby="hero-heading"]`).
With a banner the rule drops the hero's top padding, and under the same
attribute `homeRootSx` in `src/components/landing/launchTheme.ts` sets
`--home-banner` to the slot's reserve (`HOME_BANNER_VARS`, from
`SLOT_RESERVE` either side of `SWAP_PX`), which `HeroMasti` takes off
Masti's height, so the one-screen home still fits. Measured on a production
build: at 1280×720 the primary button (`StartButton`, "Let's go") ends at
571 with no scroll and Masti is 270px wide; at 390×664, 583 and 100px. The
framed copy in `src/pages/partners/chessusa/live.tsx` never carries the
attribute and applies both itself.

`SIGN_IN_PROPS` is spread on (files under `src/components/` unless written
in full):

| Site | File | Conditional? |
|---|---|---|
| nav pill Sign in button | `ui/NavPill.tsx` | no (only renders signed out) |
| drawer Sign in row | `ui/AppDrawer.tsx` | no |
| coach account gate | `preview-analysis/AnalysisImpl.tsx` | no (only renders signed out) |
| coach suggestion pills | same | `signedOut` |
| coach composer (TextField + send) | same | `signedOut` |
| puzzle rail identity chip | `puzzle/PuzzleSessionRail.tsx` | `!user && !authLoading` |
| puzzle sign-in gate, gated grid included | `puzzle/PuzzleSignInGate.tsx` | no (mounted only when auth has answered signed out) |
| Scout bullet "Free · quick sign-in" | `scout/ScoutLanding.tsx` | no |
| profile "Sign in to sync" card (wrapped in a plain div) | `src/pages/profile.tsx` | no (only renders signed out) |
| quiz result CTA and caption | `onboarding/QuizResult.tsx` | `!authed` |
| inline puzzle coach error line | `InlinePuzzleCoach.tsx` | `error === SIGN_IN_ERROR` |

Not hidden: the coach's "Sign-in required" chat reply and the share dialog's
error text, both of which need an action first. With the live placement every
one of these is visible to a real visitor, because the rule keys on
`data-cm-preview`.

## 8. Tests

- `partnerSlot.test.tsx`: the slot server-renders empty on every path,
  reserve arithmetic, which URLs activate a preview (including that an
  unregistered slug never does), the swap point, label contrast, analytics
  predicate parity, and the scoped-rule invariants. "the live placement"
  pins `LIVE_PLACEMENT` to `chessusa:2`, proves `placementForPath` shows it
  on ordinary pages and on none of the exclusions (`/auth/age`, `/partners/…`,
  `/reset-password`, `/intern`, `/admin`, with `/auth/agent`, `/partnerships`,
  `/internship`, `/administrator` and `/reset-passwords` ordinary), that a
  prefix wins over it, that it equals
  `previewForPath` when null, and that the sign-in rule never keys on the
  banner attribute. "boot script" runs `buildPartnerBootScript` for real
  against a fake document, with no placement, with `LIVE_PLACEMENT` and with
  a Chess House one, on every URL shape, and asserts the banner attribute,
  the preview attribute and the preloaded files agree with
  `placementForPath` and `previewForPath`, that every appended element is a
  well-formed font preload with `crossOrigin="anonymous"`, and that a
  dormant script returns before `createElement`. "the App Router mount
  takes its page's ground" asserts the four wrapper rules (the white default
  and the `body:has(.cm-page-shell)` dark rule, then the two `data-cm-tone`
  rules placed after the `:has()` rule at the same specificity so the stamp
  wins), that `APP_DARK_GROUND` equals `AEO_TOKENS.bg` and `aeoUi.tsx` still
  carries `className="cm-page-shell"`, and that every rule naming the
  wrapper class starts with `html[data-cm-partner]`. "the faces come from this
  domain" checks each file in `PARTNER_FONT_FACES` is a woff2 under `public`,
  one swapped rule per file at the top of `partnerSlotCss`, every face a
  creative sets text in is served at that weight, each partner lists every
  (family, weight) its creatives set text in and no face its creatives
  never use, weights checked against each face's weight or variable range
  wherever the rule block declares a `font-weight` (a block that inherits
  its weight is matched by family alone, and that residue is what
  `document.fonts.check` in the browser covers), and nothing in
  `src/components/ads/*.ts(x)`,
  `partnerSlotCss`, `partnerBootScript` or `live.tsx` points at Google.
  `EVERY_UNIT` runs the per-creative invariants across the whole registry,
  so a new advertiser inherits them.
- `partnerPrefix.test.ts` additionally reads `next.config.js` as text and
  fails when a registered slug has no rewrite, or a rewrite names a slug the
  registry does not define.
- `partnerBanner.test.ts`: `withUtm`, option guards, the shell serving the
  real creatives (every `url(...)` in rendered CSS is under `/img/p/` with no
  bait substrings), UTM content codes.
- `partnerPrefix.test.ts`: `partnerPrefixOf`, `prefixPath`, `prefixedAs`
  against Next's `resolveHref`, both router patches with fake routers, the
  anchor rewriter driven with plain objects, the viewport-lock rule (one
  rule, overflow only, scoped to `PARTNER_ATTR`), the hero fold-slack rule
  (scoped to `PARTNER_ATTR`), the sign-in rule scoped to `PREVIEW_ATTR`.
- `tests/e2e/local/puzzle-one-screen.spec.ts` (Playwright, both local legs:
  the floors run in `local-desktop-light`, guarded by a skip under 1200px,
  and `local-mobile-light` runs only the document-flow test):
  `bannerHeight` reads the `.cm-partner-slot` box, 0 when nothing is live.
  On the tall viewports the board must be at least `minBoard - banner` wide
  and the page must not scroll. On the short ones the board bottom may sit
  below the fold by at most the banner's height.

The unit environment is node with no jsdom, so DOM-facing code is written to
be driven with plain objects (`closest`, `getAttribute`, `setAttribute`).
