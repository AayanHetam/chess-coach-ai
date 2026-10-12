/**
 * Category colours.
 *
 * Ember is the one accent (the primary action, links). These exist so that
 * categories of content can be told apart: each training theme keeps one
 * colour for good (a fork is always gold, a pin always cyan). They are used
 * as quiet tints on tags and chips, and as a text or icon colour, never as a
 * glow, a gradient or the fill of a large area. Chrome (the nav, the drawer)
 * does not wear them.
 */

export interface Accent {
  /** Saturated core — icons, hairlines. */
  base: string;
  /** Lifted variant — text and glyphs on dark glass. */
  bright: string;
  /** Translucent wash for medallion/chip backgrounds. */
  soft: string;
  /** Border colour at glass-card strength. */
  border: string;
  /** Barely-there radial tint for card tops. */
  tint: string;
  /** Shadow glow behind an accented card. */
  glow: string;
}

function accent(r: number, g: number, b: number, bright: string): Accent {
  const rgb = `${r},${g},${b}`;
  return {
    base: `rgb(${rgb})`,
    bright,
    soft: `rgba(${rgb},0.12)`,
    border: `rgba(${rgb},0.3)`,
    tint: `rgba(${rgb},0.06)`,
    // Nothing on the site glows any more; kept so callers compile until the
    // sweep removes them.
    glow: "none",
  };
}

export const ACCENTS = {
  ember: accent(249, 115, 22, "#FB923C"),
  gold: accent(250, 204, 21, "#FDE047"),
  jade: accent(52, 211, 153, "#6EE7B7"),
  cyan: accent(34, 211, 238, "#67E8F9"),
  violet: accent(167, 139, 250, "#C4B5FD"),
  rose: accent(251, 113, 133, "#FDA4AF"),
} as const;

export type AccentName = keyof typeof ACCENTS;

/**
 * Stable colour identity for the quiz/SRS focus themes. Hand-picked so the
 * themes that tend to appear next to each other in a session list don't share
 * a colour; anything outside this vocabulary (Neo4j's inferred theme ids)
 * falls through to a deterministic hash so it still keeps ONE colour forever
 * rather than reshuffling between renders.
 */
const THEME_ACCENTS: Record<string, AccentName> = {
  "hanging-piece": "violet",
  fork: "gold",
  "double-attack": "rose",
  pin: "cyan",
  skewer: "ember",
  "discovered-attack": "jade",
  "back-rank": "violet",
  "exposed-king": "rose",
  "mating-attack": "ember",
  sacrifice: "gold",
  endgame: "cyan",
  promotion: "jade",
  "advanced-pawn": "gold",
};

const CYCLE: AccentName[] = ["violet", "gold", "rose", "cyan", "jade", "ember"];

export function themeAccent(themeId: string): Accent {
  const named = THEME_ACCENTS[themeId];
  if (named) return ACCENTS[named];
  let h = 0;
  for (let i = 0; i < themeId.length; i++) {
    h = (h * 31 + themeId.charCodeAt(i)) >>> 0;
  }
  return ACCENTS[CYCLE[h % CYCLE.length]];
}

/**
 * Identity colour per top-level product surface, for the tags on /plan
 * (analysis is cyan wherever it appears, lessons gold). The nav no longer
 * wears them.
 */
export const SURFACE_ACCENTS: Record<string, AccentName> = {
  plan: "ember",
  play: "jade",
  analysis: "cyan",
  practice: "violet",
  learn: "gold",
  scout: "rose",
};

/** Accent for a nav surface id; anything unmapped (home, misc) reads ember. */
export function surfaceAccent(id: string | undefined): Accent {
  return ACCENTS[(id && SURFACE_ACCENTS[id]) || "ember"];
}
