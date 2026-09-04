// The two endpoints behind the Rush board. The behaviour worth pinning is the
// one that made the shipped version feel broken: setting a personal best and
// not seeing it. GET is served from a per-instance memory cache, so the write
// path has to answer with the post-write board itself rather than leaving the
// client to re-GET a snapshot that may predate its own write.

import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
const getUserById = vi.fn();
const getPuzzleRushLeaderboard = vi.fn();
const getPuzzleRushRanks = vi.fn();
const countPuzzleRushEntries = vi.fn();
const countPuzzleRushEntriesAll = vi.fn();
const upsertPuzzleRushLeaderboardEntry = vi.fn();

class AdminConfigError extends Error {}

vi.mock("@/lib/auth/session", () => ({
  requireSession: () => requireSession(),
}));
vi.mock("@/lib/server/users", () => ({
  getUserById: (u: string) => getUserById(u),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({ AdminConfigError }));
vi.mock("@/lib/logging", () => ({
  logger: { child: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }) },
}));
vi.mock("@/lib/server/puzzleRushLeaderboard", () => ({
  RUSH_LEADERBOARD_MODES: ["threeMin", "fiveMin", "survivalBest"],
  getPuzzleRushLeaderboard: (...a: unknown[]) => getPuzzleRushLeaderboard(...a),
  countPuzzleRushEntries: (...a: unknown[]) => countPuzzleRushEntries(...a),
  countPuzzleRushEntriesAll: () => countPuzzleRushEntriesAll(),
  getPuzzleRushRanks: (...a: unknown[]) => getPuzzleRushRanks(...a),
  upsertPuzzleRushLeaderboardEntry: (...a: unknown[]) =>
    upsertPuzzleRushLeaderboardEntry(...a),
}));

const board = [{ handle: "ana", score: 30 }];

beforeEach(() => {
  vi.clearAllMocks();
  // Each test gets a fresh module so the route's module-level cache and
  // rate-limit counters don't leak between cases.
  vi.resetModules();
  getPuzzleRushLeaderboard.mockResolvedValue(board);
  // Past the placeholder cutoff by default, so the existing cases assert on
  // real rows alone; the seeding cases lower it explicitly.
  countPuzzleRushEntries.mockResolvedValue(500);
  countPuzzleRushEntriesAll.mockResolvedValue({
    threeMin: 500,
    fiveMin: 500,
    survivalBest: 500,
  });
  getPuzzleRushRanks.mockResolvedValue({
    threeMin: 7,
    fiveMin: 3,
    survivalBest: null,
  });
  upsertPuzzleRushLeaderboardEntry.mockResolvedValue({
    threeMin: 30,
    fiveMin: 0,
    survivalBest: 0,
  });
  requireSession.mockResolvedValue({ session: { uid: "u1" } });
  getUserById.mockResolvedValue({ handle: "ana" });
});

async function get(url: string, ip = "1.1.1.1") {
  const { GET } = await import("@/app/api/leaderboards/puzzle-rush/route");
  const res = await GET(
    new Request(url, { headers: { "x-forwarded-for": ip } })
  );
  return { res, body: await res.json() };
}

