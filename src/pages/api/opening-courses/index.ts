// The course catalogue: what exists, how big each one is, who it suits.
//
// Named /api/opening-courses because /api/courses is already the tactics course
// library behind /courses. Pages Router to sit beside /api/repertoire, which
// this is always fetched with.
// Unauthenticated and cacheable because it depends on nothing about the caller.

import type { NextApiRequest, NextApiResponse } from 'next';
import { loadCourseIndex } from '@/lib/courses/load';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }
  const index = loadCourseIndex();
  if (!index) return res.status(503).json({ error: 'courses unavailable' });
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  return res.status(200).json(index);
}
