// The two endpoints behind the Rush board. The behaviour worth pinning is the
// one that made the shipped version feel broken: setting a personal best and
// not seeing it. GET is served from a per-instance memory cache, so the write
// path has to answer with the post-write board itself rather than leaving the
// client to re-GET a snapshot that may predate its own write.

import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
const getUserById = vi.fn();
const getPuzzleRushLeaderboard = vi.fn();
const getPuzzleRushRank = vi.fn();
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
  getPuzzleRushRank: (...a: unknown[]) => getPuzzleRushRank(...a),
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
  getPuzzleRushRank.mockResolvedValue(7);
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
      rank: 7,
      score: 30,
      handle: "ana",
    });
  });

  it("ranks the player on the mode they are looking at", async () => {
    upsertPuzzleRushLeaderboardEntry.mockResolvedValue({
      threeMin: 30,
      fiveMin: 12,
      survivalBest: 0,
    });
    await post({ rush: rush(30, 12), mode: "fiveMin" });
    expect(getPuzzleRushRank).toHaveBeenCalledWith("fiveMin", 12);
  });

  it("reports synced:false, with the board, when nothing was worth publishing", async () => {
    upsertPuzzleRushLeaderboardEntry.mockResolvedValue(null);
    const { body } = await post({ rush: rush(0, 0, 0) });
    expect(body).toMatchObject({
      ok: true,
      synced: false,
      entries: board,
      rank: null,
    });
    expect(getPuzzleRushRank).not.toHaveBeenCalled();
  });

  it("still shows the board to someone with no public handle", async () => {
    getUserById.mockResolvedValue({ handle: undefined });
    const { res, body } = await post({ rush: rush() });
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ synced: false, entries: board });
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
