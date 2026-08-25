// Chapter mastery for the signed-in account.
//
// GET  ?courseId=&chapter=   what the account knows
// PUT  {courseId, chapter, records}  merge this device's copy in, get the union
//
// There is no anonymous mode. Progress belongs to an account or it belongs
// nowhere, and a route that quietly accepted an unauthenticated write would be
// a place to store arbitrary JSON under a guessed id.

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSessionFromCookieHeader } from '@/lib/auth/session';
import { mergeChapter, readChapter } from '@/lib/server/courseProgress';
import { sanitiseRecords } from '@/lib/learn/chapterProgress';
import { isCourseId } from '@/lib/learn/courseRoute';

function chapterOf(value: unknown): number | null {
  // An empty string is not a chapter. `Number('')` is 0, so a missing parameter
  // would otherwise be accepted as chapter 0 and read somebody's first chapter
  // whenever the caller forgot to send one.
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isInteger(n) || n < 0 || n > 99) return null;
  return n;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const session = await getSessionFromCookieHeader(req.headers.cookie);
  if (!session?.uid) return res.status(401).json({ error: 'not signed in' });

  const source = req.method === 'GET' ? req.query : ((req.body ?? {}) as Record<string, unknown>);
  const courseId = Array.isArray(source.courseId) ? source.courseId[0] : source.courseId;
  const chapter = chapterOf(Array.isArray(source.chapter) ? source.chapter[0] : source.chapter);

  // The id becomes part of a document path, so it is matched against a shape
  // rather than escaped.
  if (!isCourseId(courseId) || chapter === null) {
    return res.status(400).json({ error: 'courseId and chapter required' });
  }

  // Progress is per account and must never be cached anywhere shared.
  res.setHeader('Cache-Control', 'private, no-store');

  try {
    // The status is set only once the data is in hand. Writing
    // `res.status(200).json(await ...)` sets the code before the await settles,
    // so a rejection leaves a 200 already recorded and the handler answering
    // twice — which happens to work on a real response object and is a trap in
    // every other context.
    if (req.method === 'GET') {
      const records = await readChapter(session.uid, courseId, chapter);
      return res.status(200).json({ records });
    }
    const incoming = sanitiseRecords((req.body as { records?: unknown } | undefined)?.records);
    const merged = await mergeChapter(session.uid, courseId, chapter, incoming, Date.now());
    return res.status(200).json({ records: merged });
  } catch {
    // A sync that fails is a sync that did not happen. The local copy is
    // untouched and the screen keeps working, so this is a 503 and not a 500:
    // it is worth retrying and it broke nothing.
    return res.status(503).json({ error: 'progress unavailable' });
  }
}
