// One course, cut to the caller's band.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE CUT HAPPENS HERE, ON THE SERVER
//
// A player below a band must not be able to reach deeper content through any
// path, and the only way to mean that is for the deeper content never to leave
// the server. Sending the whole course and hiding the rest in the client would
// put ply-20 theory in front of a 900 with the developer tools open, and would
// make the band a decoration.
//
// For a SIGNED-IN caller the band is resolved here, from their own account, and
// the `band` query parameter is ignored outright. That is what makes the cut a
// gate rather than a suggestion: a rating we know cannot be talked out of by a
// URL. It costs one profile read, and the response is marked `private` because
// a per-user body behind a shared `public` cache would hand one player another
// player's depth.
//
// For a caller we do not recognise there is no rating to segregate against, so
// the query parameter still decides, and the honest framing there is unchanged:
// a SIZE and RELEVANCE boundary, so we do not ship a beginner four times more
// theory than they can use.
// ─────────────────────────────────────────────────────────────────────────────

import type { NextApiRequest, NextApiResponse } from 'next';
import { BANDS, bandFor } from '@/lib/repertoire/levels';
import { courseVerdict, viewFor } from '@/lib/courses/view';
import { loadCourse } from '@/lib/courses/load';
import { bandFromSession } from '@/lib/courses/band';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id) return res.status(400).json({ error: 'id required' });

  const course = loadCourse(id);
  if (!course) return res.status(404).json({ error: 'no such course' });

  // The caller's own band wins. Only when we cannot identify them does an
  // explicit band, then a rating, then the middle band decide — and the middle
  // band is what bandFor gives an unrated player, deliberately not the lowest.
  const bandParam = Array.isArray(req.query.band) ? req.query.band[0] : req.query.band;
  const ratingParam = Array.isArray(req.query.rating) ? req.query.rating[0] : req.query.rating;

  const owned = await bandFromSession(req.headers.cookie);
  const band =
    owned ??
    BANDS.find(b => b.id === bandParam) ??
    bandFor(ratingParam ? Number(ratingParam) : undefined);

  const view = viewFor(course, band);
  // A body chosen by cookie must never enter a shared cache. Only the anonymous
  // answer, which is a pure function of the URL, is safe to cache publicly.
  res.setHeader(
    'Cache-Control',
    owned ? 'private, no-store' : 'public, max-age=3600, stale-while-revalidate=86400'
  );
  return res.status(200).json({ ...view, verdict: courseVerdict(view) });
}
