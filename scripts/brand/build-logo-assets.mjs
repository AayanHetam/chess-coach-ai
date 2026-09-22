#!/usr/bin/env node
/**
 * Build every raster placement of the Chess Masti logo (the CM monogram with
 * Masti's face) from the master in assets/brand/chess-masti-logo.webp.
 *
 *   node scripts/brand/build-logo-assets.mjs
 *
 * The master is painted on opaque white. The build keys that white out by
 * flood-filling from the edges, so the whites inside the drawing (the eyes)
 * stay, then un-mats the anti-aliased fringe against white so the black
 * outline does not carry a pale halo onto the site's dark chrome. The mark
 * is trimmed to its ink and padded to a square.
 *
 * Output:
 *   public/brand/cm-mark-{64,128,256,512}.png   transparent, for the nav, the
 *                                                drawer, the share cards and
 *                                                the Organization JSON-LD
 *   public/favicon-16x16.png, favicon-32x32.png transparent
 *   public/favicon.ico                          16 + 32 + 48 PNG entries
 *   public/apple-touch-icon.png (180)           full-bleed ink square, iOS rounds it
 *   public/android-chrome-192x192.png / 512     same, logo inside the maskable safe zone
 *
 * Never hand-edit the outputs; change the master or this script and re-run.
 * src/components/masti/__tests__/brandIcons.test.ts asserts the shipped files.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const pub = path.join(root, "public");
const master = path.join(root, "assets", "brand", "chess-masti-logo.webp");
const EMBER = "#F97316";
const INK = "#14161c";
/** A pixel this light (every channel) can belong to the white background. */
const BG_MIN = 200;

/** The master as a trimmed, square, transparent RGBA PNG buffer. */
async function keyedMark() {
  const { data, info } = await sharp(master)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const isLight = (i) =>
    data[i * 4] >= BG_MIN &&
    data[i * 4 + 1] >= BG_MIN &&
    data[i * 4 + 2] >= BG_MIN;
  // Flood fill from every edge pixel over light pixels: the background and
  // the fringe that blends into it, never an enclosed white.
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const push = (i) => {
    if (!seen[i] && isLight(i)) {
      seen[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  // Un-mat against white: observed = a * ink + (1 - a) * white, and the
  // lightest channel says how much white is in the mix.
  for (let i = 0; i < w * h; i++) {
    if (!seen[i]) continue;
    const o = i * 4;
    const min = Math.min(data[o], data[o + 1], data[o + 2]);
    const alpha = 255 - min;
    if (alpha === 0) {
      data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 0;
      continue;
    }
    for (let c = 0; c < 3; c++) {
      const v = 255 - ((255 - data[o + c]) * 255) / alpha;
      data[o + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
    data[o + 3] = alpha;
  }
  // Trim to the ink and pad to a square.
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const side = Math.max(bw, bh);
  const padX = Math.floor((side - bw) / 2);
  const padY = Math.floor((side - bh) / 2);
  return sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: minX, top: minY, width: bw, height: bh })
    .extend({
      top: padY,
      bottom: side - bh - padY,
      left: padX,
      right: side - bw - padX,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

const svg = (size, body) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`
  );
const glow = `<defs><radialGradient id="g" cx="0.5" cy="0.4" r="0.7"><stop offset="0" stop-color="${EMBER}" stop-opacity="0.3"/><stop offset="1" stop-color="${EMBER}" stop-opacity="0"/></radialGradient></defs>`;

const mark = await keyedMark();
const at = (size) =>
  sharp(mark).resize(size, size, { kernel: "lanczos3" }).png().toBuffer();

/** The mark centred on a full-bleed ink square, `fraction` of its side wide. */
async function badge(size, fraction) {
  const inner = Math.round(size * fraction);
  const off = Math.round((size - inner) / 2);
  return sharp(
    svg(
      size,
      `${glow}<rect width="${size}" height="${size}" fill="${INK}"/><rect width="${size}" height="${size}" fill="url(#g)"/>`
    )
  )
    .composite([{ input: await at(inner), left: off, top: off }])
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

const write = (rel, buf) => {
  fs.mkdirSync(path.dirname(path.join(pub, rel)), { recursive: true });
  fs.writeFileSync(path.join(pub, rel), buf);
  console.log(`  ${rel} (${buf.length} B)`);
};

for (const size of [64, 128, 256, 512])
  write(`brand/cm-mark-${size}.png`, await at(size));
write("favicon-16x16.png", await at(16));
write("favicon-32x32.png", await at(32));
const entries = [];
for (const size of [16, 32, 48]) entries.push({ size, png: await at(size) });
write("favicon.ico", ico(entries));
write("apple-touch-icon.png", await badge(180, 0.86));
write("android-chrome-192x192.png", await badge(192, 0.8));
write("android-chrome-512x512.png", await badge(512, 0.8));
