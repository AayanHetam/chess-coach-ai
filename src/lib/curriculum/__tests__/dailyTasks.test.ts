import { describe, it, expect } from "vitest";
import {
  buildDailySession,
  secondaryTasksFor,
  TASK_MINUTES,
  puzzleMinutesFor,
  type DailyPlanInput,
  type TimeCommitment,
} from "../dailyPlan";
import { minutesPerDayFor } from "../timeCommitment";
import type { PuzzleStats } from "@/lib/puzzleRating";

function statsWith(rating = 1200): PuzzleStats {
  return {
    rating,
    totalAttempts: 0,
    totalSolved: 0,
    totalFailed: 0,
    averageTimeMs: 0,
    currentStreak: 0,
    bestStreak: 0,
    ratingHistory: [],
    themeStats: {},
    recentSolves: [],
  };
}

const input = (over: Partial<DailyPlanInput> = {}): DailyPlanInput => ({
  liveRating: 1200,
  stats: statsWith(),
  dueReviewThemes: [
    "fork",
    "pin",
    "skewer",
    "back-rank",
    "hanging-piece",
    "discovered-attack",
  ],
  ...over,
});

const totalMinutes = (tasks: { minutes: number }[]) =>
  tasks.reduce((a, t) => a + t.minutes, 0);

describe("the session honours the time the user agreed to", () => {
  const bands: TimeCommitment[] = ["under-10", "10-30", "30-plus", "60-plus"];

  it("never budgets more minutes than the commitment, on any band", () => {
    // The whole point of adding analysis and theory by DISPLACING puzzles. If
    // they stacked on top, a 30-minute commitment would silently become 42 —
    // breaking the one promise we made explicitly.
    for (const band of bands) {
      for (const linked of [true, false]) {
        for (const dayIndex of [0, 1]) {
          const s = buildDailySession(
            input({
              dailyTimeCommitment: band,
              hasLinkedAccount: linked,
              dayIndex,
            })
          );
          const budget = minutesPerDayFor(band);
          expect(
            totalMinutes(s.tasks),
            `${band}/linked=${linked}/day=${dayIndex} budgeted ${totalMinutes(s.tasks)} of ${budget}`
          ).toBeLessThanOrEqual(budget);
        }
      }
    }
  });

  it("still gives puzzles once the extras are taken out", () => {
    // Displacement must not starve the session to nothing.
    for (const band of bands) {
      const s = buildDailySession(
        input({ dailyTimeCommitment: band, hasLinkedAccount: true })
      );
      expect(s.totalPuzzles, `${band} had no puzzles`).toBeGreaterThan(0);
    }
  });

  it("leaves the smallest band as puzzles only", () => {
    // 8 minutes cannot hold a 6-minute game review and a session worth doing.
    const s = buildDailySession(
      input({ dailyTimeCommitment: "under-10", hasLinkedAccount: true })
    );
    expect(s.tasks.map((t) => t.kind)).not.toContain("analyze");
    expect(s.tasks.map((t) => t.kind)).not.toContain("theory");
  });

  it("does not shrink the smallest band's puzzle count", () => {
    // No secondary tasks fit there, so the session must be exactly what it was
    // before this change — a regression here would be a silent downgrade.
    const s = buildDailySession(input({ dailyTimeCommitment: "under-10" }));
    expect(s.newThemes).toHaveLength(3);
    expect(s.reviewThemes).toHaveLength(3);
  });

  it("gives the largest band both extras", () => {
    const s = buildDailySession(
      input({ dailyTimeCommitment: "30-plus", hasLinkedAccount: true })
    );
    const kinds = s.tasks.map((t) => t.kind);
    expect(kinds).toContain("analyze");
    expect(kinds).toContain("theory");
  });
});

