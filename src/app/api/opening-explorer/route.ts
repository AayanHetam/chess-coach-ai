import { NextRequest } from "next/server";
import {
  lookupCuratedPosition,
  curatedPositionCount,
  masterCorpusMeta,
} from "@/data/master-openings";

/**
 * Server-side proxy for "what do the masters / top engines play here?" data.
 *
 * Source order:
 * 1. chessdb.cn — primary. 7B+ positions, deep engine analysis, free,
 *    no auth, returns reliably from any network. Pipe-separated text;
 *    we parse and normalize below.
 * 2. Lichess masters — fallback. Currently 401-blocked from many IPs
 *    (their nginx layer), but kept here in case it ever comes back.
 *
 * Normalized response shape (Lichess-compatible so the client can stay
 * single-codepath):
 *
 *   {
 *     "white": N, "draws": N, "black": N,
 *     "moves": [
 *       { "uci": "e2e4", "san": "e4", "white": N, "draws": N, "black": N,
 *         "averageRating"?: N, "eval"?: cp, "rank"?: 0..3, "winrate"?: pct }
 *     ],
 *     "topGames": [{ uci, white: {name,rating}, black: {name,rating}, year, winner }],
 *     "opening"?: { eco, name },
 *     "source": "chessdb" | "lichess"
 *   }
 */

interface ChessdbMove {
  uci: string;
  score: number;
  rank: number;
  note: string;
  winrate: number;
  popularity: number;
}

function parseChessdb(text: string): ChessdbMove[] {
  if (!text || text.startsWith("invalid") || text.startsWith("unknown")) {
    return [];
  }
  const segments = text.split("|");
  const moves: ChessdbMove[] = [];
  for (const seg of segments) {
    const parts = seg.trim().split(",");
    const obj: Record<string, string> = {};
    for (const p of parts) {
      const idx = p.indexOf(":");
      if (idx > 0) {
        obj[p.slice(0, idx).trim()] = p.slice(idx + 1).trim();
      }
    }
    if (!obj.move) continue;
    // note format: "! (20-04)" — depth-popularity in parens
    const popMatch = /\(\d+-(\d+)\)/.exec(obj.note ?? "");
    moves.push({
      uci: obj.move,
      score: parseInt(obj.score ?? "0", 10) || 0,
      rank: parseInt(obj.rank ?? "0", 10) || 0,
      note: obj.note ?? "",
      winrate: parseFloat(obj.winrate ?? "0") || 0,
      popularity: popMatch ? parseInt(popMatch[1], 10) || 0 : 0,
    });
  }
  return moves;
}

// Removed with the rest of the fabricated statistics: synthCount() turned
// chessdb's "popularity tier" — how often a position has been QUERIED on
// chessdb.cn — into a game count via `10 ** (8 - tier * 0.4)`, so tier 5
// became "1M games". It was already unused by the time this route stopped
// synthesizing color splits; both invented game statistics out of engine
// metadata. chessdb rows are now labelled as engine analysis instead.

async function queryChessdb(fen: string, limit: number) {
  const url = new URL("https://www.chessdb.cn/cdb.php");
  url.searchParams.set("action", "queryall");
  url.searchParams.set("board", fen);

  const res = await fetch(url.toString(), {
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`chessdb ${res.status}`);
  const text = (await res.text()).trim();
  const parsed = parseChessdb(text);
  if (parsed.length === 0) return null;

  // Sort: best rank first, then most common (lower popularity tier = more
  // popular). Treats unknown popularity (0) as least popular.
  parsed.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    const ap = a.popularity || 99;
    const bp = b.popularity || 99;
    return ap - bp;
  });
  const top = parsed.slice(0, limit);

  // chessdb is an ENGINE database — positions and scores, not games. It has
  // no game counts at all.
  //
  // This used to synthesize `white`/`draws`/`black` from chessdb's winrate on
  // a fixed 750/250 scale, so every off-tree position rendered win/draw/loss
  // bars reading ~375/250/375 as if ~1000 master games had been played there.
  // They were a rounding of an engine's evaluation dressed as game
  // statistics. The client now renders this source as engine data, so the
  // fields are gone rather than faked.
  const moves = top.map((m) => ({
    uci: m.uci,
    san: "",
    eval: m.score,
    rank: m.rank,
    winrate: m.winrate,
    popularity: m.popularity,
  }));

  return {
    moves,
    topGames: [] as unknown[],
    source: "chessdb" as const,
    /** No game counts exist for this source — the client must not imply any. */
    hasGameCounts: false,
  };
}

async function queryLichess(fen: string, limit: number) {
  const url = new URL("https://explorer.lichess.ovh/masters");
  url.searchParams.set("fen", fen);
  url.searchParams.set("moves", String(limit));
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "ChessMastiAI/1.0 (+https://chessmasti.com)",
    },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`lichess ${res.status}`);
  const json = await res.json();
  return { ...json, source: "lichess" as const };
}

export async function GET(req: NextRequest) {
  const fen = req.nextUrl.searchParams.get("fen");
  const limit = parseInt(
    req.nextUrl.searchParams.get("moves") ?? "8",
    10
  );

  if (!fen) return Response.json({ error: "Missing fen" }, { status: 400 });

  // 1. The generated master tree — real, monotonic game counts from a single
  //    corpus. `corpus` travels with the payload so the UI can name what the
  //    numbers are drawn from instead of implying all of chess history.
  const indexed = lookupCuratedPosition(fen);
  if (indexed && indexed.moves.length > 0) {
    return Response.json(
      {
        moves: indexed.moves.slice(0, limit),
        topGames: [],
        source: "tree" as const,
        hasGameCounts: true,
        indexedPositions: curatedPositionCount(),
        corpus: masterCorpusMeta(),
      },
      {
        headers: { "cache-control": "public, max-age=600, s-maxage=600" },
      }
    );
  }

  // 2. Lichess masters — real counts + player attribution, and the source we
  //    would prefer. OFF by default: explorer.lichess.ovh returns a bare
  //    nginx 401 to every request — masters, lichess and player endpoints,
  //    any User-Agent, IPv4 or IPv6, from this network AND from Vercel
  //    (re-verified 2026-08-12). Leaving it in the hot path bought nothing
  //    and spent up to 6s of its timeout before every single off-tree
  //    position could fall through to chessdb, which is a large part of why
  //    this tab felt broken.
  //
  //    Set MASTERS_TRY_LICHESS=1 to put it back in the path if they ever
  //    unblock; the parsing below is unchanged and ready.
  if (process.env.MASTERS_TRY_LICHESS === "1") {
    try {
      const data = await queryLichess(fen, limit);
      return Response.json(
        { ...data, hasGameCounts: true },
        { headers: { "cache-control": "public, max-age=300, s-maxage=300" } }
      );
    } catch {
      // fall through to chessdb
    }
  }

  try {
    const data = await queryChessdb(fen, limit);
    if (data) {
      return Response.json(data, {
        headers: { "cache-control": "public, max-age=300, s-maxage=300" },
      });
    }
  } catch {
    // Off the tree AND chessdb unreachable — nothing to show.
  }

  return Response.json(
    { error: "All upstream master-DB sources unavailable" },
    { status: 502 }
  );
}
