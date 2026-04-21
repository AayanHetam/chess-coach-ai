/**
 * Concept classifier — orchestrates deterministic detector + LLM tagger and
 * reconciles the two signals into a final (conceptId, confidence, source) list
 * that gets written to Neo4j as (:Puzzle)-[:EXERCISES]->(:Concept).
 *
 * Rule:
 *   - Detector hits with confidence >= 0.8 are authoritative; LLM cannot override.
 *   - For concepts the detector did not return, the LLM's hits fill the gap.
 *   - LLM hits for concepts the detector REJECTED (ran and returned no hit) are
 *     still accepted — detector may miss (e.g., knight-fork via a longer line).
 *     Rejection tracking is out-of-scope for the MVP; rely on reconciliation weights.
 */

import { detectConcepts, type DetectorHit, type DetectorInput } from "./conceptDetector";
import { tagConceptsWithLLM } from "./conceptLLMTagger";
import type { ConceptId } from "./conceptTaxonomy";

export type ClassifierSource = "detector" | "llm";

export interface ClassifiedConcept {
  conceptId: ConceptId;
  confidence: number;
  source: ClassifierSource;
  evidence: string;
}

export interface ClassifyInput extends DetectorInput {
  lichessThemes?: string[];
  /** If true, skip the LLM call (useful in batch pipelines when budgeting). */
  skipLLM?: boolean;
  /** If detector produces ≥ this many high-confidence hits, skip the LLM. */
  llmSkipThreshold?: number;
}

const DEFAULT_LLM_SKIP_THRESHOLD = 2;
const AUTHORITATIVE_CONFIDENCE = 0.8;

export async function classify(input: ClassifyInput): Promise<ClassifiedConcept[]> {
  const detectorHits = detectConcepts(input);

  const highConfidenceDetectorHits = detectorHits.filter(
    (h) => h.confidence >= AUTHORITATIVE_CONFIDENCE
  );

  const skipLLM =
    input.skipLLM ||
    highConfidenceDetectorHits.length >= (input.llmSkipThreshold ?? DEFAULT_LLM_SKIP_THRESHOLD);

  let llmHits: DetectorHit[] = [];
  if (!skipLLM) {
    try {
      const result = await tagConceptsWithLLM({
        fen: input.fen,
        solutionUci: input.solutionUci,
        lichessThemes: input.lichessThemes,
        priorHits: detectorHits,
      });
      llmHits = result.hits;
    } catch (err) {
      console.warn(
        "LLM tagger failed; proceeding with detector hits only:",
        (err as Error).message
      );
    }
  }

  return reconcile(detectorHits, llmHits);
}

function reconcile(
  detectorHits: DetectorHit[],
  llmHits: DetectorHit[]
): ClassifiedConcept[] {
  const out = new Map<ConceptId, ClassifiedConcept>();

  for (const h of detectorHits) {
    out.set(h.conceptId, {
      conceptId: h.conceptId,
      confidence: h.confidence,
      source: "detector",
      evidence: h.evidence,
    });
  }

  for (const h of llmHits) {
    const existing = out.get(h.conceptId);
    if (!existing) {
      out.set(h.conceptId, {
        conceptId: h.conceptId,
        confidence: h.confidence,
        source: "llm",
        evidence: h.evidence,
      });
      continue;
    }
    // Detector already authoritative: keep detector but bump confidence if LLM agrees
    if (existing.source === "detector") {
      const bumped = Math.min(1, existing.confidence + 0.05 * h.confidence);
      existing.confidence = bumped;
    }
  }

  return Array.from(out.values()).sort((a, b) => b.confidence - a.confidence);
}
