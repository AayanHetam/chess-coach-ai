"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ACCENTS } from "@/components/ui/accents";

/** The jewel accents, so a burst is in the product's colours and not a party shop's. */
export const CONFETTI_COLOURS = [
  ACCENTS.gold.bright,
  ACCENTS.ember.bright,
  ACCENTS.jade.bright,
  ACCENTS.cyan.bright,
  ACCENTS.violet.bright,
  ACCENTS.rose.bright,
];

export interface Particle {
  x: number;
  y: number;
  rotate: number;
  duration: number;
  width: number;
  height: number;
  round: boolean;
  colour: string;
}

/** A deterministic 0-1 from an integer, so a burst is the same on every render. */
function noise(n: number): number {
  let h = (n * 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * Where each piece ends up. Pure, so the shape of a burst is testable without
 * a browser: pieces leave in every direction, rise a little before they fall,
 * and no two bursts look identical because `burst` seeds the spread.
 */
export function confettiParticles(burst: number, count = 18, spread = 120): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const t = noise(burst * 97 + i);
    const angle = (i / count) * Math.PI * 2 + t * 0.6;
    const dist = spread * (0.55 + t * 0.45);
    return {
      x: Math.round(Math.cos(angle) * dist),
      // Lifted, then dropped: the end point sits below the launch so the
      // ease-out reads as gravity rather than as a fade in place.
      y: Math.round(Math.sin(angle) * dist * 0.8 + spread * 0.3),
      rotate: Math.round(180 + t * 360),
      duration: Number((0.85 + t * 0.35).toFixed(2)),
      width: 6 + (i % 3) * 2,
      height: 7 + ((i + 1) % 3) * 3,
      round: i % 2 === 1,
      colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
    };
  });
}

/** How long a burst stays in the DOM before it is swept up. */
export const CONFETTI_MS = 1500;

export interface ConfettiBurstProps {
  /**
   * Bump to fire. Zero is silent, and a value that never changes fires once
   * on the client only, never in server markup.
   */
  burst: number;
  count?: number;
  spread?: number;
}

/**
 * A handful of coloured pieces thrown from the centre of the nearest
 * positioned ancestor. Pure transform and opacity, so nothing around it
 * shifts, and it sweeps itself up after a second and a half so a page that
 * has celebrated ten times is not carrying a hundred and eighty spans.
 * Reduced-motion visitors never see it: the thing being celebrated is already
 * on screen in words and colour.
 */
export function ConfettiBurst({ burst, count = 18, spread = 120 }: ConfettiBurstProps) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!burst) return;
    setShown(burst);
    const timer = setTimeout(() => setShown(0), CONFETTI_MS);
    return () => clearTimeout(timer);
  }, [burst]);

  if (!shown || reduce) return null;
  return (
    <span
      key={shown}
      aria-hidden
      data-confetti
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: 0,
        height: 0,
        pointerEvents: "none",
        zIndex: 3,
        overflow: "visible",
      }}
    >
      {confettiParticles(shown, count, spread).map((p, i) => (
        <motion.span
          key={i}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.5, rotate: 0 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 1, rotate: p.rotate }}
          transition={{ duration: p.duration, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: "absolute",
            display: "block",
            width: p.width,
            height: p.height,
            borderRadius: p.round ? "50%" : 2,
            background: p.colour,
          }}
        />
      ))}
    </span>
  );
}

export default ConfettiBurst;
