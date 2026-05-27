"use client";

import { motion, useInView } from "framer-motion";
import { useRef, type CSSProperties, type ReactNode } from "react";

interface RevealOnScrollProps {
  children: ReactNode;
  delay?: number;
  y?: number;
  durationMs?: number;
  style?: CSSProperties;
  className?: string;
}

export function RevealOnScroll({
  children,
  delay = 0,
  y = 24,
  durationMs = 700,
  style,
  className,
}: RevealOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{
        duration: durationMs / 1000,
        delay,
        ease: [0.22, 0.61, 0.36, 1],
      }}
      style={style}
      className={className}
    >
      {children}
    </motion.div>
  );
}
