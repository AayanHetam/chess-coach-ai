/**
 * Map a raw PGN `timeControl` string to a `TimeClass` bucket.
 *
 * Created during PR 1.C Stage A.8 (Aayan T1 ratified). No existing
 * classifier was found via grep — `ScoutGame.timeClass` comes
 * pre-populated from chess.com / Lichess platform APIs, but PGN-derived
 * `Game.timeControl` is the raw string ("300+5", "1/86400", "rapid").
 * This module fills the gap.
 *
 * Used by:
 * - `src/lib/mastermind/validators/userHistoryCitation.ts`
 *
 * Heuristic for "BASE+INCREMENT" strings: estimated game length =
 * BASE + 40 × INCREMENT seconds (standard chess time-control formula
 * assuming ~40 moves per game). Bucketing thresholds match the
 * Chess.com / Lichess convention:
 *   < 180s   → bullet
 *   180-599s → blitz
 *   600-1799s → rapid
 *   ≥ 1800s   → classical
 * Daily / correspondence: any "X/Y" format (days-per-move).
 * Bare class labels ("rapid", "blitz") pass through verbatim.
 * Unparseable → "unknown".
 */

/**
 * Narrow return type — what `classifyTimeControl` actually returns. The
 * platform-level `TimeClass` union includes "correspondence" but this
 * classifier coerces correspondence-shape inputs to "daily" (the standard
 * coaching-side label for asynchronous play), so the return is narrower.
 */
export type TimeControlClass =
  | "bullet"
  | "blitz"
  | "rapid"
  | "classical"
  | "daily"
  | "unknown";

/** Multiplier for INCREMENT in the BASE+INCREMENT formula. */
const INCREMENT_PLY_FACTOR = 40;

export function classifyTimeControl(tc: string | undefined | null): TimeControlClass {
  if (!tc || typeof tc !== "string") return "unknown";
  const lower = tc.toLowerCase().trim();
  if (!lower) return "unknown";

  // Bare class labels — pass through if recognized.
  if (lower === "bullet") return "bullet";
  if (lower === "blitz") return "blitz";
  if (lower === "rapid") return "rapid";
  if (lower === "classical") return "classical";
  if (lower === "daily" || lower === "correspondence") return "daily";

  // Correspondence / daily: any "X/Y" format (days-per-move shorthand).
  if (lower.includes("/")) return "daily";

  // Parse "BASE+INCREMENT" or bare "BASE".
  const match = lower.match(/^(\d+)(?:\+(\d+))?$/);
  if (!match) return "unknown";
  const base = parseInt(match[1], 10);
  const inc = match[2] !== undefined ? parseInt(match[2], 10) : 0;
  if (isNaN(base)) return "unknown";

  const estimatedSec = base + INCREMENT_PLY_FACTOR * inc;
  if (estimatedSec < 180) return "bullet";
  if (estimatedSec < 600) return "blitz";
  if (estimatedSec < 1800) return "rapid";
  return "classical";
}
