import { describe, expect, it } from "vitest";
import {
  fieldedProseValidator,
  relationalShadow,
} from "@/lib/mastermind/validators/fielded";
import type { ParserCall } from "@/lib/mastermind/validators/evalClaim";

const FEN = "r1b1kbnr/ppNppppp/2n5/8/8/5N2/P1P1PPPP/2q1KB1R b Kkq - 1 8";

describe("fieldedProseValidator", () => {
  it("is nothing to run when there is no user history and no scout", () => {
    let called = 0;
    const parseCall: ParserCall = async () => {
      called += 1;
      return { raw: "[]", costUsd: 0 };
    };
    expect(
      fieldedProseValidator({ dataSources: {}, correlationId: "c", parseCall })
    ).toBeUndefined();
    expect(called).toBe(0);
  });

  it("a parser that throws is no verdict, never a failed turn", async () => {
    const parseCall: ParserCall = async () => {
      throw new Error("parser down");
    };
    const check = fieldedProseValidator({
      dataSources: { userHistory: { games: [], userName: "me" } },
      correlationId: "c",
      parseCall,
    })!;
    await expect(check("You played well.")).resolves.toMatchObject({
      issues: [],
      passed: true,
    });
  });
});

describe("relationalShadow", () => {
  it("reads the two prose lines only, and counts contradictions by field", async () => {
    let user = "";
    const parseCall: ParserCall = async (o) => {
      user = o.user;
      return {
        raw: JSON.stringify([
          {
            kind: "presence",
            targetSquare: "c1",
            expectedPiece: { type: "q", color: "w" },
            rawText: "your queen still sits on c1",
          },
        ]),
        costUsd: 0.0004,
      };
    };
    const r = await relationalShadow({
      idea: "You went for the check.",
      happens: "After that your queen still sits on c1.",
      fen: FEN,
      correlationId: "c",
      parseCall,
    });
    expect(user).toContain(
      "Coach analysis:\nYou went for the check.\nAfter that your queen still sits on c1."
    );
    expect(user).not.toContain("Lesson:");
    // The white queen is not on c1 (Black's is): the claim in happens is
    // contradicted, and the count is the parser's one claim.
    expect(r.contradicted).toEqual({ idea: 0, happens: 1, unmapped: 0 });
    expect(r.checked).toBe(1);
    expect(r.parserFailed).toBe(false);
    // Numbers and booleans only.
    const flat = JSON.stringify(r);
    expect(flat).not.toContain("queen");
    expect(flat).not.toContain(FEN.split(" ")[0]);
  });

  it("counts every claim the parser returned, a contradicted one among them", async () => {
    const r = await relationalShadow({
      idea: "Black's queen sits on c1.",
      happens: "After that your queen still sits on c1.",
      fen: FEN,
      correlationId: "c",
      parseCall: async () => ({
        raw: JSON.stringify([
          {
            kind: "presence",
            targetSquare: "c1",
            expectedPiece: { type: "q", color: "w" },
            rawText: "your queen still sits on c1",
          },
          {
            kind: "presence",
            targetSquare: "c1",
            expectedPiece: { type: "q", color: "b" },
            rawText: "Black's queen sits on c1",
          },
        ]),
        costUsd: 0,
      }),
    });
    expect(r.contradicted).toEqual({ idea: 0, happens: 1, unmapped: 0 });
    expect(r.checked).toBe(2);
  });

  it("an answer with no JSON in it is a failed parse, not a clean zero", async () => {
    const r = await relationalShadow({
      idea: "a",
      happens: "b",
      fen: FEN,
      correlationId: "c",
      parseCall: async () => ({ raw: "not json at all", costUsd: 0 }),
    });
    expect(r.parserFailed).toBe(true);
    expect(r.checked).toBe(0);
    const empty = await relationalShadow({
      idea: "a",
      happens: "b",
      fen: FEN,
      correlationId: "c",
      parseCall: async () => ({ raw: "[]", costUsd: 0 }),
    });
    expect(empty).toMatchObject({ parserFailed: false, checked: 0 });
  });

  it("a parser that throws says so and counts nothing", async () => {
    const r = await relationalShadow({
      idea: "a",
      happens: "b",
      fen: FEN,
      correlationId: "c",
      parseCall: async () => {
        throw new Error("down");
      },
    });
    expect(r.parserFailed).toBe(true);
    expect(r.checked).toBeNull();
    expect(r.contradicted).toEqual({ idea: 0, happens: 0, unmapped: 0 });
  });
});
