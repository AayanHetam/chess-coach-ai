---
name: partner-preview
description: How the Chess Masti partner surface works and how to change it safely. One slot under the nav, two audiences. The preview links /partners/ChessUSA/1, /2, /3 and /partners/ChessHouse/1, /2, /3 serve the whole product with that advertiser's banner, attribute-scoped rules that alter pages only under those links (locked layouts scroll, sign-in asks hidden) and prefix-preserving navigation. The live placement (LIVE_PLACEMENT in src/components/ads/partners.ts, ChessUSA unit 2b since 2026-10-14) shows one banner to every visitor on every page, with self-hosted fonts and nothing preview-only. Use this whenever the user mentions the ChessUSA or ChessHouse links, the live or sponsor banner, taking the ad down or running another, LIVE_PLACEMENT, adding an advertiser, the partner or advertiser preview, the banner or ad slot, /partners/ URLs, the sales demo, sponsor creatives, the partner fonts or /fonts/partners/, hiding or changing something "only for the advertiser" or "under the prefix", or asks why a page looks or behaves differently on the partner links or since the banner went live, even when they never say "preview". Also reach for it when any UI change in this repo has to be proven on a production build with Playwright rather than with unit tests alone, and for the routine of verifying on a local production build and then on production with curl.
---

# Partner surface (the advertiser links and the live placement)

One slot under the nav on every page, two audiences:

- **Preview.** `https://www.chessmasti.com/partners/ChessUSA/1`, `/2`, `/3`
  and `/partners/ChessHouse/1`, `/2`, `/3` serve the whole product with one
  of that advertiser's three banners, the sign-in asks hidden and the prefix
  carried through every click. A sales asset shown to one advertiser.
- **Live.** `LIVE_PLACEMENT` in `src/components/ads/partners.ts` names
  `{ slug: "chessusa", option: "2" }`: ChessUSA unit 2b, "Sticker", bought
  2026-10-14. Every visitor on every page sees that banner under the nav,
  except the paths `LIVE_EXCLUDED_RE_SOURCE` names. Taking it down starts
  with setting `LIVE_PLACEMENT` to `null`, see "Take it down" below. A test
  pins the value.

Nothing preview-only reaches a real visitor, and nothing the banner needs
comes from anywhere but this domain: the banner is first-party HTML, the
artwork is under `public/img/p/` and the faces are under
`public/fonts/partners/v1/`. The partner surface adds no request to Google.
The only third-party requests a consented page makes are analytics, none of
them the placement's: gtag from `googletagmanager.com`, its hits to
`google-analytics.com`, and Firebase Analytics
(`firebaseinstallations.googleapis.com`) when the Firebase config is in the
build. With no consent cookie a page makes none at all (see
`references/verification.md`). The only thing the advertiser learns is the
UTM query on a click.

Read this before touching anything under `src/components/ads/` or
`public/fonts/partners/`, the rewrites or headers in `next.config.js`, the
two locked layouts (`AnalysisImpl.tsx`, `src/pages/puzzles.tsx`), the e2e spec
`tests/e2e/local/puzzle-one-screen.spec.ts`, or any element that should
behave differently "only for the advertiser".

**Advertisers are a registry, not a fork.** `src/components/ads/partners.ts`
holds the slug, the destination, the campaign, the faces (`fonts`) and the
per-option metadata for each one, and the live placement beside them. The
path regex, the `@font-face` rules and the boot script are built from it.
Adding an advertiser is four edits, see "Recipe: add an advertiser" below,
and touches no other advertiser's creative.

## The six invariants, for both audiences

1. **Where the placement is decided is written down, never stored.**
   Preview: the advertiser and the option live in the URL and nowhere else.
   No cookie, no storage, so no sequence of clicks puts a visitor on
   `/puzzles` into someone's preview, and leaving the prefix by typing a URL
   drops the banner. Live: the placement is `LIVE_PLACEMENT`, a reviewed and
   versioned value in the repo rather than an environment toggle, pinned by
   the test "is ChessUSA unit 2b, bought 2026-10-14" in
   `partnerSlot.test.tsx`. The slug list is an **allowlist** in both the
   regex and the rewrite, never a wildcard `:partner`.
