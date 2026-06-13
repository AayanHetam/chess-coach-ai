/**
 * Week-plan generator — pure. Turns the user's real spaced-repetition schedule
 * + daily session size into a 7-day calendar of effort. Honest by construction:
 * each day's reviews are the SRS cards that actually become due that day, and
 * the "new puzzles" figure is a planned effort target — never a rating
 * projection or a fabricated future curriculum.
 *
 * Day windows are relative 24h slices off `nowMs` (day 0 = next 24h), so the
 * bucketing is timezone-independent and unit-testable; only the cosmetic
 * weekday label depends on the local calendar.
 *
 * No network / React here.
 */

import type { PuzzleStats } from "@/lib/puzzleRating";
import {
  buildDailySession,
  sessionSizeFor,
  type TimeCommitment,
} from "./dailyPlan";
import {
  dueThemes,
  isCardDue,
  type ThemeSrsCard,
} from "./puzzleThemeSrs";
import { dayKey } from "./streak";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Rough solving pace; keeps estMinutes self-consistent with the session sizes
 *  (under-10 → ~9, 10-30 → ~16, 30-plus → ~30). */
const MIN_PER_PUZZLE = 1.5;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface WeekPlanInput {
  stats: PuzzleStats;
  srs: Record<string, ThemeSrsCard>;
  dailyTimeCommitment?: TimeCommitment;
  focusThemes?: string[];
  liveRating: number;
}

export interface DayPlan {
  /** Epoch ms at the start of this day's window (nowMs + i·DAY_MS). */
  startMs: number;
  dayIndex: number;
  /** Short weekday label for display (local tz). */
  weekdayLabel: string;
  /** Calendar key, aligned with the streak util for "did I train today". */
  dayKey: string;
  isToday: boolean;
  /**
   * Concrete new-concept themes — only resolved for today (future selection
   * depends on progress we can't honestly predict, so future days are []).
   */
  newThemes: string[];
  /** Planned new-puzzle count for the day (effort target). */
  newCount: number;
  /** SRS review themes that genuinely fall due on this day. */
  reviewThemes: string[];
  totalPuzzles: number;
  estMinutes: number;
}

/** Day index (0 … days-1) a card is next due on, or null if outside the window.
 *  Overdue / never-reviewed cards land on day 0. */
function reviewDayIndex(
  card: ThemeSrsCard,
  nowMs: number,
  days: number,
): number | null {
  if (isCardDue(card, nowMs)) return 0;
  const idx = Math.floor((card.nextReview - nowMs) / DAY_MS);
  return idx >= 0 && idx < days ? idx : null;
}

export function buildWeekPlan(
  input: WeekPlanInput,
  nowMs: number,
  days = 7,
): DayPlan[] {
  const size = sessionSizeFor(input.dailyTimeCommitment);

  // Bucket each SRS card onto the day it next comes due.
  const buckets: ThemeSrsCard[][] = Array.from({ length: days }, () => []);
  for (const card of Object.values(input.srs)) {
    const idx = reviewDayIndex(card, nowMs, days);
    if (idx !== null) buckets[idx].push(card);
  }
  for (const b of buckets) b.sort((a, c) => a.nextReview - c.nextReview);

  // Today uses the real daily session (weakness-first new themes + due reviews)
  // so /plan's "today" matches what SessionRunner would actually serve.
  const today = buildDailySession({
    dailyTimeCommitment: input.dailyTimeCommitment,
    focusThemes: input.focusThemes,
    liveRating: input.liveRating,
    stats: input.stats,
    dueReviewThemes: dueThemes(input.srs, nowMs),
  });

  return buckets.map((bucket, i) => {
    const startMs = nowMs + i * DAY_MS;
    const isToday = i === 0;
    const reviewThemes = isToday
      ? today.reviewThemes
      : bucket.map((c) => c.themeId).slice(0, size.reviews);
    const newThemes = isToday ? today.newThemes : [];
    const newCount = isToday ? today.newThemes.length : size.newConcept;
    const totalPuzzles = newCount + reviewThemes.length;
    return {
      startMs,
      dayIndex: i,
      weekdayLabel: WEEKDAYS[new Date(startMs).getDay()],
      dayKey: dayKey(new Date(startMs)),
      isToday,
      newThemes,
      newCount,
      reviewThemes,
      totalPuzzles,
      estMinutes: Math.max(1, Math.round(totalPuzzles * MIN_PER_PUZZLE)),
    };
  });
}
