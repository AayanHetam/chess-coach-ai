/**
 * Build one puzzle reel: 1080x1920, ~12s, silent.
 *
 * Silent is deliberate. Trending audio is added in the Instagram app, and
 * the web uploader has no audio picker, so these must be posted from a phone.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { buildHtml, FPS, FRAMES, DURATION, STAGE } from "./lib/render.mjs";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

export async function buildReel(puzzle, outDir, browser) {
  fs.mkdirSync(outDir, { recursive: true });

  // mktemp, always. Deriving the temp dir from the output name means every
  // build shares one folder and concurrent runs delete each other's frames.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cm-reel-"));

  const owned = !browser;
  const b =
    browser ??
    (await chromium.launch({
      executablePath: CHROME,
      args: ["--force-device-scale-factor=1", "--hide-scrollbars"],
    }));
  const page = await b.newPage({
    viewport: { width: STAGE.W, height: STAGE.H },
    deviceScaleFactor: 1,
  });

  try {
    await page.setContent(buildHtml(puzzle), { waitUntil: "load" });
    await page.waitForFunction("window.renderFrame !== undefined");

    for (let f = 0; f < FRAMES; f++) {
      const t = f / FPS;
      await page.evaluate((time) => window.renderFrame(time), t);
      await page.screenshot({
        path: path.join(tmp, `f${String(f).padStart(4, "0")}.jpg`),
        type: "jpeg",
        quality: 94,
      });
    }

    // Cover: the position the viewer solves, header already on screen.
    await page.evaluate(() => window.renderFrame(2.45));
    await page.screenshot({ path: path.join(outDir, "cover.png"), type: "png" });

    execFileSync(
      "ffmpeg",
      [
        "-y", "-loglevel", "error",
        "-framerate", String(FPS),
        "-i", path.join(tmp, "f%04d.jpg"),
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-profile:v", "high",
        "-level", "4.2",
        "-r", String(FPS),
        "-movflags", "+faststart",
        "-an", // silent on purpose
        path.join(outDir, "video.mp4"),
      ],
      { stdio: "inherit" },
    );
  } finally {
    await page.close();
    if (owned) await b.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  return { duration: DURATION, frames: FRAMES };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [jsonPath, out] = process.argv.slice(2);
  const puzzle = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  await buildReel(puzzle, out);
  console.log("built", out);
}
