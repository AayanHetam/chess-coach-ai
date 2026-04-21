/**
 * Concept taxonomy — single source of truth for the chess principles the
 * coaching system reinforces. Concepts are authored in conceptTaxonomy.data.json
 * so TS code and .mjs pipeline scripts share one list.
 *
 * See docs/research/concept-similarity-rationale.md for the pedagogical
 * rationale (Gick & Holyoak, Gobet, Sala & Gobet).
 */

import rawConcepts from "./conceptTaxonomy.data.json";

export type ConceptTier = "tactical" | "strategic" | "endgame";

export type ConceptId = string;

export interface Concept {
  id: ConceptId;
  name: string;
  tier: ConceptTier;
  ratingBand: [number, number];
  prerequisites: ConceptId[];
  definition: string;
  canonicalFens: string[];
  lichessThemeAliases: string[];
}

export const CONCEPTS: Concept[] = rawConcepts as unknown as Concept[];

const CONCEPT_BY_ID = new Map<ConceptId, Concept>(
  CONCEPTS.map((x) => [x.id, x])
);

const LICHESS_THEME_TO_CONCEPTS = (() => {
  const m = new Map<string, ConceptId[]>();
  for (const concept of CONCEPTS) {
    for (const alias of concept.lichessThemeAliases) {
      const list = m.get(alias) ?? [];
      list.push(concept.id);
      m.set(alias, list);
    }
  }
  return m;
})();

export function getConcept(id: ConceptId): Concept | undefined {
  return CONCEPT_BY_ID.get(id);
}

export function requireConcept(id: ConceptId): Concept {
  const c = CONCEPT_BY_ID.get(id);
  if (!c) throw new Error(`Unknown concept id: ${id}`);
  return c;
}

export function conceptsByTier(tier: ConceptTier): Concept[] {
  return CONCEPTS.filter((x) => x.tier === tier);
}

export function conceptsForLichessTheme(theme: string): ConceptId[] {
  return LICHESS_THEME_TO_CONCEPTS.get(theme) ?? [];
}

export function listConceptIds(): ConceptId[] {
  return CONCEPTS.map((x) => x.id);
}

export function conceptCount(): number {
  return CONCEPTS.length;
}
