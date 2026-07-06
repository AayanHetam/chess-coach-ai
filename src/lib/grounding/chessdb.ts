// chessdb.cn cloud evaluation lookup + queue action.
// Public-domain API; no authentication required. Be a good citizen with backoff.
//
// Two actions used:
//   "queryscore"  — get the best move and eval score for a position (returns "unknown" if not cached)
//   "queue"       — request the server to compute a position; call fire-and-forget after a queryscore miss

const CHESSDB_BASE = "http://www.chessdb.cn/cdb.php";
const FETCH_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const QUEUE_COOLDOWN_MS = 30 * 1000; // don't re-queue the same position for 30s

// "unclear" = a real advantage that is below the decisive threshold — NOT a draw.
// The old mapping labeled every |cp| < 200 position "draw", and that label was
// injected verbatim into the LLM prompt ("+1.50 pawns (draw for side to move)"),
// teaching the model factually wrong outcomes. Draw now requires near-equality.
export type ChessdbOutcome = "win" | "draw" | "loss" | "unclear" | "unknown";

export interface ChessdbResult {
  fen: string;
  best_move: string | null;
  score_cp: number | null;  // centipawns from side-to-move perspective; null if unknown
  outcome: ChessdbOutcome;
  source: "cache" | "live";
}

interface CacheEntry {
  result: ChessdbResult;
  expiresAt: number;
}

const resultCache = new Map<string, CacheEntry>();
const queuedAt = new Map<string, number>(); // prevents duplicate queue spam

// Raw response shape from chessdb queryscore
interface RawQueryScore {
  status?: string;   // "ok" | "unknown" | "nobestmove"
  move?: string;     // UCI best move
  score?: number;    // centipawns, side-to-move perspective
}

// Raw response shape from chessdb queue
interface RawQueueResponse {
  status?: string;   // "queued" | "ok" | "unknown"
}

let fetchImpl: typeof fetch = (input, init) => fetch(input, init);
export function __setFetchForTesting(impl: typeof fetch): void { fetchImpl = impl; }
export function __resetFetchForTesting(): void { fetchImpl = (input, init) => fetch(input, init); }
export function __clearChessdbCache(): void { resultCache.clear(); queuedAt.clear(); }

function scoreToOutcome(score: number | null): ChessdbOutcome {
  if (score === null) return "unknown";
  if (score >= 200) return "win";
  if (score <= -200) return "loss";
  if (Math.abs(score) < 50) return "draw";
  return "unclear";
}

async function chessdbFetch<T>(params: Record<string, string>): Promise<T | null> {
  const url = new URL(CHESSDB_BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url.toString(), { signal: controller.signal });
    if (!res.ok) return null;
    // chessdb returns plain text or JSON depending on action; try JSON first
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      // Some endpoints return "status:ok|move:e2e4|score:50" style
      const parsed: Record<string, string> = {};
      for (const part of text.split("|")) {
        const [k, v] = part.split(":");
        if (k && v !== undefined) parsed[k.trim()] = v.trim();
      }
      return parsed as unknown as T;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Look up a position in chessdb.cn.
 * Returns null on network failure; returns a result with outcome="unknown" on cache miss.
 * Fire-and-forget: if outcome is "unknown", also queues the position for computation.
 */
export async function queryChessdb(fen: string): Promise<ChessdbResult | null> {
  const cached = resultCache.get(fen);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const raw = await chessdbFetch<RawQueryScore>({ action: "queryscore", board: fen, json: "1" });
  if (!raw) return null;

  const isKnown = raw.status === "ok" && typeof raw.score === "number";
  const score = isKnown ? (raw.score ?? null) : null;
  const result: ChessdbResult = {
    fen,
    best_move: raw.move ?? null,
    score_cp: score,
    outcome: scoreToOutcome(score),
    source: "live",
  };

  resultCache.set(fen, { result, expiresAt: Date.now() + CACHE_TTL_MS });

  if (!isKnown) {
    queuePositionAsync(fen);
  }

  return result;
}

// Fire-and-forget: ask chessdb to compute a position for future queries.
// Compounding asset — our specific position coverage grows over time.
function queuePositionAsync(fen: string): void {
  const last = queuedAt.get(fen);
  if (last && Date.now() - last < QUEUE_COOLDOWN_MS) return;
  queuedAt.set(fen, Date.now());

  chessdbFetch<RawQueueResponse>({ action: "queue", board: fen, json: "1" }).catch(() => {
    // Fire-and-forget: ignore failures
  });
}

/**
 * Build a human-readable summary of a ChessdbResult for LLM prompt injection.
 * Returns empty string if outcome is unknown (no grounding).
 */
export function chessdbResultToContext(result: ChessdbResult): string {
  if (result.outcome === "unknown" || result.score_cp === null) return "";
  const scoreStr = (result.score_cp / 100).toFixed(2);
  const sign = result.score_cp >= 0 ? "+" : "";
  const move = result.best_move ? ` Best move: ${result.best_move}.` : "";
  // Label derived from the score so the prompt never contradicts the eval it
  // quotes (a +1.50 position must not be described as a draw).
  const cp = result.score_cp;
  const label =
    cp >= 200 ? "winning for the side to move" :
    cp <= -200 ? "losing for the side to move" :
    Math.abs(cp) < 50 ? "roughly equal" :
    cp > 0 ? "somewhat better for the side to move" :
    "somewhat worse for the side to move";
  return `ChessDB cloud-eval: ${sign}${scoreStr} pawns (${label}).${move}`;
}
