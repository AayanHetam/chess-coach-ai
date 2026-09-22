import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

/**
 * The brand icons are Masti's face, built from the wave still by
 * scripts/masti/build-brand-icons.mjs. These assertions run on the shipped
 * files, so an icon regenerated from the old logo.svg, or a manifest that
 * names a file that is not there, fails CI instead of the browser tab.
 */
const PUB = path.join(process.cwd(), "public");
const read = (file: string) => fs.readFileSync(path.join(PUB, file));
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe("brand icons", () => {
  it.each([
    ["favicon-16x16.png", 16, true],
    ["favicon-32x32.png", 32, true],
    ["apple-touch-icon.png", 180, false],
    ["android-chrome-192x192.png", 192, false],
    ["android-chrome-512x512.png", 512, false],
  ])(
    "%s is a %ix%i PNG with Masti in the middle",
    async (file, size, round) => {
      const img = sharp(read(file));
      const meta = await img.metadata();
      expect([meta.format, meta.width, meta.height]).toEqual([
        "png",
        size,
        size,
      ]);
      const { data, info } = await img
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const alphaAt = (x: number, y: number) =>
        data[(y * info.width + x) * info.channels + 3];
      // The round favicons show the tab through their corners; the touch and
      // PWA icons are full-bleed because iOS paints transparency black.
      expect(alphaAt(0, 0)).toBe(round ? 0 : 255);
      expect(alphaAt(size / 2, size / 2)).toBe(255);
    }
  );

  it("favicon.ico carries 16, 32 and 48 PNG entries", () => {
    const ico = read("favicon.ico");
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    const count = ico.readUInt16LE(4);
    const sizes: number[] = [];
    for (let i = 0; i < count; i++) {
      const entry = 6 + i * 16;
      sizes.push(ico.readUInt8(entry));
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      expect(ico.subarray(offset, offset + 8).equals(PNG_SIGNATURE)).toBe(true);
      expect(offset + length).toBeLessThanOrEqual(ico.length);
    }
    expect(sizes).toEqual([16, 32, 48]);
  });

  it("the manifests and the document head use the PNG marks, never logo.svg", () => {
    for (const manifest of ["site.webmanifest", "manifest.json"]) {
      const { icons } = JSON.parse(read(manifest).toString("utf8")) as {
        icons: { src: string }[];
      };
      expect(icons.length).toBeGreaterThan(0);
      for (const { src } of icons) {
        expect(src).not.toMatch(/\.svg$/);
        expect(fs.existsSync(path.join(PUB, src))).toBe(true);
      }
    }
    // An SVG icon link beats every PNG and ICO in browsers that support it,
    // which is how the old bullseye would come back to the tab.
    const doc = fs.readFileSync(
      path.join(process.cwd(), "src/pages/_document.tsx"),
      "utf8"
    );
    expect(doc).not.toMatch(/image\/svg\+xml/);
  });
});
