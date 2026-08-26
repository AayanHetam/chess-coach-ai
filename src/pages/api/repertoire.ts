// The derived repertoire bracket.
//
// Static per band: it depends on nothing about the caller except which rating
// band's corpus to measure, so it stays cacheable and needs no auth.
// Everything personal — which slots they filled — lives on the client.
//
// `?band=` is a corpus selector, not an identity. The band itself is derived
// on the client from a rating the client already has, so passing it here adds
// nothing about the caller that the caller did not already know.

import type { NextApiRequest, NextApiResponse } from 'next';
import { loadRepertoireMap } from '@/lib/repertoire/load';
import type { RepertoireMap } from '@/types/repertoire';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<RepertoireMap | { error: string }>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }
  const band = typeof req.query.band === 'string' ? req.query.band : null;
  const map = loadRepertoireMap(band);
  if (!map) return res.status(503).json({ error: 'repertoire map unavailable' });
  // Derived from two committed files and a build script. It changes when the
  // deployment changes and not otherwise. Vary on the query string, which is
  // implicit in the URL, so each band caches separately.
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  return res.status(200).json(map);
}
