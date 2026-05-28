import { NextRequest } from "next/server";

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

// chessdb's note field looks like "! (20-05)" = "depth 20, popularity tier 5".
// IMPORTANT: lower popularity number = MORE popular (more queried). The most
// common moves at the starting position (1.e4, 1.d4) sit at tier 5; rare
// moves like 1.h4 sit at tier 14+. So invert when synthesizing a count:
// tier 1 → ~40M, tier 5 → ~1M, tier 10 → ~16K, tier 14 → ~300.
function synthCount(popularity: number): number {
  if (popularity <= 0 || popularity > 20) return 0;
  return Math.round(10 ** (8 - popularity * 0.4));
}

function uciToColors(winrate: number): { white: number; draws: number; black: number } {
  // winrate is white's expected score (0..100). Split synthetically into
  // white-win / draw / black-win bands using a 25% draw rate assumption.
  // Use 1000 as the scale so the bar widths render meaningfully.
  const wr = Math.max(0, Math.min(100, winrate)) / 100;
  const draws = 250;
  const remaining = 750;
  const white = Math.round(remaining * wr);
  const black = remaining - white;
  return { white, draws, black };
}

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

  // chessdb has no SAN — client computes via chess.js. We pass UCI only.
  const moves = top.map((m) => {
    const { white, draws, black } = uciToColors(m.winrate);
    return {
      uci: m.uci,
      san: "", // client computes from FEN + UCI
      white,
      draws,
      black,
      eval: m.score,
      rank: m.rank,
      winrate: m.winrate,
      popularity: m.popularity,
    };
  });

  // Aggregate top-level color split from the first move (since chessdb is
  // engine-analysis, not game-counted)
  const total = top.reduce((acc, m) => acc + synthCount(m.popularity), 0);
  return {
    white: 0,
    draws: 0,
    black: 0,
    moves,
    topGames: [] as unknown[],
    source: "chessdb" as const,
    totalSynthCount: total,
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

  try {
    const data = await queryChessdb(fen, limit);
    if (data) {
      return Response.json(data, {
        headers: {
          "cache-control": "public, max-age=300, s-maxage=300",
        },
      });
    }
  } catch (err) {
    // fall through to Lichess
  }

  try {
    const data = await queryLichess(fen, limit);
    return Response.json(data, {
      headers: {
        "cache-control": "public, max-age=300, s-maxage=300",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "All upstream sources failed";
    return Response.json({ error: msg }, { status: 502 });
  }
}
