/**
 * Batch driver.  node make_cold.mjs <count> <batchName>
 *
 * Writes numbered folders, each with video.mp4, cover.png, caption.txt and
 * pinned-comment.txt. posted.json is the ledger and is never bypassed.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { selectDiverse, linkBand } from "./lib/puzzles.mjs";
import { caption, pinnedComment, sheetRow } from "./lib/captions.mjs";
import { buildReel } from "./build_cold.mjs";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const LEDGER = path.resolve(process.cwd(), "posted.json");
const CONCURRENCY = 3;

function readLedger() {
  if (!fs.existsSync(LEDGER)) return { posted: [] };
  return JSON.parse(fs.readFileSync(LEDGER, "utf8"));
}

async function main() {
  const count = Number(process.argv[2] ?? 30);
  const batch = process.argv[3] ?? "batch1";
  const outRoot = path.resolve(process.cwd(), "batches", batch);

  const ledger = readLedger();
  const posted = new Set(ledger.posted.map((e) => e.id));

  const picks = selectDiverse(count, posted);
  if (picks.length < count) {
    throw new Error(`only ${picks.length}/${count} puzzles survived verification`);
  }

  // Build scripts wipe the output folder, so it holds nothing but output.
  // Assets live in assets/ and public/, outside it.
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ["--force-device-scale-factor=1", "--hide-scrollbars"],
  });

  const started = Date.now();
  let done = 0;
  const queue = picks.map((p, i) => ({ p, i }));

  async function worker() {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      const { p, i } = job;
      const dir = path.join(outRoot, `${String(i + 1).padStart(2, "0")}-${p.id}`);
      await buildReel(p, dir, browser);
      fs.writeFileSync(path.join(dir, "caption.txt"), caption(p, i));
      fs.writeFileSync(path.join(dir, "pinned-comment.txt"), pinnedComment(p));
      fs.writeFileSync(
        path.join(dir, "puzzle.json"),
        JSON.stringify(
          {
            id: p.id,
            fen: p.fen,
            puzzleFen: p.puzzleFen,
            setupSan: p.setupSan,
            solutionSan: p.solutionSan,
            solutionUci: p.solutionUci,
            solverColor: p.solverColor,
            rating: p.rating,
            nbPlays: p.nbPlays,
            themes: p.themes,
            gameUrl: p.gameUrl,
            isMate: p.isMate,
            mateIn: p.mateIn,
            materialGain: p.materialGain,
            tier: p.tier.id,
            goal: p.goal.id,
            linkBand: linkBand(p.rating),
          },
          null,
          2,
        ),
      );
      done++;
      const el = ((Date.now() - started) / 1000).toFixed(0);
      console.log(`[${done}/${picks.length}] ${path.basename(dir)}  ${el}s`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await browser.close();

  const header = [
    "n", "puzzleId", "tier", "goal", "rating", "linkBand",
    "toPlay", "result", "solution", "game",
  ].join("\t");
  fs.writeFileSync(
    path.join(outRoot, "batch-sheet.tsv"),
    [header, ...picks.map((p, i) => sheetRow(p, i))].join("\n") + "\n",
  );

  // Ledger is appended only after the batch actually built.
  ledger.posted.push(
    ...picks.map((p) => ({
      id: p.id,
      batch,
      builtAt: new Date().toISOString().slice(0, 10),
      tier: p.tier.id,
      goal: p.goal.id,
    })),
  );
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");

  console.log(`\n${picks.length} reels in ${outRoot}`);
}

await main();
