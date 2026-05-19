import { describe, it, expect } from "vitest";
import {
  aggregateWinRateByTimeControl,
  aggregateScoreByOpening,
  countGamesInDateRange,
  type UserHistoryGame,
} from "@/lib/mastermind/userHistoryAggregates";

// ──────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ──────────────────────────────────────────────────────────────────────────

function pgn(opening?: string, eco?: string, variation?: string): string {
  const lines: string[] = [];
  if (eco) lines.push(`[ECO "${eco}"]`);
  if (opening) lines.push(`[Opening "${opening}"]`);
  if (variation) lines.push(`[Variation "${variation}"]`);
  lines.push("");
  lines.push("1. e4 e5 2. Nf3 *");
  return lines.join("\n");
}

function game(opts: Partial<UserHistoryGame> & { whiteName?: string; blackName?: string }): UserHistoryGame {
  return {
    pgn: opts.pgn ?? "1. e4 *",
    white: { name: opts.whiteName ?? "white_player" },
    black: { name: opts.blackName ?? "black_player" },
    result: opts.result,
    timeControl: opts.timeControl,
    date: opts.date,
    createdAt: opts.createdAt,
  };
}

const USER = "Aayan";

// ──────────────────────────────────────────────────────────────────────────
// aggregateWinRateByTimeControl
// ──────────────────────────────────────────────────────────────────────────

