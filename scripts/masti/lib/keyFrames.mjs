/**
 * The animation pack's GIFs are drawn on an opaque black background (the
 * stills are transparent). On the site's near-black chrome a pure black box
 * behind Masti is visible the moment a loop starts, so every frame is keyed
 * before encoding: the pure-black region connected to the frame's border
 * becomes transparent. Only that region: Masti's own black strokes and pupils
 * are enclosed by colour and never touch the border, so a flood fill leaves
 * them alone (measured on wave frame 0: 323k background px keyed, ~1k interior
 * black px kept, foreground count matching the transparent still).
 */
import sharp from "sharp";

/** Max channel value still counted as background black. */
const BLACK = 2;

/** Set alpha to 0 on the border-connected black region of an RGBA buffer, in place. */
export function keyBorderBlack(rgba, width, height) {
  const seen = new Uint8Array(width * height);
  const stack = [];
  const tryPush = (x, y) => {
    const k = y * width + x;
    if (seen[k]) return;
    const i = k * 4;
    if (rgba[i] <= BLACK && rgba[i + 1] <= BLACK && rgba[i + 2] <= BLACK) {
      seen[k] = 1;
      stack.push(k);
    }
  };
  for (let x = 0; x < width; x++) {
    tryPush(x, 0);
    tryPush(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    tryPush(0, y);
    tryPush(width - 1, y);
  }
  while (stack.length) {
    const k = stack.pop();
    const x = k % width;
    const y = (k - x) / width;
    if (x > 0) tryPush(x - 1, y);
    if (x < width - 1) tryPush(x + 1, y);
    if (y > 0) tryPush(x, y - 1);
    if (y < height - 1) tryPush(x, y + 1);
  }
  let keyed = 0;
  for (let k = 0; k < width * height; k++) {
    if (seen[k]) {
      rgba[k * 4 + 3] = 0;
      keyed++;
    }
  }
  return keyed;
}

/**
 * Decode every frame of an animated GIF, key the background, and return the
 * frames as one RGBA "toilet roll" buffer plus the metadata needed to encode
 * or lay them out again.
 */
export async function keyedFrames(gifPath) {
  const meta = await sharp(gifPath, { animated: true }).metadata();
  const frames = meta.pages ?? 1;
  const width = meta.width;
  const height = meta.pageHeight ?? meta.height;
  const delay = meta.delay ?? Array(frames).fill(50);
  const parts = [];
  let keyed = 0;
  for (let i = 0; i < frames; i++) {
    const { data } = await sharp(gifPath, { page: i, pages: 1 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    keyed += keyBorderBlack(data, width, height);
    parts.push(data);
  }
  return {
    frames,
    width,
    height,
    delay,
    loopMs: delay.reduce((a, d) => a + d, 0),
    keyedPerFrame: keyed / frames,
    /** RGBA, all frames stacked vertically. */
    roll: Buffer.concat(parts),
  };
}

/** A sharp instance over the keyed roll, understood as an animation. */
export function animatedFromRoll(k) {
  return sharp(k.roll, {
    raw: { width: k.width, height: k.height * k.frames, channels: 4, pageHeight: k.height },
    // Without this sharp encodes page 0 only and quietly drops the other 23.
    animated: true,
  });
}

/** A sharp instance over one keyed frame. */
export function frameFromRoll(k, index) {
  const bytes = k.width * k.height * 4;
  return sharp(k.roll.subarray(index * bytes, (index + 1) * bytes), {
    raw: { width: k.width, height: k.height, channels: 4 },
  });
}
