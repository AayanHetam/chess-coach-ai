/**
 * The advertisers the partner slot can serve, in preview or live, and
 * everything about each one that is not a React component.
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
 * 3. Put the latin woff2 of every face the creatives set text in under
 *    public/fonts/partners/v1 (with its OFL file; see the README there) and
 *    list it in `fonts`. The faces are served from this domain on purpose:
 *    a live placement must not make every visitor's page load call Google.
 * 4. Add the rewrite source to next.config.js. It is a separate file in
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

/* ── fonts ───────────────────────────────────────────────────────────────── */

/**
 * Where the partner faces live. Versioned: next.config.js serves the
 * directory with a one-year immutable cache header, so a changed file is a
 * new directory, never an edit in place.
 */
export const PARTNER_FONT_DIR = "/fonts/partners/v1";

/**
 * One @font-face rule. `weight` is CSS font-weight syntax, so a variable file
 * declares its range ("600 800") and a static instance its one weight.
 */
export interface PartnerFontFace {
  /** The family name exactly as the creatives write it in font-family. */
  family: string;
  weight: string;
  /** File name under PARTNER_FONT_DIR. */
  file: string;
}

const ARCHIVO_600_800: PartnerFontFace = {
  family: "Archivo",
  weight: "600 800",
  file: "archivo-latin.woff2",
};
const PLEX_MONO_600: PartnerFontFace = {
  family: "IBM Plex Mono",
  weight: "600",
  file: "ibm-plex-mono-600-latin.woff2",
};
const PLEX_MONO_700: PartnerFontFace = {
  family: "IBM Plex Mono",
  weight: "700",
  file: "ibm-plex-mono-700-latin.woff2",
};
const SOURCE_SERIF_700: PartnerFontFace = {
  family: "Source Serif 4",
  weight: "700",
  file: "source-serif-4-700-latin.woff2",
};

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
   * The faces this partner's creatives set text in, served from this domain
   * (PARTNER_FONT_DIR). Every partner's rules are in the page CSS, but a
   * browser downloads a face only once text on the page is set in it, so a
   * page shows exactly one advertiser's banner and fetches exactly that
   * advertiser's faces; the boot script preloads those same files so they
   * are in flight before the banner mounts.
   */
  fonts: readonly PartnerFontFace[];
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
  // The tag ChessUSA was pitched with and may already filter on. The flight
  // that went live on 2026-10-14 is Q4; the tag is kept as pitched on purpose
  // and only changes together with ChessUSA, since renaming it mid-flight
  // would split their reporting. The shell reads it from here.
  campaign: "chessusa_2026q3",
  fonts: [ARCHIVO_600_800, PLEX_MONO_700],
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
 * list differs from ChessUSA's. Weight 600 of IBM Plex Mono is needed too
 * (2a and 2c set the code at 600 and 700 respectively).
 */
const CHESSHOUSE: PartnerDef = {
  slug: "chesshouse",
  linkSegment: "ChessHouse",
  displayName: "Chess House",
  href: "https://www.chesshouse.com/",
  campaign: "chesshouse_2026q3",
  fonts: [ARCHIVO_600_800, PLEX_MONO_600, PLEX_MONO_700, SOURCE_SERIF_700],
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

/**
 * Every distinct face any partner needs, in registry order, each file once.
 * This is what partnerSlotCss turns into @font-face rules.
 */
export const PARTNER_FONT_FACES: readonly PartnerFontFace[] = Object.values(
  PARTNERS
)
  .flatMap((p) => p.fonts)
  .filter((face, i, all) => all.findIndex((f) => f.file === face.file) === i);

/** Absolute URL path of one face's file. */
export function partnerFontUrl(face: PartnerFontFace): string {
  return `${PARTNER_FONT_DIR}/${face.file}`;
}

export function isPartnerSlug(value: unknown): value is PartnerSlug {
  return typeof value === "string" && value.toLowerCase() in PARTNERS;
}

/**
 * A resolved placement: which advertiser, which of their three creatives. A
 * preview URL names one; so does the live placement below.
 */
export interface PartnerPlacement {
  slug: PartnerSlug;
  option: PartnerOptionId;
}

/** The same shape, under the name the preview call sites use. */
export type PartnerPreview = PartnerPlacement;

/* ── the live placement ──────────────────────────────────────────────────── */

/**
 * What every visitor sees on every page, or null for none. This is the one
 * value that turns the surface from a demo into an advertisement: with it
 * set, real visitors load that advertiser's banner, faces and artwork on
 * every page not matched by LIVE_EXCLUDED_RE_SOURCE below.
 *
 * ChessUSA bought unit 2b (option "2") on 2026-10-14. Taking it down is
 * setting this to null and deploying; running another is naming it here. A
 * reviewed, versioned value on purpose rather than an environment toggle:
 * an advertisement on every page of the product belongs in the repo's
 * history, and a test pins it so a stray edit cannot swap or drop it quietly.
 *
 * Nothing preview-only follows from it. The sign-in asks stay (they key on
 * PREVIEW_ATTR), the router is not patched, analytics run as normal, and the
 * pages stay indexable. Nothing is sent anywhere either: the banner is
 * first-party HTML, its faces come from this domain, and the only thing the
 * advertiser learns is the UTM query on a click.
 */
export const LIVE_PLACEMENT: PartnerPlacement | null = {
  slug: "chessusa",
  option: "2",
};

/**
 * Where the live placement never shows, as a regex source shared verbatim by
 * placementForPath and the boot script: anything under /partners/ (the iframe
 * shell, the framed route, and the preview prefixes, which resolve on their
 * own), the COPPA age gate, where no advertisement is served to anyone, the
 * password-reset form, a one-shot token flow kept free of chrome, and the
 * intern and admin dashboards, which are internal tools rather than pages
 * the advertiser is paying to be seen on. The list is the only place these
 * are spelled out; comments elsewhere point here.
 */
export const LIVE_EXCLUDED_RE_SOURCE =
  "^\\/(partners\\/|auth\\/age(?:\\/|$)|reset-password(?:\\/|$)|intern(?:\\/|$)|admin(?:\\/|$))";

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
export function partnerAttrValue(placement: PartnerPlacement): string {
  return `${placement.slug}:${placement.option}`;
}
