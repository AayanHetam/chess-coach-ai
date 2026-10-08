/**
 * Masti the Monkey, the Chess Masti mascot.
 *
 * This file is the TypeScript mirror of public/masti/<version>/manifest.json,
 * which scripts/masti/build-assets.mjs writes from a pose pack. The test in
 * __tests__/manifest.test.ts fails when the two drift, so a new pack (a new
 * version directory) is a change here plus a rebuild, never a hand edit
 * under public/.
 *
 * v5 is the "static pose pack, final logo": twelve stills with the CM logo
 * on the hoodie and no animations, so every mood rests on its still and
 * MASTI_LOOP_MS is empty. The original six moods keep their names and take
 * the closest pose; the other six poses are the moods mood.ts hands out for
 * the moments below.
 *
 *   wave      hello, idle, "you're in the right place"    (talking, open hand)
 *   excited   a clean solve, your brilliancy, a won game  (celebration jump)
 *   idea      an insight, a revealed answer, a draw       (finger raised)
 *   nervous   a miss, your mistake, a soft error          (confused shrug)
 *   defeated  a loss, your blunder, the coach offline     (facepalm)
 *   thinking  the engine running, anything loading        (chin stroke)
 *   shocked   a blunder with no side known, their brilliancy (jaw drop)
 *   panic     the third puzzle miss in a row              (losing his mind)
 *   pointing  a hint, their blunder, Commentator at rest  (pointing)
 *   smug      Rival at rest                               (smirk)
 *   laughing  Buddy at rest                               (laughing)
 *   banana    a rating gain in the session recap          (banana rating)
 */

export const MASTI_NAME = "Masti";
export const MASTI_FULL_NAME = "Masti the Monkey";
export const MASTI_VERSION = "v5";

export const MASTI_MOODS = [
  "wave",
  "excited",
  "idea",
  "nervous",
  "defeated",
  "thinking",
  "shocked",
  "panic",
  "pointing",
  "smug",
  "laughing",
  "banana",
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

/**
 * One loop of each animation, in ms (frames x delay, from the GIF headers).
 * A mood missing here has no animation in the current pack and always shows
 * its still; mastiAnimSrc returns null for it. Empty for v5, which is stills
 * only until an animated pack with the final logo lands.
 */
export const MASTI_LOOP_MS: Partial<Record<MastiMood, number>> = {};

/** Whether the current pack animates this mood. */
export function mastiAnimates(mood: MastiMood): boolean {
  return MASTI_LOOP_MS[mood] !== undefined;
}

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

/** The animated WebP for a mood, or null when the pack has no animation for it. */
export function mastiAnimSrc(
  mood: MastiMood,
  size: MastiAnimSize = "lg"
): string | null {
  if (!mastiAnimates(mood)) return null;
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
  wave: { x: 0.52, y: 0.3, scale: 2.3 },
  excited: { x: 0.6, y: 0.33, scale: 2.3 },
  idea: { x: 0.46, y: 0.3, scale: 2.3 },
  nervous: { x: 0.5, y: 0.3, scale: 2.3 },
  defeated: { x: 0.42, y: 0.35, scale: 2.3 },
  thinking: { x: 0.46, y: 0.3, scale: 2.3 },
  shocked: { x: 0.54, y: 0.27, scale: 2.3 },
  panic: { x: 0.52, y: 0.33, scale: 2.3 },
  pointing: { x: 0.47, y: 0.32, scale: 2.3 },
  smug: { x: 0.47, y: 0.3, scale: 2.3 },
  laughing: { x: 0.45, y: 0.33, scale: 2.3 },
  banana: { x: 0.53, y: 0.28, scale: 2.3 },
};

/** Accessible names. Short, present tense, no punctuation. */
export const MASTI_ALT: Record<MastiMood, string> = {
  wave: `${MASTI_FULL_NAME} saying hello`,
  excited: `${MASTI_FULL_NAME} jumping with excitement`,
  idea: `${MASTI_FULL_NAME} having an idea`,
  nervous: `${MASTI_FULL_NAME} giving a nervous shrug`,
  defeated: `${MASTI_FULL_NAME} facepalming`,
  thinking: `${MASTI_FULL_NAME} thinking it over`,
  shocked: `${MASTI_FULL_NAME} with his jaw dropped`,
  panic: `${MASTI_FULL_NAME} losing his mind`,
  pointing: `${MASTI_FULL_NAME} pointing at the answer`,
  smug: `${MASTI_FULL_NAME} smirking unimpressed`,
  laughing: `${MASTI_FULL_NAME} laughing out loud`,
  banana: `${MASTI_FULL_NAME} holding up a banana rating`,
};
