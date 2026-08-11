import { atomWithStorage } from "jotai/utils";

/**
 * Per-day record of what training actually happened.
 *
 * This is the missing half of the programme. `/plan` could describe today's
 * session and could show a week grid, but nothing anywhere recorded that a day
 * was *done* — so `goals.puzzlesPerDay` was decorative text, the week grid
 * could only ever show planned effort, and a "task list" had nothing to tick.
 *
 * Deliberately small: a count and a set of themes per day. That is enough to
 * answer the three questions the programme needs — did you train today, how
 * much of your goal is left, and which of today's themes have you touched —
 * without duplicating the stats/SRS stores that already exist.
 */

export interface DayLog {
  /** Puzzles graded on this day, across every surface. */
  puzzles: number;
  /** Distinct themes trained, so today's task rows can be ticked off. */
  themes: string[];
}

/** dayKey (YYYY-MM-DD) → what happened that day. */
export type DailyLog = Record<string, DayLog>;

export const EMPTY_DAY: DayLog = { puzzles: 0, themes: [] };

/**
 * Days retained. The week grid needs 7; a month gives the user some history
 * and keeps the object small enough to ride the synced progress blob without
 * thinking about it. Unbounded growth here would eventually threaten the
 * Firestore document limit.
 */
export const DAILY_LOG_RETENTION_DAYS = 30;

export const dailyLogAtom = atomWithStorage<DailyLog>(
  "chessMastiDailyLog",
  {},
);

/** Record one graded puzzle. Pure; returns a new log. */
export function recordDay(
  log: DailyLog,
  day: string,
  theme?: string,
): DailyLog {
  const prev = log[day] ?? EMPTY_DAY;
  const themes =
    theme && !prev.themes.includes(theme)
      ? [...prev.themes, theme]
      : prev.themes;
  return { ...log, [day]: { puzzles: prev.puzzles + 1, themes } };
}

/**
 * Drop days older than the retention window.
 *
 * `today` is passed in rather than read from the clock so this stays pure and
 * testable, and so callers can't accidentally prune against a different day
 * than the one they just wrote.
 */
export function pruneDailyLog(
  log: DailyLog,
  today: string,
  keepDays = DAILY_LOG_RETENTION_DAYS,
): DailyLog {
  const cutoff = new Date(`${today}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - (keepDays - 1));
  const out: DailyLog = {};
  for (const [day, entry] of Object.entries(log)) {
    // YYYY-MM-DD sorts lexicographically, so a string compare is a date
    // compare — no parsing per entry.
    if (day >= dayKeyOf(cutoff)) out[day] = entry;
  }
  return out;
}

function dayKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Puzzles graded on a given day. */
export function puzzlesOn(log: DailyLog, day: string): number {
  return log[day]?.puzzles ?? 0;
}

/** Whether any training was recorded on a given day. */
export function trainedOn(log: DailyLog, day: string): boolean {
  return puzzlesOn(log, day) > 0;
}

/**
 * Merge two daily logs — used when the server replica and the local copy
 * disagree. Per day: the higher puzzle count wins and themes union.
 *
 * Max-not-sum is the honest choice. Both copies may have recorded the *same*
 * session (local wrote it, the replica received it), so summing would double
 * every synced day. Under-counting a genuinely split day is the safer error:
 * it can only ever show the user less credit than they earned, never invent
 * training they didn't do.
 */
export function mergeDailyLog(a: DailyLog, b: DailyLog): DailyLog {
  const out: DailyLog = { ...a };
  for (const [day, entry] of Object.entries(b)) {
    const mine = out[day];
    if (!mine) {
      out[day] = entry;
      continue;
    }
    out[day] = {
      puzzles: Math.max(mine.puzzles, entry.puzzles),
      // Sorted so the merge is genuinely commutative. Without this, merge(a,b)
      // and merge(b,a) produce the same SET in a different order, which makes
      // the synced blob differ byte-wise depending on which side merged first
      // and provokes pointless writes.
      themes: Array.from(new Set([...mine.themes, ...entry.themes])).sort(),
    };
  }
  return out;
}