describe("secondary tasks", () => {
  it("never offers game review without a linked account", () => {
    // A task with no games behind it is a checkbox the user cannot tick.
    for (const dayIndex of [0, 1]) {
      const tasks = secondaryTasksFor(
        input({ hasLinkedAccount: false, dayIndex }),
        30
      );
      expect(tasks.map((t) => t.kind)).not.toContain("analyze");
      expect(tasks.map((t) => t.kind)).toContain("theory");
    }
  });

  it("alternates by day when only one fits", () => {
    // 15 minutes has room for one 6-minute task, not two.
    const even = secondaryTasksFor(
      input({ hasLinkedAccount: true, dayIndex: 0 }),
      15
    );
    const odd = secondaryTasksFor(
      input({ hasLinkedAccount: true, dayIndex: 1 }),
      15
    );
    expect(even).toHaveLength(1);
    expect(odd).toHaveLength(1);
    expect(even[0].kind).not.toBe(odd[0].kind);
  });

  it("prefers game review over theory on the first of alternating days", () => {
    // Your own losses beat general knowledge: one is feedback about the errors
    // actually costing you rating, the other may not touch them at all.
    const tasks = secondaryTasksFor(
      input({ hasLinkedAccount: true, dayIndex: 0 }),
      15
    );
    expect(tasks[0].kind).toBe("analyze");
  });

  it("points theory at our own repertoire, and never off-site", () => {
    // This task linked to Chessly for months, with copy promising we were
    // building our own. We have: 43 generated courses, engine-chosen lines,
    // cut to the player's level. The promise is kept and the link is gone.
    const tasks = secondaryTasksFor(input({ hasLinkedAccount: false }), 30);
    const theory = tasks.find((t) => t.kind === "theory")!;
    expect(theory.href).toBe("/learn");
    expect(theory.external).toBeFalsy();
    expect(theory.detail).not.toMatch(/chessly/i);
    // And it says what the player is actually being asked to do.
    expect(theory.detail).toMatch(/1\.e4/);
  });

  it("names the measured line instead, once we have one", () => {
    const tasks = secondaryTasksFor(
      input({
        hasLinkedAccount: false,
        openingLine: {
          line: "1.e4 c5 2.c3",
          score: 0.31,
          baseline: 0.53,
          games: 84,
          betterMove: "Nf3",
        },
      }),
      30
    );
    const theory = tasks.find((t) => t.kind === "theory")!;

    // No longer sending them off-site to guess which opening to study.
    expect(theory.href).toBe("/plan#opening-line");
    expect(theory.external).toBeUndefined();
    expect(theory.label).toContain("1.e4 c5 2.c3");
    // The claim has to carry its evidence: their score, their own average, and
    // the sample it rests on.
    expect(theory.detail).toContain("31%");
    expect(theory.detail).toContain("53%");
    expect(theory.detail).toContain("84 games");
    expect(theory.detail).toContain("Nf3");
  });

  it("says the position is the problem when the engine likes the move", () => {
    const tasks = secondaryTasksFor(
      input({
        hasLinkedAccount: false,
        openingLine: {
          line: "1.e4 c5 2.c3",
          score: 0.31,
          baseline: 0.53,
          games: 84,
          // No betterMove: the engine had no complaint worth naming.
        },
      }),
      30
    );
    const theory = tasks.find((t) => t.kind === "theory")!;
    expect(theory.detail).toMatch(/sound/i);
    // Must not invent a replacement it was never given.
    expect(theory.detail).not.toMatch(/would rather/i);
  });

  it("keeps its budget when the task is the measured one", () => {
    const withLine = secondaryTasksFor(
      input({
        hasLinkedAccount: true,
        openingLine: {
          line: "1.d4 Nf6 2.c4 g6",
          score: 0.3,
          baseline: 0.5,
          games: 40,
        },
      }),
      30
    );
    const without = secondaryTasksFor(input({ hasLinkedAccount: true }), 30);
    // Same shape, same cost — swapping the destination must not quietly buy
    // itself more of the user's day.
    expect(totalMinutes(withLine)).toBe(totalMinutes(without));
    expect(withLine.map((t) => t.kind)).toEqual(without.map((t) => t.kind));
  });

  it("fits nothing into a budget that cannot hold it", () => {
    expect(secondaryTasksFor(input({ hasLinkedAccount: true }), 8)).toEqual([]);
    expect(secondaryTasksFor(input({ hasLinkedAccount: true }), 0)).toEqual([]);
  });
});