2. **Nothing preview-only reaches a real visitor, and nothing leaves this
   domain.** Two `<html>` attributes keep the audiences apart.
   `data-cm-partner` (`PARTNER_ATTR`, value `slug:option`) is set whenever a
   banner shows, preview or live, and the slot reserve, the viewport-lock
   rule, the hero's fold-slack rule and the App Router wrapper's ground key
   on it. `data-cm-preview` (`PREVIEW_ATTR`) is set only under a
   prefix, and the sign-in hiding rule keys on it, so a real visitor keeps
   every way to sign in. The router patching, the anchor rewriting, the
   analytics exclusions and the noindex header are prefix-only. With no live
   placement the slot is `display:none` for real visitors, logos are CSS
   `background-image` (a hidden `<img>` still downloads, a hidden background
   does not) and the `@font-face` rules sit unused. With one, a visitor
   downloads that advertiser's artwork from `/img/p/` and its faces from
   `/fonts/partners/v1/`, nothing the banner needs comes from anywhere but
   this domain, and the partner surface adds no request to Google. The only
   third-party requests a consented page makes are analytics, none of them
   the placement's: gtag from `googletagmanager.com`, its hits to
   `google-analytics.com`, and Firebase Analytics on the Firebase SDK's
   `*.googleapis.com` hosts when the Firebase config is in the build. With
   no consent cookie a page makes none at all.
3. **Zero layout shift.** The slot's final height is reserved by plain CSS in
   `<head>` before first paint. The Pages Router has no Emotion SSR, so an MUI
   `sx` rule cannot reserve anything; that is why the CSS is a string in
   `PartnerSlot.tsx` injected by `src/pages/_document.tsx` and
   `src/app/layout.tsx`. Every visitor now pays for a failure here, and the
   layout-stability spec measures it: mobile CLS on its routes is under 0.001
   with Maia stubbed.
4. **No hydration mismatch.** Most pages are statically optimised, so the
   server cannot know the prefix. Anything that depends on the URL is read in
   an effect, never during render. `PartnerSlot` renders the same empty
   wrapper on both sides, live placement or not, and fills it after mount.
   The attribute is set by the boot script and kept by the component, which
   is why it never appears in server HTML.
5. **Never show one surface labelled as another.** The iframe shell at
   `/partners/chessusa` renders the same creatives the ChessUSA links serve,
   and the live banner is the same component and the same creative as
   `/partners/ChessUSA/2`. The shell's bar says which unit is live, read
   from the registry (`LIVE_NOTE` in `src/pages/partners/chessusa/index.tsx`).
   No stand-ins or placeholders on the live domain, ever. (Chess House has the three links and no shell, so
   `/partners/chesshouse` is a 404.)
6. **No advertiser pays for another's assets.** Each registry entry lists its
   own `fonts`. Every face is declared in every page head, but a browser
   downloads one only once text on the page is set in it, and the boot
   script preloads only the active advertiser's files. Artwork is
   per-advertiser too (`cu-*` / `ch-*` in `public/img/p/`).

Also: `X-Robots-Tag: noindex, nofollow` on everything under `/partners/`, and
every analytics guard (Vercel Analytics `beforeSend`, `AnalyticsProvider`, the
gtag `send_page_view` flag) goes through one rule, `isPartnerPreviewPath` (and
its inline-script twin `PARTNER_PREVIEW_PATH_JS` for the gtag config, tested
to agree), which is case-insensitive because the rewrites are. Neither applies
to the live placement: bare pages stay indexable and analytics run.

## The live placement

`placementForPath(pathname, live = LIVE_PLACEMENT)` decides what the slot
shows: the preview a prefix names, else `live` unless the path is excluded,
else null. The boot script inlines the same decision
(`buildPartnerBootScript(live)`, shipped as `partnerBootScript`) and the
component renders from it, so the head, the attributes and the banner agree
on every URL.

