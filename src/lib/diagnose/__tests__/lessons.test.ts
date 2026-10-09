import { describe, expect, it } from "vitest";
import { MOMENT_BUDGET, countProseWords } from "@/lib/coach/moment";
import { checkLesson } from "@/lib/coach/momentChecks";
import { CAUSE_LESSONS, lessonText } from "../lessons";
import type { DiagnoseCause } from "../gradeAnswer";

const CAUSES: DiagnoseCause[] = [
  "check",
  "hanging",
  "fork",
  "calculation",
  "guess",
];

describe("the five lessons", () => {
  it("one per cause", () => {
    expect(Object.keys(CAUSE_LESSONS).sort()).toEqual([...CAUSES].sort());
  });

  it.each(CAUSES)(
    "%s passes the moment's lesson check, inside its word budget",
    (cause) => {
      expect(checkLesson(CAUSE_LESSONS[cause])).toEqual([]);
      const words = countProseWords(lessonText(cause).replace(/^Lesson: /, ""));
      expect(words).toBeGreaterThanOrEqual(20);
      expect(words).toBeLessThanOrEqual(MOMENT_BUDGET.lessonWords);
    }
  );

  it("is written as the coach writes a lesson, with no dash or semicolon", () => {
    expect(lessonText("hanging")).toBe(
      "Lesson: A loose piece. Before each move, count attackers and defenders on every piece you leave behind, and fix the one that comes up short."
    );
    for (const cause of CAUSES) {
      expect(lessonText(cause)).toMatch(/^Lesson: [A-Z]/);
      expect(lessonText(cause)).not.toMatch(/[—;]/);
    }
  });
});
