import { describe, it, expect } from "vitest";
import {
  validateUserHistoryCitation,
  countUserHistoryOpportunities,
  resolveDateRange,
  hoursPlayedTolerance,
  USER_HISTORY_TOLERANCE,
  type ParserCall,
  type ParsedUserHistoryClaim,
  type UserHistoryClaimType,
  type DateRangeType,
} from "@/lib/mastermind/validators";
import {
  classifyTimeControl,
  type TimeControlClass,
} from "@/lib/utils/timeControlClass";
import type { UserHistoryGame } from "@/lib/mastermind/userHistoryAggregates";

// ──────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ──────────────────────────────────────────────────────────────────────────

const USER = "Aayan";
const NOW = Date.UTC(2026, 4, 18); // 2026-05-18 UTC (matches the session's date)

function pgn(opening?: string, eco?: string, variation?: string): string {
  const lines: string[] = [];
  if (eco) lines.push(`[ECO "${eco}"]`);
  if (opening) lines.push(`[Opening "${opening}"]`);
  if (variation) lines.push(`[Variation "${variation}"]`);
  lines.push("");
  lines.push("1. e4 e5 *");
  return lines.join("\n");
}

function game(opts: Partial<UserHistoryGame> & { whiteName?: string; blackName?: string }): UserHistoryGame {
  return {
    pgn: opts.pgn ?? "1. e4 *",
    white: { name: opts.whiteName ?? "opponent" },
    black: { name: opts.blackName ?? "opponent" },
    result: opts.result,
    timeControl: opts.timeControl,
    date: opts.date,
    createdAt: opts.createdAt,
  };
}

function mockParser(claims: ParsedUserHistoryClaim[]): ParserCall {
  return async () => ({ raw: JSON.stringify(claims), costUsd: 0 });
}

function malformedParser(raw: string): ParserCall {
  return async () => ({ raw, costUsd: 0 });
}

function runValidator(
  games: UserHistoryGame[],
  parserOutput: ParsedUserHistoryClaim[],
  opts?: Partial<{ confidenceThreshold: number; userName: string; nowMs: number }>
) {
  return validateUserHistoryCitation({
    llmResponse: parserOutput.map((c) => c.claim_text).join(" "),
    games,
    userName: opts?.userName ?? USER,
    nowMs: opts?.nowMs ?? NOW,
    correlationId: "test",
    confidenceThreshold: opts?.confidenceThreshold,
    parseCall: mockParser(parserOutput),
  });
}

function factualClaim(
  claim_type: UserHistoryClaimType,
  expected_in_data: ParsedUserHistoryClaim["expected_in_data"],
  claim_text = "test claim",
  confidence = 0.95
): ParsedUserHistoryClaim {
  return {
    claim_text,
    claim_type,
    expected_in_data,
    claim_class: "factual_user_history_claim",
    confidence,
  };
}

