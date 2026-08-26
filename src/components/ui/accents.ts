/**
 * Jewel accent system for the dark-glass chrome.
 *
 * The base surface stays obsidian; these are the colours that sit ON it.
 * Ember remains the action colour everywhere — the rest exist so that
 * different kinds of content stop all wearing the same orange: each training
 * theme keeps one colour for good (a fork is always gold, a pin always cyan),
 * and each product area on /plan gets an identity tint.
 *
 * Every accent is used as glow/tint on glass, never as a fill — solid fills
 * stay reserved for the ember primary button and the green "done" state.
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
    soft: `rgba(${rgb},0.14)`,
    border: `rgba(${rgb},0.38)`,
    tint: `rgba(${rgb},0.09)`,
    glow: `0 20px 48px -28px rgba(${rgb},0.45)`,
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
