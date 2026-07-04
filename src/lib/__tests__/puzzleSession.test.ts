import { describe, it, expect } from "vitest";
import {
  buildSavedSession,
  appendSession,
  mergeSessions,
  sessionSolvedCount,
  sessionMissed,
  sessionNetDelta,
  sessionDurationMs,
  formatDuration,
  type SessionResult,
  type SavedPuzzleSession,
} from "@/lib/puzzleSession";

function result(
  id: string,
  solved: boolean,
  ratingBefore: number,
  ratingAfter: number,
  timeMs = 1000,
): SessionResult {
  return {
    id,
    solved,
    ratingBefore,
    ratingAfter,
    theme: "fork",
    timeMs,
    puzzle: { id, fen: "8/8/8/8/8/8/8/K6k w - - 0 1", solution: ["a1a2"], themes: ["fork"], rating: ratingBefore },
  };
}

describe("buildSavedSession", () => {
  it("brackets rating from first ratingBefore to last ratingAfter", () => {
    const results = [
      result("a", true, 1200, 1215),
      result("b", false, 1215, 1200),
      result("c", true, 1200, 1218),
    ];
    const s = buildSavedSession(results, {
      id: "s1",
      startedAt: 1000,
      endedAt: 5000,
      endReason: "finished",
    });
    expect(s.ratingStart).toBe(1200);
    expect(s.ratingEnd).toBe(1218);
    expect(sessionNetDelta(s)).toBe(18);
    expect(sessionDurationMs(s)).toBe(4000);
    expect(s.endReason).toBe("finished");
  });

  it("handles an empty result list without throwing", () => {
    const s = buildSavedSession([], {
      id: "s0",
      startedAt: 0,
      endedAt: 0,
      endReason: "idle",
    });
    expect(s.ratingStart).toBe(0);
    expect(s.ratingEnd).toBe(0);
    expect(s.results).toHaveLength(0);
  });
});

describe("session counters", () => {
  const s = buildSavedSession(
    [
      result("a", true, 1200, 1215),
      result("b", false, 1215, 1200),
      result("c", false, 1200, 1188),
    ],
    { id: "s", startedAt: 0, endedAt: 1, endReason: "finished" },
  );

  it("counts solved correctly", () => {
    expect(sessionSolvedCount(s)).toBe(1);
  });

  it("returns the missed puzzles (for re-practice)", () => {
    const missed = sessionMissed(s);
    expect(missed.map((r) => r.id)).toEqual(["b", "c"]);
    // The full puzzle payload must survive so it can be replayed.
    expect(missed[0].puzzle.solution).toEqual(["a1a2"]);
  });
});

describe("appendSession", () => {
  it("prepends newest-first and caps at 50", () => {
    let history: SavedPuzzleSession[] = [];
    for (let i = 0; i < 55; i++) {
      const s = buildSavedSession([result(`p${i}`, true, 1200, 1201)], {
        id: `s${i}`,
        startedAt: i,
        endedAt: i + 1,
        endReason: "finished",
      });
      history = appendSession(history, s);
    }
    expect(history).toHaveLength(50);
    expect(history[0].id).toBe("s54"); // newest first
    expect(history[49].id).toBe("s5"); // oldest 5 dropped
  });
});

describe("appendSession dedup", () => {
  it("replaces an existing session with the same id (no duplicate)", () => {
    const v1 = buildSavedSession([result("a", false, 1200, 1190)], {
      id: "sX",
      startedAt: 0,
      endedAt: 1,
      endReason: "closed",
    });
    const v2 = buildSavedSession([result("a", true, 1200, 1215)], {
      id: "sX",
      startedAt: 0,
      endedAt: 2,
      endReason: "finished",
    });
    const after = appendSession(appendSession([], v1), v2);
    expect(after).toHaveLength(1);
    expect(after[0].endReason).toBe("finished");
  });
});

describe("mergeSessions", () => {
  it("merges by id (primary wins), newest-first", () => {
    const mk = (id: string, startedAt: number, reason: "finished" | "idle") =>
      buildSavedSession([result(id, true, 1200, 1201)], {
        id,
        startedAt,
        endedAt: startedAt + 1,
        endReason: reason,
      });
    const server = [mk("a", 100, "finished"), mk("b", 300, "finished")];
    const local = [mk("b", 300, "idle"), mk("c", 200, "idle")];
    const merged = mergeSessions(server, local);
    expect(merged.map((s) => s.id)).toEqual(["b", "c", "a"]); // by startedAt desc
    // 'b' exists in both — server (primary) wins.
    expect(merged.find((s) => s.id === "b")!.endReason).toBe("finished");
  });
});

describe("formatDuration", () => {
  it("formats sub-minute, minute, and hour durations", () => {
    expect(formatDuration(42_000)).toBe("42s");
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(192_000)).toBe("3m 12s");
    expect(formatDuration(3_600_000)).toBe("1h");
    expect(formatDuration(3_840_000)).toBe("1h 4m");
  });
});
