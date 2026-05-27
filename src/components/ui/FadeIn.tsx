"use client";

import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  durationMs?: number;
  style?: CSSProperties;
}

export function FadeIn({
  children,
  delay = 0,
  durationMs = 220,
  style,
}: FadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: durationMs / 1000,
        delay,
        ease: [0.22, 0.61, 0.36, 1],
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        ...style,
      }}
    >
      {children}
    </motion.div>
  );
}
