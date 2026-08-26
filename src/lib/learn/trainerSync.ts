// Keeping the review schedule in step across devices.
//
// LOCAL FIRST, ALWAYS. `dueCards` and `isRepaired` answer immediately from
// localStorage and the screen renders; the account copy arrives when it arrives
// and is merged in. A page that blocks on a fetch to show you what is due is a
// page that is broken on a train.
//
// EVERY SYNC FAILURE IS SILENT AND HARMLESS — a sync that does not happen costs
// nothing that was not already saved locally. The failure the player must be
// told about is the LOCAL write failing, which `scheduleAfterRepair` now
// returns and /train/opening surfaces, because that is the one that loses the
// only copy on this device.
//
// Mirrors bracketSync.ts deliberately. Two sync layers with different shapes
// would be two things to reason about, and this one is not different.

import {
  loadCards,
  mergeCards,
  sanitiseCards,
  saveCards,
  type ReviewCard,
} from '@/lib/learn/reviewSchedule';
import {
  loadRepaired,
  mergeRepaired,
  sanitiseRepaired,
  saveRepaired,
  type RepairedLine,
} from '@/lib/learn/trainerProgress';

const ENDPOINT = '/api/trainer-progress';

export interface TrainerProgressPayload {
  cards: ReviewCard[];
  repaired: RepairedLine[];
}

async function request(init?: RequestInit): Promise<TrainerProgressPayload | null> {
  try {
    const res = await fetch(ENDPOINT, { credentials: 'same-origin', ...init });
    if (!res.ok) return null;
    const body = (await res.json()) as { progress?: unknown };
    // An account with nothing stored is NOT the same as a failed sync, and both
    // have to come back as null. Sanitising a missing body would produce a
    // real-looking payload of nothing, and the caller would be told "here is
    // the account's schedule" when there is none.
    if (body.progress === null || body.progress === undefined) return null;
    const p = body.progress as { cards?: unknown; repaired?: unknown };
    return { cards: sanitiseCards(p.cards), repaired: sanitiseRepaired(p.repaired) };
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
export async function pullTrainerProgress(account: string): Promise<TrainerProgressPayload | null> {
  const remote = await request();
  if (!remote) return null;
  const merged: TrainerProgressPayload = {
    cards: mergeCards(loadCards(account), remote.cards),
    repaired: mergeRepaired(loadRepaired(account), remote.repaired),
  };
  // `saveCards` trims to the device budget. The account keeps the rest; this
  // device holds the window, and a trimmed card returns before it comes due.
  saveCards(account, merged.cards);
  saveRepaired(account, merged.repaired);
  return merged;
}

/**
 * Send this device's copy up. Fire and forget.
 *
 * UNCONDITIONAL, like the bracket push and for the same reason: a push that
 * waits for a signed-in check it does not have is a push that never happens on
 * the one device where it mattered. A signed-out visitor gets a 401 and
 * `request` returns null, which costs nothing.
 */
export async function pushTrainerProgress(
  progress: TrainerProgressPayload
): Promise<TrainerProgressPayload | null> {
  return request({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ progress }),
  });
}
