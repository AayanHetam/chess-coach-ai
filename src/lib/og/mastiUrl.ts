import { MASTI_VERSION, type MastiMood } from "@/components/masti/manifest";

/**
 * Absolute URL of a Masti still, for the edge-runtime OG route. Kept apart
 * from ./masti.ts on purpose: that file reads public/ with node:fs, which the
 * edge bundler refuses to compile, so the edge route must not import it.
 */
export function mastiOgUrl(mood: MastiMood): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chessmasti.com";
  return `${base.replace(/\/$/, "")}/masti/${MASTI_VERSION}/still/${mood}.png`;
}
