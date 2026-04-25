/**
 * Concept-first retrieval — the two-stage pipeline that serves reinforcement
 * puzzles after a student misses a position.
 *
 *   Stage 1 (hard filter): classify the anchor position via the deterministic
 *     detector, pull candidates from Neo4j by EXERCISES->Concept overlap,
 *     filter by rating band. Cross-concept candidates are excluded, NOT
 *     down-weighted — this is the core design point.
 *   Stage 2 (soft rerank): score each candidate with
 *         0.5*concept_confidence + 0.35*structural_similarity + 0.15*rating_proximity
 *     The structural signal is currently the handcrafted 50-dim cosine from
 *     fenSimilarity.ts; it will be swapped for a learned 128-dim embedding
 *     once B3 ships (see docs in plan).
 *   Stage 3 (diversity): from the top-30, pick `limit` via max-marginal
 *     relevance so the student sees the same concept in varied surface forms
 *     (interleaving principle, see concept-similarity-rationale.md).
 *
 * Fallback contract: if detector returns no concepts, we fall back to
 * theme-based retrieval and set `fallbackUsed='theme'` so the UI can badge
 * the response as "unclassified" (Part C2 honesty check).
 */

import neo4j from "neo4j-driver";
import { executeRead, isNeo4jConfigured } from "../neo4j";
import {
  extractFENFeatures,
  featuresToVector,
  cosineSimilarity,
} from "../fenSimilarity";
import { detectConcepts } from "./conceptDetector";
import type { ConceptId } from "./conceptTaxonomy";
import { logger } from "../logging";

const log = logger.child({ module: "conceptRetrieval" });

// ── Tunable weights (A/B-target) ───────────────────────────────────────────
export const RETRIEVAL_WEIGHTS = {
  concept: 0.5,
  structural: 0.35,
  ratingProximity: 0.15,
} as const;

export const MMR_LAMBDA = 0.3;

const DEFAULT_CANDIDATE_POOL = 60;
const DEFAULT_LIMIT = 5;
const RATING_BAND = 300;
const STRUCTURAL_EMBEDDING_VERSION = "handcrafted-50d-v1";

// ── Public types ──────────────────────────────────────────────────────────
export interface ReinforcementRequest {
  anchorFen: string;
  /** Full solution UCI (including opponent setup at index 0). Required for concept detection. */
  anchorSolutionUci?: string[];
  /** Pre-computed concept list (bypasses detector). */
  anchorConcepts?: ConceptId[];
  /** Fallback theme list for the unclassified case. */
  themes?: string[];
  userElo: number;
  limit?: number;
  excludeIds?: string[];
}

export interface ReinforcementPuzzle {
  puzzleId: string;
  fen: string;
  moves: string;
  rating: number;
  concepts: Array<{ id: ConceptId; confidence: number }>;
  conceptMatchScore: number;
  structuralSimilarity: number;
  ratingProximity: number;
  finalScore: number;
}

export interface ReinforcementResult {
  anchorConcepts: ConceptId[];
  fallbackUsed: "concept" | "theme" | "none";
  embeddingVersion: string;
  puzzles: ReinforcementPuzzle[];
  poolSize: number;
  notes?: string[];
}

// ── Entry point ────────────────────────────────────────────────────────────
export async function getReinforcements(
  req: ReinforcementRequest
): Promise<ReinforcementResult> {
  const t0 = Date.now();
  if (!isNeo4jConfigured()) {
    return empty("Neo4j not configured");
  }

  const limit = req.limit ?? DEFAULT_LIMIT;
  const excludeIds = req.excludeIds ?? [];
  const anchorConcepts = await resolveAnchorConcepts(req);

  // Stage 1: concept filter, or theme fallback if unclassified
  if (anchorConcepts.length === 0) {
    if (!req.themes?.length) {
      const result: ReinforcementResult = {
        anchorConcepts: [],
        fallbackUsed: "none",
        embeddingVersion: STRUCTURAL_EMBEDDING_VERSION,
        puzzles: [],
        poolSize: 0,
        notes: ["Could not classify anchor position; no themes supplied for fallback."],
      };
      emitRetrievalTelemetry(req, result, t0);
      return result;
    }
    const fallback = await themeFallback(req, limit);
    const result: ReinforcementResult = {
      anchorConcepts: [],
      fallbackUsed: "theme",
      embeddingVersion: STRUCTURAL_EMBEDDING_VERSION,
      puzzles: fallback.puzzles,
      poolSize: fallback.poolSize,
      notes: ["Anchor unclassified; falling back to Lichess theme retrieval."],
    };
    emitRetrievalTelemetry(req, result, t0);
    return result;
  }

  const candidates = await conceptStageQuery(
    anchorConcepts,
    req.userElo,
    excludeIds,
    DEFAULT_CANDIDATE_POOL
  );

  if (candidates.length === 0) {
    const result: ReinforcementResult = {
      anchorConcepts,
      fallbackUsed: "concept",
      embeddingVersion: STRUCTURAL_EMBEDDING_VERSION,
      puzzles: [],
      poolSize: 0,
      notes: [
        `No puzzles in Neo4j currently tagged with ${anchorConcepts.join(", ")} in Elo ${req.userElo}±${RATING_BAND}.`,
      ],
    };
    emitRetrievalTelemetry(req, result, t0);
    return result;
  }

  // Stage 2: structural rerank
  const scored = rerankByStructure(req.anchorFen, candidates, anchorConcepts, req.userElo);

  // Stage 3: MMR diversity pass
  const diversified = mmrSelect(scored, limit);

  const result: ReinforcementResult = {
    anchorConcepts,
    fallbackUsed: "concept",
    embeddingVersion: STRUCTURAL_EMBEDDING_VERSION,
    puzzles: diversified,
    poolSize: candidates.length,
  };
  emitRetrievalTelemetry(req, result, t0);
  return result;
}