/** Builds a games array where the user is on the named color with the given counts. */
function buildGames(
  spec: Array<{
    color?: "white" | "black";
    timeControl?: string;
    result?: "1-0" | "0-1" | "1/2-1/2";
    pgn?: string;
    createdAt?: number;
    count?: number;
  }>
): UserHistoryGame[] {
  const out: UserHistoryGame[] = [];
  for (const s of spec) {
    const n = s.count ?? 1;
    for (let i = 0; i < n; i++) {
      out.push(
        game({
          whiteName: s.color === "white" ? USER : "opponent",
          blackName: s.color === "black" ? USER : "opponent",
          timeControl: s.timeControl,
          result: s.result,
          pgn: s.pgn,
          createdAt: s.createdAt,
        })
      );
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// time_control_performance — 3 baseline + dispatch + edge cases
// ──────────────────────────────────────────────────────────────────────────

describe("userHistoryCitation: time_control_performance", () => {
  it("match positive: specific timeControl, stated within tolerance", async () => {
    // 6W 0D 4L in "300+5" → scorePct 60%
    const games = buildGames([
      { color: "white", timeControl: "300+5", result: "1-0", count: 6 },
      { color: "white", timeControl: "300+5", result: "0-1", count: 4 },
    ]);
    const r = await runValidator(games, [
      factualClaim("time_control_performance", { specific_time_control: "300+5", stated_pct: 62, stated_metric: "score_pct" }),
    ]);
    expect(r.passed).toBe(true);
  });

  it("match negative: stated %% outside tolerance", async () => {
    const games = buildGames([
      { color: "white", timeControl: "300+5", result: "1-0", count: 6 },
      { color: "white", timeControl: "300+5", result: "0-1", count: 4 },
    ]);
    const r = await runValidator(games, [
      factualClaim("time_control_performance", { specific_time_control: "300+5", stated_pct: 90, stated_metric: "score_pct" }),
    ]);
    expect(r.passed).toBe(false);
  });

  it("invented: no games in cited time control", async () => {
    const games = buildGames([{ color: "white", timeControl: "600", result: "1-0", count: 5 }]);
    const r = await runValidator(games, [
      factualClaim("time_control_performance", { specific_time_control: "300+5", stated_pct: 50 }),
    ]);
    expect(r.passed).toBe(false);
  });

  it("time_class dispatch: rapid aggregates multiple buckets", async () => {
    // 5W in 600+0 (rapid), 5W in 600+5 (rapid). 100% rapid.
    const games = buildGames([
      { color: "white", timeControl: "600+0", result: "1-0", count: 5 },
      { color: "white", timeControl: "600+5", result: "1-0", count: 5 },
    ]);
    const r = await runValidator(games, [
      factualClaim("time_control_performance", { time_class: "rapid", stated_pct: 100, stated_metric: "score_pct" }),
    ]);
    expect(r.passed).toBe(true);
  });

  it("time_class fires when class has no games", async () => {
    const games = buildGames([{ color: "white", timeControl: "60+0", result: "1-0", count: 5 }]);
    const r = await runValidator(games, [
      factualClaim("time_control_performance", { time_class: "classical", stated_pct: 60 }),
    ]);
    expect(r.passed).toBe(false);
  });

  it("stated_metric win_rate uses W/total, not (W + 0.5D)/total", async () => {
    // 6W 4D 0L → score_pct = (6+2)/10*100 = 80; win_rate = 60.
    const games = buildGames([
      { color: "white", timeControl: "blitz", result: "1-0", count: 6 },
      { color: "white", timeControl: "blitz", result: "1/2-1/2", count: 4 },
    ]);
    const wr = await runValidator(games, [
      factualClaim("time_control_performance", { time_class: "blitz", stated_pct: 60, stated_metric: "win_rate" }),
    ]);
    expect(wr.passed).toBe(true);
    const sp = await runValidator(games, [
      factualClaim("time_control_performance", { time_class: "blitz", stated_pct: 80, stated_metric: "score_pct" }),
    ]);
    expect(sp.passed).toBe(true);
  });

  it("overall (no class, no specific) matches across all buckets", async () => {
    const games = buildGames([
      { color: "white", timeControl: "blitz", result: "1-0", count: 3 },
      { color: "white", timeControl: "rapid", result: "1-0", count: 3 },
      { color: "white", timeControl: "rapid", result: "0-1", count: 4 },
    ]);
    // overall: 6W 0D 4L → 60%
    const r = await runValidator(games, [
      factualClaim("time_control_performance", { stated_pct: 60, stated_metric: "score_pct" }),
    ]);
    expect(r.passed).toBe(true);
  });

  it("specific time control: existence-only when no stated_pct", async () => {
    const games = buildGames([{ color: "white", timeControl: "300+5", result: "1-0", count: 3 }]);
    const r = await runValidator(games, [
      factualClaim("time_control_performance", { specific_time_control: "300+5" }),
    ]);
    expect(r.passed).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// opening_repertoire_performance — 3 baseline + dispatch + edges
// ──────────────────────────────────────────────────────────────────────────

describe("userHistoryCitation: opening_repertoire_performance", () => {
  it("match positive: opening name match + stated %% within tolerance", async () => {
    // 6W 4L as white in Sicilian → 60%
    const games = buildGames([
      { color: "white", result: "1-0", pgn: pgn("Sicilian Defense", "B23"), count: 6 },
      { color: "white", result: "0-1", pgn: pgn("Sicilian Defense", "B23"), count: 4 },
    ]);
    const r = await runValidator(games, [
      factualClaim("opening_repertoire_performance", { opening_name: "Sicilian", user_color: "white", stated_pct: 62 }),
    ]);
    expect(r.passed).toBe(true);
  });

  it("match negative: stated %% outside tolerance", async () => {
    const games = buildGames([
      { color: "white", result: "1-0", pgn: pgn("Sicilian Defense", "B23"), count: 6 },
      { color: "white", result: "0-1", pgn: pgn("Sicilian Defense", "B23"), count: 4 },
    ]);
    const r = await runValidator(games, [
      factualClaim("opening_repertoire_performance", { opening_name: "Sicilian", user_color: "white", stated_pct: 90 }),
    ]);
    expect(r.passed).toBe(false);
  });

  it("invented: no games in cited opening", async () => {
    const games = buildGames([{ color: "white", result: "1-0", pgn: pgn("French", "C00"), count: 5 }]);
    const r = await runValidator(games, [
      factualClaim("opening_repertoire_performance", { opening_name: "Caro-Kann", stated_pct: 60 }),
    ]);
    expect(r.passed).toBe(false);
  });

  it("ECO exact match takes precedence over name", async () => {
    const games = buildGames([
      { color: "white", result: "1-0", pgn: pgn("Some Opening", "B90"), count: 5 },
    ]);
    const r = await runValidator(games, [
      factualClaim("opening_repertoire_performance", { opening_eco: "B90", stated_pct: 100 }),
    ]);
    expect(r.passed).toBe(true);
  });

  it("color filter: claim as black skips white games", async () => {
    const games = buildGames([
      { color: "white", result: "1-0", pgn: pgn("Sicilian", "B23"), count: 5 },
    ]);
    const r = await runValidator(games, [
      factualClaim("opening_repertoire_performance", { opening_name: "Sicilian", user_color: "black", stated_pct: 100 }),
    ]);
    expect(r.passed).toBe(false);
  });

  it("substring match via reused fuzzyMatch helper (Najdorf in 'Sicilian Defense Najdorf')", async () => {
    const games = buildGames([
      { color: "white", result: "1-0", pgn: pgn("Sicilian Defense", "B90", "Najdorf"), count: 5 },
    ]);
    const r = await runValidator(games, [
      factualClaim("opening_repertoire_performance", { opening_name: "Najdorf", user_color: "white", stated_pct: 100 }),
    ]);
    expect(r.passed).toBe(true);
  });

  it("existence-only: no stated_pct passes when opening present", async () => {
    const games = buildGames([
      { color: "white", result: "1-0", pgn: pgn("Sicilian", "B23"), count: 3 },
    ]);
    const r = await runValidator(games, [
      factualClaim("opening_repertoire_performance", { opening_name: "Sicilian", user_color: "white" }),
    ]);
    expect(r.passed).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// hours_played_claim — 3 baseline + dispatch + hybrid tolerance + edges
// ──────────────────────────────────────────────────────────────────────────

describe("userHistoryCitation: hours_played_claim", () => {
  const monthAgo = (day: number) => Date.UTC(2026, 4, day); // May 2026

  it("match positive: this_month with stated_count within tolerance", async () => {
    const games = buildGames([
      { color: "white", result: "1-0", createdAt: monthAgo(1), count: 50 },
      { color: "white", result: "1-0", createdAt: monthAgo(10), count: 50 },
      { color: "white", result: "1-0", createdAt: monthAgo(15), count: 20 },
    ]);
    // 120 games in this_month; coach says 120. tolerance(120) = max(2, 6) = 6 → 114-126 passes.
    const r = await runValidator(games, [
      factualClaim("hours_played_claim", { stated_count: 120, date_range_type: "this_month" }),
    ]);
    expect(r.passed).toBe(true);
  });

  it("match negative: stated_count outside tolerance", async () => {
    const games = buildGames([
      { color: "white", result: "1-0", createdAt: monthAgo(15), count: 50 },
    ]);
    // 50 games actual; coach says 100. tolerance(100) = max(2, 5) = 5; |100-50|=50 > 5 → fires.
    const r = await runValidator(games, [
      factualClaim("hours_played_claim", { stated_count: 100, date_range_type: "this_month" }),
    ]);
    expect(r.passed).toBe(false);
  });

  it("invented: zero games in range", async () => {
    const games = buildGames([
      { color: "white", result: "1-0", createdAt: Date.UTC(2025, 0, 1), count: 5 },
    ]);
    const r = await runValidator(games, [
      factualClaim("hours_played_claim", { stated_count: 30, date_range_type: "this_month" }),
    ]);
    expect(r.passed).toBe(false);
  });

  it("hybrid tolerance: small counts use ±2", async () => {
    const games = buildGames([
      { color: "white", result: "1-0", createdAt: monthAgo(15), count: 10 },
    ]);
    // stated 12, actual 10, tolerance max(2, round(0.05*12)) = max(2, 1) = 2 → passes.
    const r1 = await runValidator(games, [
      factualClaim("hours_played_claim", { stated_count: 12, date_range_type: "this_month" }),
    ]);
    expect(r1.passed).toBe(true);
    // stated 13, actual 10, |13-10|=3 > 2 → fires.
    const r2 = await runValidator(games, [
      factualClaim("hours_played_claim", { stated_count: 13, date_range_type: "this_month" }),
    ]);
    expect(r2.passed).toBe(false);
  });

  it("hybrid tolerance: large counts use 5%", async () => {
    const games = buildGames([
      { color: "white", result: "1-0", createdAt: monthAgo(15), count: 1000 },
    ]);
    // stated 1050, tolerance(1050) = max(2, 53) = 53. |1050-1000|=50 ≤ 53 → passes.
    const r1 = await runValidator(games, [
      factualClaim("hours_played_claim", { stated_count: 1050, date_range_type: "this_month" }),
    ]);
    expect(r1.passed).toBe(true);
    // stated 1200, tolerance(1200) = max(2, 60) = 60. |1200-1000|=200 > 60 → fires.
    const r2 = await runValidator(games, [
      factualClaim("hours_played_claim", { stated_count: 1200, date_range_type: "this_month" }),
    ]);
    expect(r2.passed).toBe(false);
  });

  it("time_class pre-filter restricts games before counting", async () => {
    const games = buildGames([
      { color: "white", result: "1-0", createdAt: monthAgo(10), timeControl: "blitz", count: 20 },
      { color: "white", result: "1-0", createdAt: monthAgo(10), timeControl: "rapid", count: 30 },
    ]);
    // Total this_month: 50 games. Blitz-only: 20.
    const r = await runValidator(games, [
      factualClaim("hours_played_claim", { stated_count: 20, time_class: "blitz", date_range_type: "this_month" }),
    ]);
    expect(r.passed).toBe(true);
  });

  it("hours_played_claim with no stated_count fails", async () => {
    const games = buildGames([{ color: "white", result: "1-0", createdAt: monthAgo(10), count: 50 }]);
    const r = await runValidator(games, [
      factualClaim("hours_played_claim", { date_range_type: "this_month" }),
    ]);
    expect(r.passed).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// resolveDateRange — date arithmetic
// ──────────────────────────────────────────────────────────────────────────

describe("resolveDateRange", () => {
  it("this_month: fromMs is start of current UTC month", () => {
    const r = resolveDateRange("this_month", {}, Date.UTC(2026, 4, 18));
    expect(r.fromMs).toBe(Date.UTC(2026, 4, 1));
    expect(r.toMs).toBe(Date.UTC(2026, 4, 18));
  });

  it("last_month: handles year boundary (Jan → previous Dec)", () => {
    const r = resolveDateRange("last_month", {}, Date.UTC(2026, 0, 15));
    expect(r.fromMs).toBe(Date.UTC(2025, 11, 1));
    expect(r.toMs).toBe(Date.UTC(2026, 0, 1) - 1);
  });

  it("last_month: same year", () => {
    const r = resolveDateRange("last_month", {}, Date.UTC(2026, 4, 18));
    expect(r.fromMs).toBe(Date.UTC(2026, 3, 1));
    expect(r.toMs).toBe(Date.UTC(2026, 4, 1) - 1);
  });

  it("this_year: from Jan 1 to now", () => {
    const r = resolveDateRange("this_year", {}, Date.UTC(2026, 4, 18));
    expect(r.fromMs).toBe(Date.UTC(2026, 0, 1));
    expect(r.toMs).toBe(Date.UTC(2026, 4, 18));
  });

  it("last_year: full previous year UTC", () => {
    const r = resolveDateRange("last_year", {}, Date.UTC(2026, 4, 18));
    expect(r.fromMs).toBe(Date.UTC(2025, 0, 1));
    expect(r.toMs).toBe(Date.UTC(2026, 0, 1) - 1);
  });

  it("last_n_days: 30 days back from now", () => {
    const r = resolveDateRange("last_n_days", { n: 30 }, Date.UTC(2026, 4, 18));
    expect(r.fromMs).toBe(Date.UTC(2026, 4, 18) - 30 * 86_400_000);
    expect(r.toMs).toBe(Date.UTC(2026, 4, 18));
  });

  it("in_year: full calendar year", () => {
    const r = resolveDateRange("in_year", { year: 2024 }, Date.UTC(2026, 4, 18));
    expect(r.fromMs).toBe(Date.UTC(2024, 0, 1));
    expect(r.toMs).toBe(Date.UTC(2025, 0, 1) - 1);
  });

  it("all_time: 0 to now", () => {
    const r = resolveDateRange("all_time", {}, Date.UTC(2026, 4, 18));
    expect(r.fromMs).toBe(0);
    expect(r.toMs).toBe(Date.UTC(2026, 4, 18));
  });
});

// ──────────────────────────────────────────────────────────────────────────
// classifyTimeControl
// ──────────────────────────────────────────────────────────────────────────

describe("classifyTimeControl", () => {
  const cases: Array<[string | undefined | null, TimeControlClass]> = [
    ["300+5", "blitz"],   // 300 + 40*5 = 500s
    ["600+0", "rapid"],   // 600s
    ["60+0", "bullet"],   // 60s
    ["180+0", "blitz"],   // exactly 180s → blitz (< 180 is bullet)
    ["179+0", "bullet"],
    ["599+0", "blitz"],   // 599s
    ["600", "rapid"],     // bare base
    ["1800+30", "classical"], // 1800 + 1200 = 3000s
    ["1799+0", "rapid"],
    ["1800+0", "classical"],
    ["1/86400", "daily"],
    ["1/259200", "daily"],
    ["rapid", "rapid"],
    ["blitz", "blitz"],
    ["bullet", "bullet"],
    ["classical", "classical"],
    ["daily", "daily"],
    ["correspondence", "daily"], // collapses to daily
    ["unparseable", "unknown"],
    ["", "unknown"],
    [undefined, "unknown"],
    [null, "unknown"],
  ];

  for (const [input, expected] of cases) {
    it(`'${input}' → ${expected}`, () => {
      expect(classifyTimeControl(input)).toBe(expected);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// countUserHistoryOpportunities
// ──────────────────────────────────────────────────────────────────────────

describe("countUserHistoryOpportunities", () => {
  it("empty games → no opportunities", () => {
    expect(countUserHistoryOpportunities([], USER)).toEqual([]);
  });

  it("empty userName → no opportunities", () => {
    const games = buildGames([{ color: "white", timeControl: "rapid", result: "1-0", count: 20 }]);
    expect(countUserHistoryOpportunities(games, "")).toEqual([]);
  });

  it("≥10 rapid games → 1 time_class opp", () => {
    const games = buildGames([{ color: "white", timeControl: "600", result: "1-0", count: 12 }]);
    const opps = countUserHistoryOpportunities(games, USER);
    expect(opps.filter((o) => o.claim_type === "time_control_performance")).toHaveLength(1);
  });

  it("9 rapid games → no time_class opp (below threshold)", () => {
    const games = buildGames([{ color: "white", timeControl: "600", result: "1-0", count: 9 }]);
    const opps = countUserHistoryOpportunities(games, USER);
    expect(opps.filter((o) => o.claim_type === "time_control_performance")).toHaveLength(0);
  });

  it("≥5 games in opening-color → 1 opening opp; <5 → 0", () => {
    const games = buildGames([
      { color: "white", result: "1-0", pgn: pgn("Sicilian", "B23"), count: 6 },
      { color: "black", result: "1-0", pgn: pgn("French", "C00"), count: 4 },
    ]);
    const opps = countUserHistoryOpportunities(games, USER);
    const openingOpps = opps.filter((o) => o.claim_type === "opening_repertoire_performance");
    expect(openingOpps).toHaveLength(1);
  });

  it("any games → 1 hours_played opp", () => {
    const games = buildGames([{ color: "white", timeControl: "rapid", result: "1-0", count: 3 }]);
    const opps = countUserHistoryOpportunities(games, USER);
    expect(opps.filter((o) => o.claim_type === "hours_played_claim")).toHaveLength(1);
  });

  it("mixed-class user: only classes ≥10 games count", () => {
    const games = buildGames([
      { color: "white", timeControl: "60+0", result: "1-0", count: 5 }, // 5 bullet — below threshold
      { color: "white", timeControl: "300+0", result: "1-0", count: 12 }, // 12 blitz — counts
      { color: "white", timeControl: "600", result: "1-0", count: 8 }, // 8 rapid — below threshold
    ]);
    const opps = countUserHistoryOpportunities(games, USER);
    const tcOpps = opps.filter((o) => o.claim_type === "time_control_performance");
    expect(tcOpps).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Adversarial / edge cases
// ──────────────────────────────────────────────────────────────────────────

describe("userHistoryCitation: adversarial + edge cases", () => {
  const games = buildGames([{ color: "white", timeControl: "rapid", result: "1-0", count: 20 }]);

  it("qualitative_commentary is not validated", async () => {
    const r = await runValidator(games, [
      {
        claim_text: "you've been struggling",
        claim_type: "time_control_performance",
        expected_in_data: { time_class: "rapid", stated_pct: 1 },
        claim_class: "qualitative_commentary",
        confidence: 0.9,
      },
    ]);
    expect(r.passed).toBe(true);
  });

  it("conditional_speculation is not validated", async () => {
    const r = await runValidator(games, [
      {
        claim_text: "if you played more, you'd be 70%",
        claim_type: "time_control_performance",
        expected_in_data: { time_class: "rapid", stated_pct: 70 },
        claim_class: "conditional_speculation",
        confidence: 0.9,
      },
    ]);
    expect(r.passed).toBe(true);
  });

  it("low-confidence factual claim is skipped (default threshold 0.5)", async () => {
    const r = await runValidator(games, [
      factualClaim(
        "time_control_performance",
        { time_class: "rapid", stated_pct: 99 },
        "hedged claim",
        0.3
      ),
    ]);
    expect(r.passed).toBe(true);
    expect(r.telemetry.some((e) => e.fire_reason === "parser_low_confidence")).toBe(true);
  });

  it("malformed parser JSON returns passed=true + parser_json_invalid telemetry", async () => {
    const r = await validateUserHistoryCitation({
      llmResponse: "any",
      games,
      userName: USER,
      nowMs: NOW,
      correlationId: "test",
      parseCall: malformedParser("not valid {"),
    });
    expect(r.passed).toBe(true);
    expect(r.telemetry.some((e) => e.fire_reason === "parser_json_invalid")).toBe(true);
  });

  it("empty claims → passed=true, no telemetry", async () => {
    const r = await runValidator(games, []);
    expect(r.passed).toBe(true);
    expect(r.telemetry).toHaveLength(0);
  });

  it("fenced JSON parsed correctly", async () => {
    const parseCall: ParserCall = async () => ({ raw: "```json\n[]\n```", costUsd: 0 });
    const r = await validateUserHistoryCitation({
      llmResponse: "x",
      games,
      userName: USER,
      nowMs: NOW,
      correlationId: "test",
      parseCall,
    });
    expect(r.passed).toBe(true);
  });

  it("telemetry on unsupported fires carries claim_type for Stage C aggregation", async () => {
    const r = await runValidator(buildGames([]), [
      factualClaim("time_control_performance", { time_class: "rapid", stated_pct: 60 }),
    ]);
    const fire = r.telemetry.find((e) => e.fire_reason === "unsupported_citation");
    expect(fire).toBeDefined();
    expect((fire?.expected as { claim_type: string }).claim_type).toBe("time_control_performance");
  });

  it("nowMs injection: deterministic resolution without Date.now()", async () => {
    // Same games at a fixed createdAt; different nowMs → different "this_month" results.
    const gamesAtMay = buildGames([
      { color: "white", result: "1-0", createdAt: Date.UTC(2026, 4, 10), count: 5 },
    ]);
    // nowMs in May → in-month games count.
    const inMay = await runValidator(
      gamesAtMay,
      [factualClaim("hours_played_claim", { stated_count: 5, date_range_type: "this_month" })],
      { nowMs: Date.UTC(2026, 4, 18) }
    );
    expect(inMay.passed).toBe(true);
    // nowMs in June → "this_month" is June; the May games are last_month, count=0.
    const inJune = await runValidator(
      gamesAtMay,
      [factualClaim("hours_played_claim", { stated_count: 5, date_range_type: "this_month" })],
      { nowMs: Date.UTC(2026, 5, 18) }
    );
    expect(inJune.passed).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Public constant sanity
// ──────────────────────────────────────────────────────────────────────────

describe("userHistoryCitation: public constants", () => {
  it("USER_HISTORY_TOLERANCE.pct = 5", () => {
    expect(USER_HISTORY_TOLERANCE.pct).toBe(5);
  });

  it("hoursPlayedTolerance: ±max(2, 5% of stated)", () => {
    expect(hoursPlayedTolerance(10)).toBe(2);
    expect(hoursPlayedTolerance(40)).toBe(2);
    expect(hoursPlayedTolerance(100)).toBe(5);
    expect(hoursPlayedTolerance(1000)).toBe(50);
    expect(hoursPlayedTolerance(0)).toBe(2);
  });
});