async function post(body: unknown) {
  const { POST } = await import(
    "@/app/api/leaderboards/puzzle-rush/sync/route"
  );
  const res = await POST(
    new Request("http://t/api/leaderboards/puzzle-rush/sync", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
  return { res, body: await res.json() };
}

const rush = (threeMin = 30, fiveMin = 0, survivalBest = 0) => ({
  threeMin,
  fiveMin,
  survivalBest,
});

describe("GET /api/leaderboards/puzzle-rush", () => {
  it("returns the board for the requested mode", async () => {
    const { body } = await get("http://t/x?mode=survivalBest");
    expect(getPuzzleRushLeaderboard).toHaveBeenCalledWith("survivalBest");
    expect(body).toEqual({ mode: "survivalBest", entries: board });
  });

  it("falls back to threeMin for a mode it doesn't recognise", async () => {
    const { body } = await get("http://t/x?mode=../../etc/passwd");
    expect(body.mode).toBe("threeMin");
  });

  it("never lets a browser or CDN cache the response on top of ours", async () => {
    const { res } = await get("http://t/x");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("serves a repeat read from cache instead of re-querying", async () => {
    await get("http://t/x?mode=threeMin");
    await get("http://t/x?mode=threeMin");
    expect(getPuzzleRushLeaderboard).toHaveBeenCalledTimes(1);
  });

  it("caches per mode, not globally", async () => {
    await get("http://t/x?mode=threeMin");
    await get("http://t/x?mode=fiveMin");
    expect(getPuzzleRushLeaderboard).toHaveBeenCalledTimes(2);
  });

  it("is unavailable, not broken, when Firestore is unconfigured", async () => {
    getPuzzleRushLeaderboard.mockRejectedValue(new AdminConfigError("nope"));
    const { res } = await get("http://t/x");
    expect(res.status).toBe(503);
  });
});

describe("POST /api/leaderboards/puzzle-rush/sync", () => {
  it("refuses an unauthenticated caller", async () => {
    const { NextResponse } = await import("next/server");
    requireSession.mockResolvedValue({
      response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    });
    const { res } = await post({ rush: rush() });
    expect(res.status).toBe(401);
    expect(upsertPuzzleRushLeaderboardEntry).not.toHaveBeenCalled();
  });

  it("rejects a payload that isn't a set of three scores", async () => {
    const { res } = await post({ rush: { threeMin: "lots" } });
    expect(res.status).toBe(400);
    expect(upsertPuzzleRushLeaderboardEntry).not.toHaveBeenCalled();
  });

  it("rejects a negative score", async () => {
    const { res } = await post({ rush: rush(-1) });
    expect(res.status).toBe(400);
  });

  it("answers with the board as it stands AFTER the write", async () => {
    const { body } = await post({ rush: rush(), mode: "threeMin" });
    expect(upsertPuzzleRushLeaderboardEntry).toHaveBeenCalledWith(
      "u1",
      "ana",
      rush()
    );
    // Read after write, in-request — this is what makes a just-set personal
    // best visible without waiting out the GET cache.
    expect(body).toMatchObject({
      ok: true,
      synced: true,
      mode: "threeMin",
      entries: board,
      handle: "ana",
    });
  });

  it("reports a standing for EVERY mode, so a mode switch keeps it", async () => {
    // Ranking only the viewed mode made the player's own position vanish the
    // moment they looked at another board.
    const { body } = await post({ rush: rush(), mode: "threeMin" });
    expect(getPuzzleRushRanks).toHaveBeenCalledWith({
      threeMin: 30,
      fiveMin: 0,
      survivalBest: 0,
    });
    expect(body.ranks).toEqual({ threeMin: 7, fiveMin: 3, survivalBest: null });
    expect(body.scores).toEqual({ threeMin: 30, fiveMin: 0, survivalBest: 0 });
  });

  it("ranks against what was PUBLISHED, not what was claimed", async () => {
    // The writer drops implausible claims, so the standing has to come from
    // its answer or a rejected score would still be ranked.
    upsertPuzzleRushLeaderboardEntry.mockResolvedValue({
      threeMin: 0,
      fiveMin: 24,
      survivalBest: 0,
    });
    await post({ rush: rush(99999, 24, 0), mode: "fiveMin" });
    expect(getPuzzleRushRanks).toHaveBeenCalledWith({
      threeMin: 0,
      fiveMin: 24,
      survivalBest: 0,
    });
  });

  it("reports synced:false, with the board, when nothing was worth publishing", async () => {
    upsertPuzzleRushLeaderboardEntry.mockResolvedValue(null);
    const { body } = await post({ rush: rush(0, 0, 0) });
    expect(body).toMatchObject({
      ok: true,
      synced: false,
      entries: board,
      ranks: null,
    });
    expect(getPuzzleRushRanks).not.toHaveBeenCalled();
  });

  it("throttles one account before it can grind the read budget", async () => {
    // Each call costs a transaction, a board query and three aggregations.
    const { POST } = await import(
      "@/app/api/leaderboards/puzzle-rush/sync/route"
    );
    const call = () =>
      POST(
        new Request("http://t/s", {
          method: "POST",
          body: JSON.stringify({ rush: rush() }),
        })
      );
    let limited = 0;
    for (let i = 0; i < 40; i++) {
      if ((await call()).status === 429) limited++;
    }
    expect(limited).toBeGreaterThan(0);
  });

  it("throttles per account, not globally", async () => {
    const { POST } = await import(
      "@/app/api/leaderboards/puzzle-rush/sync/route"
    );
    const call = () =>
      POST(
        new Request("http://t/s", {
          method: "POST",
          body: JSON.stringify({ rush: rush() }),
        })
      );
    for (let i = 0; i < 40; i++) await call();
    // A different signed-in account must not inherit the first one's ceiling.
    requireSession.mockResolvedValue({ session: { uid: "u2" } });
    expect((await call()).status).toBe(200);
  });

  it("still shows the board to someone with no public handle", async () => {
    getUserById.mockResolvedValue({ handle: undefined });
    const { res, body } = await post({ rush: rush() });
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      synced: false,
      entries: board,
      ranks: null,
      handle: null,
    });
    expect(upsertPuzzleRushLeaderboardEntry).not.toHaveBeenCalled();
  });

  it("does not fail the request when the leaderboard write breaks", async () => {
    upsertPuzzleRushLeaderboardEntry.mockRejectedValue(
      new AdminConfigError("x")
    );
    const { res } = await post({ rush: rush() });
    expect(res.status).toBe(503);
  });
});

describe("placeholder rows while the board is empty", () => {
  it("pads a nearly empty board, and says so nowhere in the payload", async () => {
    countPuzzleRushEntries.mockResolvedValue(1);
    const { body } = await get("http://t/x?mode=threeMin");
    expect(body.entries.length).toBeGreaterThan(board.length);
    expect(body.entries).toContainEqual(board[0]);
    const scores = body.entries.map((e: { score: number }) => e.score);
    expect([...scores].sort((a: number, b: number) => b - a)).toEqual(scores);
  });

  it("stops padding once enough real players have a score", async () => {
    countPuzzleRushEntries.mockResolvedValue(100);
    const { body } = await get("http://t/x?mode=threeMin");
    expect(body.entries).toEqual(board);
  });

  it("ranks a player against the board they can actually see", async () => {
    countPuzzleRushEntriesAll.mockResolvedValue({
      threeMin: 1,
      fiveMin: 1,
      survivalBest: 1,
    });
    getPuzzleRushRanks.mockResolvedValue({
      threeMin: 1,
      fiveMin: null,
      survivalBest: null,
    });
    upsertPuzzleRushLeaderboardEntry.mockResolvedValue({
      threeMin: 5,
      fiveMin: 0,
      survivalBest: 0,
    });
    const { body } = await post({ rush: rush(5), mode: "threeMin" });
    // Alone among real players they are 1st, but placeholders sit above them
    // on screen — reporting 1st there would be visibly wrong.
    expect(body.ranks.threeMin).toBeGreaterThan(1);
  });

  it("reports the real rank once the placeholders are gone", async () => {
    getPuzzleRushRanks.mockResolvedValue({
      threeMin: 1,
      fiveMin: null,
      survivalBest: null,
    });
    upsertPuzzleRushLeaderboardEntry.mockResolvedValue({
      threeMin: 5,
      fiveMin: 0,
      survivalBest: 0,
    });
    const { body } = await post({ rush: rush(5), mode: "threeMin" });
    expect(body.ranks.threeMin).toBe(1);
  });
});
