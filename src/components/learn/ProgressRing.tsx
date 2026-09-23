"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

export interface ProgressRingProps {
  /** 0-1. Anything outside is clamped; a broken number draws empty. */
  value: number;
  /** Outer diameter in px. */
  size?: number;
  stroke?: number;
  colour: string;
  track?: string;
  /** Whether the ring fills in from empty when it first mounts. */
  fillOnMount?: boolean;
  children?: ReactNode;
  "data-testid"?: string;
}

const clamp = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/**
 * A ring that fills to `value`, the HUD shape of the coverage number.
 *
 * Decorative by design: the number it shows is always printed beside or inside
 * it, so the SVG is aria-hidden and the meter card keeps the one accessible
 * "N percent answered" label. Two rings and a bar all announcing the same
 * number would be three progress bars to a screen reader.
 *
 * The arc is drawn with framer's `pathLength`, which animates the stroke
 * without touching layout: a ring that springs from 40% to 52% never moves
 * anything around it. Reduced motion draws the final arc at once.
 */
export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  colour,
  track = "rgba(255,255,255,0.1)",
  fillOnMount = true,
  children,
  "data-testid": testId,
}: ProgressRingProps) {
  const reduce = useReducedMotion();
  const v = clamp(value);
  const r = (size - stroke) / 2;
  const c = size / 2;
  return (
    <span
      data-testid={testId}
      data-ring-value={Math.round(v * 100)}
      style={{
        position: "relative",
        display: "inline-grid",
        placeItems: "center",
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}
      >
        <circle cx={c} cy={c} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={fillOnMount && !reduce ? { pathLength: 0 } : false}
          animate={{ pathLength: v }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 70, damping: 18, mass: 0.8 }}
        />
      </svg>
      <span style={{ position: "relative", zIndex: 1, display: "inline-grid", placeItems: "center" }}>
        {children}
      </span>
    </span>
  );
}

export default ProgressRing;
