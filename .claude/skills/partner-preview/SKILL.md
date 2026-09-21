---
name: partner-preview
description: How the Chess Masti partner preview surface works and how to change it safely. That is the /partners/ChessUSA/1, /2 and /3 links that show a sponsor banner under the nav on every page, the attribute-scoped rules that alter pages only under those links (locked layouts scroll, sign-in asks hidden), the prefix-preserving navigation, and the routine for verifying a change in a real browser on a production build before merging. Use this whenever the user mentions the ChessUSA links, the partner or advertiser preview, the banner or ad slot, /partners/ URLs, the sales demo, sponsor creatives, hiding or changing something "only for the advertiser" or "under the prefix", or asks why a page looks or behaves differently on the partner links, even when they never say "preview". Also reach for it when any UI change in this repo has to be proven on a production build with Playwright rather than with unit tests alone.
---

# Partner preview surface (the ChessUSA links)

`https://www.chessmasti.com/partners/ChessUSA/1`, `/2` and `/3` serve the whole
product with one of three ChessUSA banners under the nav on every page. They are
a sales asset for one advertiser, not a live placement. Everything about the
surface is built so that a real visitor on a normal URL is never affected and
never pays for it, and so that the advertiser walks the real product.

Read this before touching anything under `src/components/ads/`, the rewrites or
headers in `next.config.js`, the two locked layouts (`AnalysisImpl.tsx`,
`pages/puzzles.tsx`), or any element that should behave differently "only for
the advertiser".

## The five invariants, and why each exists

1. **The option lives in the URL and nowhere else.** No cookie, no storage.
   With no stored state there is no sequence of clicks that puts a visitor on
   `/puzzles` into a state where an unapproved advertisement renders. Leave the
   prefix by typing a URL and the banner is gone. Keep it that way.
2. **Zero cost and zero change for real visitors.** The slot is `display:none`
   for them, logos are CSS `background-image` (a hidden `<img>` still
   downloads, a hidden background does not), the webfonts load only under the
   prefix, and every page alteration is one CSS rule scoped to
   `html[data-cm-partner]`.
3. **Zero layout shift.** The slot's final height is reserved by plain CSS in
   `<head>` before first paint. The Pages Router has no Emotion SSR, so an MUI
   `sx` rule cannot reserve anything; that is why the CSS is a string in
   `PartnerSlot.tsx` injected by `_document.tsx` and `app/layout.tsx`.
4. **No hydration mismatch.** Most pages are statically optimised, so the
   server cannot know the prefix. Anything that depends on the URL is read in
   an effect, never during render. `PartnerSlot` renders the same empty wrapper
   on both sides and fills it after mount.
5. **Never show one surface labelled as another.** The iframe shell at
   `/partners/chessusa` renders the same creatives the links serve. No
   stand-ins or placeholders on the live domain, ever.

Also: `X-Robots-Tag: noindex, nofollow` on everything under `/partners/`, and
every analytics guard (Vercel Analytics `beforeSend`, `AnalyticsProvider`, the
gtag `send_page_view` flag) goes through one predicate, `isPartnerPreviewPath`,
which is case-insensitive because the rewrites are.

## Map

| Piece | Where |
|---|---|
| Activation: rewrites `/partners/chessusa/:option(1\|2\|3)/:path*` → `/:path*` (plus the root and a casing no-op), the `/partners/:path*` noindex header, the frame-ancestors exception for the iframe route | `next.config.js` (the live config; `next.config.ts` is inert) |
| The slot itself: `PARTNER_PATH_RE`, the `<html>` attribute, `partnerSlotCss`, `partnerBootScript`, `partnerPrefixOf`, `prefixPath`, `anchorRewriteHandler`, `VIEWPORT_LOCK_PROPS`, `SIGN_IN_PROPS`, `isPartnerPreviewPath`, the `PartnerSlot` component | `src/components/ads/PartnerSlot.tsx` |
| Router bindings that keep the prefix on navigation | `PartnerSlotPages.tsx` (Pages Router), `PartnerSlotApp.tsx` (App Router) |
| The banner (sizes, swap point, FTC label, UTM) and the three creatives | `PartnerBanner.tsx`, `chessusaTurn2.tsx`, `chessusaCreative.tsx`, `previewOptions.ts`; artwork in `public/img/p/` with neutral filenames |
| Mount points | `ui/NavPill.tsx` (after the header), `sections/layout/index.tsx` (bare routes, minus `/auth/age`), `app/layout.tsx` |
| Iframe shell and the page it frames | `pages/partners/chessusa/index.tsx`, `live.tsx` |
| Tests | `src/components/ads/__tests__/` (node environment, no jsdom) |

`references/mechanics.md` walks a request from URL to painted banner and lists
every element currently marked. Read it when the change touches the slot,
the bindings or the creatives.

## Recipe: change something only under the links

This is the pattern for "hide X for the advertiser", "make Y scroll on the
demo", "swap Z under the prefix". It is how the locked layouts and the nine
sign-in asks were done, and it keeps invariant 2 by construction.

1. In `PartnerSlot.tsx`, export an attribute and its props object next to the
   existing ones:
   `export const THING_ATTR = "data-cm-thing"; export const THING_PROPS = { [THING_ATTR]: "" } as const;`
2. Add one rule to `partnerSlotCss`, scoped:
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
5. Add the test: the rule appears in `partnerSlotCss`, and never unscoped. Copy
   the shape of "sign-in affordances hide under the prefix, and only there" in
   `partnerPrefix.test.ts`.
6. Verify in a real browser on a production build at desktop and phone width
   (recipe below). The phone drawer has its own copies of some controls (its
   Sign in row is separate from the nav pill's), so open it with
   `button[aria-label="Open menu"]` before surveying.

Leave `AICoachChat.tsx`, the hallucination validator, the Neo4j retrieval
layer, the Stockfish bridge and the Maia contract alone for this surface.
Everything so far was done without them; if a change seems to need one, say
so rather than opening them.

## Recipe: navigation keeps the prefix

Every link and `router.push` in the app points at the bare path. The bindings
keep the prefix, and three facts about Next 15.5 decide how (each one was
learned the hard way, in Chromium):

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
assignments in the Lichess flows.

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
   sign-in asks, at 1280×900 and 390×844 with the drawer open). Then write the
   checks specific to the change the same way; `references/verification.md`
   has the patterns used for navigation, scrolling, sign-in and layout shift.
4. When a change touches code mounted on every page, also run the critical
   journeys locally,
   `npx playwright test --project=local-desktop-light --project=local-mobile-light`
   (about 19 minutes). CI's `build-and-e2e` is cancelled at its 25-minute
   ceiling and reports nothing.
5. Commit with a message file (`git commit -a -F msg.txt`), push, open the PR,
   wait for `typecheck-and-test` (about 10 minutes, the real gate), then
   squash-merge with `expectedHeadSha`.
6. After Vercel deploys (about 5 minutes), curl production for a marker only
   the new build carries (a new attribute or rule in server-rendered HTML),
   then: option links 200 with `x-robots-tag: noindex, nofollow`, bare
   `/puzzles` 200 without it and with zero `aria-label="Advertisement`.

`references/pitfalls.md` is the list of things that cost real time in this
repo: stale servers, `ss` missing, prettier churn on files that were never
prettier-clean, modal scroll locks that look like layout locks, the puzzles
lock needing 870px of height, git after a squash merge, and more. Skim it
before the first build.

## Reporting

Say what was verified and how (browser on a local production build versus
curl on production), name what is deliberately not covered, and give the
links as the advertiser will open them: `/partners/ChessUSA/1`, `/2`, `/3`.
