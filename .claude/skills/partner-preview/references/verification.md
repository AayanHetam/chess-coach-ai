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
}));
```

Under a prefix: `banner === 1` and `attr` is the option. On a bare URL: `0` and
`null`, and `.cm-partner-slot` has computed `display: none`.

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

## Locked layouts

```js
const m = await p.evaluate(() => {
  const el = document.querySelector("[data-cm-viewport-lock]");
  const cs = el ? getComputedStyle(el) : null;
  scrollTo(0, 1e6); const maxScroll = scrollY; scrollTo(0, 0);
  return {
    overflow: cs?.overflowY, height: el && Math.round(el.getBoundingClientRect().height),
    clipped: el ? el.scrollHeight - el.clientHeight : -1,
    docH: document.documentElement.scrollHeight, ih: innerHeight, maxScroll,
  };
});
```

Prefixed at 1280×900: `overflow === "visible"`, `clipped <= 1`, and either the
page fits (`docH <= ih`) or it scrolls (`maxScroll > 0`). Bare: `overflow ===
"hidden"`, `height === ih`, `maxScroll === 0`. Take a screenshot scrolled to
the bottom and look at it; "nothing clipped" is a number, "looks right" is not.

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

Prefixed: empty on every page, both widths, drawer open. Bare: the expected
asks present (nav Sign in, the coach gate, the rail chip, the captions).
Dedupe hides two elements with the same text; count `[data-cm-sign-in]`
elements with `display: none` versus not when that matters.

## Layout shift

Install before navigation with `context.addInitScript`:

```js
window.__cls = 0;
new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
  .observe({ type: "layout-shift", buffered: true });
```

Read `window.__cls` after settling. Compare the prefixed page with the bare
one; the banner adds nothing when the difference is under 0.01. Record the
shift sources (`e.sources[].node`) when a number needs explaining.

## Production, with curl

Chromium cannot reach production from the remote environment, so:

1. Poll a marker only the new build carries in server-rendered HTML (a new
   CSS rule from `partnerSlotCss`, a new `data-cm-*` attribute on a page that
   renders it on the server such as `/puzzles`). Not a URL the boot script
   always carried.
2. Then: `curl -sI https://www.chessmasti.com/partners/ChessUSA/1/practice`
   → `HTTP/2 200` and `x-robots-tag: noindex, nofollow`; an uppercase
   spelling and an App Router path behave the same; bare `/puzzles` → 200 with
   no `x-robots-tag` and zero `aria-label="Advertisement` in the body; the
   scoped rule present and no unscoped copy:
   `grep -o '[^}]*\[data-cm-sign-in\][^}]*}' | grep -vc 'html\[data-cm-partner\]'` → 0.
