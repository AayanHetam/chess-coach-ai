import { describe, expect, it } from "vitest";
import { refereeFollowUp } from "@/lib/contract/followUpReferee";
import { toCompactContract } from "@/lib/contract/followUp";
import { makeContract, makeInsight } from "./insightFactory";

/**
 * A draft the Mastermind pipeline rejected can be served instead of its
 * template when the objection travels with it: each validator issue names
 * the span it was about (`llm_span`), and the referee drops the sentence
 * holding that span, whatever else would have licensed it.
 */
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const compact = toCompactContract(makeContract([makeInsight({})]), ["M1"]);

function run(reply: string, flaggedSpans?: string[]) {
  return refereeFollowUp({
    reply,
    compact,
    activeFen: START,
    moveHistory: [],
    flaggedSpans,
  });
}

describe("followUpReferee — validator-flagged spans", () => {
  const reply =
    "A natural developing move. Black's king is in real trouble now.\n\nLesson: Look for the reply before you commit.";

  it("control: without a flag the sentence stands", () => {
    const r = run(reply);
    expect(r.text).toContain("Black's king is in real trouble now.");
    expect(r.dropped).toEqual([]);
  });

  it("drops the sentence a validator contradicted, and keeps the rest", () => {
    const r = run(reply, ["Black's king is in real trouble now"]);
    expect(r.text).toContain("A natural developing move.");
    expect(r.text).not.toContain("real trouble");
    expect(r.text).toContain("Lesson: Look for the reply before you commit.");
    expect(r.dropped).toEqual([
      { sentence: "Black's king is in real trouble now.", reason: "validator" },
    ]);
  });

  it("a span joined with ' | ' lands on every sentence it names", () => {
    const r = run(
      "The centre is yours. White is completely winning. The rook stays passive.",
      ["The rook stays passive | White is completely winning"]
    );
    expect(r.text).toBe("The centre is yours.");
    expect(r.dropped.map((d) => d.reason)).toEqual(["validator", "validator"]);
  });

  it("a span that runs across two sentences drops both", () => {
    const r = run("The knight is lost. So is the game. Play on anyway.", [
      "The knight is lost. So is the game.",
    ]);
    expect(r.text).toBe("Play on anyway.");
  });

  it("outranks the definitional exemption", () => {
    // "A fork is when…" is normally left alone as a definition; a validator
    // that objected to it still wins.
    const r = run("A fork is when one piece attacks two at once.", [
      "A fork is when one piece attacks two at once",
    ]);
    expect(r.text).not.toContain("A fork is when");
  });

  it("matches through markdown emphasis and trailing punctuation", () => {
    const r = run("Your **bishop** is doing nothing here. Keep going.", [
      "Your bishop is doing nothing here.",
    ]);
    expect(r.text).toBe("Keep going.");
  });

  it("ignores spans too short to mean anything", () => {
    const r = run("Play e4. Then develop.", ["e4", "", "  "]);
    expect(r.text).toBe("Play e4. Then develop.");
  });
});
