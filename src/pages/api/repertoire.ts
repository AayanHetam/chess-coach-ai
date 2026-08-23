// The derived repertoire bracket.
//
// Static: it depends on nothing about the caller, so it is cacheable and needs
// no auth. Everything personal — which slots they filled — lives on the client.

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
  const map = loadRepertoireMap();
  if (!map) return res.status(503).json({ error: 'repertoire map unavailable' });
  // Derived from two committed files and a build script. It changes when the
  // deployment changes and not otherwise.
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  return res.status(200).json(map);
}
