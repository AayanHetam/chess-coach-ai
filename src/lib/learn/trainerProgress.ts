// Pausing and resuming a training session, and remembering what got repaired.
//
// A drill you cannot leave is a drill nobody starts. Three clean runs is a real
// commitment, and the honest way to ask for it is to make walking away free:
// close the tab mid-run, come back tomorrow, carry on from the same ply.
//
// localStorage, because this is the working copy of one person's progress on
// one device and it must survive a reload with no network and no session. It is
// deliberately NOT the source of truth for anything else: losing it costs a
// player their streak on one line, never their measured repertoire.
//
// Two of the three things here are device-local ON PURPOSE, and one is not:
//
//   THE SESSION IN PROGRESS stays here. It is a half-finished drill with a
//   three-day life, and syncing it would let two devices fight over a streak
//   mid-run. Losing it costs one restart.
//
//   THE REPAIRED LIST goes to the account, via `trainerSync`. It is the record
//   of work that is FINISHED — lines a player has already put three clean runs
//   into — and `isRepaired` uses it to stop offering them the same drill again.
//   Losing it means being asked to redo work that was done, which is the exact
//   thing the account copy exists to prevent.
//
// Every read is defensive. A corrupt or stale entry degrades to "no saved
// session", which costs one restart. A throw here would take the trainer down
// on mount, which is the one failure a resume feature must not introduce.

import type { SessionMode, TrainerLine, TrainerState } from '@/lib/learn/trainerSession';

const PREFIX = 'cm.trainer.v1';

/**
 * Sessions older than this are not offered.
 *
 * Resuming into the middle of a drill you have no memory of starting is worse
 * than starting again: the board is mid-line, the streak is unexplained, and
 * the first thing you do is get it wrong.
 */
export const SESSION_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export interface SavedSession {
  v: 1;
  /** Identity of the line, so a re-measured repertoire cannot resume the wrong one. */
  lineKey: string;
  state: TrainerState;
  savedAt: number;
}

/**
 * Sessions are stored per MODE.
 *
 * A repair and a review of the same line share a line key but are different
 * work: three acts against one. Sharing a slot would let a paused repair be
 * resumed as a finished review, or a review overwrite a repair someone was
 * half way through.
 */

export interface RepairedLine {
  lineKey: string;
  /** The line as the reader saw it, so a history can be shown without re-deriving. */
  label: string;
  at: number;
  /** Runs it took, including the spoiled ones. Honest, not flattering. */
  runs: number;
}

/**
 * What identifies a line for storage.
 *
 * The moves and the colour, and NOT the target: the target can change when the
 * master lookup lands, and a session in progress must not be orphaned by it.
 */
export function lineKeyOf(line: Pick<TrainerLine, 'moves' | 'color'>): string {
  return `${line.color}:${line.moves.join(' ')}`;
}

/**
 * One slot per mode, because they are not interchangeable.
 *
 * Study shared the repair slot until courses existed, which was harmless while
 * nothing constructed a study session. It stops being harmless the moment a
 * course can start one: opening a chapter would silently discard a
 * half-finished repair of a line measured off the player's own games, which is
 * the one thing on this page that must not move.
 */
function sessionKey(account: string, mode: SessionMode): string {
  const suffix = mode === 'review' ? '.review' : mode === 'study' ? '.study' : '';
  return `${PREFIX}.session${suffix}:${account.toLowerCase()}`;
}

function repairedKey(account: string): string {
  return `${PREFIX}.repaired:${account.toLowerCase()}`;
}

function read<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing to do, and nothing worth failing for */
  }
}

/** Store the session in progress. Called on every state change; it is one small write. */
export function saveSession(
  account: string,
  line: Pick<TrainerLine, 'moves' | 'color'>,
  state: TrainerState,
  now: number
): void {
  write(sessionKey(account, state.mode), {
    v: 1,
    lineKey: lineKeyOf(line),
    state,
    savedAt: now,
  } satisfies SavedSession);
}

/**
 * The session to resume, or null.
 *
 * Null for every reason a resume would be wrong: nothing stored, a different
 * line, a shape we do not recognise, too old, or already finished. A finished
 * session is not resumable — there is nothing left to do in it, and dropping a
 * player back onto a completion screen reads as the trainer being stuck.
 */
