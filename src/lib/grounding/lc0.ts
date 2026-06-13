// Lc0 microservice client — Stage 7 of the Tactical Grounding Program.
//
// Provides a second-opinion neural evaluation alongside Stockfish.
// Called ONLY when SF eval is in the [-100, +100] uncertain range AND
// there are ≥2 candidate moves within 30cp of each other.
//
// When SF and Lc0 agree on direction (both ≥ +150cp or both ≤ -150cp),
// the voter upgrades material_win and positional_plan confidence MED → HIGH.

const LC0_API_URL = process.env.LC0_API_URL;
const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — Lc0 is deterministic per position
const DEFAULT_NODES = 800;

export interface Lc0Result {
  fen: string;
  eval_cp: number | null;
  best_move: string | null;
  nodes: number;
  model: string;
  source: "live" | "cache";
}

interface CacheEntry {
  result: Lc0Result;
  expiresAt: number;
}

const resultCache = new Map<string, CacheEntry>();

export function __clearLc0Cache(): void { resultCache.clear(); }
export function __isLc0Configured(): boolean { return !!LC0_API_URL; }

/**
 * Trigger condition: only call Lc0 when a second opinion is informative.
 *
 * Conditions (must satisfy BOTH):
 *   1. SF eval is in [-200, +200]cp — excludes lopsided positions where a
 *      second engine adds nothing
 *   2. ≥2 candidate lines exist AND the gap between #1 and #2 is ≤30cp
 *
 * The eval band was [-100, +100] through Stage 7/8; that range mutually
 * excluded the voter's MED→HIGH upgrade paths only (material_win + positional_
 * plan HIGH both require lc0AgreesWithSf, i.e. both evals ≥150 same-direction),
 * so those upgrades were unreachable via this trigger (the Q6 design tension in
 * PR_STAGE9_ASYNC_GROUNDING_PLAN.md / TACTICAL_GROUNDING_HANDOFF.md).
 * positionalClaim's veto→error escalation was already reachable in the old band
 * (it fires on an opposite-direction |lc0|≥50 in [50,100]cp), so this widening
 * is specifically about the upgrade paths, not the veto. Widened to ±200 so the
 * [150, 200] band lets Lc0 confirm a moderate advantage; narrowing the upgrade
 * threshold instead could never create overlap above 100cp and sub-100cp "HIGH"
 * material confidence is chess-wrong. The top-2-lines-within-30cp condition
 * still bounds call volume to genuinely contested positions.
 *
 * This keeps Lc0 calls to a handful of positions per game (the critical
 * junctions where neural pattern recognition adds the most value).
 */
export function shouldCallLc0(
  sfEvalCp: number | null,
  lines: Array<{ cp?: number | null; mate?: number | null; pv?: string[] }>,
): boolean {
  if (!LC0_API_URL) return false;
  if (sfEvalCp === null) return false;
  if (typeof sfEvalCp !== "number") return false;

  // Condition 1: SF eval inside the second-opinion band (see jsdoc)
  if (Math.abs(sfEvalCp) > 200) return false;

  // Condition 2: ≥2 candidate lines within 30cp of each other
  if (lines.length < 2) return false;
  const line1 = lines[0];
  const line2 = lines[1];
  if (line1.mate !== undefined && line1.mate !== null) return false; // forced mate — SF is certain
  if (line2.mate !== undefined && line2.mate !== null) return false;
  const cp1 = line1.cp ?? 0;
  const cp2 = line2.cp ?? 0;
  if (Math.abs(cp1 - cp2) > 30) return false;

  return true;
}

/**
 * Returns true when SF and Lc0 agree on the direction and magnitude of advantage.
 * Used by the voter to upgrade confidence from MED → HIGH.
 */
export function lc0AgreesWithSf(
  sfEvalCp: number | null,
  lc0EvalCp: number | null,
): boolean {
  if (sfEvalCp === null || lc0EvalCp === null) return false;
  const agreement =
    (sfEvalCp >= 150 && lc0EvalCp >= 150) ||
    (sfEvalCp <= -150 && lc0EvalCp <= -150);
  return agreement;
}

/**
 * Query the Lc0 microservice for a position evaluation.
 *
 * Returns null on network failure, misconfiguration, or if LC0_API_URL is unset.
 * Results are cached for 30 minutes (Lc0 is deterministic per position).
 */
export async function queryLc0(fen: string, nodes = DEFAULT_NODES): Promise<Lc0Result | null> {
  if (!LC0_API_URL) return null;

  const cacheKey = `${fen}::${nodes}`;
  const cached = resultCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${LC0_API_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen, nodes }),
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = await res.json() as { eval_cp: number | null; best_move: string | null; nodes: number; model: string };
    const result: Lc0Result = {
      fen,
      eval_cp: typeof data.eval_cp === "number" ? data.eval_cp : null,
      best_move: data.best_move ?? null,
      nodes: data.nodes ?? nodes,
      model: data.model ?? "lc0",
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

/**
 * Build a human-readable summary of an Lc0Result for LLM prompt injection.
 * Returns empty string when result is null or eval is unavailable.
 */
export function lc0ResultToContext(result: Lc0Result | null, sfEvalCp: number | null): string {
  if (!result || result.eval_cp === null) return "";
  const agree = lc0AgreesWithSf(sfEvalCp, result.eval_cp);
  const sign = result.eval_cp >= 0 ? "+" : "";
  const cpStr = `${sign}${(result.eval_cp / 100).toFixed(2)}`;
  const agreementStr = agree ? " — AGREES with Stockfish direction" : " — diverges from Stockfish";
  const moveStr = result.best_move ? ` Best: ${result.best_move}.` : "";
  return `Lc0 neural eval (${result.nodes} nodes): ${cpStr} pawns${agreementStr}.${moveStr}`;
}
