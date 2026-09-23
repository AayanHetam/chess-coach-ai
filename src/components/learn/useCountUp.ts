"use client";

import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * A number that rolls from its previous value to the next one.
 *
 * Unlike NumberTicker, which counts from zero once when it scrolls into view,
 * this follows a value that keeps changing: a coverage figure that goes from
 * 40 to 52 rolls up twelve, not up from nothing. The first render is the final
 * value, so server markup and the hydrating client agree and a reader with no
 * animation frames sees the real number. Reduced motion and hidden tabs jump.
 */
export function useCountUp(value: number, ms = 700): number {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    if (reduce || typeof document === "undefined" || document.visibilityState === "hidden") {
      setShown(value);
      return;
    }
    const controls = animate(from, value, {
      duration: ms / 1000,
      ease: [0.22, 0.61, 0.36, 1],
      onUpdate: (v) => setShown(Math.round(v)),
      onComplete: () => setShown(value),
    });
    return () => controls.stop();
  }, [value, ms, reduce]);

  return shown;
}
