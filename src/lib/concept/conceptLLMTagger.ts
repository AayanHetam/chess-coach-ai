/**
 * LLM concept tagger — fallback signal for concepts the deterministic detector
 * cannot catch (strategic/positional ideas, subtle tactical motifs without
 * crisp geometric signatures, endgame pattern recognition).
 *
 * Calls the project's shared LLM provider at the `fast` tier (Haiku) with the
 * concept taxonomy in the prompt; asks for top-3 concept IDs with confidence
 * and a short reason. Output is validated against the taxonomy — unknown IDs
 * are dropped.
 */

import { callLLM } from "../llmProvider";
import { CONCEPTS, type ConceptId, listConceptIds } from "./conceptTaxonomy";
import type { DetectorHit } from "./conceptDetector";

export interface LLMTagInput {
  fen: string;
  solutionUci: string[];
  /** Lichess theme tags already attached to this puzzle, passed as weak prior. */
  lichessThemes?: string[];
  /** Already-detected concepts (to avoid re-tagging and bias the LLM). */
  priorHits?: DetectorHit[];
}

export interface LLMTagOutput {
  hits: DetectorHit[];
  raw: string;
  elapsedMs: number;
}

const KNOWN_IDS = new Set<ConceptId>(listConceptIds());

const SYSTEM_PROMPT = `You are a chess coach tagging puzzles with pedagogical concepts from a fixed taxonomy.

Rules:
1. Return ONLY concepts whose IDs appear in the provided taxonomy list. Unknown IDs are rejected.
2. Rank concepts by how central they are to understanding the puzzle's key idea — not every incidental feature.
3. Prefer the most specific concept. If "knight-fork" applies, do not also return generic "double-attack".
4. For strategic/positional puzzles (no forcing tactic), pick the structural idea (IQP, outpost, minority-attack, etc.).
5. For endgame puzzles, prefer endgame-tier concepts (opposition, Lucena, Philidor, square-rule) over tactical tags.
6. Confidence: 0.9+ = textbook example of this concept; 0.7-0.9 = clear fit; 0.5-0.7 = plausible; below 0.5 = do not return.
7. Output strict JSON only — no preamble, no markdown fences.

Output schema:
{"concepts": [{"id": "<concept-id>", "confidence": <number 0-1>, "reason": "<one short sentence>"}]}`;

function buildTaxonomyBlock(): string {
  // Compact one-line-per-concept representation; keeps token cost low.
  return CONCEPTS.map(
    (c) => `- ${c.id} [${c.tier}, ${c.ratingBand[0]}-${c.ratingBand[1]}]: ${c.definition}`
  ).join("\n");
}

function buildUserPrompt(input: LLMTagInput): string {
  const priorBlock = input.priorHits?.length
    ? `\n\nDeterministic detectors already fired:\n${input.priorHits
        .map((h) => `- ${h.conceptId} (${h.confidence.toFixed(2)}): ${h.evidence}`)
        .join("\n")}\nTreat these as confirmed. Return only ADDITIONAL concepts the detector could not catch.`
    : "";

  const themesBlock = input.lichessThemes?.length
    ? `\nLichess theme tags (weak prior, may be noisy): ${input.lichessThemes.join(", ")}`
    : "";

  return `Taxonomy:
${buildTaxonomyBlock()}

Puzzle FEN: ${input.fen}
Solution (UCI): ${input.solutionUci.join(" ")}${themesBlock}${priorBlock}

Return the concepts this puzzle exercises. JSON only.`;
}

export async function tagConceptsWithLLM(input: LLMTagInput): Promise<LLMTagOutput> {
  const t0 = Date.now();
  const result = await callLLM({
    tier: "fast",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(input) }],
    temperature: 0.2,
    maxTokens: 400,
  });

  const hits = parseLLMResponse(result.content);
  return { hits, raw: result.content, elapsedMs: Date.now() - t0 };
}

function parseLLMResponse(raw: string): DetectorHit[] {
  // Tolerate accidental markdown fencing even though the prompt forbids it
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  const concepts = Array.isArray(parsed?.concepts) ? parsed.concepts : [];

  const hits: DetectorHit[] = [];
  for (const entry of concepts) {
    const id = typeof entry?.id === "string" ? entry.id : null;
    const conf = typeof entry?.confidence === "number" ? entry.confidence : null;
    const reason = typeof entry?.reason === "string" ? entry.reason : "";
    if (!id || conf === null) continue;
    if (!KNOWN_IDS.has(id)) continue; // drop hallucinated IDs
    if (conf < 0.5 || conf > 1) continue;
    hits.push({ conceptId: id, confidence: conf, evidence: `LLM: ${reason}` });
  }
  return hits;
}
