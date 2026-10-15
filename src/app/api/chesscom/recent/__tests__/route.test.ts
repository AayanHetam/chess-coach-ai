import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "../route";

/**
 * What the Chess.com tab on /play can tell apart: a player with games, an
 * account that exists but never played, and a name with no account.
 *
 * The bug these pin: the tab listed ongoing daily games only, so a player who
 * plays blitz and rapid, or a name typed to try the page, read "0 ongoing" and
 * found nothing to open.
 */

const API = "https://api.chess.com/pub/player";

function get(username: string) {
  const url = new URL("http://localhost:3000/api/chesscom/recent");
  url.searchParams.set("username", username);
  return GET(new NextRequest(url));
}

function game(
  n: number,
  opts: { rules?: string; pgn?: string; white?: string; black?: string } = {}
) {
  return {
    uuid: `g${n}`,
    end_time: 1_790_000_000 + n,
    time_class: "blitz",
    rules: opts.rules ?? "chess",
    pgn: opts.pgn ?? `[White "${opts.white ?? "Ana"}"]\n[Result "1-0"]\n\n1. e4 e5 1-0`,
    white: { username: opts.white ?? "Ana", rating: 1500, "@id": "" },
    black: { username: opts.black ?? "bo", rating: 1450, "@id": "" },
  };
}

/** Route each Chess.com URL to a canned body; anything unlisted is a 404. */
function stubChessCom(routes: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!(url in routes)) return new Response("{}", { status: 404 });
    const body = routes[url];
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/chesscom/recent", () => {
  it("returns finished games of every time control, newest first, with the player's colour", async () => {
    stubChessCom({
      [`${API}/ana`]: { last_online: 1_790_000_100 },
      [`${API}/ana/games/archives`]: { archives: [`${API}/ana/games/2026/10`] },
      [`${API}/ana/games/2026/10`]: { games: [game(1), game(2, { white: "bo", black: "Ana" })] },
    });
    const res = await get("Ana");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.everPlayed).toBe(true);
    expect(body.lastOnline).toBe(1_790_000_100_000);
    expect(body.games.map((g: { id: string }) => g.id)).toEqual(["chesscom:g2", "chesscom:g1"]);
    expect(body.games[0]).toMatchObject({ playerColor: "black", opponent: "bo", result: "loss" });
    expect(body.games[1]).toMatchObject({ playerColor: "white", result: "win", speed: "blitz" });
  });

  it("reads back through earlier months until it has enough rows, and no further", async () => {
    const many = Array.from({ length: 25 }, (_, i) => game(100 + i));
    const fetchMock = stubChessCom({
      [`${API}/ana`]: {},
      [`${API}/ana/games/archives`]: {
        archives: [
          `${API}/ana/games/2026/07`,
          `${API}/ana/games/2026/08`,
          `${API}/ana/games/2026/09`,
          `${API}/ana/games/2026/10`,
        ],
      },
      [`${API}/ana/games/2026/10`]: { games: [game(1)] },
      [`${API}/ana/games/2026/09`]: { games: many },
    });
    const body = await (await get("ana")).json();
    expect(body.games).toHaveLength(20);
    const fetched = fetchMock.mock.calls.map(([u]) => String(u));
    expect(fetched).toContain(`${API}/ana/games/2026/09`);
    expect(fetched).not.toContain(`${API}/ana/games/2026/08`);
  });

  it("leaves out variants the analysis board cannot set up", async () => {
    stubChessCom({
      [`${API}/ana`]: {},
      [`${API}/ana/games/archives`]: { archives: [`${API}/ana/games/2026/10`] },
      [`${API}/ana/games/2026/10`]: {
        games: [game(1), game(2, { rules: "chess960" }), game(3, { rules: "oddschess" })],
      },
    });
    const body = await (await get("ana")).json();
    expect(body.games.map((g: { id: string }) => g.id)).toEqual(["chesscom:g1"]);
  });

  it("says an account that exists but never played has never played", async () => {
    stubChessCom({
      [`${API}/dormant`]: { last_online: 1_202_774_703 },
      [`${API}/dormant/games/archives`]: { archives: [] },
    });
    const res = await get("dormant");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ everPlayed: false, games: [], lastOnline: 1_202_774_703_000 });
  });

  it("is a 404 for a name with no account", async () => {
    stubChessCom({});
    const res = await get("nobody");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Chess.com user not found");
  });

  it("skips a month that fails to load instead of failing the list", async () => {
    stubChessCom({
      [`${API}/ana`]: {},
      [`${API}/ana/games/archives`]: {
        archives: [`${API}/ana/games/2026/09`, `${API}/ana/games/2026/10`],
      },
      [`${API}/ana/games/2026/10`]: new Response("busy", { status: 429 }),
      [`${API}/ana/games/2026/09`]: { games: [game(1)] },
    });
    const body = await (await get("ana")).json();
    expect(body.games).toHaveLength(1);
  });

  it("never fetches an archive URL that is not Chess.com's", async () => {
    const fetchMock = stubChessCom({
      [`${API}/ana`]: {},
      [`${API}/ana/games/archives`]: { archives: ["https://example.com/steal"] },
    });
    const body = await (await get("ana")).json();
    expect(body.everPlayed).toBe(false);
    expect(fetchMock.mock.calls.map(([u]) => String(u))).not.toContain("https://example.com/steal");
  });

  it("rejects a malformed username without calling Chess.com", async () => {
    const fetchMock = stubChessCom({});
    const res = await get("../etc");
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
