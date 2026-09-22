#!/usr/bin/env node
/**
 * Build the Masti reels kit under assets/masti/reels-kit/ from the animation
 * pack. The kit is what the Instagram pipeline (Inspirit_project/content-engine
 * on the Mac: Chromium renders HTML, ffmpeg encodes) drops into its templates.
 * It is deliberately self-contained: copy the folder, no build step, no fonts.
 *
 *   node scripts/masti/build-reels-kit.mjs --src /path/to/unzipped-pack [--version v4]
 *
 * Output:
 *   sprites/<mood>.webp   horizontal sprite sheet, every frame side by side
 *   sprites/<mood>.json   { frames, frameWidth, frameHeight, delayMs, loopMs }
 *   stills/<mood>.png     640-wide still with alpha (poster / carousel slides)
 *   overlay/              masti-overlay.css + .js + the HTML partial
 *   demo/                 a reel frame and a carousel slide to eyeball
 *   README.md             placement rules and the frame-zero contract
 *
 * Why sprite sheets and not the animated WebP the site uses: a renderer that
 * captures frame by frame (Playwright screenshot per tick) cannot pause a
 * live-playing animated image at an exact frame, so the reel would get a
 * different Masti frame every run. A sheet plus a data-frame attribute makes
 * the frame a function of the timeline: same input, same pixels, every build.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { frameFromRoll, keyedFrames } from "./lib/keyFrames.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const src = flag("--src", null);
const version = flag("--version", "v4");
if (!src || !fs.existsSync(src)) {
  console.error("usage: node scripts/masti/build-reels-kit.mjs --src <pack dir> [--version v4]");
  process.exit(1);
}

const STATES = {
  wave: "waving-hi",
  excited: "excited",
  idea: "idea",
  nervous: "nervous",
  defeated: "defeated",
  thinking: "analysis-reading-give-me-a-minute",
};
const FRAME_W = 300;
const FRAME_H = 375;

const out = path.join(root, "assets", "masti", "reels-kit");
for (const d of ["sprites", "stills"]) fs.mkdirSync(path.join(out, d), { recursive: true });

const kb = (p) => `${(fs.statSync(p).size / 1024).toFixed(0)}KB`;
const index = { version, frameWidth: FRAME_W, frameHeight: FRAME_H, moods: {} };

for (const [key, base] of Object.entries(STATES)) {
  const gifIn = path.join(src, `masti-${version}-${base}-smooth-24f.gif`);
  const pngIn = path.join(src, `masti-${version}-${base}-still.png`);
  // Keyed first: the pack's GIFs are painted on opaque black, and a sprite
  // over a reel's navy ground would carry a black box otherwise.
  const keyed = await keyedFrames(gifIn);
  const frames = keyed.frames;
  const delays = keyed.delay;
  const delayMs = Math.round(delays.reduce((a, d) => a + d, 0) / Math.max(1, delays.length));

  const frameBufs = [];
  for (let i = 0; i < frames; i++) {
    frameBufs.push(
      await frameFromRoll(keyed, i)
        .resize({ width: FRAME_W, height: FRAME_H, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer(),
    );
  }
  const sheet = path.join(out, "sprites", `${key}.webp`);
  await sharp({
    create: { width: FRAME_W * frames, height: FRAME_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(frameBufs.map((input, i) => ({ input, left: i * FRAME_W, top: 0 })))
    .webp({ quality: 82, effort: 6, alphaQuality: 90 })
    .toFile(sheet);

  const still = path.join(out, "stills", `${key}.png`);
  await sharp(pngIn)
    .resize({ width: 640 })
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 8 })
    .toFile(still);

  const info = { mood: key, frames, frameWidth: FRAME_W, frameHeight: FRAME_H, delayMs, loopMs: delayMs * frames };
  fs.writeFileSync(path.join(out, "sprites", `${key}.json`), JSON.stringify(info, null, 2) + "\n");
  index.moods[key] = info;
  console.log(`${key.padEnd(9)} ${frames} frames @ ${delayMs}ms  sheet=${kb(sheet)} still=${kb(still)}`);
}
fs.writeFileSync(path.join(out, "sprites", "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`wrote ${path.relative(root, out)}`);