function emitRetrievalTelemetry(
  req: ReinforcementRequest,
  result: ReinforcementResult,
  t0: number
) {
  log.info("retrieval_event", {
    event: "retrieval",
    anchorFen: req.anchorFen,
    detectedConcepts: result.anchorConcepts,
    fallbackUsed: result.fallbackUsed,
    candidatesReturned: result.puzzles.length,
    poolSize: result.poolSize,
    embeddingVersion: result.embeddingVersion,
    elapsedMs: Date.now() - t0,
    userElo: req.userElo,
    limit: req.limit ?? DEFAULT_LIMIT,
  });
}

// ── Stage 1 helpers ───────────────────────────────────────────────────────
async function resolveAnchorConcepts(
  req: ReinforcementRequest
): Promise<ConceptId[]> {
  if (req.anchorConcepts?.length) return Array.from(new Set(req.anchorConcepts));
  if (req.anchorSolutionUci?.length) {
    const hits = detectConcepts({
      fen: req.anchorFen,
      solutionUci: req.anchorSolutionUci,
    });
    // Keep only high-confidence detector hits for live retrieval (no LLM on hot path)
    return hits
      .filter((h) => h.confidence >= 0.7)
      .map((h) => h.conceptId);
  }
  return [];
}

type Candidate = {
  puzzleId: string;
  fen: string;
  moves: string;
  rating: number;
  concepts: Array<{ id: ConceptId; confidence: number }>;
  maxConfidence: number;
};

async function conceptStageQuery(
  conceptIds: ConceptId[],
  userElo: number,
  excludeIds: string[],
  limit: number
): Promise<Candidate[]> {
  const cypher = `
    MATCH (p:Puzzle)-[r:EXERCISES]->(c:Concept)
    WHERE c.id IN $conceptIds
      AND p.rating >= $minRating
      AND p.rating <= $maxRating
      AND NOT p.puzzleId IN $excludeIds
    WITH p, collect({id: c.id, confidence: r.confidence}) AS concepts,
         max(r.confidence) AS maxConf
    RETURN p.puzzleId AS puzzleId,
           p.fen       AS fen,
           p.moves     AS moves,
           p.rating    AS rating,
           concepts,
           maxConf     AS maxConfidence
    ORDER BY maxConfidence DESC
    LIMIT $limit
  `;
  return executeRead<Candidate>(cypher, {
    conceptIds,
    minRating: neo4j.int(Math.max(400, userElo - RATING_BAND)),
    maxRating: neo4j.int(Math.min(3000, userElo + RATING_BAND)),
    excludeIds,
    limit: neo4j.int(limit),
  });
}

// ── Stage 2: structural rerank ────────────────────────────────────────────
function rerankByStructure(
  anchorFen: string,
  candidates: Candidate[],
  anchorConcepts: ConceptId[],
  userElo: number
): ReinforcementPuzzle[] {
  let anchorVector: number[] | null = null;
  try {
    anchorVector = featuresToVector(extractFENFeatures(anchorFen));
  } catch {
    anchorVector = null;
  }

  return candidates.map((c) => {
    const conceptMatchScore = scoreConceptOverlap(anchorConcepts, c);

    let structuralSimilarity = 0;
    if (anchorVector) {
      try {
        const candVector = featuresToVector(extractFENFeatures(c.fen));
        structuralSimilarity = cosineSimilarity(anchorVector, candVector);
      } catch {
        structuralSimilarity = 0;
      }
    }

    const ratingProximity = 1 - Math.min(1, Math.abs(c.rating - userElo) / RATING_BAND);

    const finalScore =
      RETRIEVAL_WEIGHTS.concept * conceptMatchScore +
      RETRIEVAL_WEIGHTS.structural * structuralSimilarity +
      RETRIEVAL_WEIGHTS.ratingProximity * ratingProximity;

    return {
      puzzleId: c.puzzleId,
      fen: c.fen,
      moves: c.moves,
      rating: c.rating,
      concepts: c.concepts,
      conceptMatchScore: round3(conceptMatchScore),
      structuralSimilarity: round3(structuralSimilarity),
      ratingProximity: round3(ratingProximity),
      finalScore: round3(finalScore),
    };
  });
}

