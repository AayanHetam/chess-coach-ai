/**
 * The Masti pose packs, one entry per public/masti/<version>: how the pack
 * names its files and which pose each mood key draws from. Shared by
 * build-assets.mjs (the site) and build-reels-kit.mjs (the reels kit), so
 * the two never disagree about a version.
 *
 * A state is a pack basename, resolved through the pack's `still` and `gif`
 * naming rules, or `{ still, gif }` with explicit file names when a version
 * mixes sets. A null `gif` means no animation: the site rests on the still
 * and the reels kit ships the still without a sprite sheet.
 */
export const PACKS = {
  // "Masti Smooth Animations v4": a GIF (600x750, ~1.2 s loop) and a still
  // (1122x1402 RGBA) per state. Old hoodie logo.
  v4: {
    still: (base) => `masti-v4-${base}-still.png`,
    gif: (base) => `masti-v4-${base}-smooth-24f.gif`,
    states: {
      wave: "waving-hi",
      excited: "excited",
      idea: "idea",
      nervous: "nervous",
      defeated: "defeated",
      thinking: "analysis-reading-give-me-a-minute",
    },
  },
  // "Masti static pose pack, final logo": twelve stills (1122x1402 RGBA) with
  // the CM logo on the hoodie, no animations.
  v5: {
    still: (base) => `masti-final-logo-masti-v2-${base}.png`,
    gif: null,
    states: {
      wave: "01-talking-explaining",
      excited: "05-celebration",
      idea: "02-talking-emphasis",
      nervous: "11-confused-shrug",
      defeated: "06-facepalm",
      thinking: "07-thinking",
      shocked: "03-shocked-jaw-drop",
      panic: "04-losing-his-mind",
      pointing: "08-pointing-guess",
      smug: "09-smug-unimpressed",
      laughing: "10-laughing",
      banana: "12-banana-rating",
    },
  },
  // The animated set with the final logo that the v5 pack's own manifest
  // lists (masti-final-logo-masti-v4-*: six GIFs and six stills) plus the
  // six extra v2 poses. Build from one directory holding both sets. Not yet
  // delivered: the build stops at the first missing file until it is.
  v6: {
    still: (base) => `masti-final-logo-masti-v4-${base}-still.png`,
    gif: (base) => `masti-final-logo-masti-v4-${base}-smooth-24f.gif`,
    states: {
      wave: "waving-hi",
      excited: "excited",
      idea: "idea",
      nervous: "nervous",
      defeated: "defeated",
      thinking: "analysis-reading-give-me-a-minute",
      shocked: { still: "masti-final-logo-masti-v2-03-shocked-jaw-drop.png" },
      panic: { still: "masti-final-logo-masti-v2-04-losing-his-mind.png" },
      pointing: { still: "masti-final-logo-masti-v2-08-pointing-guess.png" },
      smug: { still: "masti-final-logo-masti-v2-09-smug-unimpressed.png" },
      laughing: { still: "masti-final-logo-masti-v2-10-laughing.png" },
      banana: { still: "masti-final-logo-masti-v2-12-banana-rating.png" },
    },
  },
};

/** The pack files for one state: { still, gif (null without animation), source }. */
export function packFiles(pack, key) {
  const state = pack.states[key];
  if (state === undefined) throw new Error(`no state "${key}" in this pack`);
  if (typeof state === "string") {
    return {
      still: pack.still(state),
      gif: pack.gif ? pack.gif(state) : null,
      source: state,
    };
  }
  return {
    still: state.still,
    gif: state.gif ?? null,
    source: state.still.replace(/\.png$/, ""),
  };
}
