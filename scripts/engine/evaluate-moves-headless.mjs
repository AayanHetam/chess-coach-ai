// The headless proof for `UciEngine.evaluateMoves`: does the SHIPPED engine
// (stockfish-17-lite-single, the build every real browser gets, because
// chessmasti.com serves no COOP/COEP and SharedArrayBuffer is absent) honour
// `go depth N searchmoves a b` with MultiPV equal to the number of moves?
//
// Headless Chromium runs the exact worker file the site ships, byte for
// byte, from a fake origin that serves /engines/ out of public/. No dev
// server, no network. For every case and depth the script records:
//   - the wall time of the search,
//   - which asked moves got a PV slot and whether any unasked move did,
//   - the depth each slot reached, its score and the first plies of its PV,
//   - the engine's bestmove,
// and asserts the two invariants the primitive relies on: every asked move
// owns exactly one slot, and no slot belongs to a move that was not asked.
//
//   node scripts/engine/evaluate-moves-headless.mjs [--depths 12,13,16] [--out p.json]
//
// With --compare it runs only the pairs a compare sets side by side
// (pathway 3.5), each marked `compare: true` in the output, for the depths
// test (src/lib/coach/__tests__/compareVerdict.depths.test.ts): the
// engine's verdict on a pair at the coach's depth must not name the other
// move than at the page's final depth.
//
//   node scripts/engine/evaluate-moves-headless.mjs --compare --depths 10,12,14,16 \
//     --out scripts/engine/results/compare-depths-<date>.json
//
// Chromium: Playwright's bundled build, CHROME_PATH to override.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { Chess } from "chess.js";

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const DEPTHS = arg("--depths", "12,13,16").split(",").map(Number);
const COMPARE_ONLY = argv.includes("--compare");
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = arg(
  "--out",
  join(
    repoRoot,
    "scripts/engine/results",
    `evaluate-moves-headless-${new Date().toISOString().slice(0, 10)}.json`
  )
);
const ENGINE_DIR = join(repoRoot, "public", "engines", "stockfish-17");
const ENGINE_JS = "stockfish-17-lite-single.js";

/* ---------------- the cases ---------------- */
function fenAfter(sans) {
  const g = new Chess();
  for (const s of sans) g.move(s);
  return g.fen();
}
function uciOf(fen, san) {
  const m = new Chess(fen).move(san);
  return m.from + m.to + (m.promotion ?? "");
}
const KNIGHT_FORK =
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Qb6 Nf3 Qxb2 Na3 Qxa1 Nb5 Qxc1".split(" ");
const CASES = (() => {
  const beforeNc7 = fenAfter(KNIGHT_FORK);
  const afterNc7 = fenAfter([...KNIGHT_FORK, "Nc7+"]);
  const ruyLopez = fenAfter(["e4", "e5", "Nf3", "Nc6", "Bb5"]);
  const pawnEnding = "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1";
  return [
    {
      name: "07 before 8.Nc7+ (White): the played move and the engine's best",
      fen: beforeNc7,
      moves: [uciOf(beforeNc7, "Nc7+"), uciOf(beforeNc7, "Qxc1")],
    },
    {
      name: "07 after 8.Nc7+ (Black to move): the sign check",
      fen: afterNc7,
      moves: new Chess(afterNc7)
        .moves({ verbose: true })
        .slice(0, 2)
        .map((m) => m.from + m.to + (m.promotion ?? "")),
    },
    {
      name: "Ruy Lopez after 3.Bb5: three book replies",
      fen: ruyLopez,
      moves: [
        uciOf(ruyLopez, "a6"),
        uciOf(ruyLopez, "Nf6"),
        uciOf(ruyLopez, "Bc5"),
      ],
    },
    {
      name: "K+P v K: three king-and-pawn tries",
      fen: pawnEnding,
      moves: ["e2e4", "e1d2", "e1f2"],
    },
    // The pairs a compare sets side by side, in the order named.
    {
      name: "compare: 07 before 8.Nc7+, Qxc1 against Nd6+",
      fen: beforeNc7,
      moves: [uciOf(beforeNc7, "Qxc1"), uciOf(beforeNc7, "Nd6+")],
      compare: true,
    },
    {
      name: "compare: 07 before 8.Nc7+, Nc7+ against Nd6+",
      fen: beforeNc7,
      moves: [uciOf(beforeNc7, "Nc7+"), uciOf(beforeNc7, "Nd6+")],
      compare: true,
    },
    {
      name: "compare: Ruy Lopez after 3.Bb5, a6 against Nf6 (Black to move)",
      fen: ruyLopez,
      moves: [uciOf(ruyLopez, "a6"), uciOf(ruyLopez, "Nf6")],
      compare: true,
    },
    {
      name: "compare: K+P v K, e2e4 against e1d2",
      fen: pawnEnding,
      moves: ["e2e4", "e1d2"],
      compare: true,
    },
  ].filter((c) => !COMPARE_ONLY || c.compare);
})();

