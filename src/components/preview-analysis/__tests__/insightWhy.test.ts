import { describe, expect, it } from "vitest";
import { splitInsightWhy } from "../insightWhy";

// A real refereed card body (fixture 05, 20. Rg3), tokens and all.
const LABELLED = [
  "Idea: You probably wanted to activate the rook and pile pressure on the g-file, which is a reasonable instinct when you're ahead.",
  "Problem: Your knight on a7 was already attacking the undefended bishop on c8, and the queen on f7 was under pressure. The position was screaming for an immediate capture, but 20. Rg3 left the rook where it could be taken.",
  "Solution: The engine's path is 20. Nxc8+, which takes the bishop on c8 and gives check. After the king steps to e8, 21. Nxf7 scoops the queen.",
  "Outcome: Instead, the rook on g3 became a liability the moment it landed, and White handed back a monster advantage.",
  "The takeaway: when you have a free piece sitting under attack AND a forcing check available, capture first — active pieces don't wait.",
  "[CONTINUATION:20:w]",
  "[MAIA_CONTINUATION:20:w]",
].join("\n");

// A gold-example body: flowing paragraphs, no labels.
const FLOWING = [
  "You probably wanted to keep the queen connected to the rook, and that instinct is good! But this move hands White a resource: the knight hop to c5 forks the queen on d7 and the bishop on b7.",
  "The engine's path keeps everything safe: 18... Qe7 followed by Nf3 Rd8, and Black is still right in the game at -0.35.",
  "Here's the pattern to bank: before parking your queen, scan every knight-hop landing square around her AND your loose pieces.",
].join("\n");

describe("splitInsightWhy — a labelled body", () => {
  const parts = splitInsightWhy(LABELLED);

  it("leads with the intent and the reason", () => {
    expect(parts.lead).toContain("Idea: You probably wanted to activate the rook");
    expect(parts.lead).toContain("Problem: Your knight on a7");
    expect(parts.lead).not.toContain("Solution:");
  });

  it("lifts the takeaway out as the lesson, without its label", () => {
    expect(parts.lesson).toBe(
      "when you have a free piece sitting under attack AND a forcing check available, capture first — active pieces don't wait.",
    );
  });

  it("keeps the solution and the outcome for the pill, and drops the line tokens", () => {
    expect(parts.rest).toContain("Solution: The engine's path is 20. Nxc8+");
    expect(parts.rest).toContain("Outcome: Instead, the rook on g3");
    expect(parts.rest).not.toContain("[CONTINUATION");
    expect(parts.lead).not.toContain("[CONTINUATION");
  });

  it("has no lesson when the body ends on its Outcome", () => {
    const noLesson = splitInsightWhy(LABELLED.split("\n").filter((l) => !l.startsWith("The takeaway")).join("\n"));
    expect(noLesson.lesson).toBeNull();
    expect(noLesson.rest).toContain("Outcome:");
  });
});

describe("splitInsightWhy — flowing paragraphs", () => {
  const parts = splitInsightWhy(FLOWING);

  it("first paragraph leads, last is the lesson, the middle waits", () => {
    expect(parts.lead).toMatch(/^You probably wanted to keep the queen connected/);
    expect(parts.lesson).toBe(
      "before parking your queen, scan every knight-hop landing square around her AND your loose pieces.",
    );
    expect(parts.rest).toMatch(/^The engine's path keeps everything safe/);
  });

  it("two paragraphs: lead and lesson, nothing behind the pill", () => {
    const two = splitInsightWhy("You wanted tempo.\nLesson: count first.");
    expect(two).toEqual({ lead: "You wanted tempo.", lesson: "count first.", rest: "" });
  });

  it("one paragraph: all lead", () => {
    expect(splitInsightWhy("Just this.")).toEqual({ lead: "Just this.", lesson: null, rest: "" });
  });

  it("a trailing bullet list is not a lesson", () => {
    const parts = splitInsightWhy("Lead.\nMiddle.\n- a bullet\n- another");
    expect(parts.lesson).toBeNull();
    expect(parts.rest).toBe("Middle.\n- a bullet\n- another");
  });

  it("empty in, empty out", () => {
    expect(splitInsightWhy(undefined)).toEqual({ lead: "", lesson: null, rest: "" });
    expect(splitInsightWhy("[CONTINUATION:5:b]\n[MAIA_CONTINUATION:5:b]")).toEqual({ lead: "", lesson: null, rest: "" });
  });
});
