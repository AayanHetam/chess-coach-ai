"use client";

import { useEffect, useRef, useState } from "react";
import type { MastiMood } from "./manifest";

/**
 * Holds a mood on screen for at least `minMs` before letting the next one
 * through. Several surfaces flip state for only a few hundred ms (a wrong
 * move flashes for 650 ms on the landing puzzle), which would cut a 1.2 s
 * animation to two frames. Returns the mood to show plus a replay counter
 * that changes every time the shown mood is (re)entered, to feed Masti's
 * `replayKey` so a repeat of the same mood animates again.
 */
export function useStickyMood(
  mood: MastiMood,
  minMs = 1400,
  /** Bump to re-enter the current mood (a second wrong move in a row). */
  pulse: string | number = 0
): { mood: MastiMood; replayKey: number } {
  const [shown, setShown] = useState<MastiMood>(mood);
  const [replayKey, setReplayKey] = useState(0);
  const shownAt = useRef<number>(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPulse = useRef(pulse);

  useEffect(() => {
    const pulsed = pulse !== lastPulse.current;
    lastPulse.current = pulse;
    if (mood === shown && !pulsed) return;
    const now = Date.now();
    const elapsed = now - shownAt.current;
    const apply = () => {
      shownAt.current = Date.now();
      setShown(mood);
      setReplayKey((k) => k + 1);
    };
    if (pending.current) clearTimeout(pending.current);
    if (shownAt.current === 0 || elapsed >= minMs) {
      apply();
      return;
    }
    pending.current = setTimeout(apply, minMs - elapsed);
    return () => {
      if (pending.current) clearTimeout(pending.current);
    };
    // `shown` is intentionally read, not tracked: tracking it would re-run the
    // effect right after apply() and cancel the timer it just set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, minMs, pulse]);

  return { mood: shown, replayKey };
}
