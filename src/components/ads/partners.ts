/**
 * The advertisers the preview surface can serve, and everything about each one
 * that is not a React component.
 *
 * Deliberately a leaf module: no React, no MUI, no page imports, nothing from
 * ./PartnerSlot. The boot script, the path regex, the analytics guards and the
 * creatives all need these facts, and a cycle between any two of them would
 * pull the whole slot into modules that only wanted a slug.
 *
 * ─── ADDING AN ADVERTISER ─────────────────────────────────────────────────
 * 1. Add the slug to PartnerSlug and an entry to PARTNERS below.
 * 2. Write the creatives in <slug>Turn2.tsx and register the renderer in
 *    PartnerSlot.tsx's PARTNER_CREATIVES.
 * 3. Add the rewrite source to next.config.js. It is a separate file in
 *    CommonJS and cannot import this one, so the two are kept honest by
 *    partnerPrefix.test.ts, which reads the config as text and fails if a
 *    slug here has no rule there.
 *
 * Nothing else needs to change. The CSS, the reserve, the prefix-preserving
 * navigation and the analytics exclusions are all partner-agnostic.
 */

/* ── options ─────────────────────────────────────────────────────────────── */

/**
 * The three creative choices behind every advertiser's links, /1 /2 and /3.
 * One vocabulary for all partners, so the reserve, the regex and the boot
 * script never have to ask whose links they are looking at.
 */
export const PARTNER_OPTION_IDS = ["1", "2", "3"] as const;

export type PartnerOptionId = (typeof PARTNER_OPTION_IDS)[number];

export function isPartnerOptionId(value: unknown): value is PartnerOptionId {
  return (
    typeof value === "string" &&
    PARTNER_OPTION_IDS.includes(value as PartnerOptionId)
  );
}

/* ── partners ────────────────────────────────────────────────────────────── */

export type PartnerSlug = "chessusa" | "chesshouse";

export interface PartnerOptionMeta {
  /** The design doc's own code for this unit. Also the utm_content value. */
  code: string;
  /** The design doc's name for the direction, for talking about it. */
  name: string;
  /** Accessible name for the link. Describes the offer, not the artwork. */
  alt: string;
}

export interface PartnerDef {
  /** Canonical, lowercase. The spelling the route actually resolves to. */
  slug: PartnerSlug;
  /**
   * The capitalised spelling the links are WRITTEN as in the pitch email —
   * /partners/ChessHouse/1. Page routing is filesystem-based and therefore
   * case-sensitive, so this spelling only works because next.config.js
   * rewrites it; it is recorded here so the links in an email, the survey
   * script and the tests all quote the same string.
   */
  linkSegment: string;
  /** How the advertiser's name is written to a person, in the disclosure. */
  displayName: string;
  /** Bare destination, no UTM. PartnerBanner applies the campaign tagging. */
  href: string;
  /** utm_campaign for this flight. */
  campaign: string;
  /**
   * The webfont stylesheet this partner's creatives are set in. Appended by
   * the boot script only under this partner's prefix, so a real visitor —
   * and an advertiser looking at someone else's links — requests none of it.
   */
  fontHref: string;
  /** Per-option creative code, name and accessible label. */
  options: Record<PartnerOptionId, PartnerOptionMeta>;
}

/**
 * ChessUSA — Turn 2. Three units built on the green lockup, set in Archivo
 * with IBM Plex Mono for the code.
 */
const CHESSUSA: PartnerDef = {
  slug: "chessusa",
  linkSegment: "ChessUSA",
  displayName: "ChessUSA",
  href: "https://www.chessusa.com/",
  campaign: "chessusa_2026q3",
  fontHref:
    "https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Mono:wght@700&display=swap",
  options: {
    "1": {
      code: "2a",
      name: "Board Party",
      alt: "ChessUSA — America's Largest Chess Store. 5% off with code CHESSMASTI. It's your move.",
    },
    "2": {
      code: "2b",
      name: "Sticker",
      alt: "ChessUSA — America's Largest Chess Store. 5% off with code CHESSMASTI. Shop now.",
    },
    "3": {
      code: "2c",
      name: "Neon Board",
      alt: "ChessUSA — America's Largest Chess Store. 5% off with code CHESSMASTI. Shop now.",
    },
  },
};

/**
 * Chess House — Turn 2. Three units drawn from the brand's own two inks
 * (#285888 and #0088C8, sampled from the mark) rather than an invented
 * palette, so nothing in the set can be mistaken for first-party chrome: both
 * sit more than 150 degrees of hue from Chess Masti's ember accent.
 *
 * Direction 2b is set in Source Serif 4, which is why this partner's font
 * request differs from ChessUSA's. Weight 600 of IBM Plex Mono is needed too
 * (2a and 2c set the code at 600 and 700 respectively).
 */
const CHESSHOUSE: PartnerDef = {
  slug: "chesshouse",
  linkSegment: "ChessHouse",
  displayName: "Chess House",
  href: "https://www.chesshouse.com/",
  campaign: "chesshouse_2026q3",
  fontHref:
    "https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Mono:wght@600;700&family=Source+Serif+4:wght@700&display=swap",
  options: {
    "1": {
      code: "2a",
      name: "Threshold",
      alt: "Chess House — chess in every home. 5% off with code CHESSMASTI. Shop chess sets.",
    },
    "2": {
      code: "2b",
      name: "Swoosh",
      alt: "Chess House — established 1972. 5% off with code CHESSMASTI. Shop now.",
    },
    "3": {
      code: "2c",
      name: "Packing Slip",
      alt: "Chess House — mail order since 1972. 5% off with code CHESSMASTI. Open the box.",
    },
  },
};

export const PARTNERS: Record<PartnerSlug, PartnerDef> = {
  chessusa: CHESSUSA,
  chesshouse: CHESSHOUSE,
};

/** Every slug the surface serves, in registry order. */
export const PARTNER_SLUGS = Object.keys(PARTNERS) as PartnerSlug[];

export function isPartnerSlug(value: unknown): value is PartnerSlug {
  return typeof value === "string" && value.toLowerCase() in PARTNERS;
}

/**
 * A resolved preview: which advertiser, which of their three creatives.
 * Null everywhere else, which is every URL a real visitor ever sees.
 */
export interface PartnerPreview {
  slug: PartnerSlug;
  option: PartnerOptionId;
}

/**
 * The regex source that decides the whole surface, built from the registry so
 * a new partner cannot be half-added. Shared verbatim by PARTNER_PATH_RE and
 * by the boot script's inline copy — the one place those two could drift.
 *
 * Anchored at the start, so the prefix has to BE the route rather than appear
 * somewhere inside one, and the trailing (?:/|$) stops /partners/chessusa/12
 * or .../1x matching option 1.
 */
export const PARTNER_PATH_RE_SOURCE = `^\\/partners\\/(${PARTNER_SLUGS.join(
  "|"
)})\\/([${PARTNER_OPTION_IDS.join("")}])(?:\\/|$)`;

/**
 * Value the boot script and the component put on <html>. The CSS keys only on
 * the attribute's PRESENCE, so this is for anyone debugging a page — the
 * survey script prints it — and for the tests that compare the shipped boot
 * script against the TS path resolver.
 */
export function partnerAttrValue(preview: PartnerPreview): string {
  return `${preview.slug}:${preview.option}`;
}
