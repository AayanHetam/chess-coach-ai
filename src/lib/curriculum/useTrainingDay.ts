"use client";

import { useCallback, useRef } from "react";
import { useAtom } from "jotai";
import { bumpStreak, dayKey, streakAtom } from "./streak";
import { dailyLogAtom, pruneDailyLog, recordDay } from "./dailyLog";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Record that the user trained today — streak + server mirror, in one call.
 *
 * Why this is a shared hook rather than inline code: the streak is the
 * programme's core habit metric, and before 2026-08-10 `bumpStreak` was called
 * from exactly ONE place (SessionRunner). Solving fifty puzzles on /puzzles
 * advanced nothing, so the number on /plan disagreed with what the user had
 * actually done. Any surface where a user completes real training should call
 * this; keeping the mirror-to-profile logic in one place is what stops the next
 * surface from forgetting half of it.
 *
 * Safe to call on every graded item:
 *   - `bumpStreak` is same-day idempotent (streak.ts), so repeat calls are
 *     no-ops on the state;
 *   - a ref guard stops the redundant profile write within a session.
 *
 * The profile mirror is what the reminder cron reads server-side
 * (`/api/send-reminders` skips anyone active in the last 20h), so a surface
 * that bumps the local streak without mirroring would make the user's own
 * activity invisible to their reminders.
 */
export function useRecordTrainingDay(): (theme?: string) => void {
  const [streak, setStreak] = useAtom(streakAtom);
  const [, setDailyLog] = useAtom(dailyLogAtom);
  const { updateProfile } = useAuth();
  const mirroredForDay = useRef<string | null>(null);

  return useCallback(
    (theme?: string) => {
      const today = dayKey(new Date());

      // The per-puzzle tally runs on EVERY call — it's what "3 of 5 done
      // today" and the week grid's completed days are counted from. Only the
      // streak and the profile mirror are once-per-day.
      setDailyLog((prev) => pruneDailyLog(recordDay(prev, today, theme), today));

      if (mirroredForDay.current === today) return;
      mirroredForDay.current = today;

      const next = bumpStreak(streak, today);
      setStreak(next);

      // Always refresh lastActiveAt even when the streak itself didn't move
      // (second session of the same day) — the cron uses it to decide whether
      // the user still needs a nudge tonight.
      const at = Date.now();
      void updateProfile({
        lastActiveAt: at,
        currentStreak: next.current,
        streakUpdatedAt: at,
      }).catch(() => {
        // Best-effort mirror. A failed write must never break training, and
        // the local streak has already been updated.
      });
    },
    [streak, setStreak, setDailyLog, updateProfile],
  );
}
