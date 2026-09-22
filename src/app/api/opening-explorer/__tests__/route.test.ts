import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "../route";

/**
 * The three answers /api/opening-explorer can give, and that the Masters tab
 * has to be able to tell apart.
 *
 * The bug these pin: a position that neither the tree nor chessdb knew was a
 * 502 — the same status as chessdb being unreachable — so past the opening
 * of most real games the panel read "Master DB unavailable on this network",
 * in production, for what was simply the end of the book.
 */

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// An endgame no master tree reaches. chessdb.cn answers "unknown" for it
// (checked 2026-09-22); here its answer is stubbed either way.
const NOWHERE = "3r2k1/1p3pp1/p1n1b2p/4p3/2P1P3/1P2BN1P/P4PP1/3R2K1 w - - 3 27";

function get(fen: string, moves?: string) {
  const url = new URL("http://localhost:3000/api/opening-explorer");
  url.searchParams.set("fen", fen);
  if (moves !== undefined) url.searchParams.set("moves", moves);
  return GET(new NextRequest(url));
}

function stubChessdb(body: string, status = 200) {
  const fetchMock = vi.fn(async () => new Response(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/opening-explorer", () => {
  it("serves an indexed position from the tree without touching the network", async () => {
    const fetchMock = stubChessdb("unknown");
    const res = await get(START, "10");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("tree");
    expect(body.hasGameCounts).toBe(true);
    expect(body.moves).toHaveLength(10);
    expect(body.moves[0]).toMatchObject({ san: "e4", uci: "e2e4" });
    expect(body.moves[0].count).toBeGreaterThan(0);
    expect(body.corpus.games).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers out of book with 200 and no rows when nobody knows the position", async () => {
    stubChessdb("unknown");
    const res = await get(NOWHERE, "10");
    // This was a 502, indistinguishable from an outage.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.moves).toEqual([]);
    expect(body.hasGameCounts).toBe(false);
    expect(body.source).toBeUndefined();
    // The footer still names what was searched.
    expect(body.corpus.games).toBeGreaterThan(0);
    expect(res.headers.get("cache-control")).toContain("max-age=300");
  });

  it("serves chessdb rows as engine analysis with no game counts", async () => {
    stubChessdb(
      "move:e2e4,score:35,rank:2,note:! (30-15),winrate:53.40|" +
        "move:d2d4,score:30,rank:2,note:! (30-20),winrate:52.90|" +
        "move:a2a4,score:-40,rank:0,note:? (30-01),winrate:46.10"
    );
    const res = await get(NOWHERE, "2");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("chessdb");
    expect(body.hasGameCounts).toBe(false);
    expect(body.moves).toHaveLength(2);
    expect(body.moves[0]).toMatchObject({ uci: "e2e4", eval: 35, rank: 2 });
    expect(body.moves[0].count).toBeUndefined();
  });

  it("reports an outage as 502 when chessdb cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fetch failed");
      })
    );
    const res = await get(NOWHERE, "10");
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/unavailable/);
  });

  it("reports an outage as 502 when chessdb answers with an error status", async () => {
    stubChessdb("", 503);
    const res = await get(NOWHERE, "10");
    expect(res.status).toBe(502);
  });

  it("falls back to the default row count on a non-numeric `moves`", async () => {
    stubChessdb("unknown");
    // parseInt("abc") is NaN and slice(0, NaN) is [] — which now reads as
    // out of book for a position the tree knows perfectly well.
    const res = await get(START, "abc");
    const body = await res.json();
    expect(body.source).toBe("tree");
    expect(body.moves).toHaveLength(8);
  });

  it("rejects a request without a fen", async () => {
    const res = await GET(
      new NextRequest("http://localhost:3000/api/opening-explorer")
    );
    expect(res.status).toBe(400);
  });
});