**Excluded** (`LIVE_EXCLUDED_RE_SOURCE`, shared verbatim by `LIVE_EXCLUDED_RE`
and the boot script): anything under `/partners/` (the shell, the framed
route and the prefixes, which resolve on their own), `/auth/age` and below,
`/reset-password` and below (the one-shot token flow), `/intern` and below,
`/admin` and below. `/auth/agent`, `/partnerships`, `/internship`,
`/administrator` and `/reset-passwords` are ordinary paths as far as the
regex is concerned (it needs the slash or the end after `age`,
`reset-password`, `intern` and `admin`, and `partners/` needs its slash).
The tests use them as near misses and assert `placementForPath` on them.
Only `/internship` is a real page. The other four 404 into the App Router
not-found page, where the slot is mounted and the live banner shows. The
age gate has no mount at all in `src/sections/layout/index.tsx`. Unlike it,
`/reset-password` is in `BARE_ROUTES` and still mounts the slot, so there the
wrapper is present at `display:none`.

**What stays preview-only:** hiding the sign-in asks (keyed on
`data-cm-preview`), the router patching and anchor rewriting (the bindings
compute `prefix` with `partnerPrefixOf`, null on a bare URL), the analytics
exclusions (`isPartnerPreviewPath`) and the noindex header.

**On the App Router pages** (the ~25 SEO pages under `src/app`, which
render no NavPill) `PartnerSlotApp` wraps the slot in
`<div class="cm-partner-slot-app">`, and `partnerSlotCss` paints that
wrapper in the ground of the page that follows it, under `data-cm-partner`
only. The default is white with a 16px gutter
(`background:#fff;padding:0 16px`), the App Router body's own colour, which
the four `.cm-content` legal pages (accessibility, extension, privacy,
terms), the three internship pages and the 404 keep. Under
`body:has(.cm-page-shell)` (`PAGE_SHELL_CLASS`, the class the dark
`PageShell` in `src/app/_seo/aeoUi.tsx` carries on the 21 SEO pages) it becomes
`APP_DARK_GROUND` (`#000000`, kept equal to `AEO_TOKENS.bg` by a test) from
the first frame. After mount `PartnerSlotApp` reads the same
`.cm-page-shell` signal, picks the disclosure tone (dark with a shell, light
without) and stamps it on the wrapper as `data-cm-tone` (`SLOT_TONE_ATTR`),
which two later rules key on so a browser without `:has()` agrees once
hydrated. Without those rules the live banner sat in a white band above
every dark SEO page.

**Take it down**, the whole procedure:

1. Set `LIVE_PLACEMENT` to `null` in `src/components/ads/partners.ts`.
2. Change the pinned test "is ChessUSA unit 2b, bought 2026-10-14" in
   `partnerSlot.test.tsx` to expect `null`.
3. Rewrite the four public statements so they no longer say a sponsor banner
   is on every page: the Sponsors paragraph and "What we do not do" in
   `src/app/privacy/page.tsx`, `src/app/faq/page.tsx`,
   `src/app/architecture/page.tsx` and `public/llms.txt`. When the privacy
   page's "Last updated" line moves, update the pin in
   `src/app/__tests__/audiencePositioning.test.tsx`. Nothing else needs
   touching: the shell's `LIVE_NOTE` flips to "NOT LIVE ON CHESSMASTI.COM" on
   its own, and the pinned test is the only one that fixes the value (the
   boot-script tests run against whatever `LIVE_PLACEMENT` holds).
4. `npx tsc --noEmit` and `npm test`.
5. Deploy, then confirm with curl that the boot script no longer contains
   `{"slug":"chessusa","option":"2"}` (with `null` it inlines `var L=null`).

