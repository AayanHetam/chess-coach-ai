// chessdb.cn cloud evaluation lookup + queue action.
// Public-domain API; no authentication required. Be a good citizen with backoff.
//
// Two actions used:
//   "queryscore"  — get the eval score for a position (returns "unknown" if not cached)
//   "queue"       — request the server to compute a position; call fire-and-forget after a queryscore miss
//
// queryscore carries no best move and none is fetched separately: querybest
// answers "nobestmove" on positions with a forced mate and picks at random
// among tied moves, and a chessdb best move that disagrees with Stockfish's
// has no honest place in the prompt.

const CHESSDB_BASE = "https://www.chessdb.cn/cdb.php";
export const FETCH_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const QUEUE_COOLDOWN_MS = 30 * 1000; // don't re-queue the same position for 30s

// "unclear" = a real advantage that is below the decisive threshold — NOT a draw.
// The old mapping labeled every |cp| < 200 position "draw", and that label was
// injected verbatim into the LLM prompt ("+1.50 pawns (draw for side to move)"),
// teaching the model factually wrong outcomes. Draw now requires near-equality.
export type ChessdbOutcome = "win" | "draw" | "loss" | "unclear" | "unknown";

export interface ChessdbResult {
  fen: string;
  /**
   * Centipawns for the SIDE TO MOVE (+ = the side to move is better) —
   * chessdb's own convention, NOT White-centric like the rest of the app (see
   * chessdbWhiteView). null when chessdb does not hold the position, or scores
   * it as a forced result (`mate` / `tablebase`), which is not centipawns.
   */
  score_cp: number | null;
  /** A forced mate found by chessdb's engines, in full moves for the side to
   * move, signed like Stockfish's `mate`: +2 = it mates in 2, -1 = it is mated
   * next move. null otherwise. */
  mate: number | null;
  /** True when the result is a tablebase win or loss (`outcome` says which). */
  tablebase: boolean;
  outcome: ChessdbOutcome;
  source: "cache" | "live";
}

interface CacheEntry {
  result: ChessdbResult;
  expiresAt: number;
}

const resultCache = new Map<string, CacheEntry>();
const queuedAt = new Map<string, number>(); // prevents duplicate queue spam

// Raw response shape from chessdb queryscore with json=1, as served on 2026-10-08:
//   {"status":"ok","eval":0,"ply":1}       held (ply = chessdb's own depth; often absent)
//   {"status":"unknown"}                   not held — worth queueing
//   {"status":"checkmate"} | {"status":"stalemate"} | {"status":"invalid board"}
// The parser used to read `score` and `move`, which this action never sends,
// so every lookup came back "unknown".
interface RawQueryScore {
  status?: string;
  eval?: number;     // side to move; see decodeScore for the forced-result bands
}

// Raw response shape from chessdb queue
interface RawQueueResponse {
  status?: string;   // "queued" | "ok" | "unknown"
}

let fetchImpl: typeof fetch = (input, init) => fetch(input, init);
export function __setFetchForTesting(impl: typeof fetch): void { fetchImpl = impl; }
export function __resetFetchForTesting(): void { fetchImpl = (input, init) => fetch(input, init); }
export function __clearChessdbCache(): void { resultCache.clear(); queuedAt.clear(); }

function scoreToOutcome(score: number): ChessdbOutcome {
  if (score >= 200) return "win";
  if (score <= -200) return "loss";
  if (Math.abs(score) < 50) return "draw";
  return "unclear";
}

// chessdb folds forced results into the score (read off queryall, 2026-10-08):
//   engine mate  ±(30000 − plies to mate)   Qxf7# on the board = 29999; a move
//                                           that walks into mate-in-1 = −29998
//   tablebase    ±(25000 − n)               KQ v K = 24988
// The tablebase n is DTZ (chessdb's default egtbmetric), not a distance to
// mate — KRP v K with DTM 23 scores 24998 — so only the result is kept.
const MATE_SCORE = 30000;
const TABLEBASE_SCORE = 25000;
const TABLEBASE_FLOOR = 20000; // far below any 7-man DTZ; centipawn scores never get near it

type DecodedScore = Pick<ChessdbResult, "score_cp" | "mate" | "tablebase" | "outcome">;

const UNKNOWN: DecodedScore = { score_cp: null, mate: null, tablebase: false, outcome: "unknown" };

