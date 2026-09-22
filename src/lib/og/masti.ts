import fs from "node:fs";
import path from "node:path";
import { MASTI_VERSION, type MastiMood } from "@/components/masti/manifest";

/**
 * Masti for the OG share cards. Reads public/ with fs, so nodejs runtime
 * only, which every OG route is on: the edge runtime has no fs, and bundling
 * the PNG into an edge function put it past Vercel's compressed size cap.
 * A data: URI keeps satori from fetching the deployment mid-render and works
 * on preview URLs, where an absolute production URL might not exist yet. The
 * routes that call this are listed in next.config.js outputFileTracingIncludes
 * so the PNGs ship with the serverless bundle.
 */
const cache = new Map<MastiMood, string | null>();

export function mastiOgDataUri(mood: MastiMood): string | null {
  const hit = cache.get(mood);
  if (hit !== undefined) return hit;
  let uri: string | null = null;
  try {
    const file = path.join(
      process.cwd(),
      "public",
      "masti",
      MASTI_VERSION,
      "still",
      `${mood}.png`
    );
    uri = `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
  } catch (err) {
    console.error("[og] Masti still unavailable for", mood, err);
  }
  cache.set(mood, uri);
  return uri;
}
