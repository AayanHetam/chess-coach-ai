import { describe, expect, it } from "vitest";
import { computeAnalytics } from "@/lib/scoutAnalytics";
import type { ScoutGame } from "@/types/scout";

// The scout's headline number has to answer "how strong is this opponent".
// These fixtures pin that against the two ends of the rating scale.

type Spec = {
  rating: number;
  games: number;
  winRate: number;
  drawRate: number;
  timeoutShare: number; // share of losses lost on time
};

function buildGames(name: string, spec: Spec): ScoutGame[] {
  const out: ScoutGame[] = [];

  // Interleave outcomes deterministically rather than stacking all wins then
  // all losses — a stacked archive manufactures one enormous losing streak and
  // would let a composure fix look good for the wrong reason.
  let winAcc = 0;
  let drawAcc = 0;

  for (let i = 0; i < spec.games; i += 1) {
    winAcc += spec.winRate;
    const isWin = winAcc >= 1;
    if (isWin) winAcc -= 1;

    let isDraw = false;
    if (!isWin) {
      drawAcc += spec.drawRate;
      if (drawAcc >= 1) {
        isDraw = true;
        drawAcc -= 1;
      }
    }
    // Alternate colours so the repertoire walker sees both sides.
    const asWhite = i % 2 === 0;
    const result: ScoutGame["result"] = isDraw
      ? "1/2-1/2"
      : isWin === asWhite
        ? "1-0"
        : "0-1";

    const isLoss = !isWin && !isDraw;
    const termination: ScoutGame["termination"] = isLoss
      ? i % Math.max(2, Math.round(1 / Math.max(spec.timeoutShare, 0.01))) === 0
        ? "timeout"
        : "resignation"
      : "checkmate";

    out.push({
      id: `g${i}`,
      platform: "chess.com",
      // A varied repertoire: eight different first moves.
      moves: [["e4", "d4", "c4", "Nf3", "g3", "b3", "f4", "Nc3"][i % 8], "e5", "Nf3"],
      numMoves: 70,
      whiteUsername: asWhite ? name : "opponent",
      blackUsername: asWhite ? "opponent" : name,
      whiteRating: spec.rating,
      blackRating: spec.rating,
      result,
      timeClass: "blitz",
      termination,
      date: Date.UTC(2026, 0, 1) + i * 3_600_000,
    });
  }
  return out;
}

// Carlsen: ~3200 blitz, wins most games, plays enormous volume, and does
// occasionally flag in fast time controls.
const CARLSEN: Spec = {
  rating: 3200,
  games: 4000,
  winRate: 0.62,
  drawRate: 0.14,
  timeoutShare: 0.25,
};

// A club player at equilibrium against their own pool.
const CLUB: Spec = {
  rating: 1150,
  games: 400,
  winRate: 0.5,
  drawRate: 0.05,
  timeoutShare: 0.25,
};

describe("scout strength (OVR)", () => {
  it("rates Carlsen as a world-class player", () => {
    const a = computeAnalytics(buildGames("MagnusCarlsen", CARLSEN), "MagnusCarlsen");
    // eslint-disable-next-line no-console
    console.log("CARLSEN profile:", {
      ovr: a.profile.ovr,
      atk: a.profile.atk,
      def: a.profile.def,
      time: a.profile.time,
      mind: a.profile.mind,
      tells: a.tells.total,
    });

    expect(a.profile.ovr).toBeGreaterThanOrEqual(95);
  });

  it("separates a 3200 from an 1150 by a wide margin", () => {
    const magnus = computeAnalytics(buildGames("MagnusCarlsen", CARLSEN), "MagnusCarlsen");
    const club = computeAnalytics(buildGames("ClubPlayer", CLUB), "ClubPlayer");
    // eslint-disable-next-line no-console
    console.log("CLUB profile:", {
      ovr: club.profile.ovr,
      atk: club.profile.atk,
      def: club.profile.def,
      time: club.profile.time,
      mind: club.profile.mind,
    });

    expect(magnus.profile.ovr - club.profile.ovr).toBeGreaterThanOrEqual(40);
  });

  it("does not punish a player merely for having a long history", () => {
    // Same behaviour, different sample size. A longer archive must not lower
    // the score — streak-based penalties grow with n unless normalised.
    const short = computeAnalytics(
      buildGames("P", { ...CLUB, games: 200 }),
      "P"
    );
    const long = computeAnalytics(
      buildGames("P", { ...CLUB, games: 4000 }),
      "P"
    );

    // Guard against a vacuous pass: before the fix both sides sat pinned at the
    // penalty floor, so "stable across sample size" was trivially true and told
    // us nothing. Assert the score is actually in range first.
    expect(short.profile.mind).toBeGreaterThan(25);
    expect(long.profile.mind).toBeGreaterThan(25);

    expect(Math.abs(long.profile.mind - short.profile.mind)).toBeLessThanOrEqual(8);
  });
});
