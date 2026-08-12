import { describe, it, expect } from "vitest";
import {
  parseLichessRatings,
  parseChessComRatings,
  normalizeRating,
  selectCalibrationRating,
  MIN_ESTABLISHED_GAMES,
} from "../platformRatings";

/**
 * Fixtures below are VERBATIM from the live public APIs, captured 2026-08-11.
 * They are not hand-written — the unplayed-perf trap they encode is real, and a
 * hand-written fixture would have quietly omitted it.
 */

// GET https://lichess.org/api/user/DrNykterstein
const LICHESS_MAGNUS = {
  username: "DrNykterstein",
  perfs: {
    ultraBullet: { rating: 2406, games: 92, prov: true },
    bullet: { rating: 3243, games: 9583 },
    blitz: { rating: 3153, games: 606, prov: true },
    rapid: { rating: 2500, games: 0, prov: true },
    classical: { rating: 2500, games: 0, prov: true },
    correspondence: { rating: 1500, games: 0, prov: true },
    chess960: { rating: 2541, games: 129, prov: true },
    atomic: { rating: 2160, games: 25, prov: true },
  },
};

// GET https://api.chess.com/pub/player/erik/stats
const CHESSCOM_ERIK = {
  chess_daily: { last: { rating: 1462, rd: 62 }, record: { win: 3085, loss: 1996, draw: 372 } },
  chess960_daily: { last: { rating: 1408, rd: 102 }, record: { win: 332, loss: 215, draw: 28 } },
  chess_rapid: { last: { rating: 1904, rd: 80 }, record: { win: 27, loss: 11, draw: 1 } },
  chess_bullet: { last: { rating: 1712, rd: 42 }, record: { win: 4187, loss: 3700, draw: 223 } },
  chess_blitz: { last: { rating: 1912, rd: 140 }, record: { win: 442, loss: 339, draw: 33 } },
  fide: 0,
  tactics: {},
};

describe("parseLichessRatings — the unplayed-perf trap", () => {
  const r = parseLichessRatings("DrNykterstein", LICHESS_MAGNUS);

  it("drops perfs the player has never played, even though Lichess returns a rating for them", () => {
    // This is the whole point of the module. Lichess reports rapid 2500 and
    // correspondence 1500 for an account with zero games in either.
    expect(r.perfs.map((p) => p.perf)).not.toContain("rapid");
    expect(r.perfs.map((p) => p.perf)).not.toContain("classical");
  });

  it("never surfaces the seeded 1500 from an unplayed perf", () => {
    // Regression guard for SILENT_SUBSTITUTION A1: a fabricated 1500 must not
    // re-enter the product through the rating-lookup door.
    expect(r.perfs.some((p) => p.rating === 1500)).toBe(false);
  });

  it("keeps the established perf", () => {
    expect(r.perfs).toContainEqual({ perf: "bullet", rating: 3243, games: 9583 });
  });

  it("KEEPS an established perf that Lichess flags provisional through inactivity", () => {
    // blitz: 606 games, prov true. `prov` tracks rating deviation, which grows
    // when you stop playing — it is not a proxy for "unreliable". Filtering on
    // it would report "no rating" for a returning player, which is the exact
    // user this feature exists to serve. Verified against penguingm1 (bullet
    // 2542 / 853 games / prov true) and this fixture.
    expect(r.perfs.find((p) => p.perf === "blitz")?.rating).toBe(3153);
  });

  it("still drops 0-game perfs, which is what the prov flag was covering for", () => {
    // Every fabricated perf carries games: 0, so the games floor is sufficient.
    const zeroGame = LICHESS_MAGNUS.perfs.rapid;
    expect(zeroGame.games).toBe(0);
    expect(r.perfs.map((p) => p.perf)).not.toContain("rapid");
  });

  it("excludes variants and correspondence from calibration", () => {
    const keys = r.perfs.map((p) => p.perf);
    expect(keys).not.toContain("chess960");
    expect(keys).not.toContain("atomic");
    expect(keys).not.toContain("ultraBullet");
    expect(keys).not.toContain("correspondence");
  });

  it("returns an empty list for a brand-new account rather than a default", () => {
    const fresh = parseLichessRatings("newbie", {
      perfs: {
        blitz: { rating: 1500, games: 0, prov: true },
        rapid: { rating: 1500, games: 0, prov: true },
      },
    });
    expect(fresh.perfs).toEqual([]);
  });

  it("tolerates a missing perfs block", () => {
    expect(parseLichessRatings("x", {}).perfs).toEqual([]);
  });
});

