import fs from "node:fs";
import path from "node:path";

/**
 * The Chess Masti logo for the share cards, as a data URI read from public/
 * with fs. Same reasoning as mastiOgDataUri: nodejs runtime only, no fetch of
 * the deployment mid-render, works on preview URLs, and every route that
 * calls this lists the file in next.config.js outputFileTracingIncludes so
 * it ships with the serverless bundle.
 */
let cached: string | null | undefined;

export function brandMarkOgDataUri(): string | null {
  if (cached !== undefined) return cached;
  try {
    const file = path.join(process.cwd(), "public", "brand", "cm-mark-128.png");
    cached = `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
  } catch (err) {
    console.error("[og] brand mark unavailable", err);
    cached = null;
  }
  return cached;
}
