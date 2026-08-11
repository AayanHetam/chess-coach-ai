// Maia-2 visibility client — Stage 8 of the Tactical Grounding Program.
//
// Returns the probability that a Maia-2 player at the user's rating plays a
// specific UCI move (typically Stockfish's recommendation), used to drive the
// voter's `user_visibility` claim class.
//
// IMPORTANT (2026-07-05): this client previously POSTed to
// `${MAIA_API_URL}/predict_at_rating` — an endpoint that has NEVER existed in
// maia-service/maia_server.py (it implements only /health, /predict, /). Every
// call 404'd silently, so user_visibility grounding never worked in any
// environment. The client now derives prob_plays_best from the existing
// /predict endpoint, which returns the top human-like move (with confidence)
// plus up to 4 alternatives with probabilities:
//   - best move is the top move or listed → exact probability
//   - best move absent from the top 5 → its probability is bounded above by
//     the smallest returned probability; if that bound is already below the
//     VIS_LOW threshold we use it (classification is unaffected), otherwise
//     we return null (fail closed — no grounding rather than a guess).
//
// When prob_plays_best < 0.15, the LLM is told to suppress "obvious" / "clearly"
// language — the move is genuinely hard to see at the user's rating, so calling
// it "obvious" reads as dismissive of effort the user actually made.

import { Chess } from "chess.js";

import type { ConfidenceLevel } from "./voter";

const MAIA_API_URL = process.env.MAIA_API_URL;
export const FETCH_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — Maia is deterministic per (fen, rating)

// Visibility thresholds — derived from Maia-2 paper distribution norms.
// Tunable; lock current values with snapshot tests if they drift.
const VIS_HIGH = 0.50; // "trivially obvious" — most players at this rating find it
const VIS_MED  = 0.25; // "expected at this level" — clearly the move
const VIS_LOW  = 0.15; // "findable with effort" — defensible to mention
                       // below VIS_LOW → NONE → suppress "obvious"/"clearly"

export interface MaiaLikelyMove {
  move: string;       // SAN if parseable, else UCI
  probability: number;
}

export interface MaiaProbResult {
  fen: string;
  rating: number;
  best_move_uci: string;
  prob_plays_best: number;
  likely_moves: MaiaLikelyMove[];
  model: string;
  source: "live" | "cache";
}

interface CacheEntry {
  result: MaiaProbResult;
  expiresAt: number;
}

const resultCache = new Map<string, CacheEntry>();

export function __clearMaiaCache(): void { resultCache.clear(); }
export function __isMaiaConfigured(): boolean { return !!MAIA_API_URL; }

/**
 * Should we call Maia for this position?
 *
 * Required:
 *   1. Maia service configured (MAIA_API_URL set)
 *   2. User rating present (Maia output is meaningless without a rating)
 *   3. SF best move present (we need a move to ask about)
 *
 * Note: unlike `shouldCallLc0`, there's no SF-eval-range gate. Maia inference
 * is fast (~50ms) and the result is informative on every kind of position.
 * The route still rate-limits by calling only on top mistakes / critical
 * positions, not on every move.
 */
export function shouldCallMaia(
  userRating: number | null | undefined,
  bestMoveUci: string | null | undefined,
): boolean {
  if (!MAIA_API_URL) return false;
  if (typeof userRating !== "number" || userRating < 100 || userRating > 3500) return false;
  if (!bestMoveUci || typeof bestMoveUci !== "string") return false;
  // Maia expects UCI format: 4-5 chars (e.g., e2e4, e7e8q)
  if (bestMoveUci.length < 4 || bestMoveUci.length > 5) return false;
  return true;
}

/**
 * Map a probability to a user_visibility confidence level.
 */
export function probToVisibility(prob: number | null | undefined): ConfidenceLevel {
  if (typeof prob !== "number" || isNaN(prob)) return "NONE";
  if (prob >= VIS_HIGH) return "HIGH";
  if (prob >= VIS_MED) return "MED";
  if (prob >= VIS_LOW) return "LOW";
  return "NONE";
}

/**
 * Query the Maia-2 microservice for the probability the user plays `bestMoveUci`.
 *
 * Returns null when MAIA_API_URL is unset, the call fails, or the service
 * returns an unparseable response. Fail-closed: a null result causes the
 * voter to skip user_visibility grounding (no suppression rules added).
 *
 * Cache TTL 30min keyed by (fen, rating, best_move).
 */
