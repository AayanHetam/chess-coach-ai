// The band a signed-in player is entitled to, decided on the server.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS NOT A QUERY PARAMETER
//
// `viewFor` is the segregation: it truncates a course to the band's depth
// before anything reaches a screen. That is only a gate if the band itself
// cannot be chosen by the caller. Until this module existed the band came from
// `?band=`, computed in the browser from a rating the browser already held, and
// `?band=strong` therefore worked for anybody — including the 900 the cut
// exists to protect.
//
// So for a caller we can identify, the server decides and the parameter is
// ignored. For a caller we cannot, there is no rating to segregate against and
// the parameter still decides; `bandFor(undefined)` is the middle band, which
// is deliberately not the deepest.
//
// Failures resolve to null, never to a throw and never to a deep band. A
// profile read that times out must degrade to "we do not know you", which
// costs the caller nothing they were entitled to.
// ─────────────────────────────────────────────────────────────────────────────

// From sessionToken rather than session: this module is exactly the kind of
// thing a page would import, and `session` pulls in `next/headers`, which is
// App-Router-only and fails a pages/ build outright.
import { getSessionFromCookieHeader } from '@/lib/auth/sessionToken';
import { getUserById } from '@/lib/server/users';
import { resolveUserRating } from '@/lib/coach/userRating';
import { bandFor, type Band } from '@/lib/repertoire/levels';

/** The caller's own band, or null when we do not know who they are. */
export async function bandFromSession(
  cookieHeader: string | null | undefined
): Promise<Band | null> {
  try {
    const session = await getSessionFromCookieHeader(cookieHeader);
    if (!session?.uid) return null;
    const user = await getUserById(session.uid);
    if (!user) return null;
    // An account with no rating anywhere still gets a decided band rather than
    // falling through to the query parameter: we know who they are, so the
    // answer is ours to give. bandFor(undefined) is the middle band.
    return bandFor(resolveUserRating(user));
  } catch {
    return null;
  }
}