/* ---------------- the transport ---------------- */
async function main() {
  // The Chromium Playwright would download, or the one a cloud session has
  // pre-installed (the same path scripts/perf/cls-probe.mjs uses).
  const preinstalled = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const executablePath =
    process.env.CHROME_PATH ||
    (existsSync(chromium.executablePath())
      ? undefined
      : existsSync(preinstalled)
        ? preinstalled
        : undefined);
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  const page = await browser.newPage();
  await page.route("http://proof.local/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/")
      return route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>proof</title>",
      });
    try {
      const file = url.pathname.replace(/^\/engines\//, "");
      const body = readFileSync(join(ENGINE_DIR, file));
      return route.fulfill({
        contentType: file.endsWith(".wasm")
          ? "application/wasm"
          : "text/javascript",
        body,
      });
    } catch {
      return route.fulfill({ status: 404, body: "not found" });
    }
  });
  await page.goto("http://proof.local/");

  const listeners = [];
  await page.exposeFunction("__line", (line) => {
    for (const cb of listeners) cb(String(line).trim());
  });
  await page.evaluate((engineJs) => {
    const w = new Worker(`/engines/${engineJs}`);
    w.onmessage = (e) =>
      window.__line(typeof e.data === "string" ? e.data : String(e.data));
    w.onerror = (e) => window.__line(`__error ${e.message}`);
    window.__engine = w;
  }, ENGINE_JS);
  const send = (cmd) =>
    page.evaluate((c) => window.__engine.postMessage(c), cmd);
  const until = (pred) =>
    new Promise((resolve, reject) => {
      const cb = (line) => {
        if (line.startsWith("__error")) {
          listeners.splice(listeners.indexOf(cb), 1);
          reject(new Error(line));
        } else if (pred(line)) {
          listeners.splice(listeners.indexOf(cb), 1);
          resolve(line);
        }
      };
      listeners.push(cb);
    });

  // The handshake uciEngine.ts performs.
  const uciok = until((l) => l === "uciok");
  await send("uci");
  const id = await new Promise((resolve) => {
    const cb = (line) => {
      if (line.startsWith("id name ")) {
        listeners.splice(listeners.indexOf(cb), 1);
        resolve(line.slice(8));
      }
    };
    listeners.push(cb);
  });
  await uciok;
  await send("isready");
  await until((l) => l === "readyok");
  console.log(`engine: ${id} (${ENGINE_JS})`);

  /* ---------------- one search ---------------- */
  async function search(fen, moves, depth) {
    const infos = new Map(); // first pv move -> latest line
    const seenSlots = new Set();
    const cb = (line) => {
      if (
        !line.startsWith("info ") ||
        !line.includes(" pv ") ||
        /\b(?:lowerbound|upperbound)\b/.test(line)
      )
        return;
      const m =
        /\bdepth (\d+)\b.*?\bmultipv (\d+)\b.*?\bscore (cp|mate) (-?\d+)\b.*?\bpv (.+)$/.exec(
          line
        );
      if (!m) return;
      const pv = m[5].split(" ");
      seenSlots.add(Number(m[2]));
      const prev = infos.get(pv[0]);
      if (prev && prev.depth > Number(m[1])) return;
      infos.set(pv[0], {
        depth: Number(m[1]),
        slot: Number(m[2]),
        kind: m[3],
        value: Number(m[4]),
        pv: pv.slice(0, 6),
      });
    };
    listeners.push(cb);
    // Exactly what evaluateMoves sends: clear the table, size MultiPV, restrict the root.
    await send("ucinewgame");
    await send("isready");
    await until((l) => l === "readyok");
    await send(`setoption name MultiPV value ${moves.length}`);
    await send("isready");
    await until((l) => l === "readyok");
    const t0 = Date.now();
    const done = until((l) => l.startsWith("bestmove"));
    await send(`position fen ${fen}`);
    await send(`go depth ${depth} searchmoves ${moves.join(" ")}`);
    const bestLine = await done;
    const ms = Date.now() - t0;
    listeners.splice(listeners.indexOf(cb), 1);
    const bestmove = bestLine.split(" ")[1];
    const scored = Array.from(infos.entries()).map(([uci, i]) => ({
      uci,
      ...i,
    }));
    return {
      ms,
      bestmove,
      scored,
      slots: Array.from(seenSlots).sort((a, b) => a - b),
    };
  }

  const results = [];
  let failures = 0;
  for (const c of CASES) {
    for (const depth of DEPTHS) {
      const r = await search(c.fen, c.moves, depth);
      const askedSet = new Set(c.moves);
      const missing = c.moves.filter((m) => !r.scored.some((s) => s.uci === m));
      const extra = r.scored
        .filter((s) => !askedSet.has(s.uci))
        .map((s) => s.uci);
      const shallow = r.scored
        .filter((s) => s.depth < depth)
        .map((s) => `${s.uci}@${s.depth}`);
      const ok =
        missing.length === 0 && extra.length === 0 && askedSet.has(r.bestmove);
      if (!ok) failures++;
      results.push({
        case: c.name,
        ...(c.compare ? { compare: true } : {}),
        fen: c.fen,
        asked: c.moves,
        depth,
        ms: r.ms,
        ok,
        missing,
        extra,
        shallow,
        bestmove: r.bestmove,
        slots: r.slots,
        scored: r.scored,
      });
      const stm = c.fen.split(" ")[1];
      const line = r.scored
        .map(
          (s) =>
            `${s.uci} ${s.kind === "mate" ? "M" : ""}${s.value}${stm === "b" ? "(stm)" : ""}@${s.depth}`
        )
        .join("  ");
      console.log(
        `${ok ? "ok " : "BAD"} d${depth} ${String(r.ms).padStart(6)}ms  ${c.name}\n      best ${r.bestmove}  ${line}${missing.length ? `  MISSING ${missing}` : ""}${extra.length ? `  EXTRA ${extra}` : ""}`
      );
    }
  }

  await send("quit");
  await browser.close();

  const byDepth = {};
  for (const d of DEPTHS) {
    const rows = results.filter((r) => r.depth === d);
    const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
    byDepth[d] = {
      searches: rows.length,
      msMin: ms[0],
      msMedian: ms[Math.floor(ms.length / 2)],
      msMax: ms[ms.length - 1],
    };
  }
  console.log("\ntimings (ms, this machine, one single-threaded worker):");
  for (const [d, t] of Object.entries(byDepth))
    console.log(
      `  depth ${d}: min ${t.msMin}  median ${t.msMedian}  max ${t.msMax}  (${t.searches} searches)`
    );
  console.log(
    `\n${failures === 0 ? "every asked move owned exactly one slot and no unasked move did" : `${failures} searches broke an invariant`}`
  );

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        date: new Date().toISOString().slice(0, 10),
        engine: id,
        workerFile: ENGINE_JS,
        scoreConvention:
          "side-to-move as the engine reports it; evaluateMoves flips to White-relative",
        machine: {
          platform: process.platform,
          cpus: (await import("node:os")).cpus().length,
          node: process.version,
        },
        depths: DEPTHS,
        invariantFailures: failures,
        byDepth,
        results,
      },
      null,
      2
    )
  );
  console.log(`wrote ${OUT}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
