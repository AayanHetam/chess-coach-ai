"use client";

import { animate, useInView, useMotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface NumberTickerProps {
  value: number;
  durationMs?: number;
  suffix?: string;
  prefix?: string;
}

export function NumberTicker({
  value,
  durationMs = 1800,
  suffix = "",
  prefix = "",
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const count = useMotionValue(0);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!inView) return;
    const controls = animate(count, value, {
      duration: durationMs / 1000,
      ease: [0.22, 0.61, 0.36, 1],
    });
    const unsub = count.on("change", (v) => {
      setDisplay(Math.round(v).toLocaleString());
    });
    return () => {
      controls.stop();
      unsub();
    };
  }, [inView, value, count, durationMs]);

  return (
    <span ref={ref}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