export function loadSession(
  account: string,
  line: Pick<TrainerLine, 'moves' | 'color'>,
  now: number,
  mode: SessionMode = 'repair',
  ttlMs: number = SESSION_TTL_MS
): TrainerState | null {
  const saved = read<SavedSession>(sessionKey(account, mode));
  if (!saved || saved.v !== 1) return null;
  if (saved.lineKey !== lineKeyOf(line)) return null;
  if (typeof saved.savedAt !== 'number' || now - saved.savedAt > ttlMs) return null;
  const state = saved.state;
  if (!state || typeof state !== 'object') return null;
  if (typeof state.act !== 'string' || typeof state.fen !== 'string') return null;
  if (state.act === 'done') return null;
  // Fields added after sessions were already in the wild. `misses` in
  // particular is arithmetic: undefined + 1 is NaN, which would silently
  // corrupt the grade a review feeds back to the scheduler.
  // The mode is re-derived rather than trusted, because a stored string is
  // just a string. It must admit every mode the machine has: coercing an
  // unknown value to 'repair' was right when there were two, and with study it
  // would resume a course chapter as a CONFRONT — "play what you always play"
  // — for a move the player has never been shown.
  const resumedMode: SessionMode =
    state.mode === 'review' ? 'review' : state.mode === 'study' ? 'study' : 'repair';
  return { ...state, mode: resumedMode, misses: state.misses ?? 0 };
}

export function clearSession(account: string, mode: SessionMode = 'repair'): void {
  remove(sessionKey(account, mode));
}

/**
 * How many repaired lines we keep.
 *
 * Fifty entries at roughly a hundred bytes each. The list is a picture of the
 * repertoire, not a log, and past fifty the oldest entry stops being something
 * anyone would recognise.
 */
export const MAX_REPAIRED = 50;

/** Everything this account has repaired, newest first. */
export function loadRepaired(account: string): RepairedLine[] {
  return sanitiseRepaired(read<unknown>(repairedKey(account)));
}

/**
 * Repaired entries we are willing to act on, newest first.
 *
 * Shared with the server, so an entry written by an old client cannot make
 * `isRepaired` throw or a history render a blank row. `at` is finite rather
 * than merely a number: a NaN there sorts unpredictably and would shuffle the
 * list differently on every read.
 */
export function sanitiseRepaired(parsed: unknown): RepairedLine[] {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (r): r is RepairedLine =>
        !!r && typeof r === 'object' && typeof r.lineKey === 'string' && Number.isFinite(r.at)
    )
    .map(r => ({
      lineKey: r.lineKey,
      label: typeof r.label === 'string' ? r.label : r.lineKey,
      at: r.at,
      runs: Number.isFinite(r.runs) ? r.runs : 0,
    }))
    .sort((a, b) => b.at - a.at);
}

/**
 * Everything either copy knows, newest entry per line, capped.
 *
 * Repairing is not undoable, so a union is safe here in a way it is not for the
 * bracket: there is no path in the product that removes a repaired line, and so
 * no removal for a union to undo. The cap is the one thing that drops entries,
 * and it drops the OLDEST — which both copies agree on, so neither can hand the
 * other back something it had already aged out.
 */
export function mergeRepaired(mine: RepairedLine[], theirs: RepairedLine[]): RepairedLine[] {
  const byKey = new Map<string, RepairedLine>();
  for (const entry of [...mine, ...theirs]) {
    const held = byKey.get(entry.lineKey);
    if (!held || entry.at > held.at) byKey.set(entry.lineKey, entry);
  }
  return Array.from(byKey.values())
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_REPAIRED);
}

/** Replace the repaired list on this device. False if the write was refused. */
export function saveRepaired(account: string, list: RepairedLine[]): boolean {
  return write(repairedKey(account), sanitiseRepaired(list).slice(0, MAX_REPAIRED));
}

/**
 * Record a repaired line.
 *
 * One entry per line: repairing the same line again updates it rather than
 * stacking, so the list stays a picture of the repertoire and not a log.
 */
export function markRepaired(
  account: string,
  line: Pick<TrainerLine, 'moves' | 'color'>,
  label: string,
  runs: number,
  now: number
): RepairedLine[] {
  const key = lineKeyOf(line);
  const next = [
    { lineKey: key, label, at: now, runs },
    ...loadRepaired(account).filter(r => r.lineKey !== key),
  ].slice(0, MAX_REPAIRED);
  write(repairedKey(account), next);
  return next;
}

export function isRepaired(account: string, line: Pick<TrainerLine, 'moves' | 'color'>): boolean {
  const key = lineKeyOf(line);
  return loadRepaired(account).some(r => r.lineKey === key);
}

/**
 * How far into the session a saved state is, for a resume prompt.
 *
 * Words, not a percentage: "part-way through the drill" is something a person
 * can decide about, and 62% is not.
 */
export function describeProgress(state: TrainerState): string {
  if (state.act === 'learn') return 'You had just played your move';
  if (state.act === 'drill') {
    if (state.streak === 0) return 'You were drilling the line';
    return `You were drilling, ${state.streak} clean ${state.streak === 1 ? 'run' : 'runs'} in`;
  }
  return 'You had just started';
}
