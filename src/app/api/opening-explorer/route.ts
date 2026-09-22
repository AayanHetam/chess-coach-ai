import { NextRequest } from "next/server";
import {
  lookupCuratedPosition,
  curatedPositionCount,
  masterCorpusMeta,
} from "@/data/master-openings";
import { lookupOpeningByFen } from "@/lib/master/openingName";

/**
 * Server-side proxy for "what do the masters / top engines play here?" data.
 *
 * Source order:
 * 1. The generated master tree (src/data/master-tree.json) — real game
 *    counts from one corpus, see @/data/master-openings.
 * 2. Lichess masters — real counts + player attribution, but 401-blocked
 *    from every network tried. Off unless MASTERS_TRY_LICHESS=1.
 * 3. chessdb.cn — engine analysis, no game statistics. 7B+ positions, free,
 *    no auth. Pipe-separated text; parsed and normalized below.
 *
 * Three answers, and the client has to be able to tell them apart:
 *
 *   200 with rows         one of the sources knows the position
 *   200 with `moves: []`  none of them does — OUT OF BOOK, which is the
 *                         normal state of most of every real game past the
 *                         opening, and an answer rather than a failure
 *   502                   a source that should have answered could not be
 *                         reached — an outage
 *
 * The middle case used to be a 502 too, indistinguishable from chessdb being
 * down, so the Masters tab told every user in a middlegame that the master
 * database was "unavailable on this network".
 *
 * Normalized response shape (Lichess-compatible so the client can stay
 * single-codepath):
 *
 *   {
 *     "moves": [
 *       { "uci": "e2e4", "san": "e4", "count": N, "white": N, "draws": N,
 *         "black": N, "eval"?: cp, "rank"?: 0..2, "winrate"?: pct }
 *     ],
 *     "total"?: N,                // games that reached the position (tree)
 *     "opening"?: { eco, name },  // when the position is a named one
 *     "source"?: "tree" | "lichess" | "chessdb",   // absent when out of book
 *     "hasGameCounts": boolean,
 *     "indexedPositions"?: N, "corpus"?: {...}
 *   }
 *
 * `eval` and `winrate` are ALWAYS from White's side, like every other
 * evaluation in the app. chessdb reports both from the side to move (checked
 * against a position with Black to move and White a knight up: score -274),
 * so this route flips them when Black is to move. The previous version
 * passed them through and labelled them "white POV", which inverted the sign
 * of every engine row on every Black-to-move position.
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

/**
 * chessdb's answer for a position: rows when it has analysis, null when it
 * answers "unknown" (it has none, and queues the position). Throws when it
 * could not be asked at all — a non-2xx, a timeout, a network error — so the
 * caller can tell "no data" from "no answer".
 */
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
  // Side-to-move perspective → White's perspective (see the header).
  const blackToMove = fen.split(" ")[1] === "b";
  const moves = top.map((m) => ({
    uci: m.uci,
    san: "",
    eval: blackToMove ? -m.score : m.score,
    rank: m.rank,
    winrate: blackToMove
      ? Math.round((100 - m.winrate) * 100) / 100
      : m.winrate,
    popularity: m.popularity,
  }));

  return {
    moves,
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

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 50;

export async function GET(req: NextRequest) {
  const fen = req.nextUrl.searchParams.get("fen");
  // A non-numeric `moves` used to parse to NaN, and `slice(0, NaN)` is an
  // empty list — which now reads as "out of book". Default it instead.
  const requested = parseInt(req.nextUrl.searchParams.get("moves") ?? "", 10);
  const limit =
    Number.isFinite(requested) && requested > 0
      ? Math.min(requested, MAX_LIMIT)
      : DEFAULT_LIMIT;

  if (!fen) return Response.json({ error: "Missing fen" }, { status: 400 });

  // 1. The generated master tree — real, monotonic game counts from a single
  //    corpus. `corpus` travels with the payload so the UI can name what the
  //    numbers are drawn from instead of implying all of chess history.
  const indexed = lookupCuratedPosition(fen);
  const opening = lookupOpeningByFen(fen) ?? undefined;
  if (indexed && indexed.moves.length > 0) {
    return Response.json(
      {
        moves: indexed.moves.slice(0, limit),
        // Games that ARRIVED here, which the capped move list does not add up
        // to. Shares are computed against this, never against the rows.
        total: indexed.arrivals,
        opening,
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

  // 3. chessdb — engine analysis for the positions the tree does not cover.
  let engine: Awaited<ReturnType<typeof queryChessdb>>;
  try {
    engine = await queryChessdb(fen, limit);
  } catch {
    // Off the tree AND chessdb could not be reached. That is an outage and
    // is reported as one; the client shows it as one.
    return Response.json(
      { error: "All upstream master-DB sources unavailable" },
      { status: 502 }
    );
  }
  if (engine) {
    return Response.json(
      { ...engine, opening },
      { headers: { "cache-control": "public, max-age=300, s-maxage=300" } }
    );
  }

  // 4. Nobody knows this position: not the tree, not chessdb. Out of book is
  //    an answer, not an error, and it is where most of every real game ends
  //    up. `corpus` still travels so the footer can say what was searched.
  return Response.json(
    {
      moves: [],
      opening,
      hasGameCounts: false,
      indexedPositions: curatedPositionCount(),
      corpus: masterCorpusMeta(),
    },
    { headers: { "cache-control": "public, max-age=300, s-maxage=300" } }
  );
}
