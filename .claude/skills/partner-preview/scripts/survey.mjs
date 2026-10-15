// Per-page survey of the partner surface against a local production server.
// For each route, under the prefix and bare, at 1280x900 and 390x844 (drawer
// open on the phone): banner present, the data-cm-partner attribute, the
// locked box's overflow and clipped pixels, page scroll, and every visible
// sign-in ask. Prints one line per page. Anything unexpected is visible at a
// glance.
//
// Reading the output while a live placement is set (LIVE_PLACEMENT in
// src/components/ads/partners.ts): the bare rows show banner=1 and
// attr=chessusa:2 as well, which is the live banner and not a leak. Only the
// prefixed rows should have an empty asks list, and the bare Pages Router
// rows should list the usual asks (nav Sign in, the coach gate, the rail
// chip, the captions). /faq is an App Router page with no NavPill and lists
// none on either kind of row. The data-cm-preview attribute is not printed,
// so a prefixed row and a bare row are told apart by the URL column and the
// asks. With no live placement the bare rows read banner=0 attr=-. Under a
// banner the locked boxes read "visible" on both kinds of row, /puzzles and
// /analysis both with clipped=0px at 1280x900 and 1440x900: the rule shows
// overflow and nothing else, and on those viewports nothing is squeezed out.
// A clipped figure above 0 is overflow the page scrolls by (max= grows by
// the same amount), not a clip. Without a banner the 1280x900 rows read
// "hidden". The
// 390x844 rows read "visible" either way, since neither layout locks at
// phone width.
//
//   node .claude/skills/partner-preview/scripts/survey.mjs
//   BASE=http://127.0.0.1:3123 PREFIX=/partners/ChessUSA/1 ROUTES=/,/puzzles SHOTS=/tmp/shots node …
//
// Requires the repo's own Playwright; CHROMIUM_PATH overrides the browser
// binary (the remote environment has one under /opt/pw-browsers).
import { createRequire } from "module";
import { existsSync, readdirSync } from "fs";
import { execSync } from "child_process";

const root = execSync("git rev-parse --show-toplevel").toString().trim();
const { chromium } = createRequire(`${root}/package.json`)("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:3123";
const PREFIX = process.env.PREFIX || "/partners/ChessUSA/1";
const ROUTES = (process.env.ROUTES || "/,/plan,/play,/analysis,/practice,/puzzles,/learn,/scout,/courses,/profile,/database,/faq").split(",");
const SHOTS = process.env.SHOTS;

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const dir = "/opt/pw-browsers";
  if (!existsSync(dir)) return undefined;
  const hit = readdirSync(dir).find((d) => d.startsWith("chromium-"));
  return hit ? `${dir}/${hit}/chrome-linux/chrome` : undefined;
}

const ASK = /sign in|sign up|sign-in|create account|free account|log in|not signed in/i;
const b = await chromium.launch({ executablePath: chromiumPath(), args: ["--no-sandbox"] });

async function settle(p, mobile) {
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.waitForTimeout(800);
  for (let i = 0; i < 3 && (await p.locator('[role="dialog"]').count()); i++) {
    await p.keyboard.press("Escape");
    await p.waitForTimeout(300);
  }
  if (mobile) {
    const m = p.locator('button[aria-label="Open menu"]');
    if (await m.count()) { await m.click(); await p.waitForTimeout(500); }
  }
}

const measure = (p) => p.evaluate((src) => {
  const re = new RegExp(src, "i");
  const asks = [];
  for (const el of document.querySelectorAll("a, button, p, span, div, h1, h2, h3, input, textarea")) {
    const t = ["INPUT", "TEXTAREA"].includes(el.tagName) ? el.getAttribute("placeholder") || "" : (el.childElementCount === 0 ? el.textContent || "" : "");
    if (!re.test(t) || !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    asks.push(`${(el.closest("a, button") || el).tagName.toLowerCase()} "${t.trim().slice(0, 40)}"`);
  }
  const lock = document.querySelector("[data-cm-viewport-lock]");
  const cs = lock ? getComputedStyle(lock) : null;
  scrollTo(0, 1e6); const maxScroll = scrollY; scrollTo(0, 0);
  return {
    path: location.pathname,
    banner: document.querySelectorAll('aside[aria-label^="Advertisement"]').length,
    attr: document.documentElement.getAttribute("data-cm-partner"),
    lock: lock ? `${cs.overflowY} clipped=${lock.scrollHeight - lock.clientHeight}px` : "-",
    scroll: `docH=${document.documentElement.scrollHeight} ih=${innerHeight} max=${maxScroll}`,
    asks: [...new Set(asks)],
  };
}, ASK.source);

for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  const mobile = vp.width < 600;
  const c = await b.newContext({ viewport: vp });
  await c.addCookies([{ name: "cm_consent", value: "accepted", domain: new URL(BASE).hostname, path: "/" }]);
  for (const prefixed of [true, false]) {
    console.log(`\n=== ${vp.width}x${vp.height}  ${prefixed ? "under " + PREFIX : "bare"} ===`);
    for (const r of ROUTES) {
      const url = BASE + (prefixed ? PREFIX + (r === "/" ? "" : r) : r);
      const p = await c.newPage();
      try {
        await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await settle(p, mobile);
        const m = await measure(p);
        const moved = m.path.toLowerCase() !== new URL(url).pathname.toLowerCase() ? `  (landed on ${m.path})` : "";
        console.log(`${r.padEnd(11)} banner=${m.banner} attr=${m.attr ?? "-"}  lock: ${m.lock}  ${m.scroll}${moved}${m.asks.length ? "\n" + " ".repeat(12) + "asks: " + m.asks.join(" | ") : ""}`);
        if (SHOTS) await p.screenshot({ path: `${SHOTS}/${vp.width}-${prefixed ? "prefixed" : "bare"}${(r === "/" ? "/home" : r).replace(/\//g, "_")}.png` });
      } catch (e) {
        console.log(`${r.padEnd(11)} ERROR ${String(e.message).slice(0, 80)}`);
      }
      await p.close();
    }
  }
  await c.close();
}
await b.close();
