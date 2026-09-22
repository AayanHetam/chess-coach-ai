/**
 * CLS probe — what the layout-stability work was measured with.
 *
 * Drives a real Chromium against a running site, records every layout-shift
 * entry with the DOM nodes Chrome attributes it to, and prints a per-route
 * score plus the worst individual shifts. The attribution is the point: a
 * bare number tells you a page moved, this tells you which element moved and
 * when, which is the difference between a finding and a guess.
 *
 * Throttled by default, and that is not decoration. CLS is a function of how
 * long a page sits in its pre-hydration state, so an unthrottled run on a dev
 * machine reports 0.0000 for bugs that cost a real visitor 0.3. Every finding
 * this repo has on the subject was invisible without the throttle.
 *
 * Not in CI — tests/e2e/local/layout-stability.spec.ts is the automated
 * guard, with budgets rather than attribution. This is the tool you reach for
 * when the spec goes red and you need to know why, or when you want to sweep
 * routes the spec does not cover.
 *
 *   # the deployed site
 *   node scripts/perf/cls-probe.mjs --base https://www.chessmasti.com --virgin
 *
 *   # a local production build (npm run build && npx next start -p 3210)
 *   node scripts/perf/cls-probe.mjs --profile desktop --routes /plan,/scout
 *
 * Flags:
 *   --base <url>      default http://127.0.0.1:3210
 *   --profile         mobile (iPhone 13, default) | desktop
 *   --routes a,b,c    default: the main product surfaces
 *   --cpu <n>         CPU throttle multiplier, default 4
 *   --virgin          no seeded localStorage, i.e. a genuine first visit —
 *                     consent banner and welcome tour included. This is the
 *                     honest default for a Core Web Vitals question, since
 *                     the field metric is dominated by first visits.
 *   --no-stubs        do not stub /api/maia-status. Off by default because
 *                     locally MAIA_API_URL is unset, /api/maia-status answers
 *                     "not configured", and the Lc0DownloadBanner then
 *                     inserts 222px above every non-self-chromed page —
 *                     worth 0.26 of CLS that production, where Maia is
 *                     healthy, never pays. Pass this to measure that case
 *                     deliberately.
 *   --out <file>      write the raw entries as JSON
 *
 * Needs a Chromium. Set CHROME_PATH if the bundled Playwright one is not
 * where this expects it.
 */
import { chromium, devices } from "@playwright/test";
import fs from "node:fs";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};

const BASE = arg("base", "http://127.0.0.1:3210");
const PROFILE = arg("profile", "mobile");
const OUT = arg("out", "");
const CPU_RATE = Number(arg("cpu", "4"));
const VIRGIN = process.argv.includes("--virgin");
const NO_STUBS = process.argv.includes("--no-stubs");

const ROUTES = (arg("routes", "") || [
  "/",
  "/plan",
  "/practice",
  "/learn",
  "/courses",
  "/puzzles",
  "/scout",
  "/free-ai-chess-coach",
  "/chess-basics",
].join(",")).split(",");

/** Installed before any page script runs, so no shift escapes the observer. */
const PROBE = `
  window.__cls = { total: 0, entries: [] };
  const describe = (node) => {
    if (!node || node.nodeType !== 1) return "(detached)";
    const el = node;
    const id = el.id ? "#" + el.id : "";
    const cls = (typeof el.className === "string" && el.className)
      ? "." + el.className.trim().split(/\\s+/).slice(0, 3).join(".")
      : "";
    const text = (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 48);
    const data = el.dataset && el.dataset.testid ? "[data-testid=" + el.dataset.testid + "]" : "";
    const path = [];
    for (let n = el; n && n.nodeType === 1 && path.length < 6; n = n.parentElement) {
      const c = (typeof n.className === "string" && n.className)
        ? "." + n.className.trim().split(/\\s+/).filter((x) => !/^css-/.test(x)).slice(0, 2).join(".")
        : "";
      path.unshift(n.tagName.toLowerCase() + (n.id ? "#" + n.id : "") + c
        + (n.dataset && n.dataset.testid ? "[" + n.dataset.testid + "]" : ""));
    }
    return el.tagName.toLowerCase() + id + cls + data + (text ? ' "' + text + '"' : "")
      + "\\n           path: " + path.join(" > ")
      + "\\n           html: " + (el.outerHTML || "").replace(/\\s+/g, " ").slice(0, 200);
  };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__cls.total += e.value;
      window.__cls.entries.push({
        value: e.value,
        time: Math.round(e.startTime),
        sources: (e.sources || []).map((s) => ({
          node: describe(s.node),
          from: s.previousRect,
          to: s.currentRect,
        })),
      });
    }
  }).observe({ type: "layout-shift", buffered: true });
`;