describe("aggregateWinRateByTimeControl", () => {
  it("returns [] for empty games", () => {
    expect(aggregateWinRateByTimeControl([], USER)).toEqual([]);
  });

  it("returns [] for empty userName", () => {
    const games = [game({ whiteName: USER, result: "1-0", timeControl: "300+5" })];
    expect(aggregateWinRateByTimeControl(games, "")).toEqual([]);
  });

  it("returns [] for whitespace-only userName", () => {
    const games = [game({ whiteName: USER, result: "1-0", timeControl: "300+5" })];
    expect(aggregateWinRateByTimeControl(games, "   ")).toEqual([]);
  });

  it("counts a win when user played white and result is 1-0", () => {
    const games = [game({ whiteName: USER, result: "1-0", timeControl: "300+5" })];
    const r = aggregateWinRateByTimeControl(games, USER);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ timeControl: "300+5", wins: 1, draws: 0, losses: 0, totalGames: 1, scorePct: 100 });
  });

  it("counts a loss when user played black and result is 1-0", () => {
    const games = [game({ blackName: USER, result: "1-0", timeControl: "300+5" })];
    const r = aggregateWinRateByTimeControl(games, USER);
    expect(r[0]).toMatchObject({ wins: 0, losses: 1 });
  });

  it("counts a win when user played black and result is 0-1", () => {
    const games = [game({ blackName: USER, result: "0-1", timeControl: "300+5" })];
    const r = aggregateWinRateByTimeControl(games, USER);
    expect(r[0]).toMatchObject({ wins: 1, losses: 0 });
  });

  it("counts a draw on 1/2-1/2 regardless of color", () => {
    const games = [
      game({ whiteName: USER, result: "1/2-1/2", timeControl: "rapid" }),
      game({ blackName: USER, result: "1/2-1/2", timeControl: "rapid" }),
    ];
    const r = aggregateWinRateByTimeControl(games, USER);
    expect(r[0].draws).toBe(2);
  });

  it("skips games with result '*' (unfinished)", () => {
    const games = [
      game({ whiteName: USER, result: "*", timeControl: "300+5" }),
      game({ whiteName: USER, result: "1-0", timeControl: "300+5" }),
    ];
    const r = aggregateWinRateByTimeControl(games, USER);
    expect(r[0].totalGames).toBe(1);
  });

  it("skips games with timeControl missing", () => {
    const games = [
      game({ whiteName: USER, result: "1-0", timeControl: undefined }),
      game({ whiteName: USER, result: "1-0", timeControl: "300+5" }),
    ];
    const r = aggregateWinRateByTimeControl(games, USER);
    expect(r).toHaveLength(1);
    expect(r[0].timeControl).toBe("300+5");
  });

  it("skips games where the user is on neither side", () => {
    const games = [
      game({ whiteName: "stranger1", blackName: "stranger2", result: "1-0", timeControl: "300+5" }),
    ];
    expect(aggregateWinRateByTimeControl(games, USER)).toEqual([]);
  });

  it("matches userName case-insensitively", () => {
    const games = [game({ whiteName: "AAYAN", result: "1-0", timeControl: "300+5" })];
    const r = aggregateWinRateByTimeControl(games, "aayan");
    expect(r[0].wins).toBe(1);
  });

  it("matches userName as substring (Aayan matches Aayan_K)", () => {
    const games = [game({ whiteName: "Aayan_K", result: "1-0", timeControl: "300+5" })];
    const r = aggregateWinRateByTimeControl(games, USER);
    expect(r[0].wins).toBe(1);
  });

  it("buckets multiple time controls and sorts by totalGames desc", () => {
    const games = [
      game({ whiteName: USER, result: "1-0", timeControl: "rapid" }),
      game({ whiteName: USER, result: "1-0", timeControl: "rapid" }),
      game({ whiteName: USER, result: "1-0", timeControl: "blitz" }),
      game({ whiteName: USER, result: "1-0", timeControl: "rapid" }),
    ];
    const r = aggregateWinRateByTimeControl(games, USER);
    expect(r).toHaveLength(2);
    expect(r[0].timeControl).toBe("rapid");
    expect(r[0].totalGames).toBe(3);
    expect(r[1].timeControl).toBe("blitz");
    expect(r[1].totalGames).toBe(1);
  });

  it("scorePct: 5W 2D 3L → 60%", () => {
    const games = [
      ...Array(5).fill(null).map(() => game({ whiteName: USER, result: "1-0", timeControl: "rapid" })),
      ...Array(2).fill(null).map(() => game({ whiteName: USER, result: "1/2-1/2", timeControl: "rapid" })),
      ...Array(3).fill(null).map(() => game({ blackName: USER, result: "1-0", timeControl: "rapid" })),
    ];
    const r = aggregateWinRateByTimeControl(games, USER);
    expect(r[0].scorePct).toBe(60);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// aggregateScoreByOpening
// ──────────────────────────────────────────────────────────────────────────

describe("aggregateScoreByOpening", () => {
  it("returns [] for empty games", () => {
    expect(aggregateScoreByOpening([], USER)).toEqual([]);
  });

  it("returns [] for empty userName", () => {
    const games = [game({ whiteName: USER, result: "1-0", pgn: pgn("Sicilian", "B23") })];
    expect(aggregateScoreByOpening(games, "")).toEqual([]);
  });

  it("parses ECO + Opening + Variation from PGN headers", () => {
    const games = [
      game({
        whiteName: USER,
        result: "1-0",
        pgn: pgn("Sicilian Defense", "B90", "Najdorf"),
      }),
    ];
    const r = aggregateScoreByOpening(games, USER);
    expect(r[0]).toMatchObject({
      eco: "B90",
      opening: "Sicilian Defense",
      variation: "Najdorf",
      color: "white",
      wins: 1,
    });
  });

  it("creates a bucket with empty opening when only ECO is present", () => {
    const games = [
      game({ whiteName: USER, result: "1-0", pgn: `[ECO "B90"]\n\n1. e4 *` }),
    ];
    const r = aggregateScoreByOpening(games, USER);
    expect(r[0]).toMatchObject({ eco: "B90", opening: "" });
  });

  it("skips games with neither ECO nor Opening", () => {
    const games = [
      game({ whiteName: USER, result: "1-0", pgn: "1. e4 e5 *" }),
    ];
    expect(aggregateScoreByOpening(games, USER)).toEqual([]);
  });

  it("creates two buckets for same opening played as both colors", () => {
    const games = [
      game({ whiteName: USER, result: "1-0", pgn: pgn("Sicilian", "B23") }),
      game({ blackName: USER, result: "0-1", pgn: pgn("Sicilian", "B23") }),
    ];
    const r = aggregateScoreByOpening(games, USER);
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.color).sort()).toEqual(["black", "white"]);
  });

  it("color filter restricts to user-played-color games", () => {
    const games = [
      game({ whiteName: USER, result: "1-0", pgn: pgn("Sicilian", "B23") }),
      game({ blackName: USER, result: "0-1", pgn: pgn("Sicilian", "B23") }),
    ];
    const onlyWhite = aggregateScoreByOpening(games, USER, "white");
    expect(onlyWhite).toHaveLength(1);
    expect(onlyWhite[0].color).toBe("white");
  });

  it("sorts buckets by totalGames descending", () => {
    const games = [
      game({ whiteName: USER, result: "1-0", pgn: pgn("Sicilian", "B23") }),
      game({ whiteName: USER, result: "1-0", pgn: pgn("French", "C00") }),
      game({ whiteName: USER, result: "1-0", pgn: pgn("French", "C00") }),
      game({ whiteName: USER, result: "1-0", pgn: pgn("French", "C00") }),
    ];
    const r = aggregateScoreByOpening(games, USER);
    expect(r[0].opening).toBe("French");
    expect(r[0].totalGames).toBe(3);
  });

  it("scorePct computed correctly per opening bucket", () => {
    const games = [
      game({ whiteName: USER, result: "1-0", pgn: pgn("Sicilian", "B23") }), // W
      game({ whiteName: USER, result: "1/2-1/2", pgn: pgn("Sicilian", "B23") }), // D
      game({ whiteName: USER, result: "0-1", pgn: pgn("Sicilian", "B23") }), // L
    ];
    const r = aggregateScoreByOpening(games, USER);
    expect(r[0].scorePct).toBe(50);
  });

  it("matches userName case-insensitively + substring", () => {
    const games = [
      game({ whiteName: "AAYAN_K", result: "1-0", pgn: pgn("Sicilian", "B23") }),
    ];
    const r = aggregateScoreByOpening(games, "aayan");
    expect(r).toHaveLength(1);
  });

  it("uppercases ECO from PGN", () => {
    const games = [
      game({ whiteName: USER, result: "1-0", pgn: `[ECO "b90"]\n[Opening "Sicilian"]\n\n1. e4 *` }),
    ];
    const r = aggregateScoreByOpening(games, USER);
    expect(r[0].eco).toBe("B90");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// countGamesInDateRange
// ──────────────────────────────────────────────────────────────────────────

describe("countGamesInDateRange", () => {
  // Helpers for deterministic Firestore-shaped timestamps in tests
  const dayMs = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day);

  it("counts games inside the range", () => {
    const games = [
      game({ createdAt: dayMs(2026, 5, 1) }),
      game({ createdAt: dayMs(2026, 5, 15) }),
      game({ createdAt: dayMs(2026, 4, 15) }),
    ];
    const r = countGamesInDateRange(games, dayMs(2026, 5, 1), dayMs(2026, 5, 31));
    expect(r.count).toBe(2);
  });

  it("parses Firestore { _seconds, _nanoseconds } shape", () => {
    const games = [
      game({ createdAt: { _seconds: dayMs(2026, 5, 10) / 1000, _nanoseconds: 0 } }),
    ];
    const r = countGamesInDateRange(games, dayMs(2026, 5, 1), dayMs(2026, 5, 31));
    expect(r.count).toBe(1);
  });

  it("parses native Firestore Timestamp-like { seconds } shape", () => {
    const games = [
      game({ createdAt: { seconds: dayMs(2026, 5, 10) / 1000 } }),
    ];
    const r = countGamesInDateRange(games, dayMs(2026, 5, 1), dayMs(2026, 5, 31));
    expect(r.count).toBe(1);
  });

  it("falls back to PGN date string when createdAt missing", () => {
    const games = [game({ date: "2026.05.10" })];
    const r = countGamesInDateRange(games, dayMs(2026, 5, 1), dayMs(2026, 5, 31));
    expect(r.count).toBe(1);
  });

  it("skips games with '????.??.??' sentinel date", () => {
    const games = [game({ date: "????.??.??" })];
    const r = countGamesInDateRange(games, dayMs(2026, 5, 1), dayMs(2026, 5, 31));
    expect(r.count).toBe(0);
    expect(r.skippedNoDate).toBe(1);
  });

  it("skips games with unparseable date string", () => {
    const games = [game({ date: "garbage" })];
    const r = countGamesInDateRange(games, dayMs(2026, 5, 1), dayMs(2026, 5, 31));
    expect(r.skippedNoDate).toBe(1);
  });

  it("game exactly at fromMs is counted (inclusive lower bound)", () => {
    const games = [game({ createdAt: dayMs(2026, 5, 1) })];
    const r = countGamesInDateRange(games, dayMs(2026, 5, 1), dayMs(2026, 5, 31));
    expect(r.count).toBe(1);
  });

  it("game exactly at toMs is counted (inclusive upper bound)", () => {
    const games = [game({ createdAt: dayMs(2026, 5, 31) })];
    const r = countGamesInDateRange(games, dayMs(2026, 5, 1), dayMs(2026, 5, 31));
    expect(r.count).toBe(1);
  });

  it("inverted range (fromMs > toMs) returns zero count, no throw", () => {
    const games = [game({ createdAt: dayMs(2026, 5, 15) })];
    const r = countGamesInDateRange(games, dayMs(2026, 5, 31), dayMs(2026, 5, 1));
    expect(r.count).toBe(0);
    expect(r.skippedNoDate).toBe(0);
  });

  it("all games missing dates → count 0, skippedNoDate equals games length", () => {
    const games = [game({}), game({}), game({})];
    const r = countGamesInDateRange(games, dayMs(2026, 5, 1), dayMs(2026, 5, 31));
    expect(r.count).toBe(0);
    expect(r.skippedNoDate).toBe(3);
  });

  it("prefers createdAt over PGN date when both present", () => {
    const games = [
      game({
        createdAt: dayMs(2026, 5, 10),
        date: "1999.01.01", // outside range — would NOT count if used
      }),
    ];
    const r = countGamesInDateRange(games, dayMs(2026, 5, 1), dayMs(2026, 5, 31));
    expect(r.count).toBe(1);
  });
});
