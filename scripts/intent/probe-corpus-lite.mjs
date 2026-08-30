// Probe the intent corpus with the PRODUCTION engine: stockfish-17-lite-single
// (the default every real browser gets — DEFAULT_ENGINE is Stockfish17Lite and
// chessmasti.com serves no COOP/COEP, so SharedArrayBuffer is absent and the
// "-single" build loads). Headless Chromium runs the exact worker file the
// site ships; the recipe is byte-identical to the native sweep's.
//
//   node scripts/intent/probe-corpus-lite.mjs <games.json> <out.json>
//
// Depth via DEPTH env (default 16). ONLY=game_05 filters games.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { loadGames, runProbeSweep } from "./probe-recipe.mjs";

const GAMES_JSON = process.env.GAMES_JSON || process.argv[2];
const OUT = process.env.OUT || process.argv[3] || "probes-lite.json";
const DEPTH = Number(process.env.DEPTH || 16);
const ONLY = process.env.ONLY ? process.env.ONLY.split(",").map((s) => s.trim()) : null;
if (!GAMES_JSON) {
  console.error("usage: node scripts/intent/probe-corpus-lite.mjs <games.json> [out.json]");
  process.exit(1);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENGINE_DIR = join(repoRoot, "public", "engines", "stockfish-17");
const ENGINE_JS = "stockfish-17-lite-single.js";

async function makeLiteTransport() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Serve the repo's own engine files from a fake origin — no dev server, no
  // network: the worker the page constructs is byte-for-byte what production
  // ships from /engines/.
  await page.route("http://probe.local/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") {
      return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>probe</title>" });
    }
    try {
      const file = url.pathname.replace(/^\/engines\//, "");
      const body = readFileSync(join(ENGINE_DIR, file));
      const type = file.endsWith(".wasm") ? "application/wasm" : "text/javascript";
      return route.fulfill({ contentType: type, body });
    } catch {
      return route.fulfill({ status: 404, body: "not found" });
    }
  });
  await page.goto("http://probe.local/");

  // In-page: two Workers ("real"/"prober"), each a production engine
  // instance. postMessage in, lines out via the exposed callback.
  await page.exposeFunction("__probeLine", (which, line) => {
    for (const cb of lineCbs[which]) cb(String(line).trim());
  });
  await page.exposeFunction("__probeDeath", (which, msg) => {
    for (const cb of deathCbs[which]) cb(new Error(msg));
  });

  const lineCbs = { real: [], prober: [] };
  const deathCbs = { real: [], prober: [] };

  async function spawnWorkers() {
    await page.evaluate((engineJs) => {
      window.__engines = window.__engines || {};
      for (const which of ["real", "prober"]) {
        const old = window.__engines[which];
        if (old) { try { old.terminate(); } catch { /* gone */ } }
        const w = new Worker(`/engines/${engineJs}`);
        w.onmessage = (e) => window.__probeLine(which, typeof e.data === "string" ? e.data : String(e.data));
        w.onerror = (e) => window.__probeDeath(which, `worker error: ${e.message}`);
        // Same handshake every transport performs on spawn.
        w.postMessage("uci");
        w.postMessage("isready");
        w.postMessage("ucinewgame");
        w.postMessage("isready");
        window.__engines[which] = w;
      }
    }, ENGINE_JS);
  }
  await spawnWorkers();

  return {
    transport: {
      send(which, cmd) {
        // The worker protocol takes one command per message.
        const cmds = cmd.split("\n");
        page.evaluate(([w, cs]) => { for (const c of cs) window.__engines[w].postMessage(c); }, [which, cmds])
          .catch(() => { /* page gone — death callback handles it */ });
      },
      onLine(which, cb) { lineCbs[which].push(cb); },
      onDeath(which, cb) { deathCbs[which].push(cb); },
      async restart() {
        await spawnWorkers();
        await new Promise((r) => setTimeout(r, 400));
      },
      async quit() {
        try { await browser.close(); } catch { /* already gone */ }
      },
    },
  };
}

const games = loadGames(GAMES_JSON, ONLY);
const { transport } = await makeLiteTransport();
const stats = await runProbeSweep({ games, out: OUT, depth: DEPTH, transport });
console.error("lite sweep:", JSON.stringify(stats));
process.exit(0);
