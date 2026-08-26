// Keeping the bracket in step across devices.
//
// LOCAL FIRST, ALWAYS. `loadBracket` answers immediately from localStorage and
// /learn renders; the account copy arrives when it arrives and is merged in.
// A page that blocks on a fetch to show you what you already chose is a page
// that is broken on a train.
//
// EVERY SYNC FAILURE IS SILENT AND HARMLESS — a sync that does not happen costs
// nothing that was not already saved locally. The failure the player must be
// told about is the LOCAL write failing, which `saveBracket` returns and
// /learn surfaces, because that is the one that loses the only copy on this
// device.
//
// Mirrors chapterSync.ts deliberately. Two sync layers with different shapes
// would be two things to reason about, and this one is not different.

import { loadBracket, mergeBrackets, sanitiseBracket, saveBracket, type BracketState } from '@/lib/repertoire/store';

const ENDPOINT = '/api/repertoire-bracket';

async function request(init?: RequestInit): Promise<BracketState | null> {
  try {
    const res = await fetch(ENDPOINT, { credentials: 'same-origin', ...init });
    if (!res.ok) return null;
    const body = (await res.json()) as { bracket?: unknown };
    // An account with nothing stored is NOT the same as a failed sync, and
    // both have to come back as null. `sanitiseBracket(null)` is EMPTY, which
    // would make `pullBracket` return a real-looking bracket of nothing and
    // hand /learn an empty state to adopt. The merge would still protect the
    // local copy — EMPTY loses every comparison — but the caller would be told
    // "here is the account's bracket" when there is none.
    if (body.bracket === null || body.bracket === undefined) return null;
    return sanitiseBracket(body.bracket);
  } catch {
    return null;
  }
}

/**
 * The account's copy, merged into this device's, saved locally, and returned.
 *
 * Null when there is nothing to add — no session, no network, or an account
 * that has never been synced. A null means "carry on with what you have", not
 * "you have nothing".
 */
export async function pullBracket(account: string): Promise<BracketState | null> {
  const remote = await request();
  if (!remote) return null;
  const merged = mergeBrackets(loadBracket(account), remote);
  saveBracket(account, merged);
  return merged;
}

/**
 * Send this device's copy up. Fire and forget.
 *
 * The merged result is returned for callers that want it, but nothing has to
 * wait: the local copy is already saved by the time this is called.
 */
export async function pushBracket(bracket: BracketState): Promise<BracketState | null> {
  return request({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bracket }),
  });
}
