"use client";

import { useEffect, useState } from "react";

/**
 * Elapsed milliseconds since `startedAt`, ticking once a second while running.
 *
 * Reads the wall clock on each tick rather than accumulating an interval
 * count, so a backgrounded tab — where browsers throttle timers hard — shows
 * the true elapsed time on return instead of however many ticks it was allowed
 * to fire. `formatSolveClock` clamps the negative values a mid-session clock
 * adjustment can produce.
 */
export function useSolveClock(startedAt: number, running: boolean): number {
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);

  useEffect(() => {
    setElapsed(Date.now() - startedAt);
    if (!running) return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, [startedAt, running]);

  return elapsed;
}
