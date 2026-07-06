/**
 * gameEval sanity layer (PR-CI-1 scope item 5, audit #5).
 *
 * The request schema still accepts gameEval as z.any() (untouched — zero
 * serving change); THIS module is the real zod schema, applied with
 * safeParse: it NEVER rejects the request and NEVER mutates the object.
 * Its only output is `EvalIntegrity` — flags the contract carries so the
 * shadow log (and later the referee / CI-7d server re-check) can see
 * sentinel plies, SAN truncation, depth floors, and suspicious mate signs
 * without changing what the model is shown.
 */
import { z } from "zod";

// ── Client input types (moved semantics: these mirror what the route has
//    always assumed about the client Stockfish payload) ─────────────────────
export interface PositionEvalInput {
  bestMove?: string;
  moveClassification?: string;
  opening?: string;
  lines: Array<{
    pv: string[];
    cp?: number;
    mate?: number;
    depth: number;
    multiPv: number;
  }>;
}

export interface GameEvalInput {
  positions: PositionEvalInput[];
  accuracy?: { white: number; black: number };
  estimatedElo?: { white: number; black: number };
  settings?: { engine: string; depth: number; multiPv: number; date: string };
}

/**
 * Optional PGN-header metadata threaded from the client. Mirrors the chess.js
 * `game.header()` shape but typed loose since users import games from
 * everywhere (lichess, chess.com, raw pastes) and the headers vary.
 */
export type GameHeadersInput = {
  white?: string;
  black?: string;
  whiteElo?: string;
  blackElo?: string;
  event?: string;
  date?: string;
  result?: string;
  eco?: string;
  opening?: string;
  timeControl?: string;
};

// ── The zod schema (validation only — flags, never gates) ──────────────────
export const evalLineSchema = z
  .object({
    pv: z.array(z.string()),
    cp: z.number().optional(),
    mate: z.number().optional(),
    depth: z.number(),
    multiPv: z.number(),
  })
  .passthrough();

export const positionEvalSchema = z
  .object({
    bestMove: z.string().optional(),
    moveClassification: z.string().optional(),
    opening: z.string().optional(),
    lines: z.array(evalLineSchema),
  })
  .passthrough();

export const gameEvalSchema = z
  .object({
    positions: z.array(positionEvalSchema),
    accuracy: z.object({ white: z.number(), black: z.number() }).optional(),
    estimatedElo: z.object({ white: z.number(), black: z.number() }).optional(),
    settings: z
      .object({
        engine: z.string(),
        depth: z.number(),
        multiPv: z.number(),
        date: z.string(),
      })
      .partial()
      .passthrough()
      .optional(),
  })
  .passthrough();

export interface EvalIntegrity {
  /** positions[] indices carrying the client-timeout sentinel (lines[0].depth === 0). */
  sentinelPlies: number[];
  /** First unreplayable half-move index when the SAN record breaks; null when clean. */
  sanTruncatedAtPly: number | null;
  /** Minimum reported depth across non-sentinel lines[0]; 0 when no evals. */
  minDepth: number;
  /** Maximum number of candidate lines observed on any position. */
  multiPv: number;
  /** Any single position whose multipv lines carry mates of BOTH signs. */
  suspectMixedSignMate: boolean;
}

/**
 * Compute the integrity flags. Defensive raw access on purpose: gameEval is
 * client-controlled (z.any() at the request boundary), so a shape the zod
 * schema rejects must still produce flags rather than a throw. safeParse is
 * run for the validity signal only — the ORIGINAL object is always the one
 * inspected (never the parsed copy: never mutates, never normalizes).
 */
export function computeEvalIntegrity(
  gameEval: unknown,
  moveHistory: string[],
  replayedPlies: number,
): EvalIntegrity {
  // Validity signal (unused for gating by design — see module doc).
  gameEvalSchema.safeParse(gameEval);

  const sentinelPlies: number[] = [];
  let minDepth = Number.POSITIVE_INFINITY;
  let multiPv = 0;
  let suspectMixedSignMate = false;

  const positions = (gameEval as GameEvalInput | undefined)?.positions;
  if (Array.isArray(positions)) {
    for (let p = 0; p < positions.length; p++) {
      const lines = positions[p]?.lines;
      if (!Array.isArray(lines)) continue;
      if (lines.length > multiPv) multiPv = lines.length;
      if (lines[0]?.depth === 0) sentinelPlies.push(p);
      let sawPosMate = false;
      let sawNegMate = false;
      for (const line of lines) {
        if (typeof line?.depth === "number" && line.depth > 0 && line.depth < minDepth) {
          minDepth = line.depth;
        }
        if (typeof line?.mate === "number") {
          if (line.mate > 0) sawPosMate = true;
          if (line.mate < 0) sawNegMate = true;
        }
      }
      if (sawPosMate && sawNegMate) suspectMixedSignMate = true;
    }
  }

  return {
    sentinelPlies,
    sanTruncatedAtPly: replayedPlies < moveHistory.length ? replayedPlies : null,
    minDepth: Number.isFinite(minDepth) ? minDepth : 0,
    multiPv,
    suspectMixedSignMate,
  };
}
