import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  findMistakePuzzles,
  categorizeMistake,
  buildPuzzleExplanation,
} from "../mistakePuzzles";
import type { MistakeContext } from "../mistakeToPuzzleMapper";

const INPUT = {
  fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
  movePlayed: "Nf6",
  correctMove: "Bc5",
  evalBefore: 20,
  evalAfter: 60,
  tacticalMotifs: ["fork"],
  userRating: 1400,
};

describe("findMistakePuzzles — Neo4j-unconfigured degradation", () => {
  const saved = {
    uri: process.env.NEO4J_URI,
    user: process.env.NEO4J_USERNAME,
    pass: process.env.NEO4J_PASSWORD,
  };

  beforeEach(() => {
    delete process.env.NEO4J_URI;
    delete process.env.NEO4J_USERNAME;
    delete process.env.NEO4J_PASSWORD;
  });

  afterEach(() => {
    if (saved.uri) process.env.NEO4J_URI = saved.uri; else delete process.env.NEO4J_URI;
    if (saved.user) process.env.NEO4J_USERNAME = saved.user; else delete process.env.NEO4J_USERNAME;
    if (saved.pass) process.env.NEO4J_PASSWORD = saved.pass; else delete process.env.NEO4J_PASSWORD;
  });

  it("returns notConfigured with empty puzzles instead of throwing", async () => {
    // This is the whole point of the extraction: the old code did
    // `fetch("http://localhost:3000/...")`, which threw on Vercel. In-process,
    // an unconfigured Neo4j degrades cleanly so the coach ships empty recs
    // rather than console-erroring on every analysis.
    const result = await findMistakePuzzles(INPUT);
    expect(result.notConfigured).toBe(true);
    expect(result.puzzles).toEqual([]);
    expect(result.mistakeSeverity).toBe(categorizeMistake(INPUT.evalBefore, INPUT.evalAfter));
  });
});

describe("categorizeMistake", () => {
  it("classifies by absolute eval drop", () => {
    expect(categorizeMistake(0, 600)).toBe("blunder");
    expect(categorizeMistake(0, 400)).toBe("mistake");
    expect(categorizeMistake(0, 100)).toBe("inaccuracy");
  });
  it("is sign-agnostic (uses |drop|)", () => {
    expect(categorizeMistake(600, 0)).toBe("blunder");
  });
});

describe("buildPuzzleExplanation", () => {
  const ctx: MistakeContext = {
    fen: INPUT.fen,
    movePlayed: INPUT.movePlayed,
    correctMove: INPUT.correctMove,
    evalBefore: 0,
    evalAfter: 600,
    tacticalMotifs: ["Fork"],
    piecesInvolved: ["Nc6"],
    keySquares: ["d5"],
  };

  it("returns a fallback line when there are no puzzles", () => {
    expect(buildPuzzleExplanation(ctx, 0)).toContain("No matching puzzles");
  });

  it("describes the missed tactic and puzzle count", () => {
    const out = buildPuzzleExplanation(ctx, 3);
    expect(out).toContain("missed a critical tactic");
    expect(out).toContain("fork");
    expect(out).toContain("3 puzzles");
  });
});