With `null`, `placementForPath` equals `previewForPath` on every URL, the
boot script returns on a normal URL before touching the document, and the
slot is `display:none` on every bare URL. The six preview links keep their
banners, which is what `placementForPath` equalling `previewForPath` means.

**Run another:** the advertiser must be in the registry with creatives and
fonts. Name the slug and option in `LIVE_PLACEMENT`, update the pinned test,
run the live-mode browser checks on a local production build (see "Recipe:
verify and ship"), deploy, then confirm the production markers with curl.
The checks and the markers as written are instantiated for ChessUSA unit 2b
and must be re-derived from the registry for the new placement: the
attribute is `<slug>:<option>` (`partnerAttrValue`), the production marker
is the `JSON.stringify` of the new `LIVE_PLACEMENT`
(`{"slug":"<slug>","option":"<n>"}`), `utm_campaign` is that partner's
`campaign`, `utm_content` is `options[<n>].code`, the preload list is that
partner's `fonts` (four files for Chess House) and `document.fonts.check`
covers each family in that list. The public statements name no advertiser
and stand as they are.

**Measured on the production build** (Chromium, consent cookie set):
`/puzzles` at 1440x900, 1512x982 and 1920x1080 does not scroll with the
banner. The lock box keeps its height (the rule shows its overflow and
nothing else) and the board gives up the banner's 132px (476, 480 and
578px boards). At 1366x768 and 1280x720, below
`LOCK_MIN_HEIGHT_PX` = 870, the page flows and scrolls by about 208px, the
board unchanged in size but 132px lower. `/analysis` at 1440x900 does not
scroll either: its board gives up 86px (458 against 544 with no banner, and
278 against 364 at 1280x720) and the transcript keeps scrolling inside its
column. The one-screen home still fits with the banner, no scroll at
1280x720 or 390x664: the hero spreads `FOLD_SLACK_PROPS`, so the banner
spends its top padding, and takes the slot's reserve off Masti's height
through `--home-banner` (Masti 270px and 100px wide, the "Let's go" button
ending at 571 and 583).
`tests/e2e/local/puzzle-one-screen.spec.ts` measures the `.cm-partner-slot`
height (`bannerHeight`) and subtracts it from the board floors on the tall
viewports, and on the short ones lets the board bottom overhang the fold by
that height, so it reads the page as shipped with or without a placement.

**Public statements** describe the surface and must stay true when it
changes: the Sponsors paragraph and "What we do not do" in
`src/app/privacy/page.tsx` (last updated October 14, 2026),
`src/app/faq/page.tsx`, `src/app/architecture/page.tsx` and
`public/llms.txt`. `src/app/__tests__/audiencePositioning.test.tsx` pins
the privacy page's "Last updated" line, so a date change edits both.

## Self-hosted fonts

The creatives are set in Archivo, IBM Plex Mono and Source Serif 4, served
from this domain. `public/fonts/partners/v1/` holds `archivo-latin.woff2`
(variable, 600 to 800), `ibm-plex-mono-600-latin.woff2`,
`ibm-plex-mono-700-latin.woff2` and `source-serif-4-700-latin.woff2`, each
family's `OFL-*.txt` and a README. `next.config.js` serves
`/fonts/partners/:path*` with a one-year immutable `Cache-Control`, so a
changed file is a new directory (`PARTNER_FONT_DIR`), never an edit in place.

In the registry each partner lists `fonts: readonly PartnerFontFace[]` (`family`
exactly as the creative writes it in `font-family`, `weight` in CSS syntax,
`file`). `PARTNER_FONT_FACES` dedupes across partners by file.
`partnerFontFaceCss` emits one `@font-face` per file (`font-display:swap`,
latin `unicode-range`) at the top of `partnerSlotCss`, so the rules are in
every page head and a browser downloads a face only once text uses it. The
boot script appends `<link rel="preload" as="font" type="font/woff2"
crossorigin>` for the active partner's files only, and `crossorigin` is
mandatory even same-origin or the preload is a second download. `FONT_HREF`
and `fontHref` are gone, `src/pages/partners/chessusa/live.tsx` links nothing,
and the partner surface makes no request to Google: artwork from `/img/p/`,
faces from `/fonts/partners/v1/`. Consented analytics still load gtag, see
`references/verification.md`.

