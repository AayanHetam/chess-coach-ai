// Mistake-to-Puzzle matching — shared in-process logic.
//
// Extracted from src/app/api/mistake-puzzles/route.ts so callers on the
// SERVER (notably generatePuzzleRecommendations in /api/enhanced-analysis)
// can invoke it directly instead of doing `fetch("http://localhost:3000/...")`,
// which throws on Vercel serverless (nothing listens on localhost:3000) — the
// puzzle-recommendation feature was silently dead in prod on every branch
// (audit §3.8). The route handler now delegates here too.

import neo4j from "neo4j-driver";

import { executeRead, isNeo4jConfigured } from "@/lib/neo4j";
import {
  extractPuzzleMatchingCriteria,
  analyzeMissedOpportunity,
  type MistakeContext,
} from "@/lib/mistakeToPuzzleMapper";

export interface MistakePuzzleInput {
  fen: string;
  movePlayed: string;
  correctMove: string;
  evalBefore: number;
  evalAfter: number;
  tacticalMotifs: string[];
  userRating?: number;
}

export interface MistakePuzzle {
  puzzleId: string;
  fen: string;
  moves: string;
  rating: number;
  themes: string[];
  popularity: number;
  nbPlays: number;
}

export interface MistakePuzzleResult {
  puzzles: MistakePuzzle[];
  explanation: string;
  matchCriteria: {
    themes: string[];
    specificThemes: string[];
    ratingRange: { min: number; max: number };
    piecesInvolved: string[];
    keySquares: string[];
  };
  mistakeSeverity: "blunder" | "mistake" | "inaccuracy";
  /** true when Neo4j is unconfigured — caller can treat as "feature off". */
  notConfigured?: boolean;
}

const PUZZLE_QUERY = `
  MATCH (p:Puzzle)-[:HAS_THEME]->(t:Theme)
  WHERE (t.id IN $specificThemes OR t.name IN $specificThemes OR
         t.id IN $themes OR t.name IN $themes)
    AND p.rating >= $minRating
    AND p.rating <= $maxRating
  WITH DISTINCT p
  MATCH (p)-[:HAS_THEME]->(theme:Theme)
  WITH p, collect(theme.name) AS allThemes
  WITH p, allThemes,
       CASE
         WHEN size([t IN allThemes WHERE t IN $specificThemes]) > 0 THEN 2.0
         ELSE 1.0
       END AS specificityScore,
       rand() AS randomizer
  ORDER BY specificityScore DESC, p.popularity DESC, randomizer
  LIMIT $limit
  RETURN p.puzzleId AS puzzleId,
         p.fen AS fen,
         p.moves AS moves,
         p.rating AS rating,
         allThemes AS themes,
         p.popularity AS popularity,
         p.nbPlays AS nbPlays
`;

/**
 * Find puzzles that target the tactical concept a player missed.
 * Returns { notConfigured: true } (empty puzzles) when Neo4j is not set up,
 * so callers degrade gracefully instead of throwing.
 */
export async function findMistakePuzzles(
  input: MistakePuzzleInput,
): Promise<MistakePuzzleResult> {
  const userRating = input.userRating ?? 1500;

  if (!isNeo4jConfigured()) {
    return {
      puzzles: [],
      explanation: "",
      matchCriteria: {
        themes: [],
        specificThemes: [],
        ratingRange: { min: userRating - 200, max: userRating + 200 },
        piecesInvolved: [],
        keySquares: [],
      },
      mistakeSeverity: categorizeMistake(input.evalBefore, input.evalAfter),
      notConfigured: true,
    };
  }

  const { piecesInvolved, keySquares } = analyzeMissedOpportunity(
    input.fen,
    input.movePlayed,
    input.correctMove,
  );

  const mistakeContext: MistakeContext = {
    fen: input.fen,
    movePlayed: input.movePlayed,
    correctMove: input.correctMove,
    evalBefore: input.evalBefore,
    evalAfter: input.evalAfter,
    tacticalMotifs: input.tacticalMotifs,
    piecesInvolved,
    keySquares,
  };

  const criteria = extractPuzzleMatchingCriteria(mistakeContext, userRating);

  const puzzles = await executeRead<MistakePuzzle>(PUZZLE_QUERY, {
    themes: criteria.themes,
    specificThemes: criteria.specificThemes,
    minRating: criteria.ratingRange.min,
    maxRating: criteria.ratingRange.max,
    limit: neo4j.int(criteria.limit),
  });

  return {
    puzzles,
    explanation: buildPuzzleExplanation(mistakeContext, puzzles.length),
    matchCriteria: {
      themes: criteria.themes,
      specificThemes: criteria.specificThemes,
      ratingRange: criteria.ratingRange,
      piecesInvolved,
      keySquares,
    },
    mistakeSeverity: categorizeMistake(input.evalBefore, input.evalAfter),
  };
}

export function buildPuzzleExplanation(
  mistake: MistakeContext,
  puzzleCount: number,
): string {
  if (puzzleCount === 0) {
    return "No matching puzzles found. Try our general practice section.";
  }
  const evalDrop = Math.abs(mistake.evalAfter - mistake.evalBefore);
  const severity = evalDrop > 500 ? "blunder" : evalDrop > 300 ? "mistake" : "inaccuracy";
  const tacticsDesc =
    mistake.tacticalMotifs.length > 0
      ? `involving ${mistake.tacticalMotifs.join(" and ").toLowerCase()}`
      : "in similar positions";
  const piecesDesc =
    mistake.piecesInvolved.length > 0 ? ` with ${mistake.piecesInvolved.join(", ")}` : "";
  return `You ${severity === "blunder" ? "missed a critical tactic" : `made a ${severity}`} ${tacticsDesc}${piecesDesc}. These ${puzzleCount} puzzles will help you recognize this pattern in future games.`;
}

export function categorizeMistake(
  evalBefore: number,
  evalAfter: number,
): "blunder" | "mistake" | "inaccuracy" {
  const drop = Math.abs(evalAfter - evalBefore);
  if (drop > 500) return "blunder";
  if (drop > 300) return "mistake";
  return "inaccuracy";
}