const run = async () => {
  const useProxy = BASE.startsWith("https://") && process.env.HTTPS_PROXY;
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    ...(useProxy
      ? {
          proxy: { server: process.env.HTTPS_PROXY },
          args: ["--ignore-certificate-errors"],
        }
      : {}),
  });
  const ctx = await browser.newContext({
    ...(PROFILE === "mobile"
      ? { ...devices["iPhone 13"], browserName: undefined, isMobile: true }
      : { viewport: { width: 1280, height: 800 } }),
    colorScheme: "dark",
    // --virgin is the honest default for a Core Web Vitals question: the
    // field metric is dominated by first visits, which meet the consent
    // banner and the welcome tour. Seeding them away measures a returning
    // visitor instead, which is the easier case and not the one that scores.
    ...(VIRGIN
      ? {}
      : {
          storageState: {
            cookies: [],
            origins: [
              {
                origin: BASE,
                localStorage: [
                  { name: "cm-welcome-tour-v1", value: "1" },
                  { name: "cm-consent-v1", value: "accepted" },
                ],
              },
            ],
          },
        }),
  });
  await ctx.addInitScript(PROBE);

  // Model production, not this laptop. Locally MAIA_API_URL is unset, so
  // /api/maia-status answers "not configured" and the Lc0DownloadBanner
  // renders 222px above the page on every route that is not self-chromed.
  // Production has Maia healthy and never shows it, so leaving it in makes
  // every local number 0.2 worse than the thing being measured.
  if (!NO_STUBS) {
    await ctx.route("**/api/maia-status", (r) =>
      r.fulfill({
        json: {
          lc0Available: true,
          maiaOptimal: true,
          maiaServiceConfigured: true,
          maiaServiceReachable: true,
          maiaModelLoaded: true,
          model: "maia2",
          message: "Maia-2 is running and ready for predictions",
        },
      }),
    );
  }

  const results = [];
  for (const route of ROUTES) {
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });

    try {
      await page.goto(BASE + route, { waitUntil: "load", timeout: 60_000 });
    } catch {
      /* keep whatever shifted before the timeout */
    }
    // Hydration, auth resolution, font swap, late images.
    await page.waitForTimeout(6000);
    // A scroll pass: lazy content below the fold shifts too.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(2500);

    const cls = await page.evaluate(() => window.__cls);
    results.push({ route, ...cls });
    await page.close();
  }

  await browser.close();

  const pad = (s, n) => String(s).padEnd(n);
  console.log(`\n=== CLS — ${PROFILE}, ${CPU_RATE}x CPU, Slow 4G, ${VIRGIN ? "FIRST visit" : "returning visitor"} — ${BASE} ===\n`);
  for (const r of results) {
    const flag = r.total > 0.25 ? "POOR" : r.total > 0.1 ? "NEEDS WORK" : "good";
    console.log(`${pad(r.route, 26)} ${r.total.toFixed(4)}  ${flag}`);
  }
  const sum = results.reduce((a, r) => a + r.total, 0);
  console.log(`\n${pad("TOTAL across routes", 26)} ${sum.toFixed(4)}`);
  console.log(`${pad("worst route", 26)} ${
    results.slice().sort((a, b) => b.total - a.total)[0]?.route
  }\n`);

  console.log("=== worst individual shifts ===\n");
  const all = results.flatMap((r) => r.entries.map((e) => ({ ...e, route: r.route })));
  for (const e of all.sort((a, b) => b.value - a.value).slice(0, 18)) {
    console.log(`${e.value.toFixed(4)}  ${pad(e.route, 20)} @${e.time}ms`);
    for (const s of e.sources.slice(0, 3)) {
      const d = s.from && s.to ? `  (${Math.round(s.from.y)} -> ${Math.round(s.to.y)} y, ${Math.round(s.from.height)} -> ${Math.round(s.to.height)} h)` : "";
      console.log(`         ${s.node}${d}`);
    }
  }

  if (OUT) fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
