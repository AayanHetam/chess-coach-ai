// The player's review schedule and repaired lines, on the account.
//
// GET reads them, PUT merges the caller's copy in and returns the result. Both
// are per account and must never be cached anywhere shared.
//
// A sibling of /api/repertoire-bracket, and separate from it on purpose: the
// bracket is which openings you hold, this is what you have done about them.
// They are written by different screens at different times, and one document
// per screen keeps a push from /train from having to carry /learn's state.

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSessionFromCookieHeader } from '@/lib/auth/session';
import {
  mergeTrainerProgress,
  readTrainerProgress,
  type TrainerProgress,
} from '@/lib/server/trainerStore';
import { sanitiseCards } from '@/lib/learn/reviewSchedule';
import { sanitiseRepaired } from '@/lib/learn/trainerProgress';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const session = await getSessionFromCookieHeader(req.headers.cookie);
  if (!session?.uid) return res.status(401).json({ error: 'not signed in' });

  res.setHeader('Cache-Control', 'private, no-store');

  try {
    // The status is set only once the data is in hand. `res.status(200).json(
    // await ...)` sets the code before the await settles, so a rejection leaves
    // a 200 already recorded and the handler answering twice.
    if (req.method === 'GET') {
      const progress = await readTrainerProgress(session.uid);
      return res.status(200).json({ progress });
    }
    const body = (req.body as { progress?: { cards?: unknown; repaired?: unknown } } | undefined)
      ?.progress;
    const incoming: TrainerProgress = {
      cards: sanitiseCards(body?.cards),
      repaired: sanitiseRepaired(body?.repaired),
    };
    const merged = await mergeTrainerProgress(session.uid, incoming);
    return res.status(200).json({ progress: merged });
  } catch {
    // A sync that fails is a sync that did not happen. The local copy is
    // untouched and the screen keeps working, so this is a 503 and not a 500:
    // it is worth retrying and it broke nothing.
    return res.status(503).json({ error: 'trainer progress unavailable' });
  }
}
