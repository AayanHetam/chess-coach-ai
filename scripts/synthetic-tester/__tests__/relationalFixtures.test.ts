import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { RELATIONAL_FIXTURES } from "../relationalFixtures";

describe("relational fixtures", () => {
  it("ships at least 15 fixtures (OBJECTIVE.md bar)", () => {
    expect(RELATIONAL_FIXTURES.length).toBeGreaterThanOrEqual(15);
  });

  it("has unique ids", () => {
    const ids = RELATIONAL_FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const f of RELATIONAL_FIXTURES) {
    it(`"${f.id}" is a legal PGN reaching a legal position`, () => {
      const c = new Chess();
      expect(() => c.loadPgn(f.pgn)).not.toThrow();
      // reached a real position with both kings on the board
      const fen = c.fen();
      expect(fen.split(" ")[0]).toMatch(/k/i);
      expect(c.history().length).toBeGreaterThan(0);
    });
  }
});
