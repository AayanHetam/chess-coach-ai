import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";

import { lookupOpeningByFen } from "../openingName";

function fenAfter(sans: string[]): string {
  const g = new Chess();
  sans.forEach((s) => g.move(s));
  return g.fen();
}

describe("lookupOpeningByFen", () => {
  it("names a position by its placement, whichever move order reached it", () => {
    const najdorf = fenAfter([
      "e4",
      "c5",
      "Nf3",
      "d6",
      "d4",
      "cxd4",
      "Nxd4",
      "Nf6",
      "Nc3",
      "a6",
    ]);
    const named = lookupOpeningByFen(najdorf);
    expect(named?.name).toMatch(/Najdorf/);
    expect(named?.eco).toMatch(/^B9\d$/);
    // Another order into the same placement lands on the same name.
    const transposed = fenAfter([
      "e4",
      "c5",
      "Nc3",
      "d6",
      "Nf3",
      "a6",
      "d4",
      "cxd4",
      "Nxd4",
      "Nf6",
    ]);
    expect(lookupOpeningByFen(transposed)?.name).toBe(named?.name);
  });

  it("names the entries the library lists without a PGN", () => {
    // 1.e4 c5 is named only by its placement in the library; an index built
    // by replaying PGNs had nothing for it.
    expect(lookupOpeningByFen(fenAfter(["e4", "c5"]))?.name).toMatch(
      /Sicilian/
    );
    expect(lookupOpeningByFen(fenAfter(["e4"]))?.name).toBeTruthy();
  });

  it("names the entries the library lists with a PGN and no placement", () => {
    // 289 entries have `fen: null`; their PGN is replayed to a placement.
    expect(lookupOpeningByFen(fenAfter(["h4", "a5"]))?.name).toMatch(/Kádas/);
  });

  it("is null for a position no named opening reaches", () => {
    expect(
      lookupOpeningByFen(
        "3r2k1/1p3pp1/p1n1b2p/4p3/2P1P3/1P2BN1P/P4PP1/3R2K1 w - - 3 27"
      )
    ).toBeNull();
    expect(lookupOpeningByFen("")).toBeNull();
  });

  it("ignores everything after the placement", () => {
    const fen = fenAfter(["e4", "e5", "Nf3", "Nc6", "Bb5"]);
    expect(lookupOpeningByFen(fen.split(" ")[0])).toEqual(
      lookupOpeningByFen(fen)
    );
    expect(lookupOpeningByFen(fen)?.name).toMatch(/Ruy L/);
  });
});
