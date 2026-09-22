#!/usr/bin/env node
/**
 * Build the Masti the Monkey asset set under public/masti/<version>/ from a
 * pack of poses. Never hand-edit public/masti/; re-run this.
 *
 *   node scripts/masti/build-assets.mjs --src /path/to/unzipped-pack --version v5
 *
 * Each version names its pack in lib/packs.mjs (shared with the reels kit
 * builder): how a state's still and (when the pack has them) animation are
 * named, and which pack pose each mood key draws from. Two kinds of pack
 * exist so far:
 *
 *   v4  "Masti Smooth Animations v4": per state a GIF (600x750, ~1.2 s loop)
 *       and a still (1122x1402 RGBA). Old hoodie logo.
 *   v5  "Masti static pose pack, final logo": twelve stills (1122x1402 RGBA)
 *       with the CM logo on the hoodie and no animations, so every state's
 *       manifest entry has anim: null and the site rests on the still. The
 *       pack's manifest also lists animated "masti-final-logo-masti-v4-*"
 *       GIFs for six of the moods; v6 in lib/packs.mjs already names them
 *       and turns the bursts back on once the files are in the pack dir.
 *
 * Output (all under public/masti/<version>/):
 *   anim/<state>.webp      animated WebP, 480 wide  (hero, feature spots)
 *   anim/<state>-sm.webp   animated WebP, 240 wide  (avatars, bubbles, toasts)
 *   still/<state>.webp     640-wide still           (poster / reduced-motion)
 *   still/<state>@2x.webp  1122-wide still          (hero at retina)
 *   still/<state>.png      640-wide PNG             (last-resort <img> fallback, OG/email safe)
 *   still/<state>-sm.webp  320-wide still           (avatars: a 26-44px face crop needs no 640)
 *   still/<state>-sm.png   320-wide PNG             (its fallback)
 *   manifest.json          dimensions + bytes; src/components/masti/manifest.ts mirrors it
 *
 * Why no GIF output: the frames carry per-frame paint texture, so GIF is no
 * smaller than WebP (measured: 480px GIF 520-650 KB vs WebP 340-560 KB) and
 * every browser Chess Masti supports plays animated WebP. Browsers that do not
 * fall through <picture> to the still.
 *
 * A pack's GIFs are painted on opaque black; every frame is keyed through
 * lib/keyFrames.mjs before encoding so the animation is transparent like the
 * stills. Without that, a black box appears behind Masti the moment a loop
 * starts on the site's near-black chrome.
 *
 * The directory is versioned so /masti/:path* can be cached immutable in
 * next.config.js. A new pack is a new version directory, never overwritten
 * files.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { animatedFromRoll, keyedFrames } from "./lib/keyFrames.mjs";
import { PACKS, packFiles } from "./lib/packs.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const src = flag("--src", null);
const version = flag("--version", "v5");
if (!src || !fs.existsSync(src)) {
  console.error(
    "usage: node scripts/masti/build-assets.mjs --src <unzipped pack dir> [--version v5]"
  );
  process.exit(1);
}

const pack = PACKS[version];
if (!pack) {
  console.error(`no pack description for ${version}; add one to lib/packs.mjs`);
  process.exit(1);
}
const STATES = pack.states;
const hasAnim = Object.keys(STATES).some((key) => packFiles(pack, key).gif);

const ANIM_LG = 480;
const ANIM_SM = 240;
const STILL_1X = 640;
const STILL_SM = 320;

const out = path.join(root, "public", "masti", version);
fs.rmSync(out, { recursive: true, force: true });
if (hasAnim) fs.mkdirSync(path.join(out, "anim"), { recursive: true });
fs.mkdirSync(path.join(out, "still"), { recursive: true });

const manifest = {
  version,
  generatedBy: "scripts/masti/build-assets.mjs",
  states: {},
};
const bytes = (p) => fs.statSync(p).size;
const kb = (p) => `${(bytes(p) / 1024).toFixed(0)}KB`;

for (const key of Object.keys(STATES)) {
  const files = packFiles(pack, key);
  const base = files.source;
  const pngIn = path.join(src, files.still);
  const gifIn = files.gif ? path.join(src, files.gif) : null;
  for (const f of [gifIn, pngIn]) {
    if (f && !fs.existsSync(f)) {
      console.error(`missing ${f}`);
      process.exit(1);
    }
  }

  let anim = null;
  if (gifIn) {
    const keyed = await keyedFrames(gifIn);
    const { frames, loopMs } = keyed;
    const srcW = keyed.width;
    const srcH = keyed.height;

    // alphaQuality below 100 is what keeps a transparent animation near the
    // size of the opaque one; the edge softness it costs is invisible at
    // these sizes on dark chrome.
    const webpOpts = {
      quality: 58,
      alphaQuality: 55,
      effort: 6,
      smartSubsample: true,
      delay: keyed.delay,
      loop: 0,
    };
    const animLg = path.join(out, "anim", `${key}.webp`);
    await animatedFromRoll(keyed)
      .resize({ width: ANIM_LG })
      .webp(webpOpts)
      .toFile(animLg);
    const animSm = path.join(out, "anim", `${key}-sm.webp`);
    await animatedFromRoll(keyed)
      .resize({ width: ANIM_SM })
      .webp(webpOpts)
      .toFile(animSm);
    anim = {
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
    };
  }

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
  const stillSm = path.join(out, "still", `${key}-sm.webp`);
  await sharp(pngIn)
    .resize({ width: STILL_SM })
    .webp({ quality: 84, effort: 5 })
    .toFile(stillSm);
  const stillSmPng = path.join(out, "still", `${key}-sm.png`);
  await sharp(pngIn)
    .resize({ width: STILL_SM })
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 8 })
    .toFile(stillSmPng);

  const still1xH = Math.round((STILL_1X * stillMeta.height) / stillMeta.width);
  manifest.states[key] = {
    source: base,
    anim,
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
      sm: {
        width: STILL_SM,
        height: Math.round((STILL_SM * stillMeta.height) / stillMeta.width),
        webp: {
          path: `/masti/${version}/still/${key}-sm.webp`,
          bytes: bytes(stillSm),
        },
        png: {
          path: `/masti/${version}/still/${key}-sm.png`,
          bytes: bytes(stillSmPng),
        },
      },
    },
  };
  const animNote = anim
    ? `${anim.frames}f ${anim.loopMs}ms  anim lg=${(anim.lg.bytes / 1024).toFixed(0)}KB sm=${(anim.sm.bytes / 1024).toFixed(0)}KB`
    : "still only";
  console.log(
    `${key.padEnd(9)} ${animNote}  still webp=${kb(still1x)} @2x=${kb(still2x)} png=${kb(stillPng)} sm=${kb(stillSm)}`
  );
}

fs.writeFileSync(
  path.join(out, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n"
);
console.log(`wrote ${path.relative(root, path.join(out, "manifest.json"))}`);
