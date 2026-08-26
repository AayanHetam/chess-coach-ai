// The player's bracket, on the account.
//
// GET reads it, PUT merges the caller's copy into it and returns the result.
// Both are per account and must never be cached anywhere shared.
//
// Deliberately NOT the same route as /api/repertoire: that one serves the
// derived map, is identical for everyone in a band, and is cached publicly for
// an hour. Sharing a path between a public artifact and a private document is
// how a cache ends up serving one person's repertoire to another.

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSessionFromCookieHeader } from '@/lib/auth/session';
import { mergeBracket, readBracket } from '@/lib/server/bracketStore';
import { sanitiseBracket } from '@/lib/repertoire/store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const session = await getSessionFromCookieHeader(req.headers.cookie);
  if (!session?.uid) return res.status(401).json({ error: 'not signed in' });

  res.setHeader('Cache-Control', 'private, no-store');

  try {
    // The status is set only once the data is in hand. Writing
    // `res.status(200).json(await ...)` sets the code before the await
    // settles, so a rejection leaves a 200 already recorded and the handler
    // answering twice.
    if (req.method === 'GET') {
      const bracket = await readBracket(session.uid);
      return res.status(200).json({ bracket });
    }
    const incoming = sanitiseBracket((req.body as { bracket?: unknown } | undefined)?.bracket);
    const merged = await mergeBracket(session.uid, incoming);
    return res.status(200).json({ bracket: merged });
  } catch {
    // A sync that fails is a sync that did not happen. The local copy is
    // untouched and the screen keeps working, so this is a 503 and not a 500:
    // it is worth retrying and it broke nothing.
    return res.status(503).json({ error: 'bracket unavailable' });
  }
}
