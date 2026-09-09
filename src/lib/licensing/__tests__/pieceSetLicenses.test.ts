import { describe, expect, it } from "vitest";
import { PIECE_SETS } from "@/constants";
import { pieceSetAtom } from "@/components/board/states";
import { createStore } from "jotai";
import {
  COMMERCIAL_SAFE_PIECE_SETS,
  DEFAULT_PIECE_SET,
  PIECE_SET_LICENSES,
  isCommercialSafe,
} from "../pieceSetLicenses";

/**
 * The board every user sees must be one we are allowed to show them.
 *
 * The app shipped for months defaulting to "maestro", a CC BY-NC-SA
 * (NonCommercial) set, while a freemium tier existed in the codebase. Nothing
 * could have caught that: the license lived in a Markdown table and the
 * default lived in a TypeScript file, and no code connected the two.
 */
describe("piece set licensing", () => {
  it("defaults to a set that permits commercial use", () => {
    expect(isCommercialSafe(DEFAULT_PIECE_SET)).toBe(true);
  });

  it("is the default the board atom actually hands out", () => {
    // Guards the seam rather than the constant: a correct DEFAULT_PIECE_SET
    // is worth nothing if states.ts goes back to its own literal.
    const store = createStore();
    expect(store.get(pieceSetAtom)).toBe(DEFAULT_PIECE_SET);
  });

  it("classifies every set that ships, with no gaps", () => {
    // The Record type enforces this at compile time; this asserts it at
    // runtime too, so a cast or a stray key can't slip through.
    for (const set of PIECE_SETS) {
      expect(
        PIECE_SET_LICENSES[set],
        `${set} has no license entry`
      ).toBeDefined();
      expect(PIECE_SET_LICENSES[set].license.length).toBeGreaterThan(0);
    }
    expect(Object.keys(PIECE_SET_LICENSES).sort()).toEqual(
      [...PIECE_SETS].sort()
    );
  });

  it("keeps the NonCommercial sets out of the safe list", () => {
    // Spot-check the family that caused this: sadsnake1's sets are all
    // CC BY-NC-SA, and "maestro" is the one that was the default.
    for (const nc of [
      "maestro",
      "fresca",
      "cardinal",
      "staunty",
      "dubrovny",
    ] as const) {
      expect(PIECE_SET_LICENSES[nc].use).toBe("restricted");
      expect(COMMERCIAL_SAFE_PIECE_SETS).not.toContain(nc);
    }
  });

  it("treats an unrecorded license as unsafe, not as permission", () => {
    // governor and kosal ship under public/piece but appear nowhere in
    // COPYING.md. Absence of a stated license is not a grant.
    for (const unknown of ["governor", "kosal"] as const) {
      expect(PIECE_SET_LICENSES[unknown].use).toBe("unknown");
      expect(isCommercialSafe(unknown)).toBe(false);
    }
  });
});
