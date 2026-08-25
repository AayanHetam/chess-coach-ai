// `?band=strong` must do nothing on this route.
//
// The reader at /learn/[courseId] computes its band in the browser and sends it
// to an API whose own header says the parameter is not a security boundary.
// This route takes neither: the band comes from the account and the query is
// never read. The assertion is made on the SERIALISED PROPS rather than on
// anything rendered, because a screen that looks right while the payload
// carries ply-20 theory has already lost — the theory left the server.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetServerSidePropsContext } from 'next';
import { BANDS } from '@/lib/repertoire/levels';

const getSessionFromCookieHeader = vi.fn();
const getUserById = vi.fn();

// sessionToken, not session: the page imports the headers-free module because
// `next/headers` is App-Router-only and fails a pages/ build. Mocking the wrong
// one silently ran the real verifier, which returns null for every cookie and
// made the whole suite assert the signed-out path.
vi.mock('@/lib/auth/sessionToken', () => ({
  getSessionFromCookieHeader: (h: unknown) => getSessionFromCookieHeader(h),
}));
vi.mock('@/lib/server/users', () => ({ getUserById: (uid: string) => getUserById(uid) }));

import { getServerSideProps } from '@/pages/train/course/[courseId]/[chapter]';

type Props = { props: Record<string, unknown> };

function ctx(params: Record<string, string>, query: Record<string, string> = {}, cookie?: string) {
  return {
    params,
    query,
    req: { headers: { cookie } },
    res: { setHeader: vi.fn() },
  } as unknown as GetServerSidePropsContext;
}

const run = (params: Record<string, string>, query = {}, cookie?: string) =>
  getServerSideProps(ctx(params, query, cookie)) as Promise<Props & { notFound?: true }>;

beforeEach(() => {
  getSessionFromCookieHeader.mockReset();
  getUserById.mockReset();
});

describe('the band comes from the account', () => {
  it('ignores a forged band completely', async () => {
    getSessionFromCookieHeader.mockResolvedValue({ uid: 'u1' });
    getUserById.mockResolvedValue({ measuredRating: 900 });

    const plain = await run({ courseId: 'w-london', chapter: '0' }, {}, 'cm_session=x');
    const forged = await run(
      { courseId: 'w-london', chapter: '0' },
      { band: 'strong', rating: '2400' },
      'cm_session=x'
    );

    // THE ZERO: the byte difference between the two payloads.
    expect(JSON.stringify(forged.props)).toBe(JSON.stringify(plain.props));
    expect(plain.props.band).toBe('beginner');
    // The control that stops this passing on an empty payload.
    expect((plain.props.probes as unknown[]).length).toBeGreaterThan(0);
  });

  it('serves nothing deeper than the account is entitled to', async () => {
    getSessionFromCookieHeader.mockResolvedValue({ uid: 'u1' });
    getUserById.mockResolvedValue({ measuredRating: 900 });
    const beginner = BANDS.find(b => b.id === 'beginner')!;

    const { props } = await run({ courseId: 'w-london', chapter: '0' }, { band: 'strong' }, 'c');
    const rootPly = (props.chapterLine as string[]).length;
    const probes = props.probes as Array<{ ply: number }>;

    // The chapter's own line is the floor; the band's depth is measured from
    // the COURSE root, which is at or above it.
    const limit = rootPly + beginner.depth;
    expect(probes.filter(p => p.ply > limit)).toHaveLength(0);
    expect(props.theoryPlies).toBe(beginner.depth);
  });

  it('gives a strong account its own depth', async () => {
    getSessionFromCookieHeader.mockResolvedValue({ uid: 'u1' });
    getUserById.mockResolvedValue({ measuredRating: 2200 });
    const { props } = await run({ courseId: 'w-london', chapter: '0' }, {}, 'c');
    expect(props.band).toBe('strong');
    expect(props.theoryPlies).toBe(BANDS.find(b => b.id === 'strong')!.depth);
  });

  it('gives a visitor it cannot identify the middle band, not the deepest', async () => {
    getSessionFromCookieHeader.mockResolvedValue(null);
    const { props } = await run({ courseId: 'w-london', chapter: '0' }, { band: 'strong' });
    expect(props.band).toBe('improving');
  });

  it('degrades to the middle band when the profile read fails, never deeper', async () => {
    // Being wrong downward costs a strong player depth for one session. Being
    // wrong upward hands a beginner the theory the cut exists to withhold.
    getSessionFromCookieHeader.mockResolvedValue({ uid: 'u1' });
    getUserById.mockRejectedValue(new Error('firestore timeout'));
    const { props } = await run({ courseId: 'w-london', chapter: '0' }, { band: 'strong' }, 'c');
    expect(props.band).toBe('improving');
  });

  it('never puts a per-account page in a shared cache', async () => {
    getSessionFromCookieHeader.mockResolvedValue({ uid: 'u1' });
    getUserById.mockResolvedValue({ measuredRating: 900 });
    const context = ctx({ courseId: 'w-london', chapter: '0' }, {}, 'c');
    await getServerSideProps(context);
    expect(context.res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });
});

describe('what it refuses', () => {
  beforeEach(() => getSessionFromCookieHeader.mockResolvedValue(null));

  it('404s an id that is not a course', async () => {
    for (const courseId of ['../../etc', 'nope', 'w london', '']) {
      expect(await run({ courseId, chapter: '0' })).toMatchObject({ notFound: true });
    }
  });

  it('404s a chapter that is not one', async () => {
    for (const chapter of ['-1', 'x', '', '99']) {
      expect(await run({ courseId: 'w-london', chapter })).toMatchObject({ notFound: true });
    }
  });

  it('404s a chapter the band cannot see', async () => {
    // A chapter cut out by breadth is not a 500 and not an empty page.
    const { notFound } = await run({ courseId: 'w-london', chapter: '20' });
    expect(notFound).toBe(true);
  });
});

describe('what it says', () => {
  it('describes the chapter with measured numbers only', async () => {
    getSessionFromCookieHeader.mockResolvedValue(null);
    const { props } = await run({ courseId: 'w-london', chapter: '0' });
    expect(props.courseName).toBe('London System');
    expect(props.side).toBe('white');
    expect(Array.isArray(props.chapterLine)).toBe(true);
    expect(props.chapterShare).toBeGreaterThan(0);
    expect(props.total).toBeGreaterThanOrEqual((props.probes as unknown[]).length);
  });
});
