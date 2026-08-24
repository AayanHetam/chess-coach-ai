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
// `band` is a request parameter rather than something read off a session,
// because this route has no session — /api/repertoire has none either, for the
// same reason. The client sends the band it computed from the rating it already
// holds. That is not a security boundary and is not treated as one; it is a
// SIZE and RELEVANCE boundary, and the honest framing is that we do not ship a
// beginner four times more theory than they can use.
// ─────────────────────────────────────────────────────────────────────────────

import type { NextApiRequest, NextApiResponse } from 'next';
import { BANDS, bandFor } from '@/lib/repertoire/levels';
import { courseVerdict, viewFor } from '@/lib/courses/view';
import { loadCourse } from '@/lib/courses/load';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id) return res.status(400).json({ error: 'id required' });

  const course = loadCourse(id);
  if (!course) return res.status(404).json({ error: 'no such course' });

  // An explicit band wins; otherwise derive one from a rating; otherwise the
  // middle band, which is what bandFor gives an unrated player and is
  // deliberately not the lowest.
  const bandParam = Array.isArray(req.query.band) ? req.query.band[0] : req.query.band;
  const ratingParam = Array.isArray(req.query.rating) ? req.query.rating[0] : req.query.rating;
  const band =
    BANDS.find(b => b.id === bandParam) ??
    bandFor(ratingParam ? Number(ratingParam) : undefined);

  const view = viewFor(course, band);
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  return res.status(200).json({ ...view, verdict: courseVerdict(view) });
}
