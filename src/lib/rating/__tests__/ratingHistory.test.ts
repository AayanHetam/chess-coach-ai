import { describe, it, expect } from "vitest";
import {
  parseLichessHistory,
  parseChessComArchiveMonth,
  downsampleDaily,
  buildTrend,
  emptySeries,
} from "../ratingHistory";

// Verbatim shape from GET https://lichess.org/api/user/{name}/rating-history
const LICHESS_HISTORY = [
  { name: "Bullet", points: [[2019, 0, 30, 1851], [2019, 1, 2, 1880], [2020, 5, 14, 2160]] },
  { name: "Blitz", points: [[2019, 6, 17, 1676]] },
  { name: "Rapid", points: [] },
  { name: "Chess960", points: [[2019, 0, 23, 2834]] },
  { name: "Correspondence", points: [[2019, 0, 23, 1500]] },
];

describe("parseLichessHistory", () => {
  const s = parseLichessHistory(LICHESS_HISTORY);

  it("reads the month as 0-INDEXED, matching the live API", () => {
    // [2019, 0, 30] is 30 January 2019. Treating it as a calendar month would
    // shift every point forward by one — a distortion that looks completely
    // plausible on a trend line and would never be noticed by eye.
    const first = new Date(s.bullet[0].t);
    expect(first.getMonth()).toBe(0); // January
    expect(first.getDate()).toBe(30);
    expect(first.getFullYear()).toBe(2019);
  });

  it("keeps only the three charted time controls", () => {
    expect(s.bullet.length).toBe(3);
    expect(s.blitz.length).toBe(1);
    expect(s.rapid.length).toBe(0);
    // Variants and correspondence are not charted.
    expect(Object.keys(s).sort()).toEqual(["blitz", "bullet", "rapid"]);
  });

  it("returns points in chronological order", () => {
    const ts = s.bullet.map((p) => p.t);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
  });

  it("survives junk without throwing", () => {
    expect(parseLichessHistory(null)).toEqual(emptySeries());
    expect(parseLichessHistory({})).toEqual(emptySeries());
    expect(parseLichessHistory([{ name: "Bullet", points: [[1, 2]] }]).bullet).toEqual([]);
  });
});

describe("parseChessComArchiveMonth", () => {
  const GAMES = [
    { end_time: 1_700_000_000, time_class: "blitz", white: { username: "Hikaru", rating: 3200 }, black: { username: "foe", rating: 3100 } },
    { end_time: 1_700_100_000, time_class: "rapid", white: { username: "foe", rating: 2000 }, black: { username: "Hikaru", rating: 2800 } },
    { end_time: 1_700_200_000, time_class: "daily", white: { username: "Hikaru", rating: 2200 }, black: { username: "foe", rating: 2100 } },
  ];

  it("matches the username case-insensitively", () => {
    // The API path is lowercased but the payload preserves signup casing, so an
    // exact match yields a silently empty chart.
    const s = parseChessComArchiveMonth("hikaru", GAMES);
    expect(s.blitz[0].rating).toBe(3200);
    expect(s.rapid[0].rating).toBe(2800);
  });

  it("takes the user's own rating, not the opponent's", () => {
    const s = parseChessComArchiveMonth("hikaru", GAMES);
    expect(s.rapid[0].rating).toBe(2800); // was Black in that game
    expect(s.rapid.some((p) => p.rating === 2000)).toBe(false);
  });

  it("ignores time controls we do not chart", () => {
    const s = parseChessComArchiveMonth("hikaru", GAMES);
    expect(s.bullet).toEqual([]);
    expect(Object.values(s).flat().some((p) => p.rating === 2200)).toBe(false);
  });

  it("converts end_time from seconds to milliseconds", () => {
    const s = parseChessComArchiveMonth("hikaru", GAMES);
    expect(s.blitz[0].t).toBe(1_700_000_000 * 1000);
  });

  it("yields nothing when the user did not play in that month", () => {
    expect(parseChessComArchiveMonth("someoneelse", GAMES)).toEqual(emptySeries());
  });
});

describe("downsampleDaily", () => {
  const day = 24 * 60 * 60 * 1000;
  const base = new Date(2026, 0, 10, 9, 0, 0).getTime();

  it("keeps the last rating of each day", () => {
    const pts = [
      { t: base, rating: 1500 },
      { t: base + 3600_000, rating: 1520 },
      { t: base + day, rating: 1490 },
    ];
    const out = downsampleDaily(pts, 0);
    expect(out).toHaveLength(2);
    expect(out[0].rating).toBe(1520); // later of the two same-day points
  });

  it("drops points before the window", () => {
    const pts = [
      { t: base, rating: 1500 },
      { t: base + 30 * day, rating: 1600 },
    ];
    expect(downsampleDaily(pts, base + day)).toHaveLength(1);
  });
});

describe("buildTrend", () => {
  it("reports delta across the window", () => {
    const t = buildTrend("blitz", [{ t: 1, rating: 1400 }, { t: 2, rating: 1465 }], "lichess");
    expect(t.current).toBe(1465);
    expect(t.delta).toBe(65);
  });

  it("leaves delta UNDEFINED for a single point rather than claiming 0", () => {
    // "+0" reads as "we measured no change". From one observation we have not
    // measured anything — the user just has no history yet.
    const t = buildTrend("rapid", [{ t: 1, rating: 1400 }], "lichess");
    expect(t.current).toBe(1400);
    expect(t.delta).toBeUndefined();
  });

  it("has no current and no delta with no points at all", () => {
    const t = buildTrend("bullet", [], "chesscom");
    expect(t.current).toBeUndefined();
    expect(t.delta).toBeUndefined();
  });
});
