#!/usr/bin/env node
/**
 * Build the brand icons from Masti's face: the favicons, the iOS touch icon
 * and the PWA icons under public/. Masti is the face of the brand, so the
 * mark in the browser tab is the same face crop the NavPill and the coach
 * header draw with MastiAvatar, cut from the same still.
 *
 *   node scripts/masti/build-brand-icons.mjs
 *
 * Source: public/masti/<version>/still/wave@2x.webp (1122x1402). The crop
 * follows MASTI_FACE.wave in src/components/masti/manifest.ts, duplicated
 * here because this script runs without the TypeScript build. Change one,
 * change the other.
 *
 * Output (all under public/):
 *   favicon-16x16.png, favicon-32x32.png   round, transparent corners, ember ring
 *   favicon.ico                            16 + 32 + 48 PNG entries in one ICO
 *   apple-touch-icon.png (180)             the ring on a full-bleed ink square (iOS rounds it)
 *   android-chrome-192x192.png / 512       same, face inside the maskable safe zone
 *
 * Replaces public/generate_icons.js, which rasterised the old bullseye
 * logo.svg. The tiny sizes zoom the crop a little: at 16px a head that fits
 * the circle with room to spare is a brown dot.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const pub = path.join(root, "public");
const VERSION = "v4";
const MOOD = "wave";
/** Mirrors MASTI_FACE.wave in src/components/masti/manifest.ts. */
const FACE = { x: 0.485, y: 0.31, scale: 2.3 };
const EMBER = "#F97316";
const INK = "#14161c";
const still = path.join(pub, "masti", VERSION, "still", `${MOOD}@2x.webp`);

const svg = (size, body) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`
  );
const glow = `<defs><radialGradient id="g" cx="0.5" cy="0.36" r="0.72"><stop offset="0" stop-color="${EMBER}" stop-opacity="0.36"/><stop offset="1" stop-color="${EMBER}" stop-opacity="0"/></radialGradient></defs>`;

/** The square face crop at `size`; `zoom` above 1 tightens it. */
async function faceCrop(size, zoom = 1) {
  const { width, height } = await sharp(still).metadata();
  const side = Math.round(width / (FACE.scale * zoom));
  const left = Math.round(FACE.x * width - side / 2);
  const top = Math.round(FACE.y * height - side / 2);
  return sharp(still)
    .extract({ left, top, width: side, height: side })
    .resize(size, size, { kernel: "lanczos3" })
    .png()
    .toBuffer();
}

/** Masti in the ember ring: an ink disc with the glow, the face, the ring. */
async function ring(size, zoom = 1) {
  const r = size / 2;
  const stroke = Math.max(1, Math.round(size * 0.065));
  return sharp(
    svg(
      size,
      `${glow}<circle cx="${r}" cy="${r}" r="${r}" fill="${INK}"/><circle cx="${r}" cy="${r}" r="${r}" fill="url(#g)"/>`
    )
  )
    .composite([
      { input: await faceCrop(size, zoom) },
      {
        input: svg(size, `<circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/>`),
        blend: "dest-in",
      },
      {
        input: svg(
          size,
          `<circle cx="${r}" cy="${r}" r="${r - stroke / 2}" fill="none" stroke="${EMBER}" stroke-opacity="0.92" stroke-width="${stroke}"/>`
        ),
      },
    ])
    .png()
    .toBuffer();
}

/** The ring centred on a full-bleed ink square, `fraction` of its side wide. */
async function badge(size, fraction) {
  const inner = Math.round(size * fraction);
  const off = Math.round((size - inner) / 2);
  return sharp(
    svg(
      size,
      `${glow}<rect width="${size}" height="${size}" fill="${INK}"/><rect width="${size}" height="${size}" fill="url(#g)"/>`
    )
  )
    .composite([{ input: await ring(inner), left: off, top: off }])
    .png()
    .toBuffer();
}

/** PNG entries in an ICO container; every browser that reads ICO reads these. */
function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = header.length + dir.length;
  entries.forEach(({ size, png }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

const zoomFor = (size) => (size <= 32 ? 1.18 : 1);

const out = {
  "favicon-16x16.png": () => ring(16, zoomFor(16)),
  "favicon-32x32.png": () => ring(32, zoomFor(32)),
  "apple-touch-icon.png": () => badge(180, 0.9),
  "android-chrome-192x192.png": () => badge(192, 0.8),
  "android-chrome-512x512.png": () => badge(512, 0.8),
};
for (const [name, build] of Object.entries(out)) {
  const png = await build();
  fs.writeFileSync(path.join(pub, name), png);
  console.log(`  ${name} (${png.length} B)`);
}
const entries = [];
for (const size of [16, 32, 48])
  entries.push({ size, png: await ring(size, zoomFor(size)) });
const icoBuf = ico(entries);
fs.writeFileSync(path.join(pub, "favicon.ico"), icoBuf);
console.log(`  favicon.ico (${icoBuf.length} B, ${entries.length} entries)`);
