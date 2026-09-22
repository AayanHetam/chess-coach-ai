/**
 * Masti the Monkey, the Chess Masti mascot.
 *
 * This file is the TypeScript mirror of public/masti/<version>/manifest.json,
 * which scripts/masti/build-assets.mjs writes from the animation pack. The
 * test in __tests__/manifest.test.ts fails when the two drift, so a new pack
 * (a new version directory) is a change here plus a rebuild, never a hand
 * edit under public/.
 *
 * Six moods, each an animated WebP (a ~1.2 s loop) and a still:
 *
 *   wave      hello, idle, "you're in the right place"
 *   excited   a solve, a brilliant move, a won game, a streak
 *   idea      a hint, an insight, a lesson, "here's the point"
 *   nervous   a miss, a risky move, a blunder incoming, a soft error
 *   defeated  a loss, three misses in a row, the coach being offline
 *   thinking  the engine running, the coach streaming, anything loading
 *             (the art carries its own "give me a minute" bubble, so do not
 *             put a second speech bubble next to it)
 */

export const MASTI_NAME = "Masti";
export const MASTI_FULL_NAME = "Masti the Monkey";
export const MASTI_VERSION = "v4";

export const MASTI_MOODS = [
  "wave",
  "excited",
  "idea",
  "nervous",
  "defeated",
  "thinking",
] as const;
export type MastiMood = (typeof MASTI_MOODS)[number];

export function isMastiMood(value: unknown): value is MastiMood {
  return (
    typeof value === "string" &&
    (MASTI_MOODS as readonly string[]).includes(value)
  );
}

/** Every asset is 4:5 (600x750 animations, 1122x1402 stills). width / height. */
export const MASTI_ASPECT = 0.8;

/** One loop of each animation, in ms (frames x delay, from the GIF headers). */
export const MASTI_LOOP_MS: Record<MastiMood, number> = {
  wave: 1200,
  excited: 1200,
  idea: 1220,
  nervous: 1200,
  defeated: 1200,
  thinking: 1240,
};

export type MastiAnimSize = "lg" | "sm";

/** Rendered pixel size of each animation variant (the still is 640x800). */
export const MASTI_ANIM_DIMS: Record<
  MastiAnimSize,
  { width: number; height: number }
> = {
  lg: { width: 480, height: 600 },
  sm: { width: 240, height: 300 },
};
export const MASTI_STILL_DIMS = { width: 640, height: 800 } as const;
/** The avatar-sized still: a 26-44px face crop draws a 60-100px figure. */
export const MASTI_STILL_SM_DIMS = { width: 320, height: 400 } as const;
export const MASTI_STILL_2X_DIMS = { width: 1122, height: 1402 } as const;

/**
 * Below this CSS width the 240px animation is sharp enough at 2x and costs a
 * third of the bytes. Above it the 480px one is used.
 */
export const MASTI_SM_MAX_CSS_PX = 140;

const base = `/masti/${MASTI_VERSION}`;

export function mastiAnimSrc(
  mood: MastiMood,
  size: MastiAnimSize = "lg"
): string {
  return `${base}/anim/${mood}${size === "sm" ? "-sm" : ""}.webp`;
}
export function mastiStillSrc(mood: MastiMood, scale: 1 | 2 = 1): string {
  return `${base}/still/${mood}${scale === 2 ? "@2x" : ""}.webp`;
}
export function mastiStillPng(mood: MastiMood): string {
  return `${base}/still/${mood}.png`;
}
export function mastiStillSmSrc(
  mood: MastiMood,
  format: "webp" | "png"
): string {
  return `${base}/still/${mood}-sm.${format}`;
}
/** The srcset a <source type="image/webp"> wants for a still. */
export function mastiStillSrcSet(mood: MastiMood): string {
  return `${mastiStillSrc(mood, 1)} 1x, ${mastiStillSrc(mood, 2)} 2x`;
}

/**
 * Where the face sits in each still, as fractions of the image box, plus how
 * much bigger than the avatar circle the whole figure has to be drawn for the
 * head to fill it. MastiAvatar uses these to crop a portrait out of the
 * full-body art without a second set of files.
 */
export interface MastiFace {
  x: number;
  y: number;
  scale: number;
}
export const MASTI_FACE: Record<MastiMood, MastiFace> = {
  wave: { x: 0.485, y: 0.31, scale: 2.3 },
  excited: { x: 0.485, y: 0.275, scale: 2.3 },
  idea: { x: 0.5, y: 0.42, scale: 2.3 },
  nervous: { x: 0.47, y: 0.3, scale: 2.3 },
  defeated: { x: 0.46, y: 0.355, scale: 2.3 },
  thinking: { x: 0.4, y: 0.285, scale: 2.3 },
};

/** Accessible names. Short, present tense, no punctuation. */
export const MASTI_ALT: Record<MastiMood, string> = {
  wave: `${MASTI_FULL_NAME} waving hello`,
  excited: `${MASTI_FULL_NAME} jumping with excitement`,
  idea: `${MASTI_FULL_NAME} having an idea`,
  nervous: `${MASTI_FULL_NAME} looking nervous`,
  defeated: `${MASTI_FULL_NAME} dizzy after a knock`,
  thinking: `${MASTI_FULL_NAME} reading a chess book`,
};