describe("task list shape", () => {
  it("describes every task it returns", () => {
    const s = buildDailySession(
      input({ dailyTimeCommitment: "30-plus", hasLinkedAccount: true })
    );
    expect(s.tasks.length).toBeGreaterThan(0);
    for (const t of s.tasks) {
      expect(t.label, `${t.kind} had no label`).toBeTruthy();
      expect(t.detail, `${t.kind} had no detail`).toBeTruthy();
      expect(t.minutes, `${t.kind} had no minutes`).toBeGreaterThan(0);
      expect(t.href, `${t.kind} had no href`).toBeTruthy();
    }
  });

  it("counts on the puzzle tasks match the themes actually planned", () => {
    // The list is what the user reads; the themes are what the runner fetches.
    // If they disagree the plan promises work the session never delivers.
    const s = buildDailySession(
      input({ dailyTimeCommitment: "30-plus", hasLinkedAccount: true })
    );
    const puzzles = s.tasks.find((t) => t.kind === "puzzles");
    const reviews = s.tasks.find((t) => t.kind === "reviews");
    expect(puzzles?.count).toBe(s.newThemes.length);
    expect(reviews?.count).toBe(s.reviewThemes.length);
    expect((puzzles?.count ?? 0) + (reviews?.count ?? 0)).toBe(s.totalPuzzles);
  });

  it("omits a puzzle task entirely rather than showing a zero", () => {
    const s = buildDailySession(
      input({ dailyTimeCommitment: "30-plus", dueReviewThemes: [] })
    );
    expect(s.reviewThemes).toHaveLength(0);
    expect(s.tasks.map((t) => t.kind)).not.toContain("reviews");
  });

  it("prices a puzzle from its OWN band, not one shared constant", () => {
    // The bands imply different rates (8min/6, 15min/11, 30min/20). A single
    // constant overprices the small ones and pushes them over budget — which
    // is exactly what the budget test above caught.
    expect(puzzleMinutesFor("under-10")).toBeCloseTo(8 / 6, 2);
    expect(puzzleMinutesFor("10-30")).toBeCloseTo(15 / 11, 2);
    expect(puzzleMinutesFor("30-plus")).toBeCloseTo(30 / 20, 2);
    expect(puzzleMinutesFor("60-plus")).toBeCloseTo(60 / 38, 2);
    // And the extras stay fixed — they do not scale with the band.
    expect(TASK_MINUTES.analyze).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WHAT IS OWED OUTRANKS WHAT IS INFERRED
//
// A due card is a decision this player has already been asked and already got
// wrong. The measured weakest line is a weakness we inferred from results. One
// is a fact about them and the other is a hypothesis, and the fact goes first.
// ─────────────────────────────────────────────────────────────────────────────

describe("course reviews on the plan", () => {
  const owed = { courseId: "w-london", name: "London System", due: 4 };

  it("names the course and what is owed, and points at it", () => {
    const tasks = secondaryTasksFor(input({ hasLinkedAccount: false, dueCourse: owed }), 30);
    const theory = tasks.find((t) => t.kind === "theory")!;
    expect(theory.label).toBe("4 to review in the London System");
    expect(theory.href).toBe("/learn/w-london");
    // Nothing here is new, and saying so is the point of an earned card.
    expect(theory.detail).toMatch(/Nothing here is new/);
  });

  it("outranks the measured weakest line", () => {
    const tasks = secondaryTasksFor(
      input({
        hasLinkedAccount: false,
        dueCourse: owed,
        openingLine: { line: "1.e4 c5 2.c3", score: 0.31, baseline: 0.53, games: 84, betterMove: "Nf3" },
      }),
      30
    );
    const theory = tasks.find((t) => t.kind === "theory")!;
    expect(theory.label).toBe("4 to review in the London System");
  });

  // ── Zero by definition ─────────────────────────────────────────────────────
  it("says nothing about reviews when none are owed", () => {
    // Cards are earned. A player whose courses have gone well owes nothing,
    // and the task falls back to what it said before.
    const tasks = secondaryTasksFor(input({ hasLinkedAccount: false }), 30);
    const theory = tasks.find((t) => t.kind === "theory")!;
    expect(theory.label).toBe("Build your repertoire");
    expect(theory.href).toBe("/learn");
  });

  it("counts one decision as one, in words", () => {
    const tasks = secondaryTasksFor(
      input({ hasLinkedAccount: false, dueCourse: { ...owed, due: 1 } }),
      30
    );
    const theory = tasks.find((t) => t.kind === "theory")!;
    expect(theory.label).toBe("1 to review in the London System");
    expect(theory.detail).toMatch(/^One decision .* is due back/);
  });
});
