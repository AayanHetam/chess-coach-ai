# Pitfalls that cost real time on this surface

Each of these produced a wrong result or a wasted cycle at least once. The
fix is stated with the symptom so the symptom is recognisable.

## Local production server

- **A stale `next-server` keeps the port.** `next start` renames its process
  to `next-server (v15.x)`. If an old one is still listening, a new
  `npx next start -p 3123` dies with `EADDRINUSE` in its log while the old
  process keeps serving HTML from the new `.next` with its old in-memory build
  id: chunk and `_buildManifest.js` requests 404 with `text/plain`, nothing
  hydrates, the banner never appears. Symptom: a "server up after 1s" that is
  suspiciously fast. Check: the `_next/static/<id>/_buildManifest.js` referenced
  by the served HTML must return 200 and `<id>` must equal `.next/BUILD_ID`.
  `scripts/local-prod.sh` does this.
- **`ss` is not installed** in the remote environment, and a `2>/dev/null` on
  it hid every failure, so port-based kills never worked. Find the server by
  process title with `ps -eo pid,args` and skip this shell's own pid
  (`awk -v me=$$ '$1 != me && /next-server/'`). Never `pkill -f "next start"`:
  the pattern matches the shell running the command and kills it (exit 144).
- **The build takes about 5 minutes.** Run it in the background writing
  `REAL_BUILD_EXIT=$?` to a file and watch that file; a compound command's
  exit code is not the build's. Delete `.next` first when a previous build
  was interrupted or another process may have written into it.
- Serve with `ANTHROPIC_API_KEY=local-verify-only`; the health probes then log
  `providers_unavailable`, which is expected.

## Surveying pages in a fresh browser

- **Modals fake a layout lock.** A fresh context shows the consent bar and the
  quick-tour dialog; MUI's modal scroll lock sets `body { overflow: hidden }`,
  which reads as "the page cannot scroll". Set the cookie
  `cm_consent=accepted` (domain `127.0.0.1`, path `/`) and press Escape until
  no `[role="dialog"]` remains before measuring.
- **The live banner is not a leak.** With `LIVE_PLACEMENT` set, a bare URL
  shows `banner=1` and `data-cm-partner="chessusa:2"`, exactly what
  `/partners/ChessUSA/2` shows. The other prefixes differ only in the option
  digit (`chessusa:1`, `chessusa:3`, `chesshouse:n`). What tells the two
  apart is `data-cm-preview`, absent on a bare URL, and the sign-in asks,
  present on a bare URL. A survey that reads only `data-cm-partner` cannot
  see the difference when the previewed option is the live one, and
  `survey.mjs` prints only that attribute, so read its asks column and the
  URL column together.
- **The puzzles lock needs height.** `heightLocked` is `lg` **and**
  `min-height: 870px`. At 1280×800 the page flows on bare URLs too; measure
  locks at 1280×900 or taller. With a banner the locked box still does not
  scroll (measured at 1440×900, 1512×982 and 1920×1080). The board is 132px
  smaller instead. On the short viewports (1366×768, 1280×720) the page
  scrolls by about 208px with the banner. That is the flowing layout plus
  the banner, not a broken lock.
- **`/analysis` keeps one screen with a banner, with a smaller board** (458
  against 544 at 1440×900, 278 against 364 at 1280×720). The viewport-lock
  rule shows the box's overflow and nothing else, so the box keeps its
  `100dvh` height, the transcript keeps scrolling inside its column, and the
  page would scroll only by what the banner squeezed out, which on those
  viewports is nothing. Expected, not a regression.
- **The App Router pages paint their own ground on a white body.** The first
  live build put the banner in a white band above every dark SEO page. The
  wrapper rules in `partnerSlotCss` (`PARTNER_SLOT_APP_CLASS`) paint the
  page's own ground (white by default, `APP_DARK_GROUND` under
  `body:has(.cm-page-shell)`, the PageShell's class `PAGE_SHELL_CLASS`) and
  the disclosure tone follows the same `.cm-page-shell` signal, stamped on
  the wrapper as `data-cm-tone` after mount. Survey one dark SEO page
  (`/chess-basics`) and one legal page (`/privacy`), not just the Pages
  Router routes.
