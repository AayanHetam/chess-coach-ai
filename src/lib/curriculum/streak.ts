/**
 * Daily training streak (local). A day counts once the user completes any
 * training activity. Phase 3 mirrors `current`/`lastActiveDay` to the profile
 * so the reminder cron can nudge "don't break your N-day streak."
 */

import { atomWithStorage } from "jotai/utils";

export interface StreakState {
  current: number;
  best: number;
  /** Last active day as YYYY-MM-DD (local). */
  lastActiveDay: string | null;
}

const DEFAULT: StreakState = { current: 0, best: 0, lastActiveDay: null };

export const streakAtom = atomWithStorage<StreakState>(
  "chessMastiStreak",
  DEFAULT
);

/** YYYY-MM-DD for a Date (local time). */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isConsecutive(prev: string, today: string): boolean {
  const p = new Date(`${prev}T00:00:00`);
  const t = new Date(`${today}T00:00:00`);
  return Math.round((t.getTime() - p.getTime()) / (24 * 60 * 60 * 1000)) === 1;
}

/** Record activity on `today` (YYYY-MM-DD). Same-day is idempotent. */
export function bumpStreak(state: StreakState, today: string): StreakState {
  if (state.lastActiveDay === today) return state;
  const current =
    state.lastActiveDay && isConsecutive(state.lastActiveDay, today)
      ? state.current + 1
      : 1;
  return {
    current,
    best: Math.max(state.best, current),
    lastActiveDay: today,
  };
}