function scoreConceptOverlap(anchor: ConceptId[], cand: Candidate): number {
  // Use max edge confidence of any overlapping concept as the score,
  // slightly amplified when multiple anchor concepts are covered.
  let maxConf = 0;
  let coverage = 0;
  for (const a of anchor) {
    const hit = cand.concepts.find((c) => c.id === a);
    if (hit) {
      coverage++;
      if (hit.confidence > maxConf) maxConf = hit.confidence;
    }
  }
  if (coverage === 0) return 0;
  const coverageBonus = Math.min(0.2, (coverage - 1) * 0.1);
  return Math.min(1, maxConf + coverageBonus);
}

// ── Stage 3: MMR diversity ────────────────────────────────────────────────
function mmrSelect(
  scored: ReinforcementPuzzle[],
  limit: number
): ReinforcementPuzzle[] {
  const pool = scored
    .slice()
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, Math.min(30, scored.length));

  if (pool.length <= limit) return pool;

  const picked: ReinforcementPuzzle[] = [];
  const vectorCache = new Map<string, number[] | null>();

  const getVec = (fen: string) => {
    if (vectorCache.has(fen)) return vectorCache.get(fen)!;
    let v: number[] | null = null;
    try { v = featuresToVector(extractFENFeatures(fen)); } catch { /* invalid FEN — leave v null, caller treats null as no-vector */ }
    vectorCache.set(fen, v);
    return v;
  };

  // First pick: highest-scoring
  picked.push(pool[0]);

  while (picked.length < limit && picked.length < pool.length) {
    let best: ReinforcementPuzzle | null = null;
    let bestMmr = -Infinity;
    for (const cand of pool) {
      if (picked.includes(cand)) continue;
      const cv = getVec(cand.fen);
      let maxSimToPicked = 0;
      for (const p of picked) {
        const pv = getVec(p.fen);
        const sim = cv && pv ? cosineSimilarity(cv, pv) : 0;
        if (sim > maxSimToPicked) maxSimToPicked = sim;
      }
      const mmr = cand.finalScore - MMR_LAMBDA * maxSimToPicked;
      if (mmr > bestMmr) {
        bestMmr = mmr;
        best = cand;
      }
    }
    if (!best) break;
    picked.push(best);
  }

  return picked;
}

// ── Theme fallback (honesty path) ─────────────────────────────────────────
async function themeFallback(
  req: ReinforcementRequest,
  limit: number
): Promise<{ puzzles: ReinforcementPuzzle[]; poolSize: number }> {
  const themes = (req.themes ?? []).map(normalizeThemeId);
  const cypher = `
    MATCH (p:Puzzle)-[:HAS_THEME]->(t:Theme)
    WHERE t.id IN $themes
      AND p.rating >= $minRating
      AND p.rating <= $maxRating
      AND NOT p.puzzleId IN $excludeIds
    WITH p, count(t) AS overlap
    RETURN p.puzzleId AS puzzleId,
           p.fen       AS fen,
           p.moves     AS moves,
           p.rating    AS rating,
           overlap     AS overlap
    ORDER BY overlap DESC, abs(p.rating - $userElo) ASC
    LIMIT $limit
  `;
  const records = await executeRead<{
    puzzleId: string;
    fen: string;
    moves: string;
    rating: number;
    overlap: number;
  }>(cypher, {
    themes,
    userElo: neo4j.int(req.userElo),
    minRating: neo4j.int(Math.max(400, req.userElo - RATING_BAND)),
    maxRating: neo4j.int(Math.min(3000, req.userElo + RATING_BAND)),
    excludeIds: req.excludeIds ?? [],
    limit: neo4j.int(limit),
  });

  const puzzles: ReinforcementPuzzle[] = records.map((r) => ({
    puzzleId: r.puzzleId,
    fen: r.fen,
    moves: r.moves,
    rating: r.rating,
    concepts: [],
    conceptMatchScore: 0,
    structuralSimilarity: 0,
    ratingProximity: 1 - Math.min(1, Math.abs(r.rating - req.userElo) / RATING_BAND),
    finalScore: Math.min(1, r.overlap / Math.max(1, themes.length)),
  }));

  return { puzzles, poolSize: records.length };
}

// ── Utilities ──────────────────────────────────────────────────────────────
function empty(note: string): ReinforcementResult {
  return {
    anchorConcepts: [],
    fallbackUsed: "none",
    embeddingVersion: STRUCTURAL_EMBEDDING_VERSION,
    puzzles: [],
    poolSize: 0,
    notes: [note],
  };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

function normalizeThemeId(theme: string): string {
  return theme
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/\s+/g, "-")
    .replace(/_+/g, "-")
    .toLowerCase();
}