**Add a face for a new advertiser:** take the latin woff2 (the existing
files are the Google Fonts latin subsets), put it in
`public/fonts/partners/v1/` with its `OFL-*.txt`, add a row to the README,
declare a `PartnerFontFace` const in `partners.ts` and list it in the
partner's `fonts`. The "the faces come from this domain" block in
`partnerSlot.test.tsx` then checks that the file is woff2, that one swapped
rule points at it, that every face a creative sets text in is served at
that weight, that the partner lists every face its creatives set text in
and no other, and that nothing under `src/components/ads/` or in `live.tsx`
points at Google. The coverage checks match family and weight for every
rule block that declares a `font-weight`, against the face's weight or
variable range (a static instance covers its one weight, the variable
Archivo file its 600 to 800 range, so a creative setting Archivo 500 fails).
A block that inherits its weight is matched by family alone, and that
inherited case, plus the file actually loading, is what the
`document.fonts.check` in `references/verification.md` is for.

## Map

| Piece | Where |
|---|---|
| **The advertiser registry**: slugs, destinations, campaigns, `fonts`, per-option codes, names and alt text, `LIVE_PLACEMENT`, `LIVE_EXCLUDED_RE_SOURCE`, `PARTNER_FONT_DIR`, `PARTNER_FONT_FACES`, `partnerFontUrl`, `PARTNER_PATH_RE_SOURCE`, `partnerAttrValue` | `src/components/ads/partners.ts` (leaf module, no React, safe for anything to import) |
| The font files, their OFL licences and the README | `public/fonts/partners/v1/` |
| Activation: rewrites `/partners/:partner(chessusa\|chesshouse)/:option(1\|2\|3)/:path*` → `/:path*` (plus the root and a ChessUSA-only casing no-op), the `/partners/:path*` noindex header, the `/fonts/partners/:path*` immutable cache header, the frame-ancestors exception for the iframe route | `next.config.js` (the live config, `next.config.ts` is inert) |
| The slot itself: `PARTNER_PATH_RE`, `previewForPath`, `placementForPath`, `LIVE_EXCLUDED_RE`, the two `<html>` attributes (`PARTNER_ATTR`, `PREVIEW_ATTR`), `PARTNER_SLOT_APP_CLASS`, `PAGE_SHELL_CLASS`, `SLOT_TONE_ATTR`, `APP_DARK_GROUND`, `partnerFontFaceCss`, `partnerSlotCss`, `buildPartnerBootScript`, `partnerBootScript`, `partnerPrefixOf`, `prefixPath`, `anchorRewriteHandler`, `VIEWPORT_LOCK_PROPS`, `FOLD_SLACK_PROPS`, `SIGN_IN_PROPS`, `isPartnerPreviewPath`, `PARTNER_CREATIVES`, the `PartnerSlot` component | `src/components/ads/PartnerSlot.tsx` |
| Router bindings that keep the prefix on navigation (preview only), and the App Router wrapper that takes its page's ground | `PartnerSlotPages.tsx` (Pages Router), `PartnerSlotApp.tsx` (App Router) |
| The banner (sizes, swap point, FTC label, UTM) and each advertiser's three creatives | `PartnerBanner.tsx`, `chessusaTurn2.tsx`, `chesshouseTurn2.tsx`, `chessusaCreative.tsx`, `previewOptions.ts`; artwork in `public/img/p/` with neutral filenames |
| Mount points | `src/components/ui/NavPill.tsx` (after the header), `src/sections/layout/index.tsx` (bare routes, minus `/auth/age`), `src/app/layout.tsx` |
| Iframe shell and the page it frames | `src/pages/partners/chessusa/index.tsx`, `live.tsx` |
| Unit tests | `src/components/ads/__tests__/` (node environment, no jsdom) |
| Banner-aware board floors | `tests/e2e/local/puzzle-one-screen.spec.ts` |
| Public statements | `src/app/privacy/page.tsx`, `src/app/faq/page.tsx`, `src/app/architecture/page.tsx`, `public/llms.txt` |

