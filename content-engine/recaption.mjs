/** Rewrite caption.txt / pinned-comment.txt for an existing batch. */
import fs from "node:fs";
import path from "node:path";
import { TIERS, GOALS } from "./lib/puzzles.mjs";
import { caption, pinnedComment } from "./lib/captions.mjs";

const root = path.resolve(process.cwd(), "batches", process.argv[2] ?? "batch1");
const dirs = fs
  .readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

dirs.forEach((name, i) => {
  const d = path.join(root, name);
  const j = JSON.parse(fs.readFileSync(path.join(d, "puzzle.json"), "utf8"));
  const p = {
    ...j,
    tier: TIERS.find((t) => t.id === j.tier),
    goal: GOALS.find((g) => g.id === j.goal),
  };
  fs.writeFileSync(path.join(d, "caption.txt"), caption(p, i));
  fs.writeFileSync(path.join(d, "pinned-comment.txt"), pinnedComment(p));
});
console.log(`rewrote ${dirs.length} captions`);
