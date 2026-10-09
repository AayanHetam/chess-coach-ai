/**
 * The five lessons a graded answer ends with, one per cause (gradeAnswer.ts).
 *
 * Written by the app, never by a model: each is a pattern's name and the
 * check to run before the next move like it, in the moment's lesson shape
 * (moment.ts), so it passes the same lesson check a fielded answer's does
 * (no square, no move, no number) and fits its word budget.
 *
 * Pure and client-safe.
 */
import { renderLesson, type MomentLesson } from "@/lib/coach/moment";
import type { DiagnoseCause } from "./gradeAnswer";

export const CAUSE_LESSONS: Readonly<Record<DiagnoseCause, MomentLesson>> = {
  check: {
    pattern: "A check you didn't see",
    check:
      "Before you let go of a piece, look at every check your opponent has in reply, even the silly-looking ones",
  },
  hanging: {
    pattern: "A loose piece",
    check:
      "Before each move, count attackers and defenders on every piece you leave behind, and fix the one that comes up short",
  },
  fork: {
    pattern: "The fork",
    check:
      "When two of your pieces, or your king and a piece, could be hit by one enemy piece, move one of them before it lands",
  },
  calculation: {
    pattern: "Seen, then played into",
    check:
      "When you spot a threat, picture the board after your move and look for it again before you play",
  },
  guess: {
    pattern: "Moving without the blunder check",
    check:
      "Before every move, ask what your opponent wants to do next: checks first, then captures, then threats",
  },
};

/** The cause's lesson as the coach writes one: "Lesson: <pattern>. <check>." */
export function lessonText(cause: DiagnoseCause): string {
  return renderLesson(CAUSE_LESSONS[cause]);
}