describe("parseChessComRatings", () => {
  const r = parseChessComRatings("erik", CHESSCOM_ERIK);

  it("derives game counts from the W/L/D record", () => {
    expect(r.perfs.find((p) => p.perf === "bullet")).toEqual({
      perf: "bullet",
      rating: 1712,
      games: 4187 + 3700 + 223,
    });
  });

  it("keeps a perf that clears the games floor", () => {
    // rapid has 39 games — above the floor, so it counts.
    expect(r.perfs.find((p) => p.perf === "rapid")?.rating).toBe(1904);
  });

  it(`drops a perf below ${MIN_ESTABLISHED_GAMES} games`, () => {
    const thin = parseChessComRatings("thin", {
      chess_blitz: { last: { rating: 2200 }, record: { win: 3, loss: 2, draw: 0 } },
    });
    expect(thin.perfs).toEqual([]);
  });

  it("excludes daily and variant pools", () => {
    const keys = r.perfs.map((p) => p.perf);
    expect(keys).not.toContain("daily");
    expect(keys).not.toContain("chess960");
  });

  it("tolerates junk fields in the payload", () => {
    // `fide: 0` and `tactics: {}` are real fields with no `last.rating`.
    expect(() => parseChessComRatings("erik", CHESSCOM_ERIK)).not.toThrow();
  });
});

describe("normalizeRating", () => {
  it("passes Chess.com ratings through unchanged — it is the reference scale", () => {
    expect(normalizeRating(1650, "chesscom")).toBe(1650);
  });

  it("pulls club-level Lichess ratings down onto the Chess.com scale", () => {
    // The crossover is real: through the club range Lichess reads high.
    expect(normalizeRating(1500, "lichess")).toBeLessThan(1500);
    expect(normalizeRating(1200, "lichess")).toBeLessThan(1200);
  });

  it("narrows the gap as rating climbs, per the known crossover", () => {
    const gapLow = 1200 - normalizeRating(1200, "lichess");
    const gapHigh = 2400 - normalizeRating(2400, "lichess");
    expect(gapLow).toBeGreaterThan(gapHigh);
  });

  it("is monotonic — a higher Lichess rating never maps below a lower one", () => {
    let prev = -Infinity;
    for (let r = 600; r <= 3000; r += 50) {
      const n = normalizeRating(r, "lichess");
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });

  it("does not collapse beginners onto a single number", () => {
    expect(normalizeRating(700, "lichess")).not.toBe(normalizeRating(800, "lichess"));
  });
});

describe("selectCalibrationRating", () => {
  it("returns undefined when the player has no established rating anywhere", () => {
    // Must be absence, not a default — the caller decides what absence means.
    expect(selectCalibrationRating([])).toBeUndefined();
    expect(
      selectCalibrationRating([{ platform: "lichess", username: "n", perfs: [] }])
    ).toBeUndefined();
  });

  it("picks the highest established rating", () => {
    const sel = selectCalibrationRating([
      {
        platform: "chesscom",
        username: "u",
        perfs: [
          { perf: "rapid", rating: 1400, games: 200 },
          { perf: "blitz", rating: 1650, games: 900 },
        ],
      },
    ]);
    expect(sel?.rawRating).toBe(1650);
    expect(sel?.perf).toBe("blitz");
  });

  it("compares across platforms on the NORMALIZED scale, not the raw one", () => {
    // Lichess 1800 normalizes to ~1500; Chess.com 1600 stays 1600 and should
    // win, even though 1800 > 1600 as printed. Comparing raw numbers here is
    // exactly the bug normalization exists to prevent.
    const sel = selectCalibrationRating([
      { platform: "lichess", username: "u", perfs: [{ perf: "blitz", rating: 1800, games: 500 }] },
      { platform: "chesscom", username: "u", perfs: [{ perf: "blitz", rating: 1600, games: 500 }] },
    ]);
    expect(sel?.platform).toBe("chesscom");
    expect(sel?.rawRating).toBe(1600);
  });

  it("reports the raw rating for display alongside the normalized one", () => {
    const sel = selectCalibrationRating([
      { platform: "lichess", username: "u", perfs: [{ perf: "blitz", rating: 1800, games: 500 }] },
    ]);
    expect(sel?.rawRating).toBe(1800); // shown to the user
    expect(sel?.rating).toBeLessThan(1800); // used for calibration
  });
});