`references/mechanics.md` walks a request from URL to painted banner, for
both audiences, and lists every element currently marked. Read it when the
change touches the slot, the bindings, the fonts or the creatives.

## Recipe: add an advertiser

Four edits and a set of creatives. Nothing about the CSS, the reserve, the
prefix-preserving navigation or the analytics exclusions is per-advertiser, so
none of it needs touching.

1. **Register them** in `src/components/ads/partners.ts`: add the slug to
   `PartnerSlug` and an entry to `PARTNERS` — canonical lowercase `slug`, the
   capitalised `linkSegment` the links will be *written* as, `displayName` for
   the FTC disclosure, the bare `href`, a `campaign` of their own, the
   `fonts` their creatives set text in, and `options` `1`/`2`/`3` with each
   unit's code (`2a`/`2b`/`2c`), its design-doc name (`Sticker`, `Swoosh`)
   and its alt text (`PartnerOptionMeta` requires all three). The path regex, the
   `@font-face` rules, the boot script and the `<html>` attribute all rebuild
   themselves from this.
2. **Cut the creatives** in `<slug>Turn2.tsx`, one file per advertiser so that
   editing one buyer's units can never alter another's while theirs are live in
   a pitch. Transcribe the design doc rather than eyeballing it. Logos are CSS
   `background-image` from `public/img/p/<xx>-*.png` with neutral filenames,
   both sizes always in the DOM, swapping at `SWAP_PX` and never a literal.
   Register the renderer in `PARTNER_CREATIVES` in `PartnerSlot.tsx`; the
   `Record<PartnerSlug, …>` type means a half-added partner will not compile.
3. **Ship the faces.** Every family the creatives set text in needs a latin
   woff2 under `public/fonts/partners/v1/` with its OFL file, a README row
   and a `PartnerFontFace` listed in the entry's `fonts` (see "Self-hosted
   fonts"). A face already in the directory is listed, not copied.
4. **Open the route** in `next.config.js` by adding the slug to the two
   `:partner(…)` alternations. It is CommonJS and cannot import the registry,
   which is why `partnerPrefix.test.ts` reads the config as text and fails when
   a registered slug has no rule. Keep it an allowlist — a bare `:partner`
   would serve the whole site under any `/partners/<anything>/1` URL. An
   advertiser with no iframe shell needs no casing no-op rule.

Then verify as below. The unit suite already runs every slot invariant across
the whole registry (`EVERY_UNIT` in `partnerSlot.test.tsx`), so a new
advertiser inherits the artwork-path, no-`<img>`, both-sizes, offer-present,
swap-point and font-coverage checks for free. Only a browser proves the
units. Registering an advertiser does not put them live. That is a separate
edit to `LIVE_PLACEMENT`.

## Recipe: change something only under the links

This is the pattern for "hide X for the advertiser", "make Y scroll on the
demo", "swap Z under the prefix". It is how the locked layouts, the landing
hero's fold slack and the sign-in asks (the eleven rows of the table in
`references/mechanics.md`) were done, and it keeps
invariant 2 by construction. Decide
first which audience the rule is for.

1. In `PartnerSlot.tsx`, export an attribute and its props object next to the
   existing ones:
   `export const THING_ATTR = "data-cm-thing"; export const THING_PROPS = { [THING_ATTR]: "" } as const;`
2. Add one rule to `partnerSlotCss`, scoped to the right attribute. A rule
   for the advertiser's walkthrough only, which a real visitor must never
   get, is `html[${PREVIEW_ATTR}] [${THING_ATTR}]{...}`. A rule the banner
   itself needs whenever it is on the page, for either audience, is
   `html[${PARTNER_ATTR}] [${THING_ATTR}]{...}`. The selector's specificity
   beats any MUI `sx` class, so no `!important` is needed.
