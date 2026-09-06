"use client";

import {
  animate,
  useInView,
  useMotionValue,
  useReducedMotion,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface NumberTickerProps {
  value: number;
  durationMs?: number;
  suffix?: string;
  prefix?: string;
}

/** Pinned locale: the server and the browser must agree on the SSR text or
 *  React reports a hydration mismatch and re-renders the strip on load. */
export const formatTickerValue = (v: number) =>
  Math.round(v).toLocaleString("en-US");

/**
 * Counts up to `value` once the number scrolls into view.
 *
 * The FINAL value is what renders on the server and on first paint; the
 * count-up is decoration, so the page has to read correctly without it. That
 * was not the case before: the initial state was "0", and the count-up runs
 * on framer-motion's frame loop, which Chrome pauses in a hidden tab. Anyone
 * reading the page without a foreground tab — a crawler, a QA agent, a user
 * who opened it in the background — saw "0+ Engine Elo", "0+ puzzles" and
 * "0% claims fact-checked", the exact opposite of what the strip is for.
 *
 * Reduced-motion users and hidden tabs skip the animation and show the
 * figure; a tab hidden mid-count snaps to the figure instead of stalling on
 * a half-counted number.
 */
export function NumberTicker({
  value,
  durationMs = 1800,
  suffix = "",
  prefix = "",
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reduceMotion = useReducedMotion();
  const count = useMotionValue(0);
  const [display, setDisplay] = useState(() => formatTickerValue(value));

  useEffect(() => {
    if (!inView) return;
    const finalText = formatTickerValue(value);
    if (
      reduceMotion ||
      typeof document === "undefined" ||
      document.visibilityState === "hidden"
    ) {
      setDisplay(finalText);
      return;
    }

    count.set(0);
    const unsub = count.on("change", (v) => {
      setDisplay(formatTickerValue(v));
    });
    const controls = animate(count, value, {
      duration: durationMs / 1000,
      ease: [0.22, 0.61, 0.36, 1],
      onComplete: () => setDisplay(finalText),
    });
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      controls.stop();
      setDisplay(finalText);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      controls.stop();
      unsub();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [inView, value, count, durationMs, reduceMotion]);

  return (
    <span ref={ref}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