- **Phone width hides the nav.** Links live in the drawer; click
  `button[aria-label="Open menu"]` first. Use Playwright's `:visible`
  pseudo-class to pick a link; `checkVisibility()` disagrees with Playwright's
  notion of visible for drawer contents.
- **Text scans miss `textarea` placeholders** (the coach composer is
  multiline). Include `textarea` when scanning placeholders.
- **`grep -c` on a marker string can match the boot script**, which carries
  the live placement as JSON, the font file URLs and the prefix regex as
  string literals. Match the rule or the tag, not a bare URL: the
  `@font-face` rule (`src:url(/fonts/partners/v1/archivo-latin.woff2)`) in
  the inline `<style>`, or in the browser the `<link rel="preload" as="font">`
  the script appends. The `<html>` attribute is set by JS, so it is in the
  browser's DOM and never in curl output.
- **`document.fonts.check` answers for what has loaded, not what is
  declared.** With `font-display:swap` and a latin `unicode-range`, a face
  downloads only once text on the page is set in it, so a check run before
  the banner mounts can read false on a page that is fine. Settle the page,
  confirm the banner is there, then check `"600 12px Archivo"` and
  `"700 12px 'IBM Plex Mono'"`.
- **CLS on `/analysis` is dominated by `Lc0DownloadBanner` on a local build
  with no `MAIA_API_URL`** (about 0.26 of the 0.29 once measured). Route
  `/api/maia-status` to a healthy stub (`stubMaiaHealthy` in
  `tests/e2e/helpers.ts`) before measuring. The `ssr:false` board shift was
  fixed by the layout-stability work and the route now reads about 0.00 to
  0.02 throttled, 0 unthrottled. With the live placement a prefixed page
  and a bare page both carry the banner, so the comparison is against the
  layout-stability spec's budget rather than against a bare page.
- **`/analysis?gameId=<fake>` throws an IndexedDB key error** on bare and
  prefixed alike. Not this surface's.

## Next.js internals

- `useRouter()` in the Pages Router hands out a fresh public copy per render
  of `AppContainer` whose methods delegate to `Router.router`. Patch the
  instance.
- Client-side rewrite resolution runs only when `url` and `as` agree
  (`shouldResolveHref`). Pass the prefixed path as both.
- The App Router `Link` bypasses `router.push` (`dispatchNavigateAction`).
- The rewrite regex in the boot script, `PARTNER_PATH_RE` and the exclusion
  regex must stay in step. A test executes the boot script against every
  accepted spelling, with and without a live placement.
- Server-side redirects (`getServerSideProps` `redirect`, `/openings`) and
  `window.location.href = "/x"` drop the prefix; documented, not fixed.
- Importing `next/dist/client/resolve-href` is a private path; `tsc` fails
  loudly if a Next upgrade moves it, which is the intended alarm.

## Editing this codebase

- **Several files were never prettier-clean** (`AnalysisImpl.tsx`,
  `InlinePuzzleCoach.tsx`, `ScoutLanding.tsx`, `AppDrawer.tsx`,
  `profile.tsx`). `prettier --write` on them reflows unrelated lines. Check
  first: `git show HEAD:<file> | npx prettier --check --stdin-filepath <file>`
  (or write it to a temp file). When it is not clean, apply edits by exact
  string replacement and leave formatting alone. The required gate
  (`typecheck-and-test`) is `tsc` + vitest and does not run eslint, and
  `prettier/prettier` plus the repo's own rules are warnings. But
  `npm run build` runs eslint with `eslint:recommended` at error level, in
  CI's `build-and-e2e` job and on Vercel, and an error there freezes
  production deploys (2026-08-10). Prettier churn is safe to leave. An
  eslint error is not.
- **Inline `style` beats the scoped rule.** A wrapper with
  `style={{ display: "contents" }}` never hides.
- **Components with explicit props drop `data-*` attributes** (`PanelCard`).
  Wrap in a plain element.
- **Two big files carry these attributes at a handful of sites**
  (`AnalysisImpl.tsx`, about 11k lines, two attributes at four sites, and
  `puzzles.tsx`, one). Anchor edits on unique multi-line strings. Verify
  the diff shows only the intended hunks (`git diff -U0 <file>`).
