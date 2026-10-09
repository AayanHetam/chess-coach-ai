import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { gameDrillsFor } from "@/lib/diagnose/drillSet";
import { drillOffer, fetchCauseTopUp, topUpCount } from "../diagnoseDrills";

const FX = JSON.parse(
  fs.readFileSync(
    path.join(
      process.cwd(),
      "src/lib/contract/__tests__/fixtures-real/07_knight_fork.json"
    ),
    "utf8"
  )
);
const DRILLS = gameDrillsFor({
  positions: FX.gameEval.positions,
  sans: FX.moveHistory,
  player: "b",
  declaredDepth: FX.gameEval.settings?.depth ?? null,
  gameKey: "07",
});

/** Two rows of the shipped CSV as /api/puzzle-feed returns them, and one with no solver move. */
const FEED = {
  puzzles: [
    {
      id: "00008",
      fen: "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24",
      solution: ["f2g3", "e6e7", "b2b1", "b3c1", "b1c1", "h6c1"],
      rating: 2107,
      ratingDeviation: 78,
      popularity: 95,
      nbPlays: 9243,
      themes: ["crushing", "hangingPiece", "long", "middlegame"],
    },
    {
      id: "0000D",
      fen: "5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27",
      solution: ["d3d6", "f8d8", "d6d8", "f6d8"],
      rating: 1535,
      themes: ["advantage", "endgame", "short"],
    },
    { id: "broken", fen: "8/8/8/8/8/8/8/K6k w - - 0 1", solution: ["a1a2"] },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("drillOffer", () => {
  it("07 as Black, the loose queen asked about: no other loose piece in the game, so three like it", () => {
    const offer = drillOffer(DRILLS, "hanging", 14);
    expect(offer).toEqual({
      cause: "hanging",
      excludePly: 14,
      label: "Drill it: 3 puzzles like it",
      puzzles: [],
    });
    expect(topUpCount(offer)).toBe(3);
  });

  it("asked elsewhere, the queen is a puzzle from this game", () => {
    const offer = drillOffer(DRILLS, "hanging", 10);
    expect(offer.label).toBe("Drill it: 1 from this game, 2 like it");
    expect(offer.puzzles.map((p) => p.solution)).toEqual([["a1c1", "d1c1"]]);
    expect(topUpCount(offer)).toBe(2);
  });
});

describe("fetchCauseTopUp", () => {
  it("asks the feed for the cause's themes near the reader's rating, and keeps whole puzzles only", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(FEED)));
    vi.stubGlobal("fetch", fetch);
    const got = await fetchCauseTopUp("check", 1500, 2, ["g-1-14"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/puzzle-feed");
    expect(JSON.parse(String(init.body))).toEqual({
      themes: ["mateIn1", "mateIn2", "discoveredCheck", "doubleCheck"],
      ratingMin: 1300,
      ratingMax: 1700,
      excludeIds: ["g-1-14"],
      limit: 2,
      randomize: true,
    });
    expect(got.map((p) => p.id)).toEqual(["00008", "0000D"]);
    expect(got[0]).toEqual({
      id: "00008",
      fen: FEED.puzzles[0].fen,
      solution: FEED.puzzles[0].solution,
      rating: 2107,
      themes: ["crushing", "hangingPiece", "long", "middlegame"],
    });
  });

  it("keeps the rating band inside the feed's bounds and never more than asked", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(FEED)));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchCauseTopUp("fork", 2950, 1, [])).toHaveLength(1);
    const body = JSON.parse(
      String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body)
    );
    expect([body.ratingMin, body.ratingMax]).toEqual([2750, 3000]);
    await fetchCauseTopUp("fork", 300, 1, []);
    const low = JSON.parse(
      String((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body)
    );
    expect([low.ratingMin, low.ratingMax]).toEqual([400, 500]);
  });

  it("is empty when the store fails, and asks nothing for nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503 }))
    );
    expect(await fetchCauseTopUp("hanging", 1500, 3, [])).toEqual([]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      })
    );
    expect(await fetchCauseTopUp("hanging", 1500, 3, [])).toEqual([]);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await fetchCauseTopUp("hanging", 1500, 0, [])).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
