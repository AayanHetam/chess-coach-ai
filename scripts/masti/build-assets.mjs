#!/usr/bin/env node
/**
 * Build the Masti the Monkey asset set under public/masti/<version>/ from the
 * "Masti Smooth Animations" pack (Google Drive folder "Masti Smooth Animations
 * v4 - second-frame look"). Never hand-edit public/masti/; re-run this.
 *
 *   node scripts/masti/build-assets.mjs --src /path/to/unzipped-pack [--version v4]
 *
 * Input, per state: masti-<version>-<name>-smooth-24f.gif (600x750, ~1.2s loop)
 * and masti-<version>-<name>-still.png (1122x1402 RGBA, transparent).
 *
 * Output (all under public/masti/<version>/):
 *   anim/<state>.webp      animated WebP, 480 wide  (hero, feature spots)
 *   anim/<state>-sm.webp   animated WebP, 240 wide  (avatars, bubbles, toasts)
 *   still/<state>.webp     640-wide still           (poster / reduced-motion)
 *   still/<state>@2x.webp  1122-wide still          (hero at retina)
 *   still/<state>.png      640-wide PNG             (last-resort <img> fallback, OG/email safe)
 *   manifest.json          dimensions + bytes; src/components/masti/manifest.ts mirrors it
 *
 * Why no GIF output: the frames carry per-frame paint texture, so GIF is no
 * smaller than WebP (measured: 480px GIF 520-650 KB vs WebP 340-560 KB) and
 * every browser Chess Masti supports plays animated WebP. Browsers that do not
 * fall through <picture> to the still.
 *
 * The directory is versioned so /masti/:path* can be cached immutable in
 * next.config.js. A new pack is a new version directory, never overwritten
 * files.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

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
  console.error(
    "usage: node scripts/masti/build-assets.mjs --src <dir with masti-v4-*.gif/png> [--version v4]",
  );
  process.exit(1);
}

/** state key → pack basename (between "masti-<version>-" and "-smooth-24f.gif" / "-still.png"). */
const STATES = {
  wave: "waving-hi",
  excited: "excited",
  idea: "idea",
  nervous: "nervous",
  defeated: "defeated",
  thinking: "analysis-reading-give-me-a-minute",
};

const ANIM_LG = 480;
const ANIM_SM = 240;
const STILL_1X = 640;

const out = path.join(root, "public", "masti", version);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "anim"), { recursive: true });
fs.mkdirSync(path.join(out, "still"), { recursive: true });

const manifest = {
  version,
  generatedBy: "scripts/masti/build-assets.mjs",
  states: {},
};
const bytes = (p) => fs.statSync(p).size;
const kb = (p) => `${(bytes(p) / 1024).toFixed(0)}KB`;

for (const [key, base] of Object.entries(STATES)) {
  const gifIn = path.join(src, `masti-${version}-${base}-smooth-24f.gif`);
  const pngIn = path.join(src, `masti-${version}-${base}-still.png`);
  for (const f of [gifIn, pngIn]) {
    if (!fs.existsSync(f)) {
      console.error(`missing ${f}`);
      process.exit(1);
    }
  }

  const animMeta = await sharp(gifIn, { animated: true }).metadata();
  const frames = animMeta.pages ?? 1;
  const loopMs = (animMeta.delay ?? []).reduce((a, d) => a + d, 0);
  const srcW = animMeta.width;
  const srcH = animMeta.pageHeight ?? animMeta.height;

  const animLg = path.join(out, "anim", `${key}.webp`);
  await sharp(gifIn, { animated: true })
    .resize({ width: ANIM_LG })
    .webp({ quality: 66, effort: 6, smartSubsample: true })
    .toFile(animLg);
  const animSm = path.join(out, "anim", `${key}-sm.webp`);
  await sharp(gifIn, { animated: true })
    .resize({ width: ANIM_SM })
    .webp({ quality: 66, effort: 6, smartSubsample: true })
    .toFile(animSm);

  const stillMeta = await sharp(pngIn).metadata();
  const still1x = path.join(out, "still", `${key}.webp`);
  await sharp(pngIn)
    .resize({ width: STILL_1X })
    .webp({ quality: 86, effort: 5 })
    .toFile(still1x);
  const still2x = path.join(out, "still", `${key}@2x.webp`);
  await sharp(pngIn).webp({ quality: 84, effort: 5 }).toFile(still2x);
  const stillPng = path.join(out, "still", `${key}.png`);
  await sharp(pngIn)
    .resize({ width: STILL_1X })
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 8 })
    .toFile(stillPng);

  const still1xH = Math.round((STILL_1X * stillMeta.height) / stillMeta.width);
  manifest.states[key] = {
    source: base,
    anim: {
      frames,
      loopMs,
      lg: {
        path: `/masti/${version}/anim/${key}.webp`,
        width: ANIM_LG,
        height: Math.round((ANIM_LG * srcH) / srcW),
        bytes: bytes(animLg),
      },
      sm: {
        path: `/masti/${version}/anim/${key}-sm.webp`,
        width: ANIM_SM,
        height: Math.round((ANIM_SM * srcH) / srcW),
        bytes: bytes(animSm),
      },
    },
    still: {
      webp: {
        path: `/masti/${version}/still/${key}.webp`,
        width: STILL_1X,
        height: still1xH,
        bytes: bytes(still1x),
      },
      webp2x: {
        path: `/masti/${version}/still/${key}@2x.webp`,
        width: stillMeta.width,
        height: stillMeta.height,
        bytes: bytes(still2x),
      },
      png: {
        path: `/masti/${version}/still/${key}.png`,
        width: STILL_1X,
        height: still1xH,
        bytes: bytes(stillPng),
      },
    },
  };
  console.log(
    `${key.padEnd(9)} ${frames}f ${loopMs}ms  anim lg=${kb(animLg)} sm=${kb(animSm)}  still webp=${kb(still1x)} @2x=${kb(still2x)} png=${kb(stillPng)}`,
  );
}

fs.writeFileSync(
  path.join(out, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(`wrote ${path.relative(root, path.join(out, "manifest.json"))}`);
