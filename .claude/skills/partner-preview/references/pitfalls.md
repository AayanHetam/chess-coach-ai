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
- **The puzzles lock needs height.** `heightLocked` is `lg` **and**
  `min-height: 870px`. At 1280×800 the page flows on bare URLs too; measure
  locks at 1280×900.
- **Phone width hides the nav.** Links live in the drawer; click
  `button[aria-label="Open menu"]` first. Use Playwright's `:visible`
  pseudo-class to pick a link; `checkVisibility()` disagrees with Playwright's
  notion of visible for drawer contents.
- **Text scans miss `textarea` placeholders** (the coach composer is
  multiline). Include `textarea` when scanning placeholders.
- **`grep -c` on a marker string can match the boot script**, which carries
  `FONT_HREF` and the prefix regex as string literals. Match the tag
  (`<link rel="stylesheet" href="https://fonts.googleapis.com/…Archivo`) or a
  CSS rule, not a bare URL.
- **CLS is not zero on `/analysis` even bare** (about 0.29): the surface is
  `ssr:false` and its own client render shifts. Compare prefixed against bare
  on the same page; the banner adds nothing when the delta is under 0.01.
- **`/analysis?gameId=<fake>` throws an IndexedDB key error** on bare and
  prefixed alike. Not this surface's.

## Next.js internals

- `useRouter()` in the Pages Router hands out a fresh public copy per render
  of `AppContainer` whose methods delegate to `Router.router`. Patch the
  instance.
- Client-side rewrite resolution runs only when `url` and `as` agree
  (`shouldResolveHref`). Pass the prefixed path as both.
- The App Router `Link` bypasses `router.push` (`dispatchNavigateAction`).
- The rewrite regex in the boot script and `PARTNER_PATH_RE` must stay in
  step; a test executes the boot script against every accepted spelling.
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
  string replacement and leave formatting alone. CI does not enforce prettier
  (`tsc` + vitest only); `next lint` only warns.
- **Inline `style` beats the scoped rule.** A wrapper with
  `style={{ display: "contents" }}` never hides.
- **Components with explicit props drop `data-*` attributes** (`PanelCard`).
  Wrap in a plain element.
- **Two big files are touched with one attribute each** (`AnalysisImpl.tsx`
  10k lines, `puzzles.tsx`). Anchor edits on unique multi-line strings; verify
  the diff shows only the intended hunks (`git diff -U0 <file>`).
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
- `typecheck-and-test` is the required gate (about 10 minutes).
  `build-and-e2e` hits `timeout-minutes: 25` and is cancelled, which reports
  nothing; run the critical journeys locally when touching global code.
- Codex reviews PRs when its quota allows. Reply once per thread and resolve
  it, with the Claude Code attribution footer.
- Chromium in the remote environment cannot validate the proxy CA against
  production; verify production with curl markers only. Never disable TLS
  verification.
- Vercel deploys `main` about 5 minutes after the merge. Poll a marker only
  the new build carries; a marker that also matches the old build (a URL the
  boot script always carried) reports "deployed" on the first poll.
- One-hour fallback check-ins (`send_later`) are worth arming while a PR
  waits on CI; delete the trigger once merged.
