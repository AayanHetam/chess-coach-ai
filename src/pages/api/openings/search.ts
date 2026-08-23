// The searchable opening library: all 3,690 named openings.
//
// Served rather than shipped. The corpus is 788KB and a client-side index would
// be most of a page's budget spent on a control most players open once.
//
// `line` is what makes the search usable inside a slot. Searching "London" from
// the slot for 1.d4 Nf6 2.Bf4 should not offer the London System's own lines
// against 1...d5 — they are not reachable from where the player is standing.

import type { NextApiRequest, NextApiResponse } from 'next';
import { loadOpeningLibrary } from '@/lib/repertoire/load';
import type { OpeningEntry } from '@/types/repertoire';

const LIMIT = 40;

export interface OpeningSearchResponse {
  results: OpeningEntry[];
  /** Matches beyond the ones returned, so the UI can say the list is cut. */
  more: number;
}

function param(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<OpeningSearchResponse | { error: string }>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }
  const query = param(req.query.q).trim().toLowerCase();
  const line = param(req.query.line).split(',').filter(Boolean);

  const all = loadOpeningLibrary();
  if (all.length === 0) return res.status(503).json({ error: 'opening library unavailable' });

  const reachable = line.length
    ? all.filter(o => line.every((san, i) => o.moves[i] === san) && o.moves.length > line.length)
    : all;

  const matched = query
    ? reachable.filter(
        o => o.name.toLowerCase().includes(query) || (o.eco ?? '').toLowerCase().startsWith(query)
      )
    : reachable;

  // Shortest first: the shortest line carrying a name is the one that names the
  // idea, and the twenty-ply elaborations of it are not what someone typing
  // "London" is looking for.
  const ranked = [...matched].sort((a, b) => {
    const exact = Number(b.name.toLowerCase().startsWith(query)) - Number(a.name.toLowerCase().startsWith(query));
    if (exact !== 0) return exact;
    if (a.moves.length !== b.moves.length) return a.moves.length - b.moves.length;
    return a.name.localeCompare(b.name);
  });

  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  return res.status(200).json({
    results: ranked.slice(0, LIMIT),
    more: Math.max(0, ranked.length - LIMIT),
  });
}