export async function queryMaiaAtRating(
  fen: string,
  rating: number,
  bestMoveUci: string,
  opponentRating?: number,
): Promise<MaiaProbResult | null> {
  if (!MAIA_API_URL) return null;

  const cacheKey = `${fen}::${rating}::${bestMoveUci}`;
  const cached = resultCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.result, source: "cache" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${MAIA_API_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fen,
        rating,
        opponent_rating: opponentRating ?? rating,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = await res.json() as {
      humanLikeMove: string;
      confidence: number;
      alternativeMoves: Array<{ move: string; probability: number }>;
      rating: number;
    };

    if (typeof data.humanLikeMove !== "string" || typeof data.confidence !== "number") return null;

    const candidates: MaiaLikelyMove[] = [
      { move: data.humanLikeMove, probability: data.confidence },
      ...(Array.isArray(data.alternativeMoves)
        ? data.alternativeMoves.filter(
            (m) => m && typeof m.move === "string" && typeof m.probability === "number",
          )
        : []),
    ];

    const prob = deriveProbPlaysBest(fen, bestMoveUci, candidates);
    if (prob === null) return null;

    const result: MaiaProbResult = {
      fen,
      rating,
      best_move_uci: bestMoveUci,
      prob_plays_best: prob,
      likely_moves: candidates,
      model: "maia2",
      source: "live",
    };

    resultCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Strip decorations that differ between SAN producers (check/mate marks,
// annotation glyphs) before comparing moves.
function normalizeMoveToken(move: string): string {
  return move.replace(/[+#!?]/g, "");
}

/** UCI → SAN via chess.js; null when the move is illegal/unparseable. */
function uciToSanForMaia(fen: string, uci: string): string | null {
  try {
    const game = new Chess(fen);
    const move = game.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
    });
    return move ? move.san : null;
  } catch {
    return null;
  }
}

/**
 * Derive the probability that a player plays `bestMoveUci` from the /predict
 * candidate list (top move + up to 4 alternatives, in SAN — UCI when the
 * service's own SAN conversion failed).
 *
 * Exported for tests.
 */
export function deriveProbPlaysBest(
  fen: string,
  bestMoveUci: string,
  candidates: MaiaLikelyMove[],
): number | null {
  if (candidates.length === 0) return null;
  const bestSan = uciToSanForMaia(fen, bestMoveUci);
  const targets = new Set(
    [bestSan, bestMoveUci].filter((t): t is string => !!t).map(normalizeMoveToken),
  );

  for (const c of candidates) {
    if (targets.has(normalizeMoveToken(c.move))) return c.probability;
  }

  // Not in the returned top moves: true probability ≤ the smallest returned
  // probability. If that bound already classifies as NONE (< VIS_LOW), use it
  // — the visibility outcome is identical for any value below the bound.
  // Otherwise we cannot know the bucket; fail closed.
  const minProb = Math.min(...candidates.map((c) => c.probability));
  if (minProb < VIS_LOW) return minProb;
  return null;
}

/**
 * Build a prompt-context block for the LLM from a MaiaProbResult.
 *
 * Returns the empty string when result is null — callers should not inject
 * empty context. The HIGH/MED/LOW cases yield informational context; the NONE
 * case (prob < 0.15) yields explicit suppression rules.
 */
export function maiaResultToContext(
  result: MaiaProbResult | null,
  bestMoveSan: string | null,
): string {
  if (!result) return "";
  const visibility = probToVisibility(result.prob_plays_best);
  const pct = (result.prob_plays_best * 100).toFixed(1);
  const moveLabel = bestMoveSan ?? result.best_move_uci;

  if (visibility === "NONE") {
    // The critical case — suppress "obvious" language.
    const top = result.likely_moves[0];
    const topNote = top
      ? ` (most players at this rating play ${top.move}, ${(top.probability * 100).toFixed(0)}%)`
      : "";
    return [
      `USER VISIBILITY: best move ${moveLabel} found by only ${pct}% of ${result.rating}-rated players${topNote}.`,
      `RULE: Do NOT use the words "obvious", "obviously", "clearly", "simply", or "just" when discussing this move — the user almost certainly did not see it. Frame as a discovery, not a miss.`,
    ].join("\n");
  }

  const tone =
    visibility === "HIGH" ? "most players at this rating play this move" :
    visibility === "MED"  ? "clearly the expected move at this rating" :
                            "findable but not automatic at this rating";
  return `USER VISIBILITY: best move ${moveLabel} played by ${pct}% of ${result.rating}-rated players (${tone}).`;
}