function decodeScore(score: number): DecodedScore {
  const abs = Math.abs(score);
  const outcome: ChessdbOutcome = score > 0 ? "win" : "loss";
  if (abs >= MATE_SCORE) return UNKNOWN; // outside the encoding — ground nothing
  if (abs > TABLEBASE_SCORE) {
    // Mating side moves on odd plies, the mated side's last move is an even
    // ply: ceil(plies / 2) is the move count either way.
    const moves = Math.ceil((MATE_SCORE - abs) / 2);
    return { score_cp: null, mate: score > 0 ? moves : -moves, tablebase: false, outcome };
  }
  if (abs >= TABLEBASE_FLOOR) return { score_cp: null, mate: null, tablebase: true, outcome };
  return { score_cp: score, mate: null, tablebase: false, outcome: scoreToOutcome(score) };
}

async function chessdbFetch<T>(params: Record<string, string>): Promise<T | null> {
  const url = new URL(CHESSDB_BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url.toString(), { signal: controller.signal });
    if (!res.ok) return null;
    // json=1 makes every action answer JSON (the plain-text form is "eval:0"
    // with a trailing NUL); anything unparseable is a failed lookup.
    return (await res.json()) as T;
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

  const decoded = raw.status === "ok" && typeof raw.eval === "number" ? decodeScore(raw.eval) : UNKNOWN;
  const result: ChessdbResult = { fen, ...decoded, source: "live" };

  resultCache.set(fen, { result, expiresAt: Date.now() + CACHE_TTL_MS });

  // Only a position chessdb has never seen is worth computing; an invalid,
  // mated or stalemated board has nothing to queue.
  if (raw.status === "unknown") {
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

/** A ChessdbResult from White's point of view. */
export interface ChessdbWhiteView {
  /** Centipawns, White-positive; null for a forced result. */
  cp: number | null;
  /** Full moves to mate, White-positive (+3 = White mates in 3); null unless
   * chessdb's engines found a forced mate. */
  mate: number | null;
  /** The verdict in words, naming the side: "Black is somewhat better",
   * "forced mate in 3 for White", "tablebase win for Black". */
  verdict: string;
}

/**
 * Turn a result to White's point of view — the convention of every other eval
 * the model and the referee see (EvalFact, Lc0). chessdb scores for the side
 * to move, so a Black-to-move +1.50 is White's -1.50; quoting it raw beside
 * White-centric Stockfish evals would hand the model the opposite sign.
 * null = no grounding: an unknown position, or a FEN with no side to move.
 */
export function chessdbWhiteView(result: ChessdbResult): ChessdbWhiteView | null {
  if (result.outcome === "unknown") return null;
  const sideToMove = result.fen.split(" ")[1];
  if (sideToMove !== "w" && sideToMove !== "b") return null;
  // `+ 0` turns the -0 of a flipped 0 into 0.
  const forWhite = (n: number) => (sideToMove === "w" ? n : -n) + 0;

  if (result.mate !== null) {
    const mate = forWhite(result.mate);
    return { cp: null, mate, verdict: `forced mate in ${Math.abs(mate)} for ${mate > 0 ? "White" : "Black"}` };
  }
  if (result.tablebase) {
    const whiteWins = (result.outcome === "win") === (sideToMove === "w");
    return { cp: null, mate: null, verdict: `tablebase win for ${whiteWins ? "White" : "Black"}` };
  }
  if (result.score_cp === null) return null;
  const cp = forWhite(result.score_cp);
  // Verdict derived from the score so the prompt never contradicts the eval it
  // quotes (a +1.50 position must not be described as a draw).
  const verdict =
    cp >= 200 ? "White is winning" :
    cp <= -200 ? "Black is winning" :
    Math.abs(cp) < 50 ? "roughly equal" :
    cp > 0 ? "White is somewhat better" :
    "Black is somewhat better";
  return { cp, mate: null, verdict };
}

/**
 * Build a human-readable summary of a ChessdbResult for LLM prompt injection,
 * White-centric like the Stockfish evals around it.
 * Returns empty string when there is no grounding (see chessdbWhiteView).
 */
export function chessdbResultToContext(result: ChessdbResult): string {
  const view = chessdbWhiteView(result);
  if (!view) return "";
  if (view.cp === null) return `ChessDB cloud-eval: ${view.verdict}.`;
  const sign = view.cp >= 0 ? "+" : "";
  return `ChessDB cloud-eval: ${sign}${(view.cp / 100).toFixed(2)} pawns (${view.verdict}).`;
}