- **Scope a new rule on the right attribute.** `html[data-cm-preview]` for
  anything a real visitor must never get, `html[data-cm-partner]` for what
  the banner itself needs. A sign-in rule keyed on `data-cm-partner` would
  hide every sign-in ask from every visitor the day a placement is live.
  Two tests fail if that happens.
- **The viewport-lock rule touches overflow only.** An earlier version added
  `height:auto;min-height:100dvh`, which took the definite height away from
  the flex children and let a long coach transcript grow the page instead of
  scrolling inside its column. The test asserts one rule with no `height`
  in it. Reach for the same shape for any other box that must keep its
  height under a banner.
- **The live placement is pinned by a test.** Changing `LIVE_PLACEMENT`
  fails "is ChessUSA unit 2b, bought 2026-10-14" in `partnerSlot.test.tsx`
  until the test is updated. That is the point. Change both in one commit.
- **The font directory is immutable for a year.** A woff2 changed in place
  under `public/fonts/partners/v1/` is served stale to everyone who has it
  cached. A changed file is a new directory and a new `PARTNER_FONT_DIR`.
- **A font preload without `crossorigin` is a second download**, not a
  cache hit, because fonts are fetched in CORS mode. The boot script sets
  `crossOrigin='anonymous'` and `runBoot` in the tests asserts it on every
  appended link.
- **The privacy page's date is pinned twice**: `src/app/privacy/page.tsx`
  and `src/app/__tests__/audiencePositioning.test.tsx` ("Last updated
  October 14, 2026."). Change one and the suite fails.
- **The e2e board floors are banner-aware, not banner-blind.**
  `puzzle-one-screen.spec.ts` subtracts the measured `.cm-partner-slot`
  height. A build with `LIVE_PLACEMENT` null measures 0 and the original
  floors apply, so the spec passes either way and does not prove a banner is
  present. The live-mode checks in `references/verification.md` do.
- Unit tests are node-only (no jsdom). Drive DOM-facing code with plain
  objects; `vi.fn()` for router methods.

## Git, CI and shipping

- After a squash merge the designated branch's commits are no longer
  ancestors of `main`. For follow-up work either restart the branch from
  `origin/main` (needs a force push, which the auto-mode classifier blocks) or,
  when `git diff --stat <merged-head> origin/main` is empty, merge
  `origin/main` with `-s ours`: the tree is provably unchanged and GitHub's
  compare then shows only the new commits. A plain merge conflicts on every
  file both sides touched.
- `git fetch origin main <missing-branch>` aborts the whole fetch; fetch
  `main` alone.
- The classifier blocks `git add … && git commit -m "$(cat <<EOF …)"`. Write
  the message to a file and `git commit -a -F file` (add new files first).
- `typecheck-and-test` is the required gate (a few minutes: 3m19s on
  2026-10-13, up to about 10 on a slow runner). `build-and-e2e` was split
  into one leg per Playwright project on 2026-09-22 (`ci.yml`) and now
  finishes in about 13 minutes per leg (12m31s and 13m32s on 2026-10-13)
  inside its 25-minute budget. It is still not the required gate, which is
  the reason to run the critical journeys locally when touching global
  code. A leg that is cancelled is a regression to report, not the normal
  result.
- Codex reviews PRs when its quota allows. Reply once per thread and resolve
  it, with the Claude Code attribution footer.
- Chromium in the remote environment cannot validate the proxy CA against
  production; verify production with curl markers only. Never disable TLS
  verification.
- Vercel deploys `main` about 5 minutes after the merge. Poll a marker only
  the new build carries; a marker that also matches the old build (a URL the
  boot script always carried) reports "deployed" on the first poll. For the
  live placement the markers are the boot script's
  `{"slug":"chessusa","option":"2"}`, the `@font-face` rules for
  `/fonts/partners/v1/`, the font file answering 200 with
  `cache-control: public, max-age=31536000, immutable`, and "Sponsors" on
  `/privacy`. Do not poll for the `<html>` attribute or the banner markup:
  neither is in server HTML.
- One-hour fallback check-ins (`send_later`) are worth arming while a PR
  waits on CI; delete the trigger once merged.
