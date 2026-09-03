/**
 * Batch gate. Run before anything is handed over. Every check here is one
 * that has previously shipped broken.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Chess } from "chess.js";

const BANDS = Array.from({ length: 17 }, (_, i) => 600 + i * 100);

// Claims that must never appear in any caption.
const BANNED = [
  /free\s+forever/i,
  /open[-\s]?source/i,
  /\b\d+(\.\d+)?\s*[mk]?\s*(mau|monthly active)/i,
  /\b\d{1,3}(\.\d+)?%\s*(accura|correct)/i,
  /\bcrushing\b/i,
  /\bwinning\b/i,
  /\bcompletely\s+lost\b/i,
];

const root = path.resolve(process.cwd(), "batches", process.argv[2] ?? "batch1");
const dirs = fs
  .readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => path.join(root, d.name))
  .sort();

let fails = 0;
const fail = (d, msg) => {
  console.log(`FAIL ${path.basename(d)}: ${msg}`);
  fails++;
};

const probe = (file, args) =>
  execFileSync("ffprobe", ["-v", "error", ...args, "-of", "default=nw=1:nk=1", file])
    .toString()
    .trim();

for (const d of dirs) {
  const p = JSON.parse(fs.readFileSync(path.join(d, "puzzle.json"), "utf8"));
  const video = path.join(d, "video.mp4");

  for (const f of ["video.mp4", "cover.png", "caption.txt", "pinned-comment.txt"]) {
    if (!fs.existsSync(path.join(d, f))) fail(d, `missing ${f}`);
  }

  // 1. Legality. The line must replay, every time.
  const chess = new Chess(p.puzzleFen);
  let replayed = true;
  for (const m of p.solutionUci) {
    try {
      const mv = chess.move({
        from: m.slice(0, 2),
        to: m.slice(2, 4),
        promotion: m.length > 4 ? m[4] : undefined,
      });
      if (!mv) replayed = false;
    } catch {
      replayed = false;
    }
  }
  if (!replayed) fail(d, "solution does not replay");
  if (p.isMate && !chess.isCheckmate()) fail(d, "claims mate, position is not mate");
  const capHead = fs
    .readFileSync(path.join(d, "caption.txt"), "utf8")
    .split("ANSWER")[0];
  // \b matters: "material" contains "mate".
  if (!p.isMate && /\b(check)?mates?\b|\bmate in\b/i.test(capHead))
    fail(d, "mate wording without a proven mate");

  // 2. Format: 1080x1920, ~12s, silent.
  const w = probe(video, ["-select_streams", "v:0", "-show_entries", "stream=width"]);
  const h = probe(video, ["-select_streams", "v:0", "-show_entries", "stream=height"]);
  const dur = Number(probe(video, ["-show_entries", "format=duration"]));
  const audio = probe(video, ["-select_streams", "a", "-show_entries", "stream=index"]);
  if (w !== "1080" || h !== "1920") fail(d, `resolution ${w}x${h}`);
  if (Math.abs(dur - 12) > 0.35) fail(d, `duration ${dur}s`);
  if (audio) fail(d, "has an audio stream — reels ship silent");

  // 3. Frame zero is the board, not a logo. The ember light square
  //    (#F2E7DA) must already occupy a real share of the frame.
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "cm-verify-"));
  const f0 = path.join(tmp, "f0.png");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", video, "-frames:v", "1", f0]);
  // Decode the board region to gray and average it here — no log parsing.
  const gray = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", f0, "-vf", "crop=920:920:80:436,format=gray",
     "-f", "rawvideo", "-"],
    { maxBuffer: 1 << 28 },
  );
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const yavg = sum / gray.length;
  // The navy ground is very dark. A board is not.
  if (!(yavg > 90)) fail(d, `frame 0 is not the board (board-region mean ${yavg.toFixed(1)})`);
  fs.rmSync(tmp, { recursive: true, force: true });

  // 4. The end-card link band must point at a route that exists.
  if (!BANDS.includes(p.linkBand)) fail(d, `link band ${p.linkBand} is off the grid`);
  if (p.linkBand < 600 || p.linkBand > 2200) fail(d, `link band ${p.linkBand} unclamped`);

  // 5. The answer is never in the video, only in the caption below the fold.
  const cap = fs.readFileSync(path.join(d, "caption.txt"), "utf8");
  if (!cap.includes(`ANSWER: ${p.solutionSan.join(" ")}`)) fail(d, "caption is missing the answer");
  const foldIndex = cap.indexOf("ANSWER:");
  if (cap.slice(0, foldIndex).split("\n").length < 8)
    fail(d, "answer is not pushed below the fold");
  for (const re of BANNED) if (re.test(cap)) fail(d, `banned claim ${re}`);
}

// 6. Diversity: no two consecutive posts share a tier or a goal.
const metas = dirs.map((d) => JSON.parse(fs.readFileSync(path.join(d, "puzzle.json"), "utf8")));
for (let i = 1; i < metas.length; i++) {
  if (metas[i].tier === metas[i - 1].tier) fail(dirs[i], "same tier as the previous post");
  if (metas[i].goal === metas[i - 1].goal) fail(dirs[i], "same goal as the previous post");
}
const ids = new Set(metas.map((m) => m.id));
if (ids.size !== metas.length) fail(root, "duplicate puzzle in the batch");

console.log(
  fails === 0
    ? `\nOK — ${dirs.length} reels passed every check.`
    : `\n${fails} failure(s).`,
);
process.exit(fails === 0 ? 0 : 1);
