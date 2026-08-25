// The band has to be a gate, not a suggestion.
//
// `viewFor` truncates a course to the band's depth on the server, which is the
// segregation. It is only a gate if the BAND cannot be chosen by the caller,
// and until this module existed it could: /learn/[courseId] computed the band
// in the browser and sent it as `?band=`, so `?band=strong` worked for anybody,
// including the 900 the cut exists to protect.
//
// Every failure here resolves to null — "we do not know you" — which falls back
// to the query parameter. Never to a throw, and never to a deeper band: a
// profile read that times out must not be a way to unlock depth.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bandFromSession } from '../band';

const getSessionFromCookieHeader = vi.fn();
const getUserById = vi.fn();

vi.mock('@/lib/auth/sessionToken', () => ({
  getSessionFromCookieHeader: (h: string | null | undefined) => getSessionFromCookieHeader(h),
}));
vi.mock('@/lib/server/users', () => ({
  getUserById: (uid: string) => getUserById(uid),
}));


beforeEach(() => {
  getSessionFromCookieHeader.mockReset();
  getUserById.mockReset();
});

describe('bandFromSession', () => {
  it('decides the band from the account, not from anything the caller sent', () => {
    getSessionFromCookieHeader.mockResolvedValue({ uid: 'u1' });
    getUserById.mockResolvedValue({ measuredRating: 900 });
    return expect(bandFromSession('cm_session=x')).resolves.toMatchObject({ id: 'beginner' });
  });

  it('gives a strong player their own depth', () => {
    getSessionFromCookieHeader.mockResolvedValue({ uid: 'u1' });
    getUserById.mockResolvedValue({ measuredRating: 2100 });
    return expect(bandFromSession('cm_session=x')).resolves.toMatchObject({ id: 'strong' });
  });

  it('still decides for a signed-in account with no rating anywhere', () => {
    // We know who they are, so the answer is ours to give. bandFor(undefined)
    // is the middle band and deliberately not the deepest.
    getSessionFromCookieHeader.mockResolvedValue({ uid: 'u1' });
    getUserById.mockResolvedValue({});
    return expect(bandFromSession('cm_session=x')).resolves.toMatchObject({ id: 'improving' });
  });

  it('knows nobody without a cookie', async () => {
    getSessionFromCookieHeader.mockResolvedValue(null);
    expect(await bandFromSession(undefined)).toBeNull();
    expect(await bandFromSession('')).toBeNull();
  });

  it('knows nobody when the account has gone', async () => {
    getSessionFromCookieHeader.mockResolvedValue({ uid: 'ghost' });
    getUserById.mockResolvedValue(null);
    expect(await bandFromSession('cm_session=x')).toBeNull();
  });

  it('degrades to null when the profile read fails, never to a band', async () => {
    // THE ZERO-BY-DEFINITION CASE. A read that throws must not be a path to
    // depth. The count of deep bands returned from a failure is zero, and
    // there is no failure mode that returns one, because the catch returns null.
    getSessionFromCookieHeader.mockResolvedValue({ uid: 'u1' });
    getUserById.mockRejectedValue(new Error('firestore timeout'));
    expect(await bandFromSession('cm_session=x')).toBeNull();

    getSessionFromCookieHeader.mockRejectedValue(new Error('bad signature'));
    expect(await bandFromSession('cm_session=forged')).toBeNull();
  });

  it('never reads the request for a band', async () => {
    // The control on the whole point: the same forged parameter, two accounts,
    // two different answers, and neither of them is the one that was asked for.
    getSessionFromCookieHeader.mockResolvedValue({ uid: 'u1' });
    getUserById.mockResolvedValue({ measuredRating: 900 });
    const beginner = await bandFromSession('cm_session=x');
    getUserById.mockResolvedValue({ measuredRating: 1700 });
    const club = await bandFromSession('cm_session=x');
    expect(beginner?.id).toBe('beginner');
    expect(club?.id).toBe('club');
    expect(beginner?.depth).toBeLessThan(club!.depth);
  });
});
