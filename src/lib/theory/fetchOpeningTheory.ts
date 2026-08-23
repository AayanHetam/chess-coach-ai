// Client-side access to /api/opening-theory.
//
// Imports the wire types only — never the loader, which reads the corpus with
// `fs` and must not be reachable from a page bundle.

import type { OpeningTheory } from '@/types/theory';

/**
 * Theory for a set of positions, keyed by the FEN asked about.
 *
 * Returns an empty map on ANY failure. This is an enrichment on top of a
 * measurement that is already complete and correct; a corpus miss, a dead
 * route or a network blip must cost the reader a paragraph, never the report.
 */
export async function fetchOpeningTheory(fens: string[]): Promise<Map<string, OpeningTheory>> {
  const out = new Map<string, OpeningTheory>();
  if (fens.length === 0) return out;
  try {
    const res = await fetch('/api/opening-theory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fens }),
    });
    if (!res.ok) return out;
    const data = (await res.json()) as { theory?: Array<OpeningTheory | null> };
    // Positional: answers pair back to questions by index, so a null entry must
    // stay in place rather than shifting everything after it.
    fens.forEach((fen, i) => {
      const t = data.theory?.[i];
      if (t?.excerpt) out.set(fen, t);
    });
    return out;
  } catch {
    return out;
  }
}