3. Spread the props on the element: `<Box {...THING_PROPS} sx={...}>`. When the
   element is only relevant in some state (signed out, no game loaded), spread
   conditionally, `{...(signedOut ? THING_PROPS : {})}`, so someone demoing
   while signed in keeps their controls.
4. Two things silently defeat the rule. An **inline `style`** on the marked
   element outranks every selector (this bit the profile card). A **component
   that does not forward unknown props** drops the attribute (`PanelCard` takes
   explicit props only); wrap it in a plain `<div {...THING_PROPS}>` with no
   inline style.
5. Add the test: the rule appears in `partnerSlotCss`, scoped to the attribute
   you chose and never to the other one or unscoped. Copy the shape of
   "sign-in affordances hide under the prefix, and only there" (keyed on
   `PREVIEW_ATTR`) or "the viewport-locked layouts show their overflow
   whenever a banner is on the page" (keyed on `PARTNER_ATTR`) in
   `partnerPrefix.test.ts`.
6. Verify in a real browser on a production build at desktop and phone width
   (recipe below), on a prefixed URL and on a bare one. With a live
   placement the bare URL carries the banner too, so the bare check is what
   proves a preview-only rule stayed preview-only. The phone drawer has its
   own copies of some controls (its Sign in row is separate from the nav
   pill's), so open it with `button[aria-label="Open menu"]` before
   surveying.

Leave `AICoachChat.tsx`, the hallucination validator, the Neo4j retrieval
layer, the Stockfish bridge and the Maia contract alone for this surface.
Everything so far was done without them; if a change seems to need one, say
so rather than opening them.

## Recipe: navigation keeps the prefix

Preview only. The bindings compute `prefix` with `partnerPrefixOf`, which is
null on a bare URL, so with the live banner on a bare page nothing is patched
and nothing is rewritten. Every link and `router.push` in the app points at
the bare path. Under a prefix the bindings keep it, and three facts about
Next 15.5 decide how (each one was learned the hard way, in Chromium):

- `useRouter()` returns a fresh public copy on every render whose methods
  delegate to `Router.router` at call time. Patch the instance, not the copy,
  or the patch is lost on the next render and never reaches `window.next.router`.
- The client resolves rewrites only when `url` and `as` agree. Send the
  prefixed path as **both**, resolved first with Next's own `resolveHref`
  (`next/dist/client/resolve-href`). With the href left bare, dynamic routes
  fall back to a full load ("Failed to lookup route: /learn/w-london").
- The App Router's `Link` calls `dispatchNavigateAction` directly and never
  `router.push`. On those pages a capture-phase click handler rewrites the
  href and does a full load of the prefixed URL.

Anchor hrefs are also rewritten on `mousedown`, `click` and `contextmenu`, so
plain `<a href>` buttons, ctrl-clicks into a new tab and "copy link address"
carry the prefix. Not covered, on purpose: server-side redirects
(`/openings` → `/learn`, auth bounces) and the three `window.location.href`
assignments (two in the Lichess flows, one in `PlayerFeedbackResults`).

## Recipe: verify and ship

The unit suite proves the CSS and the helpers; only a browser on a production
build proves the page. Chromium in the remote environment cannot reach
production (proxy CA), so browser work happens against a local production
server and production gets curl.

1. `npx tsc --noEmit`, `npx vitest run src/components/ads`, then `npm test`
   (about 4 minutes).
2. Build and serve a production bundle:
   `bash .claude/skills/partner-preview/scripts/local-prod.sh 3123`
   (give the tool call a 10-minute timeout; pass `--no-build` when `.next` is
   already fresh). It stops any stale `next-server`, rebuilds, starts, and
   confirms the served `_buildManifest` id equals `.next/BUILD_ID`. A stale
   server answering the port is the most common false result; that last line
   is the check.
3. Survey the main pages under the prefix and bare:
   `node .claude/skills/partner-preview/scripts/survey.mjs`
   (banner, `<html>` attribute, anything clipped inside a locked box, visible
   sign-in asks, at 1280×900 and 390×844 with the drawer open). With a live
   placement the bare rows show `banner=1 attr=chessusa:2` too, and on the
   Pages Router routes their asks lists are not empty (`/faq`, an App Router
   page with no NavPill, lists none either way). Then write the checks
   specific to the change the same way. `references/verification.md` has the
   patterns used for navigation, scrolling, sign-in, fonts, layout shift and
   the live mode.
4. When the change touches the live placement, the fonts, or anything mounted
   on every page, run the live-mode checks from `references/verification.md`
   on bare URLs: banner with `data-cm-partner="chessusa:2"` and no
   `data-cm-preview`, `utm_content=2b`, `rel="sponsored noopener noreferrer"`,
   sign-in asks present, router not patched, no noindex meta (course pages
   `/learn/<id>` are noindex by design), font preloads under
   `/fonts/partners/` with `crossorigin` (select on that href prefix, since
   App Router pages also carry Next's own Inter preload),
   `document.fonts.check` true for Archivo and IBM Plex Mono, no
   cross-origin request other than the consent-gated analytics hosts
   (`googletagmanager.com`, `google-analytics.com`, the Firebase SDK's
   `*.googleapis.com`), and none at all in a context without the consent
   cookie, CLS small. The exclusions set no
   attribute and the slot stays empty (the framed route renders its own
   banner). The previews still hide the asks and patch the router.
5. When a change touches code mounted on every page, also run the critical
   journeys locally,
   `npx playwright test --project=local-desktop-light --project=local-mobile-light`
   (about 19 minutes). CI's `build-and-e2e` runs one Playwright project per
   matrix leg since 2026-09-22 (`ci.yml`) and does report: the last green
   run, on 2026-10-13, took 12m31s for the desktop leg and 13m32s for the
   mobile one, inside the 25-minute budget. It is still not a required
   check, so running the journeys locally remains worthwhile, and a leg
   that is cancelled is a regression to report rather than the normal
   result. `puzzle-one-screen.spec.ts` is in that run and its floors are
   banner-aware.
6. Commit with a message file (`git commit -a -F msg.txt`), push, open the PR,
   wait for `typecheck-and-test` (the real gate, a few minutes: 3m19s on
   2026-10-13, up to about 10 on a slow runner), then
   squash-merge with `expectedHeadSha`.
7. After Vercel deploys (about 5 minutes), curl production for a marker only
   the new build carries. For the live placement and the fonts those are: the
   boot script in any page's HTML contains `{"slug":"chessusa","option":"2"}`,
   the inline `<style>` contains the `@font-face` rules for
   `/fonts/partners/v1/`,
   `https://www.chessmasti.com/fonts/partners/v1/archivo-latin.woff2` answers
   200 with `cache-control: public, max-age=31536000, immutable`, and
   `/privacy` contains "Sponsors". The `<html>` attribute is set by JS and
   never appears in curl output. Then: option links 200 with
   `x-robots-tag: noindex, nofollow`, bare `/puzzles` 200 without it and with
   zero `aria-label="Advertisement` (the banner is client-rendered, so that
   stays zero live or not).

`references/pitfalls.md` is the list of things that cost real time in this
repo: stale servers, `ss` missing, prettier churn on files that were never
prettier-clean, modal scroll locks that look like layout locks, the puzzles
lock needing 870px of height, the live banner read as a leak, git after a
squash merge, and more. Skim it before the first build.

## Reporting

Say what was verified and how (browser on a local production build versus
curl on production), name what is deliberately not covered, say whether the
live placement was checked on bare URLs as well as the previews, and give
the links as the advertiser will open them, in their own capitalisation:
`/partners/ChessUSA/1`, `/2`, `/3` and `/partners/ChessHouse/1`, `/2`, `/3`.
