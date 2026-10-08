#!/usr/bin/env node
/**
 * Print the overlay CSS with the sprite sheets inlined as data: URIs, for
 * templates rendered through Playwright's setContent (which has no base URL,
 * so a relative url() fails silently and Masti is simply missing).
 *
 *   node overlay/inline.mjs thinking excited > build/masti.css
 *
 * Only the moods named are inlined; a reel usually needs two.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kit = path.resolve(here, "..");
const moods = process.argv.slice(2);
if (moods.length === 0) {
  console.error("usage: node overlay/inline.mjs <mood> [mood…]");
  process.exit(1);
}
let css = fs
  .readFileSync(path.join(here, "masti-overlay.css"), "utf8")
  .split("\n")
  .filter((line) => !/^\.masti--\w+\s*\{/.test(line))
  .join("\n");
for (const mood of moods) {
  const file = path.join(kit, "sprites", `${mood}.webp`);
  if (!fs.existsSync(file)) {
    console.error(`unknown mood ${mood}`);
    process.exit(1);
  }
  const b64 = fs.readFileSync(file).toString("base64");
  css += `\n.masti--${mood} { background-image: url("data:image/webp;base64,${b64}"); }`;
}
process.stdout.write(css + "\n");
