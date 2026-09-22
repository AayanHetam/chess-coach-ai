"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * Whether a Masti animation may play right now.
 *
 * False on the server and on the first client render, so SSR markup and the
 * hydrating render agree (the still is always what the HTML carries). After
 * mount it turns true unless the visitor prefers reduced motion or the tab is
 * hidden, and it tracks visibility from then on: an animated WebP cannot be
 * paused, so the way to stop twelve monkeys looping in a background tab is to
 * swap them for stills. Same shape as NumberTicker's guard.
 */
export function useMastiMotion(enabled = true): boolean {
  const reduceMotion = useReducedMotion();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!enabled || reduceMotion || typeof document === "undefined") {
      setOk(false);
      return;
    }
    const update = () => setOk(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [enabled, reduceMotion]);

  return ok;
}
