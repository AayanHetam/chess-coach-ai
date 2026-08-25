// `?band=strong` must do nothing to a caller we can identify.
//
// This is the assertion the whole segregation rests on, and it is made on the
// RESPONSE BODY rather than on anything rendered: a UI that looks right while
// the payload carries ply-20 theory has already lost, because the theory left
// the server.
//
// It lives here and not beside the route because anything under src/pages/api
// is an API route to Next, and a test file has no default export. `tsc` and
// vitest were both happy with it there; `npm run build` was not.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { BANDS } from '@/lib/repertoire/levels';
import type { CourseView } from '@/lib/courses/view';
import handler from '@/pages/api/opening-courses/[id]';

const bandFromSession = vi.fn();
vi.mock('@/lib/courses/band', () => ({
  bandFromSession: (h: string | null | undefined) => bandFromSession(h),
}));



const BEGINNER = BANDS.find(b => b.id === 'beginner')!;

function call(query: Record<string, string>, cookie?: string) {
  const json = vi.fn();
  const setHeader = vi.fn();
  const req = { method: 'GET', query, headers: { cookie } } as unknown as NextApiRequest;
  const res = {
    status: () => res,
    json,
    setHeader,
  } as unknown as NextApiResponse;
  return handler(req, res).then(() => ({
    body: json.mock.calls[0]?.[0] as CourseView & { verdict: string },
    headers: Object.fromEntries(setHeader.mock.calls),
  }));
}

beforeEach(() => bandFromSession.mockReset());

describe('the band gate', () => {
  it('ignores a forged band for a caller it can identify', async () => {
    bandFromSession.mockResolvedValue(BEGINNER);
    const forged = await call({ id: 'w-london', band: 'strong' }, 'cm_session=x');
    const plain = await call({ id: 'w-london' }, 'cm_session=x');

    // THE ZERO: the two payloads are byte-identical, so asking for depth
    // bought exactly nothing.
    expect(JSON.stringify(forged.body)).toBe(JSON.stringify(plain.body));
    expect(forged.body.band).toBe('beginner');

    // The control that stops this passing on an empty body.
    expect(Object.keys(forged.body.nodes).length).toBeGreaterThan(0);
  });

  it('serves nothing deeper than the caller is entitled to', async () => {
    bandFromSession.mockResolvedValue(BEGINNER);
    const { body } = await call({ id: 'w-london', band: 'strong' }, 'cm_session=x');
    const limit = body.meta.root.length + BEGINNER.depth;
    const past = Object.values(body.nodes).filter(n => n.p > limit);
    expect(past).toHaveLength(0);
    expect(body.maxPly).toBeLessThanOrEqual(limit);
  });

  it('does not put a per-account body into a shared cache', async () => {
    // A `public` cache keyed on the URL alone would serve one player's depth
    // to the next player who asked for the same course.
    bandFromSession.mockResolvedValue(BEGINNER);
    const { headers } = await call({ id: 'w-london' }, 'cm_session=x');
    expect(headers['Cache-Control']).toBe('private, no-store');
  });

  it('still lets an unrecognised caller choose, and caches that publicly', async () => {
    // Nothing is known about them, so there is no rating to segregate against
    // and the parameter is all there is. That answer is a pure function of the
    // URL, so it is safe to cache.
    bandFromSession.mockResolvedValue(null);
    const { body, headers } = await call({ id: 'w-london', band: 'beginner' });
    expect(body.band).toBe('beginner');
    expect(headers['Cache-Control']).toContain('public');
  });
});
