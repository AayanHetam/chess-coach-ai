import { describe, expect, it } from "vitest";
import {
  mergeDailyLog,
  pruneDailyLog,
  puzzlesOn,
  recordDay,
  trainedOn,
  type DailyLog,
} from "@/lib/curriculum/dailyLog";

describe("recordDay", () => {
  it("starts a day at one puzzle", () => {
    expect(recordDay({}, "2026-08-10", "fork")).toEqual({
      "2026-08-10": { puzzles: 1, themes: ["fork"] },
    });
  });

  it("accumulates puzzles within a day", () => {
    let log: DailyLog = {};
    for (let i = 0; i < 5; i++) log = recordDay(log, "2026-08-10", "fork");
    expect(puzzlesOn(log, "2026-08-10")).toBe(5);
  });

  it("keeps themes distinct while counting every puzzle", () => {
    let log = recordDay({}, "2026-08-10", "fork");
    log = recordDay(log, "2026-08-10", "fork");
    log = recordDay(log, "2026-08-10", "pin");
    expect(log["2026-08-10"]).toEqual({ puzzles: 3, themes: ["fork", "pin"] });
  });

  it("records an untagged puzzle without inventing a theme", () => {
    const log = recordDay({}, "2026-08-10");
    expect(log["2026-08-10"]).toEqual({ puzzles: 1, themes: [] });
  });

  it("does not mutate the input", () => {
    const before: DailyLog = { "2026-08-10": { puzzles: 1, themes: ["fork"] } };
    recordDay(before, "2026-08-10", "pin");
    expect(before["2026-08-10"]).toEqual({ puzzles: 1, themes: ["fork"] });
  });

  it("keeps days independent", () => {
    let log = recordDay({}, "2026-08-10", "fork");
    log = recordDay(log, "2026-08-11", "pin");
    expect(puzzlesOn(log, "2026-08-10")).toBe(1);
    expect(puzzlesOn(log, "2026-08-11")).toBe(1);
  });
});

describe("trainedOn", () => {
  it("is false for a day with no record and true once one exists", () => {
    expect(trainedOn({}, "2026-08-10")).toBe(false);
    expect(trainedOn(recordDay({}, "2026-08-10"), "2026-08-10")).toBe(true);
  });
});

describe("pruneDailyLog", () => {
  const log: DailyLog = {
    "2026-07-01": { puzzles: 3, themes: [] },
    "2026-08-01": { puzzles: 4, themes: [] },
    "2026-08-10": { puzzles: 5, themes: [] },
  };

  it("drops days outside the window and keeps the rest", () => {
    const pruned = pruneDailyLog(log, "2026-08-10", 30);
    // Window is 2026-07-12 .. 2026-08-10 inclusive.
    expect(Object.keys(pruned).sort()).toEqual(["2026-08-01", "2026-08-10"]);
  });

  it("keeps today even with a window of one", () => {
    const pruned = pruneDailyLog(log, "2026-08-10", 1);
    expect(Object.keys(pruned)).toEqual(["2026-08-10"]);
  });

  it("retains a full week for the week grid", () => {
    // The grid renders 7 cells; the default window must cover all of them.
    const week: DailyLog = {};
    for (let d = 4; d <= 10; d++) {
      week[`2026-08-0${d}`] = { puzzles: 1, themes: [] };
    }
    expect(Object.keys(pruneDailyLog(week, "2026-08-10"))).toHaveLength(7);
  });
});

describe("mergeDailyLog", () => {
  it("unions days present on only one side", () => {
    const a: DailyLog = { "2026-08-10": { puzzles: 2, themes: ["fork"] } };
    const b: DailyLog = { "2026-08-11": { puzzles: 3, themes: ["pin"] } };
    expect(Object.keys(mergeDailyLog(a, b)).sort()).toEqual([
      "2026-08-10",
      "2026-08-11",
    ]);
  });

  it("takes the max count for a shared day, never the sum", () => {
    // Both copies may hold the SAME session — local wrote it, the replica
    // received it. Summing would double every synced day.
    const a: DailyLog = { "2026-08-10": { puzzles: 5, themes: ["fork"] } };
    const b: DailyLog = { "2026-08-10": { puzzles: 5, themes: ["fork"] } };
    expect(mergeDailyLog(a, b)["2026-08-10"].puzzles).toBe(5);
  });

  it("unions themes for a shared day", () => {
    const a: DailyLog = { "2026-08-10": { puzzles: 2, themes: ["fork"] } };
    const b: DailyLog = { "2026-08-10": { puzzles: 4, themes: ["pin"] } };
    const m = mergeDailyLog(a, b)["2026-08-10"];
    expect(m.puzzles).toBe(4);
    expect(m.themes.sort()).toEqual(["fork", "pin"]);
  });

  it("is order-independent and idempotent", () => {
    const a: DailyLog = { "2026-08-10": { puzzles: 2, themes: ["fork"] } };
    const b: DailyLog = { "2026-08-10": { puzzles: 7, themes: ["pin"] } };
    expect(mergeDailyLog(a, b)).toEqual(mergeDailyLog(b, a));
    const once = mergeDailyLog(a, b);
    expect(mergeDailyLog(once, once)).toEqual(once);
  });
});
