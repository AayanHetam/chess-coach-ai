// Where this game left what players at the reader's own level actually play.
//
// POST, because a game's move list is not a query string.
//
// The band is resolved from the SESSION and never taken from the caller. It is
// a claim about who the reader is, and the whole value of the answer is that
// the population it was measured on is the population they play against. A
// client-supplied band would let the screen say "people at your level" over
// numbers from somebody else's level.
//
// A reader with no rating gets `band: null` and no exit — not a defaulted one.
// `bandFor(undefined)` returns `improving`, which is the right default for a
// bracket (it has to show something, and it says which corpus it is) and the
// wrong one here: "fewer than one player at your level plays this" would be a
// measurement of a level nobody measured.

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSessionFromCookieHeader } from '@/lib/auth/sessionToken';
import { getUserById } from '@/lib/server/users';
import { resolveUserRating } from '@/lib/coach/userRating';
import { bandFor } from '@/lib/repertoire/levels';
import { loadOpeningBook } from '@/lib/book/load';
import { bookExit, type BookExit } from '@/lib/book/bookExit';
import type { OpeningBookMeta } from '@/types/book';

/**
 * Longest move list we will walk.
 *
 * The book stops at fourteen plies, so anything past the opening is discarded
 * before the walk. The cap is a bound on the request, not on the answer.
 */
const MAX_SANS = 200;

export interface BookExitResponse {
  band: string | null;
  exit: BookExit | null;
  /** Which corpus answered, so the screen never has to guess. Null with band. */
  corpus: Pick<OpeningBookMeta, 'band' | 'source' | 'games' | 'maxPly' | 'minGames' | 'minShare'> | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BookExitResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const session = await getSessionFromCookieHeader(req.headers.cookie);
  if (!session?.uid) return res.status(401).json({ error: 'not signed in' });

  // Personal: the band is derived from this reader's rating.
  res.setHeader('Cache-Control', 'private, no-store');

  const body = req.body as { sans?: unknown; side?: unknown } | undefined;
  const side = body?.side === 'black' ? 'black' : body?.side === 'white' ? 'white' : null;
  if (!side) return res.status(400).json({ error: 'side must be white or black' });
  if (!Array.isArray(body?.sans)) return res.status(400).json({ error: 'sans must be an array' });
  const sans = body.sans.filter((s): s is string => typeof s === 'string').slice(0, MAX_SANS);

  try {
    const user = await getUserById(session.uid);
    const rating = resolveUserRating(user);
    // No rating is not a band. Answering anyway would put a number from one
    // population under a sentence about another.
    if (rating === null || rating === undefined) {
      return res.status(200).json({ band: null, exit: null, corpus: null });
    }
    const band = bandFor(rating).id;
    const book = loadOpeningBook(band);
    // A band with no shipped book gets nothing, NOT the Elite corpus. "Players
    // rated 2300+ do not play this" and "players at your level do not play
    // this" are different sentences, and only one of them is on the screen.
    if (!book) return res.status(200).json({ band, exit: null, corpus: null });
    return res.status(200).json({
      band,
      exit: bookExit(sans, side, book),
      corpus: {
        band: book.meta.band,
        source: book.meta.source,
        games: book.meta.games,
        maxPly: book.meta.maxPly,
        minGames: book.meta.minGames,
        minShare: book.meta.minShare,
      },
    });
  } catch {
    // Nothing on the page depends on this panel, so a failure here is worth
    // retrying (503) and is not an error the caller caused (500).
    return res.status(503).json({ error: 'book unavailable' });
  }
}
