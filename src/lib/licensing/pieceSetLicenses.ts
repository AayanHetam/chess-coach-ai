import { PIECE_SETS } from "@/constants";

export type PieceSet = (typeof PIECE_SETS)[number];

/**
 * How a bundled piece set may be used on a site that charges money.
 *
 * - `commercial-ok` — a license that permits commercial use: the permissive
 *   ones (MIT / Apache / CC0 / CC BY), and the copyleft ones (GPL / AGPL /
 *   CC BY-SA), which are fine here because this repo is already AGPL-3.0 and
 *   ships its own source.
 * - `restricted` — a license that forbids commercial use (CC BY-NC-SA, the
 *   "personal non commercial use" and "freeware" grants) or forbids
 *   derivatives (CC BY-ND). COPYING.md's own preamble carves exactly these
 *   out: "neither AGPL-compatible nor open source".
 * - `unknown` — shipped with no recorded license. Treat as the strictest case,
 *   not the loosest: no grant on record is not the same as a permissive grant.
 */
export type PieceSetUse = "commercial-ok" | "restricted" | "unknown";

export interface PieceSetLicense {
  /** Verbatim from the COPYING.md row, so the two can be diffed by eye. */
  license: string;
  use: PieceSetUse;
}

/**
 * Every set in `PIECE_SETS`, classified from COPYING.md.
 *
 * This is a `Record` over the whole union on purpose: adding a set to
 * `PIECE_SETS` without recording its license **fails `tsc`**. That is the
 * point of the file. `governor` and `kosal` are how we learned it was needed —
 * both shipped for months without ever appearing in COPYING.md, so nobody
 * could have told you what they were licensed under.
 */
export const PIECE_SET_LICENSES: Record<PieceSet, PieceSetLicense> = {
  // --- Permissive / copyleft: usable on a commercial surface ---
  cburnett: { license: "GPLv2+", use: "commercial-ok" },
  merida: { license: "GPLv2+", use: "commercial-ok" },
  mpchess: { license: "GPLv3+", use: "commercial-ok" },
  letter: { license: "AGPLv3+", use: "commercial-ok" },
  pirouetti: { license: "AGPLv3+", use: "commercial-ok" },
  pixel: { license: "AGPLv3+", use: "commercial-ok" },
  chessnut: { license: "Apache 2.0", use: "commercial-ok" },
  fantasy: { license: "MIT", use: "commercial-ok" },
  spatial: { license: "MIT", use: "commercial-ok" },
  celtic: { license: "MIT", use: "commercial-ok" },
  rhosgfx: { license: "CC0 1.0", use: "commercial-ok" },
  "kiwen-suwi": { license: "CC BY 4.0", use: "commercial-ok" },
  firi: { license: "CC BY 4.0", use: "commercial-ok" },
  shapes: { license: "CC BY-SA 4.0", use: "commercial-ok" },

  // --- NonCommercial: must not be the default, and not on a paid surface ---
  maestro: { license: "CC BY-NC-SA 4.0", use: "restricted" },
  horsey: { license: "CC BY-NC-SA 4.0", use: "restricted" },
  california: { license: "CC BY-NC-SA 4.0", use: "restricted" },
  caliente: { license: "CC BY-NC-SA 4.0", use: "restricted" },
  fresca: { license: "CC BY-NC-SA 4.0", use: "restricted" },
  cardinal: { license: "CC BY-NC-SA 4.0", use: "restricted" },
  icpieces: { license: "CC BY-NC-SA 4.0", use: "restricted" },
  gioco: { license: "CC BY-NC-SA 4.0", use: "restricted" },
  tatiana: { license: "CC BY-NC-SA 4.0", use: "restricted" },
  staunty: { license: "CC BY-NC-SA 4.0", use: "restricted" },
  dubrovny: { license: "CC BY-NC-SA 4.0", use: "restricted" },
  anarcandy: { license: "CC BY-NC-SA 4.0", use: "restricted" },
  cooke: { license: "CC BY-NC-SA 4.0", use: "restricted" },
  monarchy: { license: "CC BY-NC-SA 4.0", use: "restricted" },
  xkcd: { license: "CC BY-NC-SA 2.5", use: "restricted" },

  // --- NoDerivatives: commercial use is allowed, altering them is not ---
  chicago: { license: "CC BY-ND 4.0", use: "restricted" },
  iowa: { license: "CC BY-ND 4.0", use: "restricted" },
  oslo: { license: "CC BY-ND 4.0", use: "restricted" },

  // --- Freeware / personal-use grants: no commercial permission given ---
  alpha: {
    license: '"free for personal non commercial use"',
    use: "restricted",
  },
  chess7: { license: '"freeware"', use: "restricted" },
  companion: { license: '"freeware"', use: "restricted" },
  leipzig: { license: '"freeware"', use: "restricted" },

  // --- Listed in COPYING.md with the license column left blank ---
  reillycraig: { license: "not stated", use: "unknown" },
  symmetric: { license: "not stated", use: "unknown" },
  riohacha: { license: "not stated", use: "unknown" },

  // --- Not in COPYING.md at all (found 2026-08-29) ---
  governor: { license: "absent from COPYING.md", use: "unknown" },
  kosal: { license: "absent from COPYING.md", use: "unknown" },
};

export function isCommercialSafe(set: PieceSet): boolean {
  return PIECE_SET_LICENSES[set].use === "commercial-ok";
}

export const COMMERCIAL_SAFE_PIECE_SETS: PieceSet[] = PIECE_SETS.filter(
  (set) => PIECE_SET_LICENSES[set].use === "commercial-ok"
);

/**
 * The board every user sees until they pick something else.
 *
 * Was `maestro` (CC BY-NC-SA) — a NonCommercial asset serving as the default
 * for the entire app, including the freemium tier. `cburnett` is GPLv2+, is
 * already what the /puzzles/<rating> landing pages ship and credit, and is the
 * set Wikipedia uses, so it is both safe and unremarkable.
 *
 * Changing this only affects people who never opened the piece-set picker:
 * `pieceSetAtom` is an `atomWithStorage`, which writes to localStorage solely
 * on `set`, and the picker is the only caller. An existing `pieceSet` key is
 * therefore a deliberate choice, and this leaves it alone.
 */
export const DEFAULT_PIECE_SET: PieceSet = "cburnett";
