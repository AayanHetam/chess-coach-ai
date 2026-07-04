import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { Chess } from "chess.js";

const SET_PATH = join("scripts", "synthetic-tester", "fixtures", "helpfulness", "eval-set-50.json");

interface Entry {
  id: string;
  moveHistory: string[];
  movePlayedSan: string;
  fenBefore: string;
  fenAfter: string;
  playerColor: "w" | "b";
  userRating: number;
  tier: string;
  kind: string;
}

describe("frozen helpfulness eval set", () => {
  const exists = existsSync(SET_PATH);
  it("file exists (run buildHelpfulnessEvalSet.ts to generate)", () => {
    expect(exists).toBe(true);
  });
  if (!exists) return;

  const data = JSON.parse(readFileSync(SET_PATH, "utf8")) as { entries: Entry[] };
  const entries = data.entries;

  it("has at least 50 positions", () => {
    expect(entries.length).toBeGreaterThanOrEqual(50);
  });

  it("has unique ids", () => {
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  });

  it("spans all three rating tiers", () => {
    const tiers = new Set(entries.map((e) => e.tier));
    expect(tiers.has("beginner")).toBe(true);
    expect(tiers.has("intermediate")).toBe(true);
    expect(tiers.has("advanced")).toBe(true);
  });

  it("covers both error and best-move kinds (>=10 each) for dim-2 paths", () => {
    const err = entries.filter((e) => e.kind === "error").length;
    const best = entries.filter((e) => e.kind === "best").length;
    expect(err).toBeGreaterThanOrEqual(10);
    expect(best).toBeGreaterThanOrEqual(10);
  });

  it("every entry is a legal position reached by its moveHistory ending in movePlayedSan", () => {
    for (const e of entries) {
      const c = new Chess();
      expect(() => {
        for (const m of e.moveHistory) c.move(m);
      }, `${e.id} moveHistory must be legal`).not.toThrow();
      expect(c.fen(), `${e.id} fenAfter mismatch`).toBe(e.fenAfter);
      expect(e.moveHistory[e.moveHistory.length - 1], `${e.id} last move`).toBe(e.movePlayedSan);
    }
  });
});
