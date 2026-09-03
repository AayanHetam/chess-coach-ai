/** Build a single reviewable contact sheet of every cover in a batch. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const batch = process.argv[2] ?? "batch1";
const root = path.resolve(process.cwd(), "batches", batch);
const dirs = fs
  .readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cm-sheet-"));
dirs.forEach((d, i) => {
  fs.copyFileSync(
    path.join(root, d, "cover.png"),
    path.join(tmp, `c${String(i).padStart(3, "0")}.png`),
  );
});

const cols = 6;
const rows = Math.ceil(dirs.length / cols);
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error",
  "-i", path.join(tmp, "c%03d.png"),
  "-vf", `scale=300:533,tile=${cols}x${rows}:padding=8:margin=8:color=#0D1420`,
  "-frames:v", "1",
  path.join(root, "contact-sheet.png"),
]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(path.join(root, "contact-sheet.png"), `${dirs.length} covers`);
